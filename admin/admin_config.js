// ==========================================
// 📌 1. Firebase 初始化與全局狀態維護
// ==========================================
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 全局核心數據狀態
let localGuestsList = [];
const DEFAULT_MAX_SEATS_PER_TABLE = 12;
const ABSOLUTE_MAX_SEATS_PER_TABLE = 99;
let tableSettingsCache = {};
const PRIMARY_TAG_KEY = 'group';

function getMaxSeatsForTable(tableNum) {
    const n = parseInt(tableNum, 10);
    if (isNaN(n)) return DEFAULT_MAX_SEATS_PER_TABLE;
    const settings = tableSettingsCache[n] || tableSettingsCache[String(n)];
    const configured = parseInt(settings?.max_seats, 10);
    if (!isNaN(configured) && configured >= 1) {
        return Math.min(configured, ABSOLUTE_MAX_SEATS_PER_TABLE);
    }
    return DEFAULT_MAX_SEATS_PER_TABLE;
}

let labelColumnsKeys = ['group']; 
let labelColumnsNames = ['標籤 (可多選)']; 
let categoriesByColumn = {
    'group': ['LK', '家人', '男方親戚', '女方親戚', '中學同學']
};

function normalizeCSVHeaderLabel(label) {
    return String(label || '')
        .replace(/^"|"$/g, '')
        .replace(/\s/g, '')
        .toLowerCase();
}

/** 依表頭欄位名稱對應欄位索引，支援新舊 CSV 格式與 Excel 改過的表頭 */
function buildCSVColumnMap(headers) {
    const map = {};
    headers.forEach((raw, index) => {
        const h = normalizeCSVHeaderLabel(raw);
        if (!h) return;
        if (h === '順序' || h === '顺序' || h === 'seq' || h === 'order' || h === '#') map.seq = index;
        if (/桌號|桌号|枱號|枱号|分配桌次|^table$/.test(h)) map.table = index;
        if (/^座位$|^座號$|^座号$|^seat$|^sort$/.test(h)) map.seat = index;
        if (h === '姓名' || h === 'name') map.name = index;
        if (/來源|来源|男方|女方|^side$/.test(h)) map.side = index;
        if (/標籤|标签|群組|群组|^group$|^tag/.test(h)) map.tags = index;
    });
    return map;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result.map(s => s.trim());
}

function normalizeTags(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(t => String(t).trim()).filter(t => t && t !== '未分類');
    const s = String(val).trim();
    if (!s || s === '未分類') return [];
    if (s.includes(';')) return s.split(';').map(t => t.trim()).filter(t => t && t !== '未分類');
    if (s.includes('|')) return s.split('|').map(t => t.trim()).filter(t => t && t !== '未分類');
    return [s];
}

function findGuestsUsingTag(tag, guests) {
    return guests.filter(g => normalizeTags(g.group).includes(tag));
}

function mergeGuestLabelsToTags(guest, keys) {
    const tags = new Set();
    keys.forEach(k => normalizeTags(guest[k]).forEach(t => tags.add(t)));
    return [...tags];
}

/** 匯入合併用：姓名 + 來源 + 標籤（標籤排序後以 ; 連接） */
function guestIdentityKey(guest) {
    const name = String(guest?.name || '').trim();
    const side = guest?.side === '女方' ? '女方' : '男方';
    const tags = normalizeTags(guest?.group ?? guest?.[PRIMARY_TAG_KEY]).slice().sort().join(';');
    return `${name}\x1f${side}\x1f${tags}`;
}

function normalizeGuestForList(guest) {
    const tableRaw = guest?.table;
    const tableNum = parseInt(tableRaw, 10);
    const hasTable = tableRaw !== '' && tableRaw != null && !isNaN(tableNum) && tableNum >= 1;
    const sortNum = parseInt(guest?.sort, 10);
    return {
        name: String(guest?.name || '').trim(),
        side: guest?.side === '女方' ? '女方' : '男方',
        table: hasTable ? tableNum : '',
        sort: hasTable ? ((!isNaN(sortNum) && sortNum >= 1) ? sortNum : 1) : 99,
        group: normalizeTags(guest?.group ?? guest?.[PRIMARY_TAG_KEY]),
        isCanceled: !!guest?.isCanceled,
        preservedSort: guest?.preservedSort ?? null,
        seatReleased: !!guest?.seatReleased
    };
}

function formatGuestTagsLabel(tags) {
    const list = normalizeTags(tags);
    return list.length ? list.join('、') : '（無標籤）';
}

function formatGuestPlacementLabel(guest) {
    if (guest.table === '' || guest.table == null) return '未分配';
    const seat = guest.isCanceled ? '已釋放' : (guest.sort || 1);
    return `第 ${guest.table} 桌 · 座位 ${seat}`;
}

function dedupeImportedGuestsLastWins(importedGuests) {
    const map = new Map();
    importedGuests.forEach((guest) => map.set(guestIdentityKey(guest), guest));
    return [...map.values()];
}

// UI 元素與實例快取
let tbody = null;
let scrollContainer = null;
let activeSelectElement = null; 
let activeColumnKey = null; 
let sortableInstance = null;
let csvImportInProgress = false;
let pendingCSVImportData = null;
let adminHasUnsavedChanges = false;
let pendingLeaveHref = null;

function isAdminPageDirty() {
    return adminHasUnsavedChanges;
}

function markAdminDirty() {
    adminHasUnsavedChanges = true;
    updateAdminUnsavedIndicator();
}

function markAdminClean() {
    adminHasUnsavedChanges = false;
    updateAdminUnsavedIndicator();
}

function updateAdminUnsavedIndicator() {
    const btn = document.getElementById('btn-save-all');
    if (!btn) return;
    if (adminHasUnsavedChanges) {
        btn.classList.add('ring-2', 'ring-yellow-400', 'ring-offset-1');
        btn.title = '有未儲存的改動，請按此儲存';
    } else {
        btn.classList.remove('ring-2', 'ring-yellow-400', 'ring-offset-1');
        btn.title = '';
    }
}