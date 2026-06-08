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

// ==========================================
// 📌 畫布初始化與平移縮放 (已修復空白處拉唔郁問題)12
// ==========================================
let zoom = 0.8; 
let panX = -900;  
let panY = -600;
let isPanning = false;
let startX, startY;

const viewport = document.getElementById('canvas-viewport');
const canvas = document.getElementById('main-canvas');

function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    document.getElementById('zoom-percent').innerText = `${Math.round(zoom * 100)}%`;
}

viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    let nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    nextZoom = Math.min(2.0, Math.max(0.25, nextZoom));

    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * (nextZoom / zoom);
    panY = mouseY - (mouseY - panY) * (nextZoom / zoom);
    zoom = nextZoom;
    applyTransform();
}, { passive: false });

viewport.addEventListener('mousedown', (e) => {
    const isSeat = e.target.closest('.seat-slot');
    const isCenterCircle = e.target.closest('.w-40.h-40'); 
    const isInteractive = e.target.closest('button, input, select');

    if (isSeat || isCenterCircle || isInteractive) {
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
    zoom = Math.min(2.0, Math.max(0.25, zoom * factor));
    applyTransform();
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

    let updatedSettings = false;
    for(let i = 1; i <= 14; i++) {
        if (!tableSettings[i]) {
            const row = Math.floor((i - 1) / 4);
            const col = (i - 1) % 4;
            tableSettings[i] = {
                max_seats: 12,
                x: 1800 + col * 460,
                y: 1300 + row * 460
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
    applyTransform();
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
        const gName = guest.group || "未分類";
        
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
        maleContainer.innerHTML = `<div class="text-center text-slate-400 text-xs py-4 font-medium">🎉 男方已全數安排</div>`;
    } else {
        renderGroupData(maleGroups, maleContainer);
    }

    // 渲染女方段落 (自動貼在男方下面)
    if (femaleCount === 0) {
        femaleContainer.innerHTML = `<div class="text-center text-slate-400 text-xs py-4 font-medium">🎉 女方已全數安排</div>`;
    } else {
        renderGroupData(femaleGroups, femaleContainer);
    }
}

function renderGroupData(groups, container) {
    Object.keys(groups).forEach(groupName => {
        const groupWrap = document.createElement('div');
        groupWrap.className = "bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm w-full";
        groupWrap.innerHTML = `<h4 class="text-[11px] font-bold text-slate-400 mb-2.5 border-b border-slate-100 pb-1">🏷️ ${groupName}</h4>`;
        
        const chipsContainer = document.createElement('div');
        chipsContainer.className = "grid grid-cols-2 gap-2";

        groups[groupName].forEach(item => {
            const chip = document.createElement('div');
            chip.className = `text-xs p-2 rounded-lg border text-center font-bold truncate transition-all hover:translate-y-[-1px] cursor-grab ${item.data.side === '女方' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`;
            chip.innerText = item.data.name;
            chip.setAttribute('draggable', 'true');
            
            chip.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: "POOL", index: item.originalIndex, name: item.data.name }));
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
        
        const seatSlotsArray = new Array(maxSeats).fill(null);
        guestsInTable.forEach(g => {
            if (g && g.name && g.sort >= 1 && g.sort <= maxSeats) {
                seatSlotsArray[g.sort - 1] = g;
            }
        });

        const tableWrapper = document.createElement('div');
        tableWrapper.className = "draggable-table w-96 h-96 flex items-center justify-center"; 
        tableWrapper.style.left = `${settings.x}px`;
        tableWrapper.style.top = `${settings.y}px`;
        tableWrapper.setAttribute('data-table', tableNum);

        const innerCircle = document.createElement('div');
        innerCircle.className = "w-40 h-40 rounded-full bg-white border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.05)] flex flex-col items-center justify-center relative z-10 select-none cursor-grab";
        innerCircle.innerHTML = `
            <div class="text-[10px] uppercase font-bold tracking-widest text-slate-400">TABLE</div>
            <div class="text-3xl font-black text-slate-800 my-0.5">${tableNum}</div>
            <div class="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                ${guestsInTable.filter(g=>g&&g.name).length} / ${maxSeats}人
            </div>
            <button class="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold mt-1.5 transition">⚙️設定</button>
        `;
        
        innerCircle.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            openSettingsModal(tableNum, maxSeats);
        };

        innerCircle.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.stopPropagation();
            isDraggingTable = true;
            draggedTableElement = tableWrapper;
            tableOffsetX = (e.clientX / zoom) - tableWrapper.offsetLeft;
            tableOffsetY = (e.clientY / zoom) - tableWrapper.offsetTop;
            tableWrapper.style.zIndex = 1000;
        };

        for (let i = 0; i < maxSeats; i++) {
            const seatSlot = document.createElement('div');
            const angle = (i * 2 * Math.PI) / maxSeats - Math.PI / 2;
            const radius = 135; 
            const x = 192 + radius * Math.cos(angle); 
            const y = 192 + radius * Math.sin(angle);

            seatSlot.style.left = `${x}px`;
            seatSlot.style.top = `${y}px`;
            
            const guest = seatSlotsArray[i];

            if (guest) {
                seatSlot.className = `seat-slot guest-chip-fixed text-white ${guest.side === '女方' ? 'bg-rose-400 shadow-rose-200' : 'bg-blue-400 shadow-blue-200'}`;
                seatSlot.innerHTML = `<span class="text-ellipsis" title="${guest.name}">${guest.name}</span>`;
                seatSlot.setAttribute('draggable', 'true');

                seatSlot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openGuestModal(guest, tableNum, i);
                });

                seatSlot.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: tableNum, seatIndex: i, name: guest.name }));
                });
            } else {
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
        database.ref(`table_settings/${tableNum}`).update({
            x: parseInt(draggedTableElement.style.left),
            y: parseInt(draggedTableElement.style.top)
        });
        draggedTableElement.style.zIndex = "";
    }
    isDraggingTable = false;
    draggedTableElement = null;
});

function allowDrop(e) { e.preventDefault(); }

function openGuestModal(guest, tableNum, seatIdx) {
    selectedGuestContext = { guest, tableNum, seatIdx };
    document.getElementById('edit-guest-name').value = guest.name;
    document.getElementById('edit-guest-group').value = guest.group || '';
    document.getElementById('edit-guest-side').value = guest.side === '女方' ? '女方' : '男方';
    document.getElementById('md-guest-seat').innerText = `第 ${tableNum} 桌 - 座位 ${seatIdx + 1}`;
    document.getElementById('guest-detail-modal').classList.remove('hidden');
}

function closeGuestModal() {
    document.getElementById('guest-detail-modal').classList.add('hidden');
    selectedGuestContext = null;
}

function saveGuestChangesAction() {
    if (!selectedGuestContext) return;
    const { tableNum, seatIdx } = selectedGuestContext;
    const tableIdx = parseInt(tableNum);

    const newName = document.getElementById('edit-guest-name').value.trim();
    const newGroup = document.getElementById('edit-guest-group').value.trim();
    const newSide = document.getElementById('edit-guest-side').value;

    if (!newName) { alert("❌ 姓名不能為空！"); return; }

    const foundIdx = allGuests[tableIdx].findIndex(g => g && g.sort === (seatIdx + 1));
    if (foundIdx !== -1) {
        allGuests[tableIdx][foundIdx].name = newName;
        allGuests[tableIdx][foundIdx].group = newGroup;
        allGuests[tableIdx][foundIdx].side = newSide;

        database.ref(`wedding_guests/${tableIdx}`).set(allGuests[tableIdx]).then(() => {
            closeGuestModal();
        });
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

    database.ref(`table_settings/${cleanNum}`).set({
        max_seats: cleanMax,
        x: Math.abs(panX) + 300,
        y: Math.abs(panY) + 200
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