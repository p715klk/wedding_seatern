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

function mergeGuestLabelsToTags(guest, keys) {
    const tags = new Set();
    keys.forEach(k => normalizeTags(guest[k]).forEach(t => tags.add(t)));
    return [...tags];
}

// UI 元素與實例快取
let tbody = null;
let scrollContainer = null;
let activeSelectElement = null; 
let activeColumnKey = null; 
let sortableInstance = null;