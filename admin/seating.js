const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let allGuests = [];         
let unassignedPool = [];    
let tableSettings = {};     
let activeSettingTableNum = null;
let selectedGuestContext = null;

const PRIMARY_TAG_KEY = 'group';
let categoriesByColumn = {
    'group': ['LK', '家人', '男方親戚', '女方親戚', '中學同學']
};
let activeSelectElement = null;
let activeColumnKey = null;

function normalizeGuestTags(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(t => String(t).trim()).filter(t => t && t !== '未分類');
    const s = String(val).trim();
    if (!s || s === '未分類') return [];
    if (s.includes('|')) return s.split('|').map(t => t.trim()).filter(t => t && t !== '未分類');
    return [s];
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
    } else if (meta && meta.categories) {
        categoriesByColumn = meta.categories;
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
    insertModalTagChip(columnKey, val);
    refreshModalTagAddSelect(columnKey);
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

function getTablesBoundingBox() {
    const nums = Object.keys(tableSettings);
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
    Object.keys(tableSettings).forEach(num => {
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
    Object.keys(tableSettings).forEach(num => {
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
    if (menu) menu.classList.add('hidden');
}

function togglePrintMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('print-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#print-menu-wrap')) closePrintMenu();
});

let printPreviewCleanup = null;
let printPreviewZoom = 1;
let printPreviewOrientation = 'portrait';
let printLayoutZoom = 1;
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
    return Math.min(2, Math.max(0.08, computePrintFitScale(bounds)));
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
    printLayoutZoom = computePrintLayoutZoom(bounds);

    const contentW = (spanW + pad * 2) * printLayoutZoom;
    const contentH = (spanH + pad * 2) * printLayoutZoom;
    const offsetX = (page.w - contentW) / 2;
    const offsetY = (page.h - contentH) / 2;

    const tablesHTML = Array.from(canvas.querySelectorAll('.draggable-table')).map(el => {
        const bx = parseFloat(el.dataset.baseX);
        const by = parseFloat(el.dataset.baseY);
        const plate = el.querySelector('.table-plate');
        if (!plate) return '';
        const left = offsetX + (bx - bounds.minX + pad) * printLayoutZoom;
        const top = offsetY + (by - bounds.minY + pad) * printLayoutZoom;
        return `<div class="draggable-table" style="left:${left}px;top:${top}px">${cloneTablePlateForPrint(plate)}</div>`;
    }).join('');

    return `<div class="print-tables-layout" style="--zoom:${printLayoutZoom}">${tablesHTML}</div>`;
}

function applyPrintPreviewTransform() {
    const viewport = document.getElementById('print-preview-viewport');
    const pct = document.getElementById('print-zoom-percent');

    if (viewport) {
        viewport.style.zoom = printPreviewZoom;
        if (!('zoom' in viewport.style)) {
            viewport.style.transform = `scale(${printPreviewZoom})`;
            viewport.style.transformOrigin = 'top center';
        } else {
            viewport.style.transform = '';
        }
    }
    if (pct) pct.textContent = `${Math.round(printPreviewZoom * 100)}%`;
}

function stepPrintPreviewZoom(delta) {
    printPreviewZoom = snapPrintPreviewZoom(printPreviewZoom + delta);
    applyPrintPreviewTransform();
}

function fitPrintPreviewZoom() {
    const scroll = document.getElementById('print-preview-scroll');
    const sheet = document.getElementById('print-preview-sheet');
    if (!scroll || !sheet) return;
    const padding = 48;
    const zoomX = (scroll.clientWidth - padding) / sheet.offsetWidth;
    const zoomY = (scroll.clientHeight - padding) / sheet.offsetHeight;
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
    if (!sheet || !document.body.classList.contains('print-preview-open')) return;
    const savedZoom = printPreviewZoom;
    if (sheet.querySelector('.print-tables-layout')) {
        sheet.innerHTML = buildCanvasPrintHTML();
    } else if (sheet.querySelector('.print-floor')) {
        sheet.innerHTML = buildGuestCirclePrintHTML();
    } else {
        return;
    }
    printPreviewZoom = savedZoom;
    requestAnimationFrame(() => applyPrintPreviewTransform());
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
    if (viewport) {
        viewport.style.zoom = '';
        viewport.style.transform = '';
    }
    document.body.classList.add('print-preview-open');
    overlay.classList.remove('hidden');
    document.getElementById('print-preview-scroll')?.scrollTo(0, 0);
    requestAnimationFrame(() => applyPrintPreviewTransform());
}

function closePrintPreview() {
    const overlay = document.getElementById('print-preview-overlay');
    if (printPreviewCleanup) {
        printPreviewCleanup();
        printPreviewCleanup = null;
    }
    document.body.classList.remove('print-preview-open');
    delete document.body.dataset.printOrientation;
    overlay?.classList.add('hidden');
    const sheet = document.getElementById('print-preview-sheet');
    if (sheet) sheet.innerHTML = '';
    const viewport = document.getElementById('print-preview-viewport');
    if (viewport) {
        viewport.style.zoom = '';
        viewport.style.transform = '';
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
    if (guestCount <= 8) return 2;
    return 3;
}

function buildGuestCirclePrintHTML() {
    const bounds = getTablesBoundingBox();
    if (!bounds) return `<p class="print-empty">${PRINT_EMPTY_MSG}</p>`;

    const page = getPrintPageInnerSize();
    const sheetW = page.w;
    const sheetH = page.h;
    const scale = computePrintFitScale(bounds);
    const floorW = spanW * scale;
    const floorH = spanH * scale;
    const titleH = 22 * scale;

    const sortedTableNums = Object.keys(tableSettings).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    const circles = sortedTableNums.map(tableNum => {
        const settings = tableSettings[tableNum];
        const idx = parseInt(tableNum, 10);
        const left = (settings.x - bounds.minX) * scale;
        const top = (settings.y - bounds.minY) * scale;
        const size = TABLE_DIM * scale;
        const guests = (allGuests[idx] || [])
            .filter(g => g && g.name)
            .sort((a, b) => (a.sort || 99) - (b.sort || 99));
        const colCount = getPrintNameColumnCount(guests.length);
        const fontSize = Math.max(9, Math.min(13, size * 0.032));
        const titleSize = Math.max(10, Math.min(15, size * 0.05));
        const borderW = Math.max(1.5, scale * 1.8);
        const names = guests.length
            ? guests.map(g => `<span class="print-name-item">${escapeHtml(g.name)}</span>`).join('')
            : '<span class="print-empty">—</span>';

        return `
            <div class="print-table-unit" style="left:${left}px;top:${top}px;width:${size}px">
                <div class="print-table-title" style="font-size:${titleSize}px;height:${titleH}px">第 ${tableNum} 桌</div>
                <div class="print-table-circle" style="width:${size}px;height:${size}px;border-width:${borderW}px">
                    <div class="print-name-grid" style="column-count:${colCount};font-size:${fontSize}px">${names}</div>
                </div>
            </div>
        `;
    }).join('');

    const offsetX = (sheetW - floorW) / 2;
    const offsetY = (sheetH - (floorH + titleH)) / 2;
    return `<div class="print-floor" style="width:${sheetW}px;height:${sheetH}px">
        <div class="print-floor-inner" style="position:relative;width:${floorW}px;height:${floorH + titleH}px;left:${offsetX}px;top:${offsetY}px">${circles}</div>
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

function persistGuestState() {
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
    renderSidebar();
    renderCanvasTables();
    updateGlobalStats();
    applyTransform();
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

// Firebase 實時同步
database.ref().on('value', (snapshot) => {
    const root = snapshot.val() || {};
    allGuests = root.wedding_guests || [];
    unassignedPool = root.unassigned_guests || [];
    tableSettings = root.table_settings || {};
    applyMetaLabelColumns(root.meta_label_columns);

    let updatedSettings = false;
    for(let i = 1; i <= 14; i++) {
        if (!tableSettings[i]) {
            const row = Math.floor((i - 1) / 4);
            const col = (i - 1) % 4;
            const colGap = 440;
            const rowGap = 460;
            const gridW = 3 * colGap + TABLE_DIM;
            const gridH = 3 * rowGap + TABLE_TOTAL_H;
            const startX = snapToGrid(CANVAS_W / 2 - gridW / 2);
            const startY = snapToGrid(CANVAS_H / 2 - gridH / 2);
            tableSettings[i] = {
                max_seats: 12,
                x: snapToGrid(startX + col * colGap),
                y: snapToGrid(startY + row * rowGap)
            };
            updatedSettings = true;
        }
    }
    if (updatedSettings) {
        database.ref('table_settings').update(tableSettings);
        return; 
    }

    if (!localStorage.getItem('seating_grid_snap_v1')) {
        snapAllTablesToGrid().then(() => {
            localStorage.setItem('seating_grid_snap_v1', '1');
            bootstrapSeatingView();
        });
        return;
    }

    bootstrapSeatingView();
});

window.addEventListener('resize', () => {
    if (!isMobileViewport()) return;
    clearTimeout(window._seatingResizeTimer);
    window._seatingResizeTimer = setTimeout(() => fitViewToTables(), 200);
});

function updateGlobalStats() {
    let total = 0, assigned = 0;
    allGuests.forEach(table => {
        if (Array.isArray(table)) {
            table.forEach(g => { if (g && g.name) { total++; assigned++; } });
        }
    });
    unassignedPool.forEach(g => { if (g && g.name) { total++; } });
    document.getElementById('global-stats').innerText = `已排位: ${assigned} / 總人數: ${total}`;
}

function collectPoolBySide(side) {
    const groups = {};
    let count = 0;
    unassignedPool.forEach((guest, index) => {
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
    const sortedTableNums = Object.keys(tableSettings).sort((a,b) => parseInt(a) - parseInt(b));
    document.querySelectorAll('.draggable-table').forEach(el => el.remove());

    sortedTableNums.forEach(tableNum => {
        const idx = parseInt(tableNum);
        const settings = tableSettings[tableNum];
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
            database.ref(`table_settings/${tableNum}`).update({ x: bx, y: by });
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
    });
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
        database.ref(`table_settings/${oldNum}`).update({
            max_seats: newMax,
            label: newLabel
        }).then(() => closeSettingsModal());
        return;
    }

    const oldIdx = parseInt(oldNum, 10);
    const newIdx = parseInt(newNum, 10);
    const guests = (allGuests[oldIdx] || []).map(g => {
        if (!g || !g.name) return g;
        return { ...g, table: newIdx };
    });

    const updates = {};
    updates[`table_settings/${newNum}`] = newSettings;
    updates[`table_settings/${oldNum}`] = null;
    updates[`wedding_guests/${newIdx}`] = guests;
    updates[`wedding_guests/${oldIdx}`] = null;

    database.ref().update(updates).then(() => closeSettingsModal());
}

function deleteTableAction() {
    if (!activeSettingTableNum) return;
    if (confirm(`⚠️ 確定要刪除第 ${activeSettingTableNum} 桌嗎？所有人會退回左側。`)) {
        const idx = parseInt(activeSettingTableNum);
        const guestsInTable = allGuests[idx] || [];
        guestsInTable.forEach(g => { if (g && g.name) { g.sort = 99; unassignedPool.push(g); } });
        allGuests[idx] = [];
        
        Promise.all([
            database.ref(`wedding_guests/${idx}`).remove(),
            database.ref(`unassigned_guests`).set(unassignedPool),
            database.ref(`table_settings/${activeSettingTableNum}`).remove()
        ]).then(() => { closeSettingsModal(); });
    }
}

applyPrintPageStyle();
