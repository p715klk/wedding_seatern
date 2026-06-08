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

function bindGuestTap(element, onTap) {
    let startX = 0, startY = 0, moved = false;
    element.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        moved = false;
    });
    element.addEventListener('pointermove', (e) => {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) moved = true;
    });
    element.addEventListener('pointerup', (e) => {
        if (e.button !== 0 || moved) return;
        e.stopPropagation();
        onTap(e);
    });
}

function setPrimaryGroupTag(guest, newPrimary) {
    const tags = normalizeGuestTags(guest.group);
    const rest = tags.filter(t => t !== newPrimary);
    guest.group = newPrimary === '未分類' ? rest : [newPrimary, ...rest];
}

// ==========================================
// 📌 畫布初始化與平移縮放 (已修復空白處拉唔郁問題)
// ==========================================
const CANVAS_W = 5000;
const CANVAS_H = 4000;
const TABLE_DIM = 380;
const TABLE_CENTER = TABLE_DIM / 2;
const SEAT_RADIUS = 138;
const GRID_SIZE = 20;

let zoom = 1.0;
let panX = -900;
let panY = -600;
let isPanning = false;
let startX, startY;

const viewport = document.getElementById('canvas-viewport');
const canvas = document.getElementById('main-canvas');

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

viewport.addEventListener('mousedown', (e) => {
    const isSeat = e.target.closest('.seat-slot');
    const isTableCore = e.target.closest('.table-core');
    const isInteractive = e.target.closest('button, input, select');

    if (isSeat || isTableCore || isInteractive) {
        return;
    }

    isPanning = true;
    viewport.style.cursor = 'grabbing';
    startX = e.clientX - panX;
    startY = e.clientY - panY;
});

window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
});

window.addEventListener('mouseup', () => {
    if (isPanning) { isPanning = false; viewport.style.cursor = 'auto'; }
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
        maxY = Math.max(maxY, s.y + TABLE_DIM);
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
    const sidebarWidth = isSidebarOpen ? 320 : 0;
    const vpW = vpRect.width - sidebarWidth;
    const vpH = vpRect.height;
    const padding = 100;

    const zoomX = vpW / (groupW + padding * 2);
    const zoomY = vpH / (groupH + padding * 2);
    zoom = Math.min(1.2, Math.max(0.4, Math.min(zoomX, zoomY)));

    panX = sidebarWidth + (vpW / 2) - bounds.centerX * zoom;
    panY = (vpH / 2) - bounds.centerY * zoom;
    applyTransform();
}

function getOccupancyColor(filled, maxSeats) {
    const ratio = filled / maxSeats;
    if (ratio > 1) return '#ef4444';
    if (ratio >= 1) return '#f59e0b';
    if (ratio >= 0.75) return '#eab308';
    return '#22c55e';
}

function buildOccRingSVG(filled, maxSeats) {
    const r = 54;
    const circumference = 2 * Math.PI * r;
    const ratio = Math.min(filled / maxSeats, 1);
    const dash = circumference * ratio;
    const color = getOccupancyColor(filled, maxSeats);
    const size = 120;
    return `<svg class="occ-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="width:calc(${size}px * var(--zoom));height:calc(${size}px * var(--zoom))">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="6"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="6"
            stroke-dasharray="${dash} ${circumference}" stroke-linecap="round"
            transform="rotate(-90 ${size/2} ${size/2})"/>
    </svg>`;
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
            const gridW = 3 * 400 + TABLE_DIM;
            const gridH = 3 * 400 + TABLE_DIM;
            const startX = snapToGrid(CANVAS_W / 2 - gridW / 2);
            const startY = snapToGrid(CANVAS_H / 2 - gridH / 2);
            tableSettings[i] = {
                max_seats: 12,
                x: snapToGrid(startX + col * 400),
                y: snapToGrid(startY + row * 400)
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
    if (!localStorage.getItem('seating_view_fitted_v3')) {
        fitViewToTables();
        localStorage.setItem('seating_view_fitted_v3', '1');
    }
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
        groupWrap.className = "pool-group-drop bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm w-full transition-colors";
        groupWrap.dataset.groupName = groupName;
        groupWrap.innerHTML = `<h4 class="pool-group-title text-xs font-bold text-slate-400 mb-2.5 border-b border-slate-100 pb-1">🏷️ ${groupName}</h4>`;

        groupWrap.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            groupWrap.classList.add('drag-over');
        });
        groupWrap.addEventListener('dragleave', (e) => {
            if (!groupWrap.contains(e.relatedTarget)) {
                groupWrap.classList.remove('drag-over');
            }
        });
        groupWrap.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            groupWrap.classList.remove('drag-over');
            handleDropOnPoolGroup(e, groupName);
        });
        
        const chipsContainer = document.createElement('div');
        chipsContainer.className = "grid grid-cols-2 gap-2";

        groups[groupName].forEach(item => {
            const chip = document.createElement('div');
            chip.className = `pool-guest-chip text-sm p-2.5 rounded-lg border text-center font-bold truncate transition-all hover:translate-y-[-1px] cursor-grab active:cursor-grabbing ${item.data.side === '女方' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`;
            chip.innerText = item.data.name;
            chip.setAttribute('draggable', 'true');

            chip.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: "POOL", index: item.originalIndex, name: item.data.name }));
            });

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

        const tableLabel = document.createElement('div');
        tableLabel.className = 'table-label';
        tableLabel.innerText = `第 ${tableNum} 桌`;
        tableWrapper.appendChild(tableLabel);

        const tableBody = document.createElement('div');
        tableBody.className = 'table-body';

        tableBody.insertAdjacentHTML('beforeend', buildOccRingSVG(filled, maxSeats));

        const tableCore = document.createElement('div');
        tableCore.className = 'table-core';
        tableCore.innerHTML = `
            <div class="table-core-num">${filled}</div>
            <div class="table-core-count">${filled} / ${maxSeats}</div>
            <button type="button" class="table-core-settings">⚙️ 設定</button>
        `;

        tableCore.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            openSettingsModal(tableNum, maxSeats);
        };

        tableCore.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.stopPropagation();
            isDraggingTable = true;
            draggedTableElement = tableWrapper;
            const pos = screenToCanvas(e.clientX, e.clientY);
            tableOffsetX = pos.x - parseFloat(tableWrapper.dataset.baseX);
            tableOffsetY = pos.y - parseFloat(tableWrapper.dataset.baseY);
            tableWrapper.classList.add('is-dragging');
        };

        for (let i = 0; i < maxSeats; i++) {
            const seatSlot = document.createElement('div');
            const angle = (i * 2 * Math.PI) / maxSeats - Math.PI / 2;
            const x = TABLE_CENTER + SEAT_RADIUS * Math.cos(angle);
            const y = TABLE_CENTER + SEAT_RADIUS * Math.sin(angle);

            seatSlot.style.left = `calc(${x}px * var(--zoom))`;
            seatSlot.style.top = `calc(${y}px * var(--zoom))`;

            const guest = seatSlotsArray[i];

            if (guest) {
                const sideClass = guest.side === '女方' ? 'side-female' : 'side-male';
                seatSlot.className = `seat-slot guest-seat-circle ${sideClass}`;
                seatSlot.innerHTML = `<span class="text-ellipsis" title="${guest.name}">${guest.name}</span>`;
                seatSlot.setAttribute('draggable', 'true');

                bindGuestTap(seatSlot, () => {
                    openGuestModal(guest, tableNum, i);
                });

                seatSlot.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: tableNum, seatIndex: i, name: guest.name }));
                });
            } else {
                seatSlot.className = "seat-slot seat-empty";
                seatSlot.innerText = i + 1;
            }

            seatSlot.setAttribute('ondragover', 'allowDrop(event)');
            seatSlot.setAttribute('ondrop', `handleDropOnSpecificSeat(event, "${tableNum}", ${i})`);

            tableBody.appendChild(seatSlot);
        }

        tableBody.appendChild(tableCore);
        tableWrapper.appendChild(tableBody);
        canvas.appendChild(tableWrapper);
    });
}

document.addEventListener('mousemove', (e) => {
    if (!isDraggingTable || !draggedTableElement) return;
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

document.addEventListener('mouseup', () => {
    if (isDraggingTable && draggedTableElement) {
        const tableNum = draggedTableElement.getAttribute('data-table');
        const bx = parseInt(draggedTableElement.dataset.baseX, 10);
        const by = parseInt(draggedTableElement.dataset.baseY, 10);
        tableSettings[tableNum].x = bx;
        tableSettings[tableNum].y = by;
        database.ref(`table_settings/${tableNum}`).update({ x: bx, y: by });
        draggedTableElement.classList.remove('is-dragging');
    }
    isDraggingTable = false;
    draggedTableElement = null;
});

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
        const { fromTable, index, seatIndex } = data;
        const toTableIdx = parseInt(toTableNum);
        const targetSortNum = targetSeatIdx + 1;

        if (!allGuests[toTableIdx]) allGuests[toTableIdx] = [];
        let movingGuestObj = null;

        if (fromTable === "POOL") {
            movingGuestObj = unassignedPool[index];
            unassignedPool.splice(index, 1);
        } else {
            const fromTableIdx = parseInt(fromTable);
            const foundIdx = allGuests[fromTableIdx].findIndex(g => g && g.sort === (seatIndex + 1));
            if (foundIdx !== -1) {
                movingGuestObj = allGuests[fromTableIdx][foundIdx];
                allGuests[fromTableIdx].splice(foundIdx, 1);
            }
        }

        if (!movingGuestObj) return;

        const occupiedIdx = allGuests[toTableIdx].findIndex(g => g && g.sort === targetSortNum);
        if (occupiedIdx !== -1) {
            let bumpedGuest = allGuests[toTableIdx][occupiedIdx];
            if (fromTable === "POOL") {
                bumpedGuest.sort = 99;
                unassignedPool.push(bumpedGuest);
            } else {
                const fromTableIdx = parseInt(fromTable);
                bumpedGuest.sort = seatIndex + 1;
                allGuests[fromTableIdx].push(bumpedGuest);
            }
            allGuests[toTableIdx].splice(occupiedIdx, 1);
        }

        movingGuestObj.sort = targetSortNum;
        allGuests[toTableIdx].push(movingGuestObj);

        const updates = {};
        updates['wedding_guests'] = allGuests;
        updates['unassigned_guests'] = unassignedPool;
        database.ref().update(updates);
    } catch (err) { console.error(err); }
}

function handleDropOnPoolGroup(e, targetGroupName) {
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.fromTable !== 'POOL') return;

        const guest = unassignedPool[data.index];
        if (!guest) return;

        const currentPrimary = getPrimaryGroup(guest);
        if (currentPrimary === targetGroupName) return;

        setPrimaryGroupTag(guest, targetGroupName);
        database.ref('unassigned_guests').set(unassignedPool);
    } catch (err) { console.error(err); }
}

function handleDropTrash(e) {
    e.preventDefault();
    try {
        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;
        const data = JSON.parse(dataStr);
        const { fromTable, seatIndex } = data;
        
        if (!fromTable || fromTable === "POOL") return;

        const fromTableIdx = parseInt(fromTable);
        const foundIdx = allGuests[fromTableIdx].findIndex(g => g && g.sort === (seatIndex + 1));
        
        if (foundIdx !== -1) {
            let movingGuestObj = allGuests[fromTableIdx][foundIdx];
            allGuests[fromTableIdx].splice(foundIdx, 1);
            
            movingGuestObj.sort = 99;
            
            if (!unassignedPool) unassignedPool = [];
            unassignedPool.push(movingGuestObj);

            const updates = {};
            updates['wedding_guests'] = allGuests;
            updates['unassigned_guests'] = unassignedPool;
            database.ref().update(updates);
        }
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
        x: snapToGrid(center.x - TABLE_DIM / 2),
        y: snapToGrid(center.y - TABLE_DIM / 2)
    });
}

function openSettingsModal(tableNum, currentMax) {
    activeSettingTableNum = tableNum;
    document.getElementById('modal-table-title').innerText = `⚙️ 調整第 ${tableNum} 桌設定`;
    document.getElementById('modal-max-seats').value = currentMax;
    showModal(document.getElementById('table-settings-modal'));
}

function closeSettingsModal() {
    hideModal(document.getElementById('table-settings-modal'));
    activeSettingTableNum = null;
}

function saveTableSettingsAction() {
    if (!activeSettingTableNum) return;
    const newMax = parseInt(document.getElementById('modal-max-seats').value) || 12;
    database.ref(`table_settings/${activeSettingTableNum}/max_seats`).set(newMax).then(() => { closeSettingsModal(); });
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
