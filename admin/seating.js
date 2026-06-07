// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let allGuests = [];         
let unassignedPool = [];    
let tableSettings = {};     
let currentSideFilter = 'all';
let activeSettingTableNum = null;

// ==========================================
// 📌 核心一：Miro/Figma 等級畫布手勢平移與直覺縮放
// ==========================================
let zoom = 0.9; // 預設微縮小看全景
let panX = 40;  // 預設偏移
let panY = 40;
let isPanning = false;
let startX, startY;

const viewport = document.getElementById('canvas-viewport');
const canvas = document.getElementById('main-canvas');

function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    document.getElementById('zoom-percent').innerText = `${Math.round(zoom * 100)}%`;
}

// 1. 直覺滾輪縮放 (無需任何按鍵)
viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    
    // 限制縮放範圍在 30% 到 200%
    nextZoom = Math.min(2.0, Math.max(0.3, nextZoom));

    // 以滑鼠目前位置為中心進行縮放
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * (nextZoom / zoom);
    panY = mouseY - (mouseY - panY) * (nextZoom / zoom);
    zoom = nextZoom;
    applyTransform();
}, { passive: false });

// 2. 畫布抓取平移 (支援按住右鍵拖拽 / 或直接拖拽空白位)
viewport.addEventListener('mousedown', (e) => {
    // 如果點擊到的是圓枱或賓客，就不觸發畫布平移
    if (e.target.closest('.draggable-table') || e.target.closest('.seat-slot') || e.target.closest('button')) return;
    
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
    if (isPanning) {
        isPanning = false;
        viewport.style.cursor = 'auto';
    }
});

// 防止右鍵彈出選單干擾拖拽
viewport.addEventListener('contextmenu', e => e.preventDefault());

function zoomCanvas(factor) {
    zoom = Math.min(2.0, Math.max(0.3, zoom * factor));
    applyTransform();
}

// ==========================================
// 📌 核心二：側邊欄收合邏輯 (內部按鈕)
// ==========================================
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

// ==========================================
// 📌 核心三：圓枱移動 (與畫布縮放比完美同步)
// ==========================================
let isDraggingTable = false;
let draggedTableElement = null;
let tableOffsetX = 0;
let tableOffsetY = 0;

// 監聽 Firebase
database.ref().on('value', (snapshot) => {
    const root = snapshot.val() || {};
    allGuests = root.wedding_guests || [];
    unassignedPool = root.unassigned_guests || [];
    tableSettings = root.table_settings || {};

    let updatedSettings = false;
    for(let i = 1; i <= 14; i++) {
        if (!tableSettings[i]) {
            const row = Math.floor((i - 1) / 4);
            const col = (i - 1) % 4;
            tableSettings[i] = {
                max_seats: 12,
                x: 120 + col * 420,
                y: 100 + row * 420
            };
            updatedSettings = true;
        }
    }
    if (updatedSettings) {
        database.ref('table_settings').update(tableSettings);
        return; 
    }

    renderSidebar();
    renderCanvasTables();
    updateGlobalStats();
    applyTransform(); // 初始化擺位
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

function setSideFilter(side) {
    currentSideFilter = side;
    ['filter-all', 'filter-male', 'filter-female'].forEach(id => {
        document.getElementById(id).className = "flex-1 py-1 rounded bg-slate-100 text-slate-600 font-semibold transition";
    });
    if (side === 'all') document.getElementById('filter-all').className = "flex-1 py-1 rounded bg-slate-800 text-white font-bold transition shadow-sm";
    if (side === '男方') document.getElementById('filter-male').className = "flex-1 py-1 rounded bg-blue-600 text-white font-bold transition shadow-sm";
    if (side === '女方') document.getElementById('filter-female').className = "flex-1 py-1 rounded bg-rose-600 text-white font-bold transition shadow-sm";
    renderSidebar();
}

// 渲染左邊名單
function renderSidebar() {
    const poolContainer = document.getElementById('unassigned-pool');
    const counter = document.getElementById('unassigned-count');
    poolContainer.innerHTML = '';
    const searchKey = document.getElementById('sidebar-search').value.trim().toLowerCase();

    const cleanPool = unassignedPool.filter(g => g && g.name);
    counter.innerText = `${cleanPool.length}人`;

    if (cleanPool.length === 0) {
        poolContainer.innerHTML = `<div class="text-center text-slate-400 text-xs py-8 font-medium">🎉 所有賓客均已入座</div>`;
        return;
    }

    let groups = {};
    cleanPool.forEach((guest, index) => {
        if (searchKey && !guest.name.toLowerCase().includes(searchKey) && !guest.group.toLowerCase().includes(searchKey)) return;
        if (currentSideFilter !== 'all' && guest.side !== currentSideFilter) return;

        const gName = guest.group || "未分類";
        if (!groups[gName]) groups[gName] = [];
        groups[gName].push({ data: guest, originalIndex: index });
    });

    Object.keys(groups).forEach(groupName => {
        const groupWrap = document.createElement('div');
        groupWrap.className = "bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm";
        groupWrap.innerHTML = `<h4 class="text-[11px] font-bold text-slate-400 mb-2 border-b border-slate-100 pb-1 flex items-center gap-1">🏷️ ${groupName}</h4>`;
        
        const chipsContainer = document.createElement('div');
        chipsContainer.className = "grid grid-cols-2 gap-1.5";

        groups[groupName].forEach(item => {
            const chip = document.createElement('div');
            chip.className = `guest-pill text-xs p-2 rounded-lg border text-center transition-all hover:translate-y-[-1px] hover:shadow-md active:scale-95 ${item.data.side === '女方' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`;
            chip.innerText = item.data.name;
            chip.setAttribute('draggable', 'true');
            
            chip.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: "POOL", index: item.originalIndex, name: item.data.name }));
            });

            chipsContainer.appendChild(chip);
        });
        groupWrap.appendChild(chipsContainer);
        poolContainer.appendChild(groupWrap);
    });
}

// ==========================================
// 📌 核心四：UI 高級美化渲染 (比照鷗鷗風格)
// ==========================================
function renderCanvasTables() {
    const sortedTableNums = Object.keys(tableSettings).sort((a,b) => parseInt(a) - parseInt(b));
    document.querySelectorAll('.draggable-table').forEach(el => el.remove());

    sortedTableNums.forEach(tableNum => {
        const idx = parseInt(tableNum);
        const settings = tableSettings[tableNum];
        const maxSeats = settings.max_seats || 12;
        const guestsInTable = allGuests[idx] || [];
        
        const seatSlotsArray = new Array(maxSeats).fill(null);
        guestsInTable.forEach(g => {
            if (g && g.name && g.sort >= 1 && g.sort <= maxSeats) {
                seatSlotsArray[g.sort - 1] = g;
            }
        });

        // 圓枱大框架
        const tableWrapper = document.createElement('div');
        tableWrapper.className = "draggable-table w-80 h-80 flex items-center justify-center";
        tableWrapper.style.left = `${settings.x}px`;
        tableWrapper.style.top = `${settings.y}px`;
        tableWrapper.setAttribute('data-table', tableNum);

        // 核心內木圈（極簡白/奶油風格，配精緻微陰影）
        const innerCircle = document.createElement('div');
        innerCircle.className = "w-40 h-40 rounded-full bg-white border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.06)] flex flex-col items-center justify-center relative z-10 select-none";
        innerCircle.innerHTML = `
            <div class="text-[10px] uppercase font-bold tracking-widest text-slate-400">TABLE</div>
            <div class="text-3xl font-black text-slate-800 my-0.5">${tableNum}</div>
            <div class="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                ${guestsInTable.filter(g=>g&&g.name).length} / ${maxSeats} 人
            </div>
            <button class="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold mt-1.5 transition">⚙️設定</button>
        `;
        
        innerCircle.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            openSettingsModal(tableNum, maxSeats);
        };

        // 圓枱移動事件 (防走位精準計算)
        innerCircle.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDraggingTable = true;
            draggedTableElement = tableWrapper;
            tableOffsetX = (e.clientX / zoom) - tableWrapper.offsetLeft;
            tableOffsetY = (e.clientY / zoom) - tableWrapper.offsetTop;
            tableWrapper.style.zIndex = 1000;
        };

        // 環形座位完美工整排佈
        for (let i = 0; i < maxSeats; i++) {
            const seatSlot = document.createElement('div');
            const angle = (i * 2 * Math.PI) / maxSeats - Math.PI / 2;
            const radius = 120; // 半徑擴大，避免擁擠
            const x = 160 + radius * Math.cos(angle); 
            const y = 160 + radius * Math.sin(angle);

            seatSlot.style.left = `${x}px`;
            seatSlot.style.top = `${y}px`;
            
            const guest = seatSlotsArray[i];

            if (guest) {
                // 高級扁平膠囊名牌：字體清晰、顯色柔和、男女識別度高
                seatSlot.className = `seat-slot guest-pill text-xs px-2.5 py-1.5 rounded-full border border-white/60 text-center shadow-sm font-bold truncate max-w-[100px] text-white ${guest.side === '女方' ? 'bg-rose-400 shadow-rose-200' : 'bg-blue-400 shadow-blue-200'}`;
                seatSlot.innerText = guest.name;
                seatSlot.setAttribute('draggable', 'true');

                seatSlot.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: tableNum, seatIndex: i, name: guest.name }));
                });
            } else {
                // 質感小灰點空位
                seatSlot.className = "seat-slot w-7 h-7 rounded-full border-2 border-dashed border-slate-200 bg-white text-slate-300 font-mono text-[10px] flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-500 hover:scale-110 shadow-sm transition-all";
                seatSlot.innerText = i + 1;
            }

            seatSlot.setAttribute('ondragover', 'allowDrop(event)');
            seatSlot.setAttribute('ondrop', `handleDropOnSpecificSeat(event, "${tableNum}", ${i})`);

            tableWrapper.appendChild(seatSlot);
        }

        tableWrapper.appendChild(innerCircle);
        canvas.appendChild(tableWrapper);
    });
}

// 畫布上滑鼠移動事件 (全局防抖)
document.addEventListener('mousemove', (e) => {
    if (!isDraggingTable || !draggedTableElement) return;
    let x = (e.clientX / zoom) - tableOffsetX;
    let y = (e.clientY / zoom) - tableOffsetY;
    
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    
    draggedTableElement.style.left = `${x}px`;
    draggedTableElement.style.top = `${y}px`;
});

document.addEventListener('mouseup', () => {
    if (isDraggingTable && draggedTableElement) {
        const tableNum = draggedTableElement.getAttribute('data-table');
        const x = parseInt(draggedTableElement.style.left);
        const y = parseInt(draggedTableElement.style.top);
        
        database.ref(`table_settings/${tableNum}`).update({ x: x, y: y });
        draggedTableElement.style.zIndex = "";
    }
    isDraggingTable = false;
    draggedTableElement = null;
});

function allowDrop(e) { e.preventDefault(); }

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

function handleDropTrash(e) {
    e.preventDefault();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { fromTable, seatIndex } = data;

        if (fromTable === "POOL") return;

        const fromTableIdx = parseInt(fromTable);
        const foundIdx = allGuests[fromTableIdx].findIndex(g => g && g.sort === (seatIndex + 1));
        
        if (foundIdx !== -1) {
            let movingGuestObj = allGuests[fromTableIdx][foundIdx];
            allGuests[fromTableIdx].splice(foundIdx, 1);

            movingGuestObj.sort = 99;
            if (!unassignedPool) unassignedPool = [];
            unassignedPool.push(movingGuestObj);

            renderSidebar(); 

            const updates = {};
            updates['wedding_guests'] = allGuests;
            updates['unassigned_guests'] = unassignedPool;
            database.ref().update(updates);
        }
    } catch (err) { console.error(err); }
}

function createNewTableAction() {
    const newNum = prompt("請輸入全新圓枱桌號 (例如: 15):");
    if (!newNum || newNum.trim() === "") return;
    const cleanNum = newNum.trim();

    if (tableSettings[cleanNum]) {
        alert("❌ 此桌號已存在！");
        return;
    }

    const maxSeats = prompt(`請輸入第 ${cleanNum} 桌的人數上限：`, "12");
    const cleanMax = parseInt(maxSeats) || 12;

    database.ref(`table_settings/${cleanNum}`).set({
        max_seats: cleanMax,
        x: Math.abs(panX) + 200,
        y: Math.abs(panY) + 150
    });
}

function openSettingsModal(tableNum, currentMax) {
    activeSettingTableNum = tableNum;
    document.getElementById('modal-table-title').innerText = `⚙️ 調整第 ${tableNum} 桌設定`;
    document.getElementById('modal-max-seats').value = currentMax;
    document.getElementById('table-settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('table-settings-modal').classList.add('hidden');
    activeSettingTableNum = null;
}

function saveTableSettingsAction() {
    if (!activeSettingTableNum) return;
    const newMax = parseInt(document.getElementById('modal-max-seats').value) || 12;
    database.ref(`table_settings/${activeSettingTableNum}/max_seats`).set(newMax)
        .then(() => { closeSettingsModal(); });
}

function deleteTableAction() {
    if (!activeSettingTableNum) return;
    if (confirm(`⚠️ 確定要刪除第 ${activeSettingTableNum} 桌嗎？\n入面所有人會退回左側清單。`)) {
        const idx = parseInt(activeSettingTableNum);
        const guestsInTable = allGuests[idx] || [];
        
        if (!unassignedPool) unassignedPool = [];
        guestsInTable.forEach(g => { if (g && g.name) { g.sort = 99; unassignedPool.push(g); } });
        allGuests[idx] = [];
        
        Promise.all([
            database.ref(`wedding_guests/${idx}`).remove(),
            database.ref(`unassigned_guests`).set(unassignedPool),
            database.ref(`table_settings/${activeSettingTableNum}`).remove()
        ]).then(() => {
            closeSettingsModal();
        });
    }
}