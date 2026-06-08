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

function buildTagChipHTML(tag, columnKey) {
    const safe = tag.replace(/"/g, '&quot;');
    return `<span class="tag-chip inline-flex items-center gap-0.5 bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[10px] font-bold" data-tag="${safe}">${tag}<button type="button" onclick="removeModalTag(this,'${columnKey}')" class="text-red-500 hover:text-red-700 font-black leading-none">×</button></span>`;
}

function buildTagAddSelectHTML(columnKey, selectedTags) {
    const optionsArr = categoriesByColumn[columnKey] || ['未分類'];
    const available = optionsArr.filter(cat => !selectedTags.includes(cat));
    let optsHTML = `<option value="">＋</option>`;
    optsHTML += available.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    optsHTML += `<option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂...</option>`;
    return `<select onchange="handleModalTagAdd(this, '${columnKey}')" class="row-tag-add-select row-tag-add-select-${columnKey} border border-red-200 bg-red-50/20 rounded px-1 py-0.5 text-[10px] font-bold focus:bg-white shrink-0">${optsHTML}</select>`;
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
            refreshModalTagAddSelect(activeColumnKey);
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

function getSidebarWidth() {
    if (!isSidebarOpen) return 0;
    return isMobileViewport() ? Math.min(window.innerWidth * 0.88, 300) : 320;
}

function bindGuestTap(element, onTap) {
    let startX = 0, startY = 0, moved = false;
    element.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        moved = false;
    });
    element.addEventListener('pointermove', (e) => {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;
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
let pinchZoom = 1;

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
    let nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    nextZoom = Math.min(2.5, Math.max(0.35, nextZoom));

    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const canvasX = (mouseX - panX) / zoom;
    const canvasY = (mouseY - panY) / zoom;

    zoom = nextZoom;
    panX = mouseX - canvasX * zoom;
    panY = mouseY - canvasY * zoom;
    applyTransform();
}, { passive: false });

function canStartCanvasPan(target) {
    return !target.closest('.seat-slot, .table-plate, .pool-guest-chip, button, input, select, a, #sidebar-content');
}

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

viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        isPanning = false;
        panPointerId = null;
        lastPinchDist = getTouchDistance(e.touches);
        const center = getTouchCenter(e.touches);
        const canvasX = (center.x - panX) / zoom;
        const canvasY = (center.y - panY) / zoom;
        pinchZoom = zoom;
        viewport._pinchCanvasX = canvasX;
        viewport._pinchCanvasY = canvasY;
        viewport._pinchCenterX = center.x;
        viewport._pinchCenterY = center.y;
    }
}, { passive: false });

viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !lastPinchDist) return;
    e.preventDefault();
    const dist = getTouchDistance(e.touches);
    const scale = dist / lastPinchDist;
    const center = getTouchCenter(e.touches);
    const nextZoom = Math.min(2.5, Math.max(0.15, pinchZoom * scale));
    const canvasX = viewport._pinchCanvasX;
    const canvasY = viewport._pinchCanvasY;
    zoom = nextZoom;
    panX = center.x - canvasX * zoom;
    panY = center.y - canvasY * zoom;
    applyTransform();
}, { passive: false });

viewport.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        lastPinchDist = 0;
        pinchZoom = zoom;
    }
});

viewport.addEventListener('contextmenu', e => e.preventDefault());

function zoomCanvas(factor) {
    const rect = viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const canvasX = (centerX - panX) / zoom;
    const canvasY = (centerY - panY) / zoom;

    zoom = Math.min(2.5, Math.max(0.35, zoom * factor));
    panX = centerX - canvasX * zoom;
    panY = centerY - canvasY * zoom;
    applyTransform();
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
    const sidebarWidth = getSidebarWidth();
    const vpW = vpRect.width - sidebarWidth;
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
    if (len <= 3) return escapeHtml(text);
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

function formatGuestDisplayName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';

    const attachMatch = trimmed.match(/^(.+?)\s*(眷屬\s*\d+.*)$/);
    let mainPart = trimmed;
    let attachPart = '';
    if (attachMatch) {
        mainPart = attachMatch[1].trim();
        attachPart = attachMatch[2].replace(/\s+/g, '');
    }

    const cjkMain = mainPart.replace(/\s/g, '');
    if (/^[\u4e00-\u9fff]+$/.test(cjkMain)) {
        let html = splitCJKNameEvenly(cjkMain);
        if (attachPart) html += `<br>${escapeHtml(attachPart)}`;
        return html;
    }

    if (attachPart) return `${escapeHtml(mainPart)}<br>${escapeHtml(attachPart)}`;
    if (trimmed.includes(' ')) {
        return trimmed.split(/\s+/).map(escapeHtml).join('<br>');
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

function initMobileExperience() {
    if (!isMobileViewport() || !isSidebarOpen) return;
    const sidebar = document.getElementById('sidebar-panel');
    const icon = document.getElementById('sidebar-toggle-icon');
    sidebar.classList.add('collapsed');
    icon.innerText = '▶';
    isSidebarOpen = false;
}

// 側邊欄開合
let isSidebarOpen = true;
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-panel');
    const icon = document.getElementById('sidebar-toggle-icon');
    if (isSidebarOpen) {
        sidebar.classList.add('collapsed');
        icon.innerText = "▶";
    } else {
        sidebar.classList.remove('collapsed');
        icon.innerText = "◀";
    }
    isSidebarOpen = !isSidebarOpen;
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
        const foundIdx = allGuests[fromTableIdx].findIndex(g => g && g.sort === (seatIndex + 1));
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

    database.ref().update({
        wedding_guests: allGuests,
        unassigned_guests: unassignedPool
    });
}

function moveGuestToPool(data) {
    const { fromTable, seatIndex } = data;
    if (!fromTable || fromTable === 'POOL') return;

    const fromTableIdx = parseInt(fromTable, 10);
    const foundIdx = allGuests[fromTableIdx].findIndex(g => g && g.sort === (seatIndex + 1));
    if (foundIdx === -1) return;

    const movingGuestObj = allGuests[fromTableIdx][foundIdx];
    allGuests[fromTableIdx].splice(foundIdx, 1);
    movingGuestObj.sort = 99;
    if (!unassignedPool) unassignedPool = [];
    unassignedPool.push(movingGuestObj);

    database.ref().update({
        wedding_guests: allGuests,
        unassigned_guests: unassignedPool
    });
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

function setupGuestPointerDrag(seatSlot, guest, tableNum, seatIndex) {
    let startX = 0, startY = 0, dragging = false, ghost = null, dragData = null;
    const threshold = IS_TOUCH_DEVICE ? 8 : 12;

    seatSlot.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        dragging = false;
        e.stopPropagation();
        cancelTableDrag();
        try { seatSlot.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    seatSlot.addEventListener('pointermove', (e) => {
        if (!seatSlot.hasPointerCapture(e.pointerId)) return;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (!dragging && dist > threshold) {
            dragging = true;
            isGuestDragging = true;
            dragData = { fromTable: tableNum, seatIndex, name: guest.name };
            ghost = createDragGhost(guest.name, e.clientX, e.clientY);
        }
        if (dragging && ghost) {
            ghost.style.left = `${e.clientX}px`;
            ghost.style.top = `${e.clientY}px`;
        }
    });

    const endDrag = (e) => {
        if (!seatSlot.hasPointerCapture(e.pointerId)) return;
        try { seatSlot.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (dragging && dragData) {
            if (ghost) ghost.style.visibility = 'hidden';
            resolvePointerDrop(e.clientX, e.clientY, dragData);
        }
        if (ghost) ghost.remove();
        dragging = false;
        ghost = null;
        dragData = null;
        isGuestDragging = false;
        cancelTableDrag();
    };

    seatSlot.addEventListener('pointerup', endDrag);
    seatSlot.addEventListener('pointercancel', endDrag);
}

function setupPoolPointerDrag(chip, guest, poolIndex) {
    let startX = 0, startY = 0, dragging = false, ghost = null, dragData = null;

    chip.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        dragging = false;
        e.stopPropagation();
        cancelTableDrag();
        try { chip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    chip.addEventListener('pointermove', (e) => {
        if (!chip.hasPointerCapture(e.pointerId)) return;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (!dragging && dist > 8) {
            dragging = true;
            isGuestDragging = true;
            dragData = { fromTable: 'POOL', index: poolIndex, name: guest.name };
            ghost = createDragGhost(guest.name, e.clientX, e.clientY);
        }
        if (dragging && ghost) {
            ghost.style.left = `${e.clientX}px`;
            ghost.style.top = `${e.clientY}px`;
        }
    });

    const endDrag = (e) => {
        if (!chip.hasPointerCapture(e.pointerId)) return;
        try { chip.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (dragging && dragData) {
            if (ghost) ghost.style.visibility = 'hidden';
            resolvePointerDrop(e.clientX, e.clientY, dragData);
        }
        if (ghost) ghost.remove();
        dragging = false;
        ghost = null;
        dragData = null;
        isGuestDragging = false;
        cancelTableDrag();
    };

    chip.addEventListener('pointerup', endDrag);
    chip.addEventListener('pointercancel', endDrag);
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

    const runRender = () => {
        renderSidebar();
        renderCanvasTables();
        updateGlobalStats();
        applyTransform();
    };

    if (!localStorage.getItem('seating_grid_snap_v1')) {
        snapAllTablesToGrid().then((moved) => {
            localStorage.setItem('seating_grid_snap_v1', '1');
            if (!moved) runRender();
        });
        return;
    }

    runRender();
    initMobileExperience();
    if (isMobileViewport()) {
        fitViewToTables();
    } else if (!localStorage.getItem('seating_view_fitted_v3')) {
        fitViewToTables();
        localStorage.setItem('seating_view_fitted_v3', '1');
    }
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

// 🎯 核心渲染更新：緊貼式上下結構
function renderSidebar() {
    const maleContainer = document.getElementById('pool-male');
    const femaleContainer = document.getElementById('pool-female');
    if (!maleContainer || !femaleContainer) return;
    
    maleContainer.innerHTML = '';
    femaleContainer.innerHTML = '';

    let maleGroups = {};
    let femaleGroups = {};
    let maleCount = 0;
    let femaleCount = 0;

    unassignedPool.forEach((guest, index) => {
        if (!guest || !guest.name) return;
        const gName = getPrimaryGroup(guest);
        
        if (guest.side === '男方') {
            maleCount++;
            if (!maleGroups[gName]) maleGroups[gName] = [];
            maleGroups[gName].push({ data: guest, originalIndex: index });
        } else {
            femaleCount++;
            if (!femaleGroups[gName]) femaleGroups[gName] = [];
            femaleGroups[gName].push({ data: guest, originalIndex: index });
        }
    });

    // 渲染男方段落
    if (maleCount === 0) {
        maleContainer.innerHTML = `<div class="text-center text-slate-400 text-sm py-4 font-medium">🎉 男方已全數安排</div>`;
    } else {
        renderGroupData(maleGroups, maleContainer);
    }

    // 渲染女方段落 (自動貼在男方下面)
    if (femaleCount === 0) {
        femaleContainer.innerHTML = `<div class="text-center text-slate-400 text-sm py-4 font-medium">🎉 女方已全數安排</div>`;
    } else {
        renderGroupData(femaleGroups, femaleContainer);
    }
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
            chip.className = `pool-guest-chip text-sm p-2.5 rounded-lg border text-center font-bold truncate transition-all hover:translate-y-[-1px] cursor-grab active:cursor-grabbing ${item.data.side === '女方' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`;
            chip.innerText = item.data.name;
            if (IS_TOUCH_DEVICE) {
                setupPoolPointerDrag(chip, item.data, item.originalIndex);
            } else {
                chip.setAttribute('draggable', 'true');
                chip.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    cancelTableDrag();
                    isGuestDragging = true;
                    e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: "POOL", index: item.originalIndex, name: item.data.name }));
                });
                chip.addEventListener('dragend', () => {
                    isGuestDragging = false;
                    cancelTableDrag();
                });
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
        tablePlate.addEventListener('pointerdown', startTableDrag);
        tablePlate.ondblclick = (e) => {
            e.stopPropagation();
            cancelTableDrag();
            openSettingsModal(tableNum, maxSeats);
        };

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
                seatSlot.innerHTML = `<span class="guest-name-text" title="${guest.name}">${formatGuestDisplayName(guest.name)}</span>`;

                bindGuestTap(seatSlot, () => {
                    openGuestModal(guest, tableNum, i);
                });

                if (IS_TOUCH_DEVICE) {
                    setupGuestPointerDrag(seatSlot, guest, tableNum, i);
                } else {
                    seatSlot.setAttribute('draggable', 'true');
                    seatSlot.addEventListener('pointerdown', (e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        cancelTableDrag();
                        isGuestDragging = true;
                    });
                    seatSlot.addEventListener('dragstart', (e) => {
                        e.stopPropagation();
                        cancelTableDrag();
                        isGuestDragging = true;
                        e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: tableNum, seatIndex: i, name: guest.name }));
                    });
                    seatSlot.addEventListener('dragend', () => {
                        isGuestDragging = false;
                        cancelTableDrag();
                    });
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
        tablePlate.appendChild(hubCenter);

        tableWrapper.appendChild(tablePlate);
        canvas.appendChild(tableWrapper);
    });
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
    renderModalTags(guest.group);
    document.getElementById('edit-guest-side').value = guest.side === '女方' ? '女方' : '男方';
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
    const foundIdx = allGuests[tableIdx].findIndex(g => g && g.sort === (seatIdx + 1));
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

    const foundIdx = allGuests[tableIdx].findIndex(g => g && g.sort === (seatIdx + 1));
    if (foundIdx !== -1) {
        let guestObj = allGuests[tableIdx][foundIdx];
        allGuests[tableIdx].splice(foundIdx, 1);
        guestObj.sort = 99; 

        if (!unassignedPool) unassignedPool = [];
        unassignedPool.push(guestObj);

        const updates = {};
        updates['wedding_guests'] = allGuests;
        updates['unassigned_guests'] = unassignedPool;
        
        database.ref().update(updates).then(() => { closeGuestModal(); });
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
