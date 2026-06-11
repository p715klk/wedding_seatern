const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let allGuests = [];
let unassignedPool = [];
let tableSettings = {};
let activeSettingTableNum = null;

function normalizeTableSettings(raw) {
    const normalized = {};
    if (!raw) return normalized;

    const entries = Array.isArray(raw)
        ? raw.map((settings, idx) => [String(idx), settings])
        : Object.entries(raw);

    entries.forEach(([key, settings]) => {
        const tableNum = parseInt(key, 10);
        if (!tableNum || tableNum < 1 || !settings || typeof settings !== 'object') return;
        if (settings.x == null || settings.y == null) return;
        normalized[String(tableNum)] = settings;
    });

    return normalized;
}

function getTableSettingKeys() {
    return Object.keys(tableSettings)
        .filter(num => {
            const settings = tableSettings[num];
            return settings && settings.x != null && settings.y != null;
        })
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

let tableSettingsMigrated = false;

function loadTableSettings(raw) {
    const normalized = normalizeTableSettings(raw);
    if (Array.isArray(raw) && Object.keys(normalized).length && !tableSettingsMigrated) {
        tableSettingsMigrated = true;
        database.ref('table_settings').set(normalized).catch(err => {
            console.warn('table_settings 轉換 object 失敗:', err);
            tableSettingsMigrated = false;
        });
    }
    return normalized;
}

function persistTableSettings() {
    return database.ref('table_settings').set(tableSettings);
}

function ensureDefaultTablesIfEmpty() {
    if (getTableSettingKeys().length > 0) return false;

    let created = false;
    for (let i = 1; i <= 14; i++) {
        const row = Math.floor((i - 1) / 4);
        const col = (i - 1) % 4;
        const colGap = 440;
        const rowGap = 460;
        const gridW = 3 * colGap + TABLE_DIM;
        const gridH = 3 * rowGap + TABLE_TOTAL_H;
        const startX = snapToGrid(CANVAS_W / 2 - gridW / 2);
        const startY = snapToGrid(CANVAS_H / 2 - gridH / 2);
        tableSettings[String(i)] = {
            max_seats: 12,
            x: snapToGrid(startX + col * colGap),
            y: snapToGrid(startY + row * rowGap)
        };
        created = true;
    }
    return created;
}

let selectedGuestContext = null;

const PRIMARY_TAG_KEY = 'group';
let categoriesByColumn = {
    'group': ['LK', '家人', '男方親戚', '女方親戚', '中學同學']
};
let legacyLabelKeys = null;
let activeSelectElement = null;
let activeColumnKey = null;

function normalizeGuestTags(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(t => String(t).trim()).filter(t => t && t !== '未分類');
    const s = String(val).trim();
    if (!s || s === '未分類') return [];
    if (s.includes(';')) return s.split(';').map(t => t.trim()).filter(t => t && t !== '未分類');
    if (s.includes('|')) return s.split('|').map(t => t.trim()).filter(t => t && t !== '未分類');
    return [s];
}

function getGuestTags(guest) {
    const keys = legacyLabelKeys || [PRIMARY_TAG_KEY];
    const tags = new Set();
    keys.forEach(k => normalizeGuestTags(guest[k]).forEach(t => tags.add(t)));
    return [...tags];
}

function getPrimaryGroup(guest) {
    const tags = normalizeGuestTags(guest.group);
    return tags[0] || '未分類';
}

function applyMetaLabelColumns(meta) {
    if (meta && meta.keys && meta.names) {
        const mergedPool = new Set(categoriesByColumn[PRIMARY_TAG_KEY] || []);
        meta.keys.forEach(k => {
            (meta.categories?.[k] || []).forEach(c => mergedPool.add(c));
        });
        categoriesByColumn = { [PRIMARY_TAG_KEY]: [...mergedPool] };
        legacyLabelKeys = meta.keys.length > 1 ? meta.keys : null;
    } else if (meta && meta.categories) {
        categoriesByColumn = meta.categories;
        legacyLabelKeys = null;
    }
}

function getModalGuestSide() {
    const el = document.getElementById('edit-guest-side');
    return el && el.value === '女方' ? '女方' : '男方';
}

function tagChipSideClasses(side) {
    if (side === '女方') {
        return {
            chip: 'bg-rose-100 text-rose-800',
            btn: 'text-rose-500 hover:text-rose-700',
            select: 'border-rose-200 bg-rose-50/20',
            pool: 'bg-rose-50 text-rose-700 border-rose-200'
        };
    }
    return {
        chip: 'bg-blue-100 text-blue-800',
        btn: 'text-blue-500 hover:text-blue-700',
        select: 'border-blue-200 bg-blue-50/20',
        pool: 'bg-blue-50 text-blue-700 border-blue-200'
    };
}

function buildTagChipHTML(tag, columnKey, side = getModalGuestSide()) {
    const safe = tag.replace(/"/g, '&quot;');
    const c = tagChipSideClasses(side);
    return `<span class="tag-chip inline-flex items-center gap-1 ${c.chip} px-2 py-1 rounded font-bold" data-tag="${safe}">${tag}<button type="button" onclick="removeModalTag(this,'${columnKey}')" class="${c.btn} font-black leading-none">×</button></span>`;
}

function buildTagAddSelectHTML(columnKey, selectedTags, side = getModalGuestSide()) {
    const optionsArr = categoriesByColumn[columnKey] || ['未分類'];
    const available = optionsArr.filter(cat => !selectedTags.includes(cat));
    const c = tagChipSideClasses(side);
    let optsHTML = `<option value="">＋</option>`;
    optsHTML += available.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    optsHTML += `<option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂...</option>`;
    optsHTML += `<option value="__DELETE__" class="text-red-600 font-bold">− 刪除標籤...</option>`;
    return `<select onchange="handleModalTagAdd(this, '${columnKey}')" class="row-tag-add-select row-tag-add-select-${columnKey} border ${c.select} rounded px-2 py-1 font-bold focus:bg-white shrink-0">${optsHTML}</select>`;
}

function refreshModalTagColors() {
    renderModalTags(readModalTags());
}

function readModalTags() {
    const container = document.getElementById('edit-guest-tags');
    if (!container) return [];
    return [...container.querySelectorAll('.tag-chip')].map(chip => chip.dataset.tag);
}

function renderModalTags(tags) {
    const container = document.getElementById('edit-guest-tags');
    if (!container) return;
    const normalized = normalizeGuestTags(tags);
    normalized.forEach(t => {
        const pool = categoriesByColumn[PRIMARY_TAG_KEY] || [];
        if (!pool.includes(t)) pool.push(t);
    });
    const chips = normalized.map(t => buildTagChipHTML(t, PRIMARY_TAG_KEY)).join('');
    container.innerHTML = chips + buildTagAddSelectHTML(PRIMARY_TAG_KEY, normalized);
}

function insertModalTagChip(columnKey, tag) {
    const container = document.getElementById('edit-guest-tags');
    const select = container.querySelector(`.row-tag-add-select-${columnKey}`);
    if (!select) return;
    const current = readModalTags();
    if (!current.includes(tag)) {
        select.insertAdjacentHTML('beforebegin', buildTagChipHTML(tag, columnKey));
    }
}

function refreshModalTagAddSelect(columnKey) {
    const container = document.getElementById('edit-guest-tags');
    const select = container.querySelector(`.row-tag-add-select-${columnKey}`);
    if (!select) return;
    select.outerHTML = buildTagAddSelectHTML(columnKey, readModalTags());
}

function handleModalTagAdd(selectEl, columnKey) {
    const val = selectEl.value;
    if (!val) return;
    if (val === '__NEW__') {
        activeSelectElement = selectEl;
        activeColumnKey = columnKey;
        document.getElementById('custom-category-input').value = '';
        showModal(document.getElementById('custom-dialog-overlay'));
        selectEl.value = '';
        return;
    }
    if (val === '__DELETE__') {
        openDeleteTagDialog(columnKey, selectEl);
        selectEl.value = '';
        return;
    }
    insertModalTagChip(columnKey, val);
    refreshModalTagAddSelect(columnKey);
}

function forEachAssignedGuest(callback) {
    if (!allGuests) return;
    const processTable = table => {
        if (Array.isArray(table)) table.forEach(callback);
    };
    if (Array.isArray(allGuests)) {
        allGuests.forEach(processTable);
    } else if (typeof allGuests === 'object') {
        Object.values(allGuests).forEach(processTable);
    }
}

function collectAllGuestsInSeating() {
    const guests = [];
    forEachAssignedGuest(g => { if (g && g.name) guests.push(g); });
    if (Array.isArray(unassignedPool)) {
        unassignedPool.forEach(g => { if (g && g.name) guests.push(g); });
    }
    return guests;
}

function getGuestsUsingTagInSeating(tag) {
    return collectAllGuestsInSeating().filter(g => getGuestTags(g).includes(tag));
}

function populateDeleteTagSelect(columnKey) {
    const select = document.getElementById('delete-tag-select');
    const pool = (categoriesByColumn[columnKey] || []).filter(t => t && t !== '未分類');
    select.innerHTML = pool.length
        ? pool.map(t => `<option value="${t.replace(/"/g, '&quot;')}">${t}</option>`).join('')
        : '<option value="">（無可刪除標籤）</option>';
}

function updateDeleteTagUsageHint() {
    const select = document.getElementById('delete-tag-select');
    const hint = document.getElementById('delete-tag-usage-hint');
    const btn = document.getElementById('btn-confirm-delete-tag');
    const tag = select.value;
    if (!tag) {
        hint.textContent = '目前標籤清單為空。';
        btn.disabled = true;
        return;
    }
    const users = getGuestsUsingTagInSeating(tag);
    if (users.length > 0) {
        const names = users.map(g => g.name).join('、');
        hint.innerHTML = `<span class="text-red-600 font-bold">尚有 ${users.length} 位賓客使用中：</span>${names}`;
        btn.disabled = true;
    } else {
        hint.innerHTML = '<span class="text-green-700 font-bold">無人使用此標籤，可安全刪除。</span>';
        btn.disabled = false;
    }
}

function openDeleteTagDialog(columnKey, selectEl) {
    activeSelectElement = selectEl;
    activeColumnKey = columnKey;
    populateDeleteTagSelect(columnKey);
    updateDeleteTagUsageHint();
    showModal(document.getElementById('delete-tag-dialog-overlay'));
}

function closeDeleteTagDialog(isConfirm) {
    hideModal(document.getElementById('delete-tag-dialog-overlay'));
    if (isConfirm && activeColumnKey) {
        const tag = document.getElementById('delete-tag-select').value;
        if (tag && getGuestsUsingTagInSeating(tag).length === 0) {
            const pool = categoriesByColumn[activeColumnKey];
            const idx = pool.indexOf(tag);
            if (idx !== -1) {
                pool.splice(idx, 1);
                persistMetaLabelColumns();
                refreshModalTagAddSelect(activeColumnKey);
                alert(`✅ 已刪除標籤「${tag}」`);
            }
        }
    }
    if (activeSelectElement) activeSelectElement.value = '';
    activeSelectElement = null;
    activeColumnKey = null;
}

function removeModalTag(btn, columnKey) {
    btn.closest('.tag-chip').remove();
    refreshModalTagAddSelect(columnKey);
}

function closeCustomCategoryDialog(isConfirm) {
    const overlay = document.getElementById('custom-dialog-overlay');
    const inputEl = document.getElementById('custom-category-input');
    hideModal(overlay);

    if (isConfirm && activeColumnKey) {
        const newCat = inputEl.value.trim();
        if (newCat && !categoriesByColumn[activeColumnKey].includes(newCat)) {
            categoriesByColumn[activeColumnKey].push(newCat);
            persistMetaLabelColumns();
            insertModalTagChip(activeColumnKey, newCat);
            refreshModalTagAddSelect(activeColumnKey);
        }
    }
    activeSelectElement = null;
    activeColumnKey = null;
}

function persistMetaLabelColumns() {
    return database.ref('meta_label_columns').update({
        keys: [PRIMARY_TAG_KEY],
        names: ['標籤 (可多選)'],
        categories: categoriesByColumn
    });
}

function showModal(el) {
    el.classList.remove('hidden');
    el.style.display = 'flex';
}

function hideModal(el) {
    el.classList.add('hidden');
    el.style.display = '';
}

const IS_TOUCH_DEVICE = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function getSidebarPanelWidth() {
    return isMobileViewport() ? Math.min(window.innerWidth * 0.88, 300) : 320;
}

function getSidebarWidth() {
    return isSidebarOpen ? getSidebarPanelWidth() : 0;
}

function getSidebarDragOpenThreshold() {
    if (isMobileViewport()) {
        return window.innerWidth * 0.20;
    }
    return getSidebarPanelWidth() + 16;
}

function bindGuestTap(element, onTap) {
    const threshold = 14;
    let startX = 0, startY = 0, moved = false;

    if (IS_TOUCH_DEVICE) {
        element.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            moved = false;
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1) return;
            if (Math.hypot(e.touches[0].clientX - startX, e.touches[0].clientY - startY) > threshold) {
                moved = true;
            }
        }, { passive: true });

        element.addEventListener('touchend', (e) => {
            if (moved || isGuestDragging) return;
            e.preventDefault();
            e.stopPropagation();
            onTap(e);
        }, { passive: false });
        return;
    }

    element.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        moved = false;
    });
    element.addEventListener('pointermove', (e) => {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > threshold) moved = true;
    });
    element.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (moved) return;
        e.stopPropagation();
        onTap(e);
    });
}

// ==========================================
// 📌 畫布初始化與平移縮放 (已修復空白處拉唔郁問題)
// ==========================================
const CANVAS_W = 5000;
const CANVAS_H = 4000;
const PLATE_SIZE = 420;
const PLATE_CENTER = PLATE_SIZE / 2;
const TABLE_DIM = PLATE_SIZE;
const TABLE_TOTAL_H = PLATE_SIZE;
const GRID_SIZE = 20;

let zoom = 1.0;
let panX = -900;
let panY = -600;
let isPanning = false;
let panPointerId = null;
let startX, startY;
let lastPinchDist = 0;
let touchPanOrigin = null;
let touchPanActive = false;
let touchGestureActive = false;

const viewport = document.getElementById('canvas-viewport');
const canvas = document.getElementById('main-canvas');

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

function getTouchCenter(touches) {
    const rect = viewport.getBoundingClientRect();
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
        y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top
    };
}

function zoomAtPoint(nextZoom, pointX, pointY) {
    const canvasX = (pointX - panX) / zoom;
    const canvasY = (pointY - panY) / zoom;
    zoom = nextZoom;
    panX = pointX - canvasX * zoom;
    panY = pointY - canvasY * zoom;
    applyTransform();
}

function snapToGrid(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function screenToCanvas(screenX, screenY) {
    const rect = viewport.getBoundingClientRect();
    return {
        x: (screenX - rect.left - panX) / zoom,
        y: (screenY - rect.top - panY) / zoom
    };
}

function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px)`;
    canvas.style.setProperty('--zoom', zoom);
    document.getElementById('zoom-percent').innerText = `${Math.round(zoom * 100)}%`;
    updateAllTablePositions();
}

function updateAllTablePositions() {
    document.querySelectorAll('.draggable-table').forEach(el => {
        const bx = parseFloat(el.dataset.baseX || 0);
        const by = parseFloat(el.dataset.baseY || 0);
        el.style.left = `${bx * zoom}px`;
        el.style.top = `${by * zoom}px`;
    });
}

viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    const rect = viewport.getBoundingClientRect();
    zoomAtPoint(
        Math.min(2.5, Math.max(0.35, nextZoom)),
        e.clientX - rect.left,
        e.clientY - rect.top
    );
}, { passive: false });

function canStartCanvasPan(target) {
    return !target.closest(
        '.seat-slot, .guest-seat-circle, .pool-guest-chip, .hub-center, .hub-title, button, input, select, a, #sidebar-content, #sidebar-panel, #sidebar-toggle-btn, .guest-drag-ghost'
    );
}

function resetTouchGestures() {
    touchPanActive = false;
    touchPanOrigin = null;
    lastPinchDist = 0;
    touchGestureActive = false;
    isPanning = false;
    panPointerId = null;
}

if (!IS_TOUCH_DEVICE) {
    viewport.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (!canStartCanvasPan(e.target)) return;

        isPanning = true;
        panPointerId = e.pointerId;
        viewport.style.cursor = 'grabbing';
        startX = e.clientX - panX;
        startY = e.clientY - panY;
        try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    viewport.addEventListener('pointermove', (e) => {
        if (!isPanning || e.pointerId !== panPointerId) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        applyTransform();
    });

    function endCanvasPan(e) {
        if (panPointerId !== null && e && e.pointerId !== panPointerId) return;
        isPanning = false;
        panPointerId = null;
        viewport.style.cursor = 'grab';
    }

    viewport.addEventListener('pointerup', endCanvasPan);
    viewport.addEventListener('pointercancel', endCanvasPan);
}

viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        touchGestureActive = true;
        touchPanActive = false;
        touchPanOrigin = null;
        isPanning = false;
        lastPinchDist = getTouchDistance(e.touches);
        return;
    }

    if (e.touches.length === 1 && canStartCanvasPan(e.target)) {
        touchGestureActive = true;
        touchPanActive = true;
        touchPanOrigin = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            panX,
            panY
        };
    }
}, { passive: false, capture: true });

viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && lastPinchDist > 0) {
        e.preventDefault();
        const dist = getTouchDistance(e.touches);
        const scale = dist / lastPinchDist;
        const center = getTouchCenter(e.touches);
        zoomAtPoint(Math.min(2.5, Math.max(0.15, zoom * scale)), center.x, center.y);
        lastPinchDist = dist;
        return;
    }

    if (e.touches.length === 1 && touchPanActive && touchPanOrigin) {
        e.preventDefault();
        panX = touchPanOrigin.panX + (e.touches[0].clientX - touchPanOrigin.x);
        panY = touchPanOrigin.panY + (e.touches[0].clientY - touchPanOrigin.y);
        applyTransform();
    }
}, { passive: false, capture: true });

viewport.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        resetTouchGestures();
        return;
    }
    if (e.touches.length === 1) {
        lastPinchDist = 0;
        if (canStartCanvasPan(e.target)) {
            touchPanActive = true;
            touchPanOrigin = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                panX,
                panY
            };
        }
    }
}, { capture: true });

viewport.addEventListener('touchcancel', resetTouchGestures, { capture: true });

viewport.addEventListener('contextmenu', e => e.preventDefault());

function zoomCanvas(factor) {
    const rect = viewport.getBoundingClientRect();
    zoomAtPoint(
        Math.min(2.5, Math.max(0.35, zoom * factor)),
        rect.width / 2,
        rect.height / 2
    );
}

const FLOOR_COLS = 4;
const SEATING_ROW_Y_THRESHOLD = 240;
const SEATING_COL_GAP = 440;

function groupTablesByY(tables, threshold = SEATING_ROW_Y_THRESHOLD) {
    const sorted = [...tables].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    const groups = [];
    let bucket = [];
    let centerY = null;

    sorted.forEach(t => {
        if (centerY === null || Math.abs(t.cy - centerY) > threshold) {
            if (bucket.length) groups.push(bucket);
            bucket = [t];
            centerY = t.cy;
        } else {
            bucket.push(t);
            centerY = bucket.reduce((sum, item) => sum + item.cy, 0) / bucket.length;
        }
    });
    if (bucket.length) groups.push(bucket);
    return groups;
}

function classifyWingCol(cx, allCx) {
    const minX = Math.min(...allCx);
    const maxX = Math.max(...allCx);
    const midX = (minX + maxX) / 2;
    return cx < midX ? 1 : 4;
}

function isWingTable(cx, allCx) {
    const minX = Math.min(...allCx);
    const maxX = Math.max(...allCx);
    const span = Math.max(maxX - minX, SEATING_COL_GAP);
    const rel = (cx - minX) / span;
    return rel < 0.24 || rel > 0.76;
}

function bandCenterY(band) {
    return band.reduce((sum, t) => sum + t.cy, 0) / band.length;
}

function computeFloorLayoutFromTableSettings(settings) {
    const normalized = normalizeTableSettings(settings);
    const nums = Object.keys(normalized);
    if (!nums.length) return { items: [], numHalfRows: 0, numCols: FLOOR_COLS };

    const tables = nums.map(num => ({
        num: String(num),
        cx: normalized[num].x + PLATE_CENTER,
        cy: normalized[num].y + PLATE_CENTER
    }));
    const allCx = tables.map(t => t.cx);

    const center = [];
    const wings = [];

    tables.forEach(t => {
        if (isWingTable(t.cx, allCx)) {
            wings.push({ ...t, gridCol: classifyWingCol(t.cx, allCx) });
        } else {
            center.push(t);
        }
    });

    const centerBands = groupTablesByY(center);
    const items = [];
    const occupied = new Set();

    function tryPlace(rowStart, gridCol, num) {
        const key = `${rowStart},${gridCol}`;
        if (occupied.has(key)) return false;
        occupied.add(key);
        items.push({ num, rowStart, rowSpan: 2, gridCol });
        return true;
    }

    centerBands.forEach((band, i) => {
        const rowStart = 1 + i * 2;
        band.sort((a, b) => a.cx - b.cx);
        band.forEach((t, idx) => {
            const gridCol = band.length === 1
                ? (t.cx < (Math.min(...allCx) + Math.max(...allCx)) / 2 ? 2 : 3)
                : (idx === 0 ? 2 : 3);
            if (!tryPlace(rowStart, gridCol, t.num)) {
                tryPlace(rowStart, gridCol === 2 ? 3 : 2, t.num)
                    || tryPlace(rowStart + 2, gridCol, t.num);
            }
        });
    });

    const staggerSlots = [];
    for (let i = 0; i < centerBands.length - 1; i++) {
        const rsA = 1 + i * 2;
        const rsB = 1 + (i + 1) * 2;
        staggerSlots.push({
            rowStart: Math.floor((rsA + rsB) / 2),
            cy: (bandCenterY(centerBands[i]) + bandCenterY(centerBands[i + 1])) / 2
        });
    }
    if (centerBands.length) {
        const lastRowStart = 1 + (centerBands.length - 1) * 2;
        staggerSlots.push({
            rowStart: lastRowStart + 1,
            cy: bandCenterY(centerBands[centerBands.length - 1]) + SEATING_ROW_Y_THRESHOLD
        });
    }
    if (!staggerSlots.length) {
        staggerSlots.push({ rowStart: 4, cy: tables[0]?.cy || 0 });
    }

    function assignWingsSide(wingTables) {
        wingTables.sort((a, b) => a.cy - b.cy || Number(a.num) - Number(b.num));
        wingTables.forEach(t => {
            const ranked = [...staggerSlots].sort(
                (a, b) => Math.abs(t.cy - a.cy) - Math.abs(t.cy - b.cy)
            );
            for (const slot of ranked) {
                if (tryPlace(slot.rowStart, t.gridCol, t.num)) return;
            }
            let row = (staggerSlots[staggerSlots.length - 1]?.rowStart || 4) + 2;
            while (!tryPlace(row, t.gridCol, t.num)) row += 2;
        });
    }

    assignWingsSide(wings.filter(t => t.gridCol === 1));
    assignWingsSide(wings.filter(t => t.gridCol === 4));

    const numHalfRows = items.length
        ? Math.max(...items.map(i => i.rowStart + i.rowSpan - 1))
        : 0;

    return { items, numHalfRows, numCols: FLOOR_COLS };
}

function buildSignInFloorLayout(settings) {
    return computeFloorLayoutFromTableSettings(settings);
}

let lastPersistedFloorLayoutJson = null;

function normalizeFloorLayout(layout) {
    if (!layout) return null;
    if (Array.isArray(layout.items)) {
        return {
            items: layout.items.map(item => ({
                num: String(item.num),
                rowStart: Number(item.rowStart ?? item.gridRow),
                rowSpan: Number(item.rowSpan) || 2,
                gridCol: Number(item.gridCol)
            })),
            numHalfRows: Number(layout.numHalfRows ?? layout.numRows) || 0,
            numCols: Number(layout.numCols) || FLOOR_COLS
        };
    }
    if (layout.cols != null && Array.isArray(layout.rows)) {
        return {
            cols: Number(layout.cols) || layout.rows[0]?.length || 4,
            rows: layout.rows.map(row => (Array.isArray(row) ? row : Object.values(row)).map(cell => String(cell)))
        };
    }
    const rows = Array.isArray(layout) ? layout : Object.keys(layout)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => layout[k]);
    const normalizedRows = rows.map(row => {
        if (Array.isArray(row)) return row.map(cell => String(cell));
        if (row && typeof row === 'object') {
            return Object.keys(row)
                .sort((a, b) => Number(a) - Number(b))
                .map(k => String(row[k]));
        }
        return [String(row)];
    });
    return { cols: normalizedRows[0]?.length || 4, rows: normalizedRows };
}

function syncFloorLayoutIfNeeded(existingLayout) {
    const computed = buildSignInFloorLayout(tableSettings);
    if (!computed) return Promise.resolve();

    const normalizedExisting = normalizeFloorLayout(existingLayout);
    const computedJson = JSON.stringify(computed);
    const existingJson = JSON.stringify(normalizedExisting);
    if (computedJson === existingJson) {
        lastPersistedFloorLayoutJson = computedJson;
        return Promise.resolve();
    }
    if (computedJson === lastPersistedFloorLayoutJson) return Promise.resolve();

    return database.ref('floor_layout').set(computed).then(() => {
        lastPersistedFloorLayoutJson = computedJson;
    }).catch(err => {
        console.warn('floor_layout 同步失敗（簽到頁排位可能未更新）:', err);
    });
}

function scheduleFloorLayoutSync(existingLayout = null) {
    syncFloorLayoutIfNeeded(existingLayout);
}

function forceFloorLayoutSync() {
    const layout = buildSignInFloorLayout(tableSettings);
    lastPersistedFloorLayoutJson = JSON.stringify(layout);
    return database.ref('floor_layout').set(layout);
}

function getTablesBoundingBox() {
    const nums = getTableSettingKeys();
    if (nums.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nums.forEach(num => {
        const s = tableSettings[num];
        minX = Math.min(minX, s.x);
        minY = Math.min(minY, s.y);
        maxX = Math.max(maxX, s.x + TABLE_DIM);
        maxY = Math.max(maxY, s.y + TABLE_TOTAL_H);
    });
    return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

function snapAllTablesToGrid() {
    const updates = {};
    let changed = false;
    getTableSettingKeys().forEach(num => {
        const nx = snapToGrid(tableSettings[num].x);
        const ny = snapToGrid(tableSettings[num].y);
        if (nx !== tableSettings[num].x || ny !== tableSettings[num].y) {
            tableSettings[num].x = nx;
            tableSettings[num].y = ny;
            updates[`table_settings/${num}/x`] = nx;
            updates[`table_settings/${num}/y`] = ny;
            changed = true;
        }
    });
    if (!changed) return Promise.resolve(false);
    return database.ref().update(updates).then(() => true);
}

function centerAllTablesOnCanvas() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return Promise.resolve(false);

    const dx = CANVAS_W / 2 - bounds.centerX;
    const dy = CANVAS_H / 2 - bounds.centerY;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return Promise.resolve(false);

    const updates = {};
    getTableSettingKeys().forEach(num => {
        tableSettings[num].x = snapToGrid(Math.round(tableSettings[num].x + dx));
        tableSettings[num].y = snapToGrid(Math.round(tableSettings[num].y + dy));
        updates[`table_settings/${num}/x`] = tableSettings[num].x;
        updates[`table_settings/${num}/y`] = tableSettings[num].y;
    });
    return database.ref().update(updates).then(() => true);
}

function fitViewToTables() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return;

    const groupW = bounds.maxX - bounds.minX;
    const groupH = bounds.maxY - bounds.minY;
    const vpRect = viewport.getBoundingClientRect();
    const sidebarWidth = isSidebarOpen ? getSidebarWidth() : 0;
    const vpW = Math.max(0, vpRect.width - sidebarWidth);
    const vpH = vpRect.height;
    const mobile = isMobileViewport();
    const padding = mobile ? 24 : 100;

    const zoomX = vpW / (groupW + padding * 2);
    const zoomY = vpH / (groupH + padding * 2);
    const maxZoom = mobile ? 0.75 : 1.2;
    const minZoom = mobile ? 0.12 : 0.35;
    zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(zoomX, zoomY)));

    panX = sidebarWidth + (vpW / 2) - bounds.centerX * zoom;
    panY = (vpH / 2) - bounds.centerY * zoom;
    applyTransform();
}

function getOccupancyColor(filled, maxSeats) {
    const ratio = filled / maxSeats;
    if (ratio > 1) return '#f87171';
    if (ratio >= 1) return '#fb923c';
    if (ratio >= 0.7) return '#fbbf24';
    return '#4ade80';
}

function buildHubRingSVG(filled, maxSeats) {
    const r = 58;
    const circumference = 2 * Math.PI * r;
    const ratio = Math.min(filled / maxSeats, 1);
    const dash = circumference * ratio;
    const color = getOccupancyColor(filled, maxSeats);
    const size = 136;
    const cx = size / 2;
    return `<svg class="hub-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="width:calc(${size}px * var(--zoom));height:calc(${size}px * var(--zoom))">
        <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#f3f4f6" stroke-width="6"/>
        <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="6"
            stroke-dasharray="${dash} ${circumference}" stroke-linecap="round"
            transform="rotate(-90 ${cx} ${cx})"/>
    </svg>`;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function splitCJKNameEvenly(text) {
    const len = text.length;
    if (len <= 5) return escapeHtml(text);
    if (len === 6) return `${escapeHtml(text.slice(0, 3))}<br>${escapeHtml(text.slice(3))}`;
    if (len === 8) return `${escapeHtml(text.slice(0, 4))}<br>${escapeHtml(text.slice(4))}`;
    if (len === 10) return `${escapeHtml(text.slice(0, 5))}<br>${escapeHtml(text.slice(5))}`;
    if (len % 2 === 0) {
        const half = len / 2;
        return `${escapeHtml(text.slice(0, half))}<br>${escapeHtml(text.slice(half))}`;
    }
    const half = Math.ceil(len / 2);
    return `${escapeHtml(text.slice(0, half))}<br>${escapeHtml(text.slice(half))}`;
}

function isLatinGuestName(name) {
    const core = (name || '').trim().replace(/\s*(\*\d+)?\s*(眷屬\s*[\d０-９]+)?\s*$/u, '');
    return /^[A-Za-z][A-Za-z\s'.-]*$/.test(core);
}

function splitLatinNameEvenly(text) {
    const trimmed = text.trim();
    const parts = trimmed.split(/\s+/);
    const letterCount = trimmed.replace(/\s/g, '').length;
    if (letterCount <= 10) return escapeHtml(trimmed);
    if (parts.length > 1) {
        const mid = Math.ceil(parts.length / 2);
        return `${escapeHtml(parts.slice(0, mid).join(' '))}<br>${escapeHtml(parts.slice(mid).join(' '))}`;
    }
    const word = parts[0];
    if (word.length <= 10) return escapeHtml(word);
    const half = Math.ceil(word.length / 2);
    return `${escapeHtml(word.slice(0, half))}<br>${escapeHtml(word.slice(half))}`;
}

function getGuestNameTextClass(name) {
    return isLatinGuestName(name) ? 'guest-name-text name-latn' : 'guest-name-text name-cjk';
}

const GUEST_NAME_FONT_RATIO_MIN = 0.145;
// 字體上限 ≈ 3 個中文字（如「二姑姐」）— 單字放大但唔會頂晒個圓
const GUEST_NAME_FONT_RATIO_REF_CHARS = 3.15;
const GUEST_NAME_PADDING = 6;
const GUEST_NAME_CIRCLE_INSET = 0.9;

function getGuestNameInnerSize(guestSize) {
    return (guestSize - GUEST_NAME_PADDING) * GUEST_NAME_CIRCLE_INSET;
}

function getGuestNameFontRatioCap(guestSize) {
    const inner = getGuestNameInnerSize(guestSize);
    return inner / (guestSize * GUEST_NAME_FONT_RATIO_REF_CHARS);
}

function noBreakSpaces(text) {
    return escapeHtml(text).replace(/ /g, '&nbsp;');
}

function formatAttachSubline(text) {
    return `<span class="name-subline">${noBreakSpaces(text)}</span>`;
}

function isCJKWord(text) {
    return /^[\u4e00-\u9fff]+$/.test(text);
}

function isCJKOnlyText(text) {
    return isCJKWord((text || '').replace(/\s/g, ''));
}

function formatCJKMainPart(mainPart) {
    const parts = mainPart.trim().split(/\s+/);
    if (parts.length === 2 && parts.every(isCJKWord)) {
        return `${escapeHtml(parts[0])}<br>${escapeHtml(parts[1])}`;
    }
    const cjkMain = mainPart.replace(/\s/g, '');
    if (isCJKOnlyText(cjkMain)) {
        if (cjkMain.length <= 5) return escapeHtml(mainPart);
        return splitCJKNameEvenly(cjkMain);
    }
    return escapeHtml(mainPart);
}

function measureGuestNameFontRatio(circle) {
    const guestSize = parseFloat(getComputedStyle(circle).getPropertyValue('--guest-size')) || 64;
    const textSpan = circle.querySelector('.guest-name-text');
    if (!textSpan) return 0.19;

    const zoomVal = parseFloat(getComputedStyle(canvas).getPropertyValue('--zoom')) || 1;
    const inner = getGuestNameInnerSize(guestSize) * zoomVal;
    let lo = GUEST_NAME_FONT_RATIO_MIN;
    let hi = getGuestNameFontRatioCap(guestSize);
    const prevFontSize = circle.style.fontSize;

    while (hi - lo > 0.003) {
        const mid = (lo + hi) / 2;
        circle.style.fontSize = `${guestSize * mid * zoomVal}px`;
        const fits = textSpan.scrollWidth <= inner + 1 && textSpan.scrollHeight <= inner + 1;
        if (fits) lo = mid;
        else hi = mid;
    }

    circle.style.fontSize = prevFontSize;
    return Math.max(GUEST_NAME_FONT_RATIO_MIN, lo);
}

function fitAllGuestNameFonts() {
    document.querySelectorAll('.guest-seat-circle').forEach(circle => {
        const ratio = measureGuestNameFontRatio(circle);
        circle.style.setProperty('--name-font-ratio', ratio.toFixed(4));
    });
}

function normalizeAttachLabel(text) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.replace(/眷屬\s*([0-9０-９]+)/gu, (_, n) => {
        const num = n.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
        return `眷屬 ${num}`;
    });
}

function formatGuestDisplayName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';

    // 「靚女姑姐 *3 眷屬1」→ 兩行：靚女姑姐 / *3 眷屬 1（第二行唔再拆）
    const starAttach = trimmed.match(/^(.+?)\s*(\*\d+)\s*(眷屬\s*[\d０-９]+)\s*$/u);
    if (starAttach) {
        const star = starAttach[2];
        const attach = normalizeAttachLabel(starAttach[3]);
        return `${escapeHtml(starAttach[1].trim())}<br>${formatAttachSubline(`${star} ${attach}`)}`;
    }

    const attachMatch = trimmed.match(/^(.+?)\s*(眷屬\s*[\d０-９]+.*)$/u);
    let mainPart = trimmed;
    let attachPart = '';
    if (attachMatch) {
        mainPart = attachMatch[1].trim();
        attachPart = attachMatch[2].trim();
    }

    const starInMain = mainPart.match(/^(.+?)\s*(\*\d+)\s*$/);
    if (starInMain && attachPart) {
        const star = starInMain[2];
        const attach = normalizeAttachLabel(attachPart);
        return `${escapeHtml(starInMain[1].trim())}<br>${formatAttachSubline(`${star} ${attach}`)}`;
    }

    if (attachPart) {
        return `${formatCJKMainPart(mainPart)}<br>${formatAttachSubline(normalizeAttachLabel(attachPart))}`;
    }

    const cjkOnly = trimmed.replace(/\s/g, '');
    if (isCJKOnlyText(cjkOnly)) {
        if (cjkOnly.length <= 5) return escapeHtml(cjkOnly);
        return splitCJKNameEvenly(cjkOnly);
    }

    if (isLatinGuestName(trimmed)) {
        return splitLatinNameEvenly(trimmed);
    }

    if (trimmed.includes(' ')) {
        const combo = trimmed.match(/^(.+?)\s+(\*\d+\s+眷屬\s*[\d０-９]+.*)$/u);
        if (combo) {
            const starAttachTail = combo[2].match(/^(\*\d+)\s*(眷屬\s*[\d０-９]+.*)$/u);
            if (starAttachTail) {
                return `${escapeHtml(combo[1].trim())}<br>${formatAttachSubline(`${starAttachTail[1]} ${normalizeAttachLabel(starAttachTail[2])}`)}`;
            }
        }
        const parts = trimmed.split(/\s+/);
        if (parts.length === 2 && parts.every(isCJKWord)) {
            return `${escapeHtml(parts[0])}<br>${escapeHtml(parts[1])}`;
        }
        const compactLen = trimmed.replace(/\s/g, '').length;
        if (compactLen <= 5) return escapeHtml(trimmed);
        if (compactLen === 6 && parts.every(isCJKWord)) {
            return splitCJKNameEvenly(trimmed.replace(/\s/g, ''));
        }
        if (isLatinGuestName(trimmed)) return splitLatinNameEvenly(trimmed);
        return parts.map(escapeHtml).join('<br>');
    }

    return escapeHtml(trimmed);
}

function getSeatLayout(maxSeats) {
    const plateR = PLATE_SIZE / 2;
    const hubClearR = 74;
    let guestSize = 64;
    if (maxSeats > 12) guestSize = 58;
    if (maxSeats > 14) guestSize = 54;
    const guestHalf = guestSize / 2;
    const edgeMargin = 16;
    const maxRadius = plateR - edgeMargin - guestHalf;
    const minRadius = hubClearR + guestHalf + 4;
    const minChord = guestSize * 0.98;

    let radius = maxRadius;
    for (let r = maxRadius; r >= minRadius; r -= 1) {
        const chord = 2 * r * Math.sin(Math.PI / maxSeats);
        if (chord >= minChord) {
            radius = r;
            break;
        }
    }
    radius = Math.max(minRadius, Math.min(maxRadius, radius));
    return { radius, guestSize };
}

// 側邊欄開合
let isSidebarOpen = true;

function getSidebarRightEdge() {
    const content = document.getElementById('sidebar-content');
    if (content && isSidebarOpen) {
        return content.getBoundingClientRect().right;
    }
    return getSidebarWidth();
}

function openSidebar({ instant = false } = {}) {
    if (isSidebarOpen) return;
    const sidebar = document.getElementById('sidebar-panel');
    const icon = document.getElementById('sidebar-toggle-icon');
    if (instant) sidebar.classList.add('sidebar-no-transition');
    sidebar.classList.remove('collapsed');
    icon.innerText = '◀';
    isSidebarOpen = true;
    if (instant) {
        requestAnimationFrame(() => sidebar.classList.remove('sidebar-no-transition'));
    }
}

function closeSidebar({ instant = false } = {}) {
    if (!isSidebarOpen) return;
    const sidebar = document.getElementById('sidebar-panel');
    const icon = document.getElementById('sidebar-toggle-icon');
    if (instant) sidebar.classList.add('sidebar-no-transition');
    sidebar.classList.add('collapsed');
    icon.innerText = '▶';
    isSidebarOpen = false;
    if (instant) {
        requestAnimationFrame(() => sidebar.classList.remove('sidebar-no-transition'));
    }
}

function openSidebarIfDragEntersSidebar(clientX) {
    if (isSidebarOpen || !isGuestDragging) return;
    if (clientX <= getSidebarDragOpenThreshold()) {
        openSidebar();
    }
}

function closeSidebarIfDragLeavesSidebar(clientX, sidebarRight) {
    if (!isSidebarOpen) return;
    const edge = sidebarRight ?? getSidebarRightEdge();
    if (clientX > edge - 8) {
        closeSidebar();
    }
}

function initMobileExperience() {
    if (!isMobileViewport()) return;
    closeSidebar({ instant: true });
}

function toggleSidebar() {
    if (isSidebarOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

const TABLE_LOCK_KEY = 'seating_tables_locked';
let isTablePositionLocked = localStorage.getItem(TABLE_LOCK_KEY) === '1';

function updateTableLockUI() {
    const btn = document.getElementById('btn-lock-tables');
    if (!btn) return;
    if (isTablePositionLocked) {
        btn.innerHTML = '🔒<span class="hide-mobile"> 已鎖</span>';
        btn.classList.add('is-active');
        btn.title = '枱位已鎖定，點擊解鎖';
        document.body.classList.add('tables-position-locked');
    } else {
        btn.innerHTML = '🔓<span class="hide-mobile"> 鎖枱</span>';
        btn.classList.remove('is-active');
        btn.title = '鎖定枱位（防止拖動）';
        document.body.classList.remove('tables-position-locked');
    }
}

function toggleTablePositionLock() {
    isTablePositionLocked = !isTablePositionLocked;
    localStorage.setItem(TABLE_LOCK_KEY, isTablePositionLocked ? '1' : '0');
    if (isTablePositionLocked) cancelTableDrag();
    updateTableLockUI();
}

function closePrintMenu() {
    const menu = document.getElementById('print-menu');
    if (menu) {
        menu.classList.add('hidden');
        menu.classList.remove('is-fixed');
        menu.style.top = '';
        menu.style.right = '';
        menu.style.left = '';
    }
}

let printMenuIgnoreCloseUntil = 0;

function positionPrintMenuFixed() {
    const btn = document.getElementById('btn-print-menu');
    const menu = document.getElementById('print-menu');
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    menu.classList.add('is-fixed');
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    menu.style.left = 'auto';
}

function togglePrintMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('print-menu');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (willOpen) {
        printMenuIgnoreCloseUntil = Date.now() + 400;
        if (isMobileViewport()) positionPrintMenuFixed();
    } else {
        closePrintMenu();
    }
}

function handlePrintMenuAction(action, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    printMenuIgnoreCloseUntil = Date.now() + 600;
    closePrintMenu();
    if (action === 'canvas') printCanvasView();
    else if (action === 'guest-list') printGuestListView();
}

document.addEventListener('click', (e) => {
    if (Date.now() < printMenuIgnoreCloseUntil) return;
    if (!e.target.closest('#print-menu-wrap')) closePrintMenu();
});

let printPreviewCleanup = null;
let printPreviewZoom = 1;
let printPreviewOrientation = 'portrait';
let printLayoutZoom = 1;
let printPreviewBuilder = null;
const PRINT_ZOOM_STEP = 0.2;
const PRINT_ZOOM_MIN = 0.2;
const PRINT_ZOOM_MAX = 3;

function snapPrintPreviewZoom(value) {
    return Math.min(PRINT_ZOOM_MAX, Math.max(PRINT_ZOOM_MIN, Math.round(value / PRINT_ZOOM_STEP) * PRINT_ZOOM_STEP));
}

const PRINT_PAGE_PAD = 10;
const PRINT_EMPTY_MSG = '目前沒有任何枱位資料。';

function getPrintPageInnerSize(orientation = printPreviewOrientation) {
    // A4 @ 96dpi，扣除 5mm 邊距後可印區域
    if (orientation === 'landscape') return { w: 1085, h: 756 };
    return { w: 756, h: 1085 };
}

function computePrintFitScale(bounds) {
    const spanW = bounds.maxX - bounds.minX;
    const spanH = bounds.maxY - bounds.minY;
    const page = getPrintPageInnerSize();
    return Math.min(
        (page.w - PRINT_PAGE_PAD * 2) / spanW,
        (page.h - PRINT_PAGE_PAD * 2) / spanH
    );
}

function computePrintLayoutZoom(bounds) {
    return Math.max(0.05, computePrintFitScale(bounds));
}

function requireTablesBounds() {
    const bounds = getTablesBoundingBox();
    if (!bounds) {
        alert(`❌ ${PRINT_EMPTY_MSG}`);
        return null;
    }
    return bounds;
}

function openPrintPreview(buildHTML) {
    closePrintMenu();
    if (!requireTablesBounds()) return;
    printPreviewBuilder = buildHTML;
    showPrintPreview(buildHTML());
}

function cloneTablePlateForPrint(plate) {
    const plateClone = plate.cloneNode(true);
    plateClone.querySelectorAll('[draggable]').forEach(node => node.removeAttribute('draggable'));
    plateClone.querySelectorAll('[ondragover],[ondrop]').forEach(node => {
        node.removeAttribute('ondragover');
        node.removeAttribute('ondrop');
    });
    return plateClone.outerHTML;
}

function buildCanvasPrintHTML() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return `<p class="print-empty">${PRINT_EMPTY_MSG}</p>`;

    const page = getPrintPageInnerSize();
    const pad = PRINT_PAGE_PAD;
    const spanW = bounds.maxX - bounds.minX;
    const spanH = bounds.maxY - bounds.minY;
    const fitScale = computePrintLayoutZoom(bounds);
    printLayoutZoom = fitScale;

    const innerW = spanW + pad * 2;
    const innerH = spanH + pad * 2;
    const scaledW = innerW * fitScale;
    const scaledH = innerH * fitScale;
    const offsetX = (page.w - scaledW) / 2;
    const offsetY = (page.h - scaledH) / 2;

    const tablesHTML = Array.from(canvas.querySelectorAll('.draggable-table')).map(el => {
        const bx = parseFloat(el.dataset.baseX);
        const by = parseFloat(el.dataset.baseY);
        const plate = el.querySelector('.table-plate');
        if (!plate) return '';
        const left = bx - bounds.minX + pad;
        const top = by - bounds.minY + pad;
        return `<div class="draggable-table" style="left:${left}px;top:${top}px;--zoom:1">${cloneTablePlateForPrint(plate)}</div>`;
    }).join('');

    return `<div class="print-tables-layout" style="width:${page.w}px;height:${page.h}px;--zoom:1">
        <div class="print-tables-scale-group" style="left:${offsetX}px;top:${offsetY}px;width:${innerW}px;height:${innerH}px;transform:scale(${fitScale})">${tablesHTML}</div>
    </div>`;
}

function applyPrintPreviewTransform() {
    const viewport = document.getElementById('print-preview-viewport');
    const sheet = document.getElementById('print-preview-sheet');
    const pct = document.getElementById('print-zoom-percent');
    const page = getPrintPageInnerSize();
    if (!viewport || !sheet) return;

    sheet.style.transform = `scale(${printPreviewZoom})`;
    sheet.style.transformOrigin = 'top left';
    viewport.style.width = `${Math.ceil(page.w * printPreviewZoom)}px`;
    viewport.style.height = `${Math.ceil(page.h * printPreviewZoom)}px`;

    if (pct) pct.textContent = `${Math.round(printPreviewZoom * 100)}%`;
}

function stepPrintPreviewZoom(delta) {
    printPreviewZoom = snapPrintPreviewZoom(printPreviewZoom + delta);
    applyPrintPreviewTransform();
}

function fitPrintPreviewZoom() {
    const scroll = document.getElementById('print-preview-scroll');
    if (!scroll) return;
    const page = getPrintPageInnerSize();
    const padding = isMobileViewport() ? 24 : 48;
    const zoomX = (scroll.clientWidth - padding) / page.w;
    const zoomY = (scroll.clientHeight - padding) / page.h;
    printPreviewZoom = snapPrintPreviewZoom(Math.min(zoomX, zoomY));
    applyPrintPreviewTransform();
}

function updatePrintOrientationUI() {
    document.getElementById('btn-print-portrait')?.classList.toggle('is-active', printPreviewOrientation === 'portrait');
    document.getElementById('btn-print-landscape')?.classList.toggle('is-active', printPreviewOrientation === 'landscape');
}

function applyPrintPageStyle() {
    let styleEl = document.getElementById('print-page-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'print-page-style';
        document.head.appendChild(styleEl);
    }
    const pageSize = printPreviewOrientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
    styleEl.textContent = `@media print { @page { size: ${pageSize}; margin: 5mm; } }`;
}

function setPrintOrientation(orientation) {
    if (orientation !== 'portrait' && orientation !== 'landscape') return;
    printPreviewOrientation = orientation;
    document.body.dataset.printOrientation = orientation;
    updatePrintOrientationUI();
    applyPrintPageStyle();
    rebuildPrintPreviewContent();
}

function rebuildPrintPreviewContent() {
    const sheet = document.getElementById('print-preview-sheet');
    if (!sheet || !document.body.classList.contains('print-preview-open') || !printPreviewBuilder) return;
    const savedZoom = printPreviewZoom;
    sheet.innerHTML = printPreviewBuilder();
    printPreviewZoom = savedZoom;
    requestAnimationFrame(() => {
        applyPrintPreviewTransform();
        if (isMobileViewport()) fitPrintPreviewZoom();
    });
}

function showPrintPreview(contentHTML, cleanup) {
    const sheet = document.getElementById('print-preview-sheet');
    const overlay = document.getElementById('print-preview-overlay');
    if (!sheet || !overlay) return;

    if (printPreviewCleanup) printPreviewCleanup();
    printPreviewCleanup = cleanup || null;

    printPreviewZoom = 1;
    document.body.dataset.printOrientation = printPreviewOrientation;
    applyPrintPageStyle();
    updatePrintOrientationUI();

    sheet.innerHTML = contentHTML;
    const viewport = document.getElementById('print-preview-viewport');
    const sheetEl = document.getElementById('print-preview-sheet');
    if (viewport) {
        viewport.style.width = '';
        viewport.style.height = '';
    }
    if (sheetEl) {
        sheetEl.style.transform = '';
    }
    document.body.classList.add('print-preview-open');
    overlay.classList.remove('hidden');
    document.getElementById('print-preview-scroll')?.scrollTo(0, 0);
    requestAnimationFrame(() => {
        if (isMobileViewport()) fitPrintPreviewZoom();
        else applyPrintPreviewTransform();
    });
}

function closePrintPreview() {
    const overlay = document.getElementById('print-preview-overlay');
    if (printPreviewCleanup) {
        printPreviewCleanup();
        printPreviewCleanup = null;
    }
    printPreviewBuilder = null;
    document.body.classList.remove('print-preview-open');
    delete document.body.dataset.printOrientation;
    overlay?.classList.add('hidden');
    const sheet = document.getElementById('print-preview-sheet');
    if (sheet) sheet.innerHTML = '';
    const viewport = document.getElementById('print-preview-viewport');
    const sheetEl = document.getElementById('print-preview-sheet');
    if (viewport) {
        viewport.style.width = '';
        viewport.style.height = '';
    }
    if (sheetEl) {
        sheetEl.style.transform = '';
    }
    printPreviewZoom = 1;
}

function executePrintPreview() {
    applyPrintPageStyle();
    window.print();
}

function printCanvasView() {
    openPrintPreview(buildCanvasPrintHTML);
}

function getPrintNameColumnCount(guestCount) {
    if (guestCount <= 4) return 1;
    if (guestCount <= 10) return 2;
    return 3;
}

function getPrintTextFontSize(tableSize, guestCount) {
    const base = tableSize * (guestCount <= 4 ? 0.055 : guestCount <= 8 ? 0.048 : 0.04);
    return Math.max(11, Math.min(20, Math.round(base)));
}

function buildGuestCirclePrintHTML() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return `<p class="print-empty">${PRINT_EMPTY_MSG}</p>`;

    const page = getPrintPageInnerSize();
    const sheetW = page.w;
    const sheetH = page.h;
    const titleBleed = 24;
    const spanW = bounds.maxX - bounds.minX;
    const spanH = bounds.maxY - bounds.minY + titleBleed;
    const pad = PRINT_PAGE_PAD;
    const fitScale = Math.max(0.05, Math.min(
        (sheetW - pad * 2) / spanW,
        (sheetH - pad * 2) / spanH
    ));
    const floorW = spanW * fitScale;
    const floorH = spanH * fitScale;
    const offsetX = (sheetW - floorW) / 2;
    const offsetY = (sheetH - floorH) / 2;

    const sortedTableNums = getTableSettingKeys();

    const circles = sortedTableNums.map(tableNum => {
        const settings = tableSettings[tableNum];
        const idx = parseInt(tableNum, 10);
        const left = (settings.x - bounds.minX) * fitScale;
        const top = (settings.y - bounds.minY) * fitScale;
        const size = TABLE_DIM * fitScale;
        const guests = (allGuests[idx] || [])
            .filter(g => g && g.name)
            .sort((a, b) => (a.sort || 99) - (b.sort || 99));
        const colCount = getPrintNameColumnCount(guests.length);
        const fontSize = getPrintTextFontSize(size, guests.length);
        const titleSize = Math.max(12, Math.min(20, Math.round(size * 0.06)));
        const titleH = Math.max(16, Math.round(size * 0.07));
        const borderW = Math.max(1.5, fitScale * 2);
        const names = guests.length
            ? guests.map(g => `<span class="print-name-item">${escapeHtml(g.name)}</span>`).join('')
            : '<span class="print-empty">—</span>';

        return `
            <div class="print-table-unit" style="left:${left}px;top:${top}px;width:${size}px">
                <div class="print-table-title" style="font-size:${titleSize}px;height:${titleH}px;line-height:${titleH}px">第 ${tableNum} 桌</div>
                <div class="print-table-circle" style="width:${size}px;height:${size}px;border-width:${borderW}px">
                    <div class="print-name-grid" style="column-count:${colCount};font-size:${fontSize}px;line-height:1.25">${names}</div>
                </div>
            </div>
        `;
    }).join('');

    return `<div class="print-floor" style="width:${sheetW}px;height:${sheetH}px;overflow:hidden">
        <div class="print-floor-inner" style="position:relative;width:${floorW}px;height:${floorH}px;left:${offsetX}px;top:${offsetY}px">${circles}</div>
    </div>`;
}

function printGuestListView() {
    openPrintPreview(buildGuestCirclePrintHTML);
}

let isDraggingTable = false;
let draggedTableElement = null;
let tableOffsetX = 0;
let tableOffsetY = 0;
let isGuestDragging = false;

function createDragGhost(name, x, y) {
    const ghost = document.createElement('div');
    ghost.className = 'guest-drag-ghost';
    ghost.textContent = name;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    document.body.appendChild(ghost);
    return ghost;
}

function findGuestBySeat(tableIdx, seatIndex) {
    const guests = allGuests[tableIdx];
    if (!guests) return -1;
    return guests.findIndex(g => g && g.sort === seatIndex + 1);
}

function sortGuestArraysBySeat() {
    if (!allGuests) return;
    const tableLists = Array.isArray(allGuests) ? allGuests : Object.values(allGuests);
    tableLists.forEach(list => {
        if (Array.isArray(list)) {
            list.sort((a, b) => (parseInt(a?.sort, 10) || 99) - (parseInt(b?.sort, 10) || 99));
        }
    });
}

function persistGuestState() {
    sortGuestArraysBySeat();
    return database.ref().update({
        wedding_guests: allGuests,
        unassigned_guests: unassignedPool
    });
}

function moveGuestToSeat(data, toTableNum, targetSeatIdx) {
    const { fromTable, index, seatIndex } = data;
    const toTableIdx = parseInt(toTableNum, 10);
    const targetSortNum = targetSeatIdx + 1;

    if (!allGuests[toTableIdx]) allGuests[toTableIdx] = [];
    let movingGuestObj = null;

    if (fromTable === 'POOL') {
        movingGuestObj = unassignedPool[index];
        unassignedPool.splice(index, 1);
    } else {
        const fromTableIdx = parseInt(fromTable, 10);
        const foundIdx = findGuestBySeat(fromTableIdx, seatIndex);
        if (foundIdx !== -1) {
            movingGuestObj = allGuests[fromTableIdx][foundIdx];
            allGuests[fromTableIdx].splice(foundIdx, 1);
        }
    }

    if (!movingGuestObj) return;

    const occupiedIdx = allGuests[toTableIdx].findIndex(g => g && g.sort === targetSortNum);
    if (occupiedIdx !== -1) {
        const bumpedGuest = allGuests[toTableIdx][occupiedIdx];
        if (fromTable === 'POOL') {
            bumpedGuest.sort = 99;
            unassignedPool.push(bumpedGuest);
        } else {
            const fromTableIdx = parseInt(fromTable, 10);
            bumpedGuest.sort = seatIndex + 1;
            allGuests[fromTableIdx].push(bumpedGuest);
        }
        allGuests[toTableIdx].splice(occupiedIdx, 1);
    }

    movingGuestObj.sort = targetSortNum;
    allGuests[toTableIdx].push(movingGuestObj);

    persistGuestState();
}

function moveGuestToPool(data) {
    const { fromTable, seatIndex } = data;
    if (!fromTable || fromTable === 'POOL') return;

    const fromTableIdx = parseInt(fromTable, 10);
    const foundIdx = findGuestBySeat(fromTableIdx, seatIndex);
    if (foundIdx === -1) return;

    const movingGuestObj = allGuests[fromTableIdx][foundIdx];
    allGuests[fromTableIdx].splice(foundIdx, 1);
    movingGuestObj.sort = 99;
    if (!unassignedPool) unassignedPool = [];
    unassignedPool.push(movingGuestObj);

    persistGuestState();
}

function resolvePointerDrop(clientX, clientY, data) {
    const dropEl = document.elementFromPoint(clientX, clientY);
    if (!dropEl) return;

    if (dropEl.closest('#sidebar-content, #single-scroll-pool, .pool-group, .pool-guest-chip')) {
        moveGuestToPool(data);
        return;
    }

    const seatSlot = dropEl.closest('.seat-slot');
    if (seatSlot && seatSlot.dataset.tableNum != null) {
        moveGuestToSeat(data, seatSlot.dataset.tableNum, parseInt(seatSlot.dataset.seatIndex, 10));
    }
}

const GUEST_DRAG_THRESHOLD = 14;

function finishGuestTouchDrag(dragging, dragData, ghost, clientX, clientY) {
    if (dragging && dragData) {
        if (ghost) ghost.style.visibility = 'hidden';
        resolvePointerDrop(clientX, clientY, dragData);
    }
    if (ghost) ghost.remove();
    isGuestDragging = false;
    cancelTableDrag();
}

function handleGuestTouchMove(t, startX, startY, state, opts, sidebarRight, ev) {
    openSidebarIfDragEntersSidebar(t.clientX);
    if (sidebarRight != null) closeSidebarIfDragLeavesSidebar(t.clientX, sidebarRight);

    const dist = Math.hypot(t.clientX - startX, t.clientY - startY);
    if (!state.dragging && dist > GUEST_DRAG_THRESHOLD) {
        state.dragging = true;
        isGuestDragging = true;
        state.dragData = opts.getDragData();
        state.ghost = createDragGhost(state.dragData.name || '', t.clientX, t.clientY);
        if (opts.onDragStart) opts.onDragStart(state.dragData);
    }
    if (state.dragging) {
        if (ev) ev.preventDefault();
        state.ghost.style.left = `${t.clientX}px`;
        state.ghost.style.top = `${t.clientY}px`;
        if (opts.onDragMove) opts.onDragMove(t.clientX, t.clientY, state.dragData);
    }
}

function setupTouchDrag(el, getDragData, options) {
    const opts = typeof options === 'function' ? { onDragStart: options } : (options || {});
    const useDocListeners = !!opts.closeSidebarOnLeave;
    opts.getDragData = getDragData;

    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation();
        resetTouchGestures();
        cancelTableDrag();

        const touchId = e.touches[0].identifier;
        const startX = e.touches[0].clientX;
        const startY = e.touches[0].clientY;
        const state = { dragging: false, ghost: null, dragData: null };
        const sidebarRight = useDocListeners ? getSidebarRightEdge() : null;

        const findTouch = (list) => {
            for (let i = 0; i < list.length; i++) {
                if (list[i].identifier === touchId) return list[i];
            }
            return null;
        };

        if (useDocListeners) {
            const onDocMove = (ev) => {
                const t = findTouch(ev.touches);
                if (!t) return;
                handleGuestTouchMove(t, startX, startY, state, opts, sidebarRight, ev);
            };
            const onDocEnd = (ev) => {
                const ended = findTouch(ev.changedTouches);
                if (!ended) return;
                document.removeEventListener('touchmove', onDocMove, true);
                document.removeEventListener('touchend', onDocEnd, true);
                document.removeEventListener('touchcancel', onDocEnd, true);
                finishGuestTouchDrag(state.dragging, state.dragData, state.ghost, ended.clientX, ended.clientY);
            };
            document.addEventListener('touchmove', onDocMove, { passive: false, capture: true });
            document.addEventListener('touchend', onDocEnd, { capture: true });
            document.addEventListener('touchcancel', onDocEnd, { capture: true });
            return;
        }

        const onElMove = (ev) => {
            if (ev.touches.length !== 1) return;
            handleGuestTouchMove(ev.touches[0], startX, startY, state, opts, null, ev);
        };
        const onElEnd = (ev) => {
            el.removeEventListener('touchmove', onElMove);
            el.removeEventListener('touchend', onElEnd);
            el.removeEventListener('touchcancel', onElEnd);
            const t = ev.changedTouches[0];
            finishGuestTouchDrag(state.dragging, state.dragData, state.ghost, t.clientX, t.clientY);
        };
        el.addEventListener('touchmove', onElMove, { passive: false });
        el.addEventListener('touchend', onElEnd, { passive: true });
        el.addEventListener('touchcancel', onElEnd, { passive: true });
    }, { passive: true });
}

function setupDesktopGuestDrag(el, getDragData, options = {}) {
    el.setAttribute('draggable', 'true');
    if (options.pointerDown) {
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            cancelTableDrag();
            isGuestDragging = true;
        });
    }
    el.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        cancelTableDrag();
        isGuestDragging = true;
        e.dataTransfer.setData('text/plain', JSON.stringify(getDragData()));
    });
    el.addEventListener('drag', (e) => {
        openSidebarIfDragEntersSidebar(e.clientX);
        if (options.trackSidebarLeave) closeSidebarIfDragLeavesSidebar(e.clientX);
    });
    el.addEventListener('dragend', () => {
        isGuestDragging = false;
        cancelTableDrag();
    });
}

function cancelTableDrag() {
    if (!draggedTableElement) return;
    const el = draggedTableElement;
    const startX = parseFloat(el.dataset.dragStartX ?? el.dataset.baseX ?? 0);
    const startY = parseFloat(el.dataset.dragStartY ?? el.dataset.baseY ?? 0);
    el.dataset.baseX = startX;
    el.dataset.baseY = startY;
    el.style.left = `${startX * zoom}px`;
    el.style.top = `${startY * zoom}px`;
    el.classList.remove('is-dragging');
    isDraggingTable = false;
    draggedTableElement = null;
}

let seatingViewBootstrapped = false;

function runRender() {
    try {
        renderSidebar();
        renderCanvasTables();
        updateGlobalStats();
        applyTransform();
    } catch (err) {
        console.error('排位畫布渲染失敗:', err);
        const stats = document.getElementById('global-stats');
        if (stats) stats.innerText = '載入失敗，請重新整理';
    }
}

function bootstrapSeatingView() {
    runRender();
    initMobileExperience();
    updateTableLockUI();
    if (seatingViewBootstrapped) return;
    seatingViewBootstrapped = true;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => fitViewToTables());
    });
}

function setGlobalStatsMessage(message) {
    const stats = document.getElementById('global-stats');
    if (stats) stats.innerText = message;
}

function handleSeatingDataRoot(root) {
    root = root || {};
    allGuests = root.wedding_guests || [];
    unassignedPool = root.unassigned_guests || [];
    tableSettings = loadTableSettings(root.table_settings);
    applyMetaLabelColumns(root.meta_label_columns);

    if (ensureDefaultTablesIfEmpty()) {
        persistTableSettings().catch(err => {
            console.warn('table_settings 初始化失敗:', err);
        });
        bootstrapSeatingView();
        scheduleFloorLayoutSync();
        return;
    }

    if (!localStorage.getItem('seating_grid_snap_v1')) {
        snapAllTablesToGrid()
            .catch(err => console.warn('枱位對齊格線失敗:', err))
            .finally(() => {
                localStorage.setItem('seating_grid_snap_v1', '1');
                bootstrapSeatingView();
                scheduleFloorLayoutSync();
            });
        return;
    }

    bootstrapSeatingView();
    scheduleFloorLayoutSync();
}

// Firebase 實時同步（分拆監聽，避免一次下載成個 DB 太慢）
let seatingDataReady = { guests: false, pool: false, tables: false, meta: false };

function maybeBootstrapFromPartialSync() {
    if (!seatingDataReady.tables) return;
    bootstrapSeatingView();
}

function markSeatingPartialReady(key) {
    seatingDataReady[key] = true;
    maybeBootstrapFromPartialSync();
}

setGlobalStatsMessage('連線中...');

database.ref('wedding_guests').on('value', (snapshot) => {
    allGuests = snapshot.val() || [];
    markSeatingPartialReady('guests');
    runRender();
}, err => {
    console.error('wedding_guests 讀取失敗:', err);
    setGlobalStatsMessage('賓客資料讀取失敗');
});

database.ref('unassigned_guests').on('value', (snapshot) => {
    unassignedPool = snapshot.val() || [];
    markSeatingPartialReady('pool');
    runRender();
}, err => console.error('unassigned_guests 讀取失敗:', err));

database.ref('meta_label_columns').on('value', (snapshot) => {
    applyMetaLabelColumns(snapshot.val());
    markSeatingPartialReady('meta');
}, err => console.error('meta_label_columns 讀取失敗:', err));

database.ref('table_settings').on('value', (snapshot) => {
    const root = {
        wedding_guests: allGuests,
        unassigned_guests: unassignedPool,
        table_settings: snapshot.val(),
        meta_label_columns: null,
        floor_layout: null
    };
    handleSeatingDataRoot(root);
    markSeatingPartialReady('tables');
}, err => {
    console.error('table_settings 讀取失敗:', err);
    setGlobalStatsMessage('枱位資料讀取失敗');
});

window.addEventListener('resize', () => {
    if (!isMobileViewport()) return;
    clearTimeout(window._seatingResizeTimer);
    window._seatingResizeTimer = setTimeout(() => fitViewToTables(), 200);
});

function forEachGuestTable(callback) {
    if (Array.isArray(allGuests)) {
        allGuests.forEach(callback);
        return;
    }
    if (allGuests && typeof allGuests === 'object') {
        Object.values(allGuests).forEach(callback);
    }
}

function updateGlobalStats() {
    let total = 0, assigned = 0;
    forEachGuestTable(table => {
        if (Array.isArray(table)) {
            table.forEach(g => { if (g && g.name) { total++; assigned++; } });
        }
    });
    if (Array.isArray(unassignedPool)) {
        unassignedPool.forEach(g => { if (g && g.name) { total++; } });
    }
    document.getElementById('global-stats').innerText = `已排位: ${assigned} / 總人數: ${total}`;
}

function collectPoolBySide(side) {
    const groups = {};
    let count = 0;
    const pool = Array.isArray(unassignedPool) ? unassignedPool : [];
    pool.forEach((guest, index) => {
        if (!guest || !guest.name) return;
        const isMatch = side === '男方' ? guest.side === '男方' : guest.side !== '男方';
        if (!isMatch) return;
        count++;
        const gName = getPrimaryGroup(guest);
        if (!groups[gName]) groups[gName] = [];
        groups[gName].push({ data: guest, originalIndex: index });
    });
    return { groups, count };
}

function renderSidePool(container, groups, count, emptyMessage) {
    container.innerHTML = '';
    if (count === 0) {
        container.innerHTML = `<div class="text-center text-slate-400 text-sm py-4 font-medium">${emptyMessage}</div>`;
    } else {
        renderGroupData(groups, container);
    }
}

// 🎯 核心渲染更新：緊貼式上下結構
function renderSidebar() {
    const maleContainer = document.getElementById('pool-male');
    const femaleContainer = document.getElementById('pool-female');
    if (!maleContainer || !femaleContainer) return;

    const male = collectPoolBySide('男方');
    const female = collectPoolBySide('女方');
    renderSidePool(maleContainer, male.groups, male.count, '🎉 男方已全數安排');
    renderSidePool(femaleContainer, female.groups, female.count, '🎉 女方已全數安排');
}

function renderGroupData(groups, container) {
    Object.keys(groups).forEach(groupName => {
        const groupWrap = document.createElement('div');
        groupWrap.className = "pool-group bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm w-full";
        groupWrap.innerHTML = `<h4 class="pool-group-title text-xs font-bold text-slate-400 mb-2.5 border-b border-slate-100 pb-1">🏷️ ${groupName}</h4>`;

        const chipsContainer = document.createElement('div');
        chipsContainer.className = "grid grid-cols-2 gap-2";

        groups[groupName].forEach(item => {
            const chip = document.createElement('div');
            const poolSide = tagChipSideClasses(item.data.side === '女方' ? '女方' : '男方').pool;
            chip.className = `pool-guest-chip text-sm p-2.5 rounded-lg border text-center font-bold truncate transition-all hover:translate-y-[-1px] cursor-grab active:cursor-grabbing ${poolSide}`;
            chip.innerText = item.data.name;
            const poolDragData = () => ({
                fromTable: 'POOL',
                index: item.originalIndex,
                name: item.data.name
            });
            if (IS_TOUCH_DEVICE) {
                setupTouchDrag(chip, poolDragData, { closeSidebarOnLeave: true });
            } else {
                setupDesktopGuestDrag(chip, poolDragData, { trackSidebarLeave: true });
            }

            bindGuestTap(chip, () => {
                openGuestModal(item.data, null, null, item.originalIndex);
            });

            chipsContainer.appendChild(chip);
        });
        groupWrap.appendChild(chipsContainer);
        container.appendChild(groupWrap);
    });
}

function renderCanvasTables() {
    const sortedTableNums = getTableSettingKeys();
    document.querySelectorAll('.draggable-table').forEach(el => el.remove());

    sortedTableNums.forEach(tableNum => {
        const idx = parseInt(tableNum, 10);
        const settings = tableSettings[tableNum];
        if (!settings) return;
        const maxSeats = settings.max_seats || 12;
        const guestsInTable = allGuests[idx] || [];
        const filled = guestsInTable.filter(g => g && g.name).length;

        const seatSlotsArray = new Array(maxSeats).fill(null);
        guestsInTable.forEach(g => {
            if (g && g.name && g.sort >= 1 && g.sort <= maxSeats) {
                seatSlotsArray[g.sort - 1] = g;
            }
        });

        const tableWrapper = document.createElement('div');
        tableWrapper.className = "draggable-table";
        tableWrapper.dataset.baseX = settings.x;
        tableWrapper.dataset.baseY = settings.y;
        tableWrapper.style.left = `${settings.x * zoom}px`;
        tableWrapper.style.top = `${settings.y * zoom}px`;
        tableWrapper.setAttribute('data-table', tableNum);

        const startTableDrag = (e) => {
            if (isTablePositionLocked) return;
            if ((e.pointerType === 'mouse' && e.button !== 0) || isGuestDragging) return;
            if (e.target.closest('.seat-slot, .hub-center, .hub-ring')) return;
            e.stopPropagation();
            isDraggingTable = true;
            draggedTableElement = tableWrapper;
            tableWrapper.dataset.dragStartX = tableWrapper.dataset.baseX;
            tableWrapper.dataset.dragStartY = tableWrapper.dataset.baseY;
            const pos = screenToCanvas(e.clientX, e.clientY);
            tableOffsetX = pos.x - parseFloat(tableWrapper.dataset.baseX);
            tableOffsetY = pos.y - parseFloat(tableWrapper.dataset.baseY);
            tableWrapper.classList.add('is-dragging');
            tableWrapper.dataset.dragPointerId = e.pointerId;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        };

        const tablePlate = document.createElement('div');
        tablePlate.className = 'table-plate';
        if (!IS_TOUCH_DEVICE) {
            tablePlate.addEventListener('pointerdown', startTableDrag);
            tablePlate.ondblclick = (e) => {
                e.stopPropagation();
                cancelTableDrag();
                openSettingsModal(tableNum, maxSeats);
            };
        }

        const seatLayout = getSeatLayout(maxSeats);
        tablePlate.style.setProperty('--guest-size', `${seatLayout.guestSize}px`);

        for (let i = 0; i < maxSeats; i++) {
            const seatSlot = document.createElement('div');
            const angle = (i * 2 * Math.PI) / maxSeats - Math.PI / 2;
            const x = PLATE_CENTER + seatLayout.radius * Math.cos(angle);
            const y = PLATE_CENTER + seatLayout.radius * Math.sin(angle);

            seatSlot.style.left = `calc(${x}px * var(--zoom))`;
            seatSlot.style.top = `calc(${y}px * var(--zoom))`;
            seatSlot.dataset.tableNum = tableNum;
            seatSlot.dataset.seatIndex = i;

            const guest = seatSlotsArray[i];

            if (guest) {
                const sideClass = guest.side === '女方' ? 'side-female' : 'side-male';
                seatSlot.className = `seat-slot guest-seat-circle ${sideClass}`;
                seatSlot.innerHTML = `<span class="${getGuestNameTextClass(guest.name)}" title="${guest.name}">${formatGuestDisplayName(guest.name)}</span>`;

                bindGuestTap(seatSlot, () => {
                    openGuestModal(guest, tableNum, i);
                });

                const seatDragData = () => ({
                    fromTable: tableNum,
                    seatIndex: i,
                    name: guest.name
                });
                if (IS_TOUCH_DEVICE) {
                    setupTouchDrag(seatSlot, seatDragData);
                } else {
                    setupDesktopGuestDrag(seatSlot, seatDragData, { pointerDown: true });
                }
            } else {
                seatSlot.className = 'seat-slot seat-empty';
                seatSlot.innerHTML = '<span>+</span>';
            }

            seatSlot.setAttribute('ondragover', 'allowDrop(event)');
            seatSlot.setAttribute('ondrop', `handleDropOnSpecificSeat(event, "${tableNum}", ${i})`);

            tablePlate.appendChild(seatSlot);
        }

        tablePlate.insertAdjacentHTML('beforeend', buildHubRingSVG(filled, maxSeats));

        const tableLabel = (settings.label || '').trim();
        const hubCenter = document.createElement('div');
        hubCenter.className = 'hub-center';
        hubCenter.innerHTML = [
            `<span class="hub-title">Table ${tableNum}</span>`,
            tableLabel ? `<span class="hub-category">${escapeHtml(tableLabel)}</span>` : '',
            `<span class="hub-num">${filled}</span>`
        ].join('');
        if (IS_TOUCH_DEVICE) {
            bindGuestTap(hubCenter, () => openSettingsModal(tableNum, maxSeats));
        } else {
            const hubTitle = hubCenter.querySelector('.hub-title');
            if (hubTitle) {
                bindGuestTap(hubTitle, () => openSettingsModal(tableNum, maxSeats));
            }
        }
        tablePlate.appendChild(hubCenter);

        tableWrapper.appendChild(tablePlate);
        canvas.appendChild(tableWrapper);
    });

    requestAnimationFrame(() => fitAllGuestNameFonts());
}

function finishTableDrag() {
    if (isGuestDragging) {
        cancelTableDrag();
        return;
    }
    if (isDraggingTable && draggedTableElement) {
        const bx = parseInt(draggedTableElement.dataset.baseX, 10);
        const by = parseInt(draggedTableElement.dataset.baseY, 10);
        const startX = parseInt(draggedTableElement.dataset.dragStartX, 10);
        const startY = parseInt(draggedTableElement.dataset.dragStartY, 10);
        const moved = Math.abs(bx - startX) > 2 || Math.abs(by - startY) > 2;
        if (moved) {
            const tableNum = draggedTableElement.getAttribute('data-table');
            tableSettings[tableNum].x = bx;
            tableSettings[tableNum].y = by;
            database.ref(`table_settings/${tableNum}`).update({ x: bx, y: by })
                .then(() => forceFloorLayoutSync())
                .catch(err => console.warn('枱位同步失敗:', err));
        } else {
            cancelTableDrag();
            return;
        }
        draggedTableElement.classList.remove('is-dragging');
    }
    isDraggingTable = false;
    draggedTableElement = null;
}

document.addEventListener('pointermove', (e) => {
    if (isGuestDragging || !isDraggingTable || !draggedTableElement) return;
    if (draggedTableElement.dataset.dragPointerId && e.pointerId !== parseInt(draggedTableElement.dataset.dragPointerId, 10)) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    let bx = snapToGrid(pos.x - tableOffsetX);
    let by = snapToGrid(pos.y - tableOffsetY);
    if (bx < 0) bx = 0;
    if (by < 0) by = 0;
    draggedTableElement.dataset.baseX = bx;
    draggedTableElement.dataset.baseY = by;
    draggedTableElement.style.left = `${bx * zoom}px`;
    draggedTableElement.style.top = `${by * zoom}px`;
});

document.addEventListener('pointerup', finishTableDrag);
document.addEventListener('pointercancel', finishTableDrag);

function allowDrop(e) { e.preventDefault(); }

function openGuestModal(guest, tableNum, seatIdx, poolIndex) {
    const fromPool = poolIndex != null;
    selectedGuestContext = { guest, tableNum, seatIdx, poolIndex, fromPool };
    document.getElementById('edit-guest-name').value = guest.name;
    document.getElementById('edit-guest-side').value = guest.side === '女方' ? '女方' : '男方';
    renderModalTags(guest.group);
    document.getElementById('md-guest-seat').innerText = fromPool
        ? '未安排'
        : `第 ${tableNum} 桌 - 座位 ${seatIdx + 1}`;
    document.getElementById('btn-remove-from-seat').classList.toggle('hidden', fromPool);
    showModal(document.getElementById('guest-detail-modal'));
}

function closeGuestModal() {
    hideModal(document.getElementById('guest-detail-modal'));
    document.getElementById('btn-remove-from-seat').classList.remove('hidden');
    selectedGuestContext = null;
}

function saveGuestChangesAction() {
    if (!selectedGuestContext) return;
    const { tableNum, seatIdx, poolIndex, fromPool } = selectedGuestContext;

    const newName = document.getElementById('edit-guest-name').value.trim();
    const newGroup = readModalTags();
    const newSide = document.getElementById('edit-guest-side').value;

    if (!newName) { alert("❌ 姓名不能為空！"); return; }

    if (fromPool) {
        if (unassignedPool[poolIndex]) {
            unassignedPool[poolIndex].name = newName;
            unassignedPool[poolIndex].group = newGroup;
            unassignedPool[poolIndex].side = newSide;
            Promise.all([
                database.ref('unassigned_guests').set(unassignedPool),
                persistMetaLabelColumns()
            ]).then(() => closeGuestModal());
        }
        return;
    }

    const tableIdx = parseInt(tableNum);
    const foundIdx = findGuestBySeat(tableIdx, seatIdx);
    if (foundIdx !== -1) {
        allGuests[tableIdx][foundIdx].name = newName;
        allGuests[tableIdx][foundIdx].group = newGroup;
        allGuests[tableIdx][foundIdx].side = newSide;

        Promise.all([
            database.ref(`wedding_guests/${tableIdx}`).set(allGuests[tableIdx]),
            persistMetaLabelColumns()
        ]).then(() => closeGuestModal());
    }
}

function removeGuestFromSeatAction() {
    if (!selectedGuestContext) return;
    const { tableNum, seatIdx } = selectedGuestContext;
    const tableIdx = parseInt(tableNum);

    const foundIdx = findGuestBySeat(tableIdx, seatIdx);
    if (foundIdx !== -1) {
        let guestObj = allGuests[tableIdx][foundIdx];
        allGuests[tableIdx].splice(foundIdx, 1);
        guestObj.sort = 99;

        if (!unassignedPool) unassignedPool = [];
        unassignedPool.push(guestObj);

        persistGuestState().then(() => closeGuestModal());
    }
}

function handleDropOnSpecificSeat(e, toTableNum, targetSeatIdx) {
    e.preventDefault();
    e.stopPropagation();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        moveGuestToSeat(data, toTableNum, targetSeatIdx);
    } catch (err) { console.error(err); }
}

document.addEventListener('dragover', (e) => {
    if (!isGuestDragging) return;
    openSidebarIfDragEntersSidebar(e.clientX);
}, { passive: true });

document.addEventListener('dragend', () => {
    isGuestDragging = false;
    cancelTableDrag();
});

function handleDropTrash(e) {
    e.preventDefault();
    e.stopPropagation();
    isGuestDragging = false;
    cancelTableDrag();
    try {
        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;
        moveGuestToPool(JSON.parse(dataStr));
    } catch (err) { console.error(err); }
}

function createNewTableAction() {
    const newNum = prompt("請輸入全新圓枱桌號:");
    if (!newNum || newNum.trim() === "") return;
    const cleanNum = newNum.trim();

    if (tableSettings[cleanNum]) { alert("❌ 此桌號已存在！"); return; }
    const maxSeats = prompt(`請輸入第 ${cleanNum} 桌的人數上限：`, "12");
    const cleanMax = parseInt(maxSeats) || 12;

    const center = screenToCanvas(
        viewport.getBoundingClientRect().left + viewport.getBoundingClientRect().width / 2,
        viewport.getBoundingClientRect().top + viewport.getBoundingClientRect().height / 2
    );
    database.ref(`table_settings/${cleanNum}`).set({
        max_seats: cleanMax,
        x: snapToGrid(center.x - PLATE_SIZE / 2),
        y: snapToGrid(center.y - TABLE_TOTAL_H / 2)
    }).then(() => forceFloorLayoutSync());
}

function fillTableSettingsForm(tableNum, currentMax) {
    const settings = tableSettings[tableNum] || {};
    const numEl = document.getElementById('modal-table-num');
    const labelEl = document.getElementById('modal-table-label');
    const maxEl = document.getElementById('modal-max-seats');
    const numStr = String(tableNum);

    numEl.value = '';
    numEl.defaultValue = numStr;
    numEl.setAttribute('value', numStr);
    numEl.value = numStr;

    labelEl.value = settings.label || '';
    maxEl.value = String(currentMax);
}

function openSettingsModal(tableNum, currentMax) {
    activeSettingTableNum = String(tableNum);
    document.getElementById('modal-table-title').innerText = `⚙️ Table ${tableNum} 設定`;
    fillTableSettingsForm(tableNum, currentMax);
    showModal(document.getElementById('table-settings-modal'));
}

function closeSettingsModal() {
    hideModal(document.getElementById('table-settings-modal'));
    document.getElementById('modal-table-num').value = '';
    document.getElementById('modal-table-label').value = '';
    document.getElementById('modal-max-seats').value = '';
    activeSettingTableNum = null;
}

function saveTableSettingsAction() {
    if (!activeSettingTableNum) return;

    const oldNum = String(activeSettingTableNum);
    const newNumRaw = document.getElementById('modal-table-num').value.trim();
    const newLabel = document.getElementById('modal-table-label').value.trim();
    const newMax = parseInt(document.getElementById('modal-max-seats').value) || 12;

    if (!newNumRaw) { alert('❌ 枱號不能為空！'); return; }
    const newNum = String(parseInt(newNumRaw, 10));
    if (!newNum || newNum === 'NaN' || parseInt(newNum, 10) < 1) {
        alert('❌ 請輸入有效枱號（1–99）！');
        return;
    }
    if (newNum !== oldNum && tableSettings[newNum]) {
        alert(`❌ Table ${newNum} 已存在！`);
        return;
    }

    const oldSettings = tableSettings[oldNum] || {};
    const newSettings = {
        ...oldSettings,
        max_seats: newMax,
        label: newLabel
    };

    if (newNum === oldNum) {
        tableSettings[oldNum] = { ...tableSettings[oldNum], max_seats: newMax, label: newLabel };
        database.ref(`table_settings/${oldNum}`).update({
            max_seats: newMax,
            label: newLabel
        }).then(() => {
            scheduleFloorLayoutSync();
            closeSettingsModal();
        });
        return;
    }

    const oldIdx = parseInt(oldNum, 10);
    const newIdx = parseInt(newNum, 10);
    const guests = (allGuests[oldIdx] || []).map(g => {
        if (!g || !g.name) return g;
        return { ...g, table: newIdx };
    });

    delete tableSettings[oldNum];
    tableSettings[newNum] = newSettings;
    if (Array.isArray(allGuests)) {
        allGuests[newIdx] = guests;
        allGuests[oldIdx] = [];
    }

    const updates = {};
    updates[`table_settings/${newNum}`] = newSettings;
    updates[`table_settings/${oldNum}`] = null;
    updates[`wedding_guests/${newIdx}`] = guests;
    updates[`wedding_guests/${oldIdx}`] = null;

    database.ref().update(updates).then(() => persistTableSettings())
        .then(() => forceFloorLayoutSync())
        .then(() => {
            runRender();
            closeSettingsModal();
        })
        .catch(err => alert(`❌ 儲存失敗：${err.message || err}`));
}

function deleteTableAction() {
    if (!activeSettingTableNum) return;
    const tableNum = String(activeSettingTableNum);
    if (!confirm(`⚠️ 確定要刪除第 ${tableNum} 桌嗎？所有人會退回左側。`)) return;

    const idx = parseInt(tableNum, 10);
    const guestsInTable = Array.isArray(allGuests[idx]) ? allGuests[idx] : [];
    if (!Array.isArray(unassignedPool)) unassignedPool = [];

    guestsInTable.forEach(g => {
        if (g && g.name) {
            g.sort = 99;
            unassignedPool.push(g);
        }
    });
    if (Array.isArray(allGuests)) allGuests[idx] = [];

    delete tableSettings[tableNum];

    Promise.all([
        persistTableSettings(),
        database.ref(`wedding_guests/${idx}`).set(null),
        database.ref('unassigned_guests').set(unassignedPool)
    ]).then(() => forceFloorLayoutSync())
        .then(() => {
            runRender();
            closeSettingsModal();
        })
        .catch(err => alert(`❌ 刪除失敗：${err.message || err}`));
}

applyPrintPageStyle();
