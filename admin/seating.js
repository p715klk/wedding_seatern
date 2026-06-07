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

// 1. 摺疊側邊欄功能
let isSidebarOpen = true;
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-panel');
    const icon = document.getElementById('sidebar-toggle-icon');
    if (isSidebarOpen) {
        sidebar.style.marginLeft = "-320px"; // 摺埋
        icon.innerText = "▶";
    } else {
        sidebar.style.marginLeft = "0px";    // 伸展
        icon.innerText = "◀";
    }
    isSidebarOpen = !isSidebarOpen;
}

// 2. 畫布放大縮小功能 (Zoom) 核心變數
let currentZoom = 1.0;
const minZoom = 0.4;
const maxZoom = 2.0;

function updateZoomUI() {
    const canvas = document.getElementById('main-canvas');
    canvas.style.transform = `scale(${currentZoom})`;
    document.getElementById('zoom-percent').innerText = `${Math.round(currentZoom * 100)}%`;
}

function zoomCanvas(factor) {
    currentZoom = Math.min(maxZoom, Math.max(minZoom, currentZoom * factor));
    updateZoomUI();
}

function resetZoomAction() {
    currentZoom = 1.0;
    updateZoomUI();
}

// 綁定 Ctrl + 滾輪縮放畫布
document.getElementById('canvas-scroll-container').addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
            zoomCanvas(1.05); // 放大
        } else {
            zoomCanvas(0.95); // 縮小
        }
    }
}, { passive: false });


// 拖動圓枱變數
let isDraggingTable = false;
let draggedTableElement = null;
let offsetX = 0;
let offsetY = 0;

// 監聽 Firebase 數據庫
database.ref().on('value', (snapshot) => {
    const root = snapshot.val() || {};
    allGuests = root.wedding_guests || [];
    unassignedPool = root.unassigned_guests || [];
    tableSettings = root.table_settings || {};

    // 初始化防呆：生成 1-14 桌預設位置
    let updatedSettings = false;
    for(let i = 1; i <= 14; i++) {
        if (!tableSettings[i]) {
            const row = Math.floor((i - 1) / 4);
            const col = (i - 1) % 4;
            tableSettings[i] = {
                max_seats: 12,
                x: 100 + col * 380,
                y: 80 + row * 380
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
});

function updateGlobalStats() {
    let total = 0, assigned = 0;
    allGuests.forEach(table => {
        if (Array.isArray(table)) {
            table.forEach(g => { if (g && g.name) { total++; assigned++; } });
        }
    });
    unassignedPool.forEach(g => { if (g && g.name) { total++; } });
    document.getElementById('global-stats').innerText = `已坐: ${assigned} / 總賓客: ${total} 人`;
}

function setSideFilter(side) {
    currentSideFilter = side;
    ['filter-all', 'filter-male', 'filter-female'].forEach(id => {
        document.getElementById(id).className = "flex-1 py-1 rounded bg-slate-100 text-slate-600 font-bold transition";
    });
    if (side === 'all') document.getElementById('filter-all').className = "flex-1 py-1 rounded bg-slate-700 text-white font-bold transition";
    if (side === '男方') document.getElementById('filter-male').className = "flex-1 py-1 rounded bg-blue-600 text-white font-bold transition";
    if (side === '女方') document.getElementById('filter-female').className = "flex-1 py-1 rounded bg-rose-600 text-white font-bold transition";
    renderSidebar();
}

// 🌟 1. 渲染左側賓客卡片
function renderSidebar() {
    const poolContainer = document.getElementById('unassigned-pool');
    const counter = document.getElementById('unassigned-count');
    poolContainer.innerHTML = '';
    const searchKey = document.getElementById('sidebar-search').value.trim().toLowerCase();

    const cleanPool = unassignedPool.filter(g => g && g.name);
    counter.innerText = `${cleanPool.length} 人`;

    if (cleanPool.length === 0) {
        poolContainer.innerHTML = `<div class="text-center text-slate-400 text-xs py-8 font-bold">🎉 所有人都排好位喇！</div>`;
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
        groupWrap.className = "bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm";
        groupWrap.innerHTML = `<h4 class="text-[11px] font-black text-indigo-600 mb-2 border-b pb-1">📍 ${groupName}</h4>`;
        
        const chipsContainer = document.createElement('div');
        chipsContainer.className = "grid grid-cols-2 gap-1.5";

        groups[groupName].forEach(item => {
            const chip = document.createElement('div');
            chip.className = `guest-chip text-xs font-bold p-2 rounded-lg border text-center shadow-sm truncate transition-all hover:scale-105 active:scale-95 ${item.data.side === '女方' ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`;
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

// 🌟 2. 渲染右側大畫布 (UI 美化進化版)
function renderCanvasTables() {
    const canvas = document.getElementById('main-canvas');
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

        // 大框架
        const tableWrapper = document.createElement('div');
        tableWrapper.className = "draggable-table w-72 h-72 flex items-center justify-center";
        tableWrapper.style.left = `${settings.x}px`;
        tableWrapper.style.top = `${settings.y}px`;
        tableWrapper.setAttribute('data-table', tableNum);

        // 圓枱內圈美化：加上立體高雅深邃陰影與漸變色
        const innerCircle = document.createElement('div');
        innerCircle.className = "w-36 h-36 rounded-full bg-gradient-to-br from-amber-50 to-orange-100/60 border-4 border-amber-400 shadow-[0_10px_25px_-5px_rgba(217,119,6,0.3)] flex flex-col items-center justify-center relative z-10 font-black text-slate-700 transition hover:border-amber-500";
        innerCircle.innerHTML = `
            <div class="text-[11px] uppercase tracking-wider text-amber-700 font-bold">TABLE</div>
            <div class="text-2xl font-black text-amber-900 -mt-0.5">${tableNum}</div>
            <div class="text-[10px] bg-amber-200/70 text-amber-950 px-1.5 py-0.5 rounded-md mt-1 flex items-center gap-0.5">
                👥 ${guestsInTable.filter(g=>g&&g.name).length}/${maxSeats}
            </div>
            <button class="text-[10px] text-slate-400 hover:text-amber-700 mt-1 transition">⚙️ 設定</button>
        `;
        
        innerCircle.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            openSettingsModal(tableNum, maxSeats);
        };

        // 按住圓枱內圈即可自由移位
        innerCircle.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDraggingTable = true;
            draggedTableElement = tableWrapper;
            // 考慮到縮放比例 (Zoom Level) 對拖拽位移嘅影響
            offsetX = (e.clientX / currentZoom) - tableWrapper.offsetLeft;
            offsetY = (e.clientY / currentZoom) - tableWrapper.offsetTop;
            tableWrapper.style.zIndex = 1000;
        };

        // 🎯 環形精緻座位分佈
        for (let i = 0; i < maxSeats; i++) {
            const seatSlot = document.createElement('div');
            const angle = (i * 2 * Math.PI) / maxSeats - Math.PI / 2;
            const radius = 105; // 擴大半徑，留位俾靚靚人名 Chip
            const x = 144 + radius * Math.cos(angle); 
            const y = 144 + radius * Math.sin(angle);

            seatSlot.style.left = `${x}px`;
            seatSlot.style.top = `${y}px`;
            
            const guest = seatSlotsArray[i];

            if (guest) {
                // 💎 人名貼紙美化：極致圓潤、白字、男藍女粉、精緻微陰影
                seatSlot.className = `seat-slot guest-chip-on-seat px-2.5 py-1.5 rounded-full text-xs font-black flex items-center justify-center border text-center shadow-md truncate max-w-[90px] border-white text-white ${guest.side === '女方' ? 'bg-gradient-to-r from-rose-400 to-rose-500 shadow-rose-300/40' : 'bg-gradient-to-r from-blue-400 to-blue-500 shadow-blue-300/40'}`;
                seatSlot.innerText = guest.name;
                seatSlot.setAttribute('draggable', 'true');

                seatSlot.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: tableNum, seatIndex: i, name: guest.name }));
                });
            } else {
                // ⚪ 空座位點：變得低調柔和
                seatSlot.className = "seat-slot w-7 h-7 rounded-full border-2 border-dashed border-slate-300 bg-white/90 text-slate-400 font-mono text-[10px] flex items-center justify-center hover:bg-amber-50 hover:border-amber-400 hover:text-amber-600 hover:scale-110 shadow-sm";
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

// 監聽畫布上圓枱移位
document.onmousemove = (e) => {
    if (!isDraggingTable || !draggedTableElement) return;
    // 拖曳時除以目前的 Zoom 比例，防止拖動速度跟唔上手勢
    let x = (e.clientX / currentZoom) - offsetX;
    let y = (e.clientY / currentZoom) - offsetY;
    
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    
    draggedTableElement.style.left = `${x}px`;
    draggedTableElement.style.top = `${y}px`;
};

document.onmouseup = () => {
    if (isDraggingTable && draggedTableElement) {
        const tableNum = draggedTableElement.getAttribute('data-table');
        const x = parseInt(draggedTableElement.style.left);
        const y = parseInt(draggedTableElement.style.top);
        
        database.ref(`table_settings/${tableNum}`).update({ x: x, y: y });
        draggedTableElement.style.zIndex = "";
    }
    isDraggingTable = false;
    draggedTableElement = null;
};

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

    } catch (err) { console.error("落位失敗", err); }
}

// 🌟 4. 移出座位丟進左側名單 (放低即時重繪優化)
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

    const scrollContainer = document.getElementById('canvas-scroll-container');
    const rx = scrollContainer.scrollLeft + 200;
    const ry = scrollContainer.scrollTop + 150;

    database.ref(`table_settings/${cleanNum}`).set({
        max_seats: cleanMax,
        x: rx,
        y: ry
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