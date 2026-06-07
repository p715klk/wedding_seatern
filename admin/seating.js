// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let allGuests = [];         // 來自 wedding_guests
let unassignedPool = [];    // 來自 unassigned_guests
let tableSettings = {};     // 來自 table_settings (新增存儲 x, y)
let currentSideFilter = 'all';
let activeSettingTableNum = null;

// 拖動圓枱專用變數
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

    // 初始化防呆：生成 1-14 桌預設位置（好似排兵布陣噉散開）
    let updatedSettings = false;
    for(let i = 1; i <= 14; i++) {
        if (!tableSettings[i]) {
            // 自動計算格子散開，避免全部疊喺 (0,0)
            const row = Math.floor((i - 1) / 4);
            const col = (i - 1) % 4;
            tableSettings[i] = {
                max_seats: 12,
                x: 100 + col * 360,
                y: 80 + row * 360
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
        document.getElementById(id).className = "flex-1 py-1 rounded bg-slate-100 text-slate-600 font-bold";
    });
    if (side === 'all') document.getElementById('filter-all').className = "flex-1 py-1 rounded bg-slate-700 text-white font-bold";
    if (side === '男方') document.getElementById('filter-male').className = "flex-1 py-1 rounded bg-blue-600 text-white font-bold";
    if (side === '女方') document.getElementById('filter-female').className = "flex-1 py-1 rounded bg-rose-600 text-white font-bold";
    renderSidebar();
}

// 🌟 1. 渲染左側賓客卡片 (鷗鷗高顏值清單)
function renderSidebar() {
    const poolContainer = document.getElementById('unassigned-pool');
    poolContainer.innerHTML = '';
    const searchKey = document.getElementById('sidebar-search').value.trim().toLowerCase();

    const cleanPool = unassignedPool.filter(g => g && g.name);
    if (cleanPool.length === 0) {
        poolContainer.innerHTML = `<div class="text-center text-slate-400 text-xs py-8">🎉 所有人都排好位喇！</div>`;
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
            chip.className = `guest-chip text-xs font-bold p-2 rounded-lg border text-center shadow-sm truncate transition-transform hover:scale-105 ${item.data.side === '女方' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`;
            chip.innerText = item.data.name;
            chip.setAttribute('draggable', 'true');
            
            // 尋找 renderSidebar 函數入面，修改 chip 的 dragstart 同 dragend 事件：
            chip.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: "POOL", index: item.originalIndex, name: item.data.name }));
                // 攞走原本控制垃圾桶閃爍嘅 code
            });
            chip.addEventListener('dragend', () => {
                // 攞走原本控制垃圾桶恢復嘅 code
            });

            chipsContainer.appendChild(chip);
        });
        groupWrap.appendChild(chipsContainer);
        poolContainer.appendChild(groupWrap);
    });
}

// 🌟 2. 渲染右側真正的大畫布（鷗鷗極致體驗）
function renderCanvasTables() {
    const canvas = document.getElementById('main-canvas');
    
    // 為了不讓拖動時畫面閃爍，我們只在初次或數據更新時更新，這裡用最穩定的方式清空重畫
    // 先保留正在拖拽的桌子狀態
    const sortedTableNums = Object.keys(tableSettings).sort((a,b) => parseInt(a) - parseInt(b));
    
    // 清除舊圓枱
    document.querySelectorAll('.draggable-table').forEach(el => el.remove());

    sortedTableNums.forEach(tableNum => {
        const idx = parseInt(tableNum);
        const settings = tableSettings[tableNum];
        const maxSeats = settings.max_seats || 12;
        
        const guestsInTable = allGuests[idx] || [];
        // 建立長度為 maxSeats 且對應 sort 數值的座位陣列
        const seatSlotsArray = new Array(maxSeats).fill(null);
        guestsInTable.forEach(g => {
            if (g && g.name && g.sort >= 1 && g.sort <= maxSeats) {
                seatSlotsArray[g.sort - 1] = g;
            }
        });

        // 建立一整組圓枱元件 (直徑 180px 包含外圈座位大框)
        const tableWrapper = document.createElement('div');
        tableWrapper.className = "draggable-table bg-transparent w-64 h-64 flex items-center justify-center";
        tableWrapper.style.left = `${settings.x}px`;
        tableWrapper.style.top = `${settings.y}px`;
        tableWrapper.setAttribute('data-table', tableNum);

        // 圓枱核心內圈 (140px 直徑)
        const innerCircle = document.createElement('div');
        innerCircle.className = "w-32 h-32 rounded-full bg-amber-50 border-4 border-amber-300 shadow-md flex flex-col items-center justify-center relative z-10 font-black text-slate-700";
        innerCircle.innerHTML = `
            <div class="text-xs text-slate-400">第 ${tableNum} 桌</div>
            <div class="text-2xl">${guestsInTable.filter(g=>g&&g.name).length}</div>
            <button class="text-[10px] text-slate-400 hover:text-amber-600">⚙️設定</button>
        `;
        
        // 點擊內圈齒輪打開 Modal
        innerCircle.querySelector('button').onclick = (e) => {
            e.stopPropagation();
            openSettingsModal(tableNum, maxSeats);
        };

        // 實作圓枱大框架的滑鼠拖動移位 (Drag Table Position)
        innerCircle.onmousedown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDraggingTable = true;
            draggedTableElement = tableWrapper;
            offsetX = e.clientX - tableWrapper.offsetLeft;
            offsetY = e.clientY - tableWrapper.offsetTop;
            tableWrapper.style.zIndex = 1000;
        };

        // 🎯 核心：動態計算環形虛線空座位，可以直接把賓客 Drop 入特定序號座位！
        for (let i = 0; i < maxSeats; i++) {
            const seatSlot = document.createElement('div');
            const angle = (i * 2 * Math.PI) / maxSeats - Math.PI / 2;
            const radius = 90; // 座位環繞半徑
            const x = 128 + radius * Math.cos(angle); // 128px 係 w-64 外框嘅半圓心
            const y = 128 + radius * Math.sin(angle);

            seatSlot.style.left = `${x}px`;
            seatSlot.style.top = `${y}px`;
            
            const guest = seatSlotsArray[i];

            if (guest) {
                // 座位有宾客
                seatSlot.className = `seat-slot w-14 h-8 rounded-lg shadow-sm text-[11px] font-bold flex items-center justify-center border text-center px-1 truncate ${guest.side === '女方' ? 'bg-rose-500 text-white border-rose-600' : 'bg-blue-500 text-white border-blue-600'}`;
                seatSlot.innerText = guest.name;
                seatSlot.setAttribute('draggable', 'true');

                // 賓客可以從座位上直接拉走去其他座位
                seatSlot.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: tableNum, seatIndex: i, name: guest.name }));
                });
            } else {
                // 空座位：鷗鷗經典的精準數字空位點
                seatSlot.className = "seat-slot w-7 h-7 rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 font-mono text-[10px] flex items-center justify-center hover:bg-slate-100 hover:border-amber-400";
                seatSlot.innerText = i + 1;
            }

            // 令每一個特定座位點都支援 Drop 機制
            seatSlot.setAttribute('ondragover', 'allowDrop(event)');
            seatSlot.setAttribute('ondrop', `handleDropOnSpecificSeat(event, "${tableNum}", ${i})`);

            tableWrapper.appendChild(seatSlot);
        }

        tableWrapper.appendChild(innerCircle);
        canvas.appendChild(tableWrapper);
    });
}

// 監聽畫布上的圓枱拖動移動
document.onmousemove = (e) => {
    if (!isDraggingTable || !draggedTableElement) return;
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    
    // 邊界防禦
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
        
        // 即時寫入 Firebase 記錄呢張枱嘅畫布座標位置
        database.ref(`table_settings/${tableNum}`).update({ x: x, y: y });
        draggedTableElement.style.zIndex = "";
    }
    isDraggingTable = false;
    draggedTableElement = null;
};

function allowDrop(e) { e.preventDefault(); }

// 🌟 3. 實作真．鷗鷗靈魂：將人塞入「第幾桌、第幾個位」
function handleDropOnSpecificSeat(e, toTableNum, targetSeatIdx) {
    e.preventDefault();
    e.stopPropagation();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { fromTable, index, seatIndex, name } = data;
        const toTableIdx = parseInt(toTableNum);
        const targetSortNum = targetSeatIdx + 1; // Firebase sort 是由 1 開始計

        if (!allGuests[toTableIdx]) allGuests[toTableIdx] = [];

        let movingGuestObj = null;

        // A. 先將人由原始位置抽起
        if (fromTable === "POOL") {
            movingGuestObj = unassignedPool[index];
            unassignedPool.splice(index, 1);
        } else {
            // 從別的圓枱座位拉過來
            const fromTableIdx = parseInt(fromTable);
            const foundIdx = allGuests[fromTableIdx].findIndex(g => g && g.sort === (seatIndex + 1));
            if (foundIdx !== -1) {
                movingGuestObj = allGuests[fromTableIdx][foundIdx];
                allGuests[fromTableIdx].splice(foundIdx, 1);
            }
        }

        if (!movingGuestObj) return;

        // B. 檢查目標座位有沒有人坐緊？如果有，自動將兩個人對調位置 (Swap Seat)
        const occupiedIdx = allGuests[toTableIdx].findIndex(g => g && g.sort === targetSortNum);
        if (occupiedIdx !== -1) {
            // 把被壓住的人踢出黎
            let bumpedGuest = allGuests[toTableIdx][occupiedIdx];
            
            if (fromTable === "POOL") {
                // 如果來源是左邊大池，被踢出黎嘅人退回左邊大池
                bumpedGuest.sort = 99;
                unassignedPool.push(bumpedGuest);
            } else {
                // 如果來源是別的座位，兩個人直接跨枱互換交叉對調位置！
                const fromTableIdx = parseInt(fromTable);
                bumpedGuest.sort = seatIndex + 1;
                allGuests[fromTableIdx].push(bumpedGuest);
            }
            allGuests[toTableIdx].splice(occupiedIdx, 1);
        }

        // C. 將拉過黎嘅人安穩塞落去指定號碼座位
        movingGuestObj.sort = targetSortNum;
        allGuests[toTableIdx].push(movingGuestObj);

        // D. 清洗清洗名單並塞回 Firebase
        const updates = {};
        updates['wedding_guests'] = allGuests;
        updates['unassigned_guests'] = unassignedPool;
        database.ref().update(updates);

    } catch (err) { console.error("落位失敗", err); }
}

// 🌟 4. 移出座位丢进左侧名单 (优化即时刷新)
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

            // 💡 核心優化：本地先即時重繪左邊名單，等畫面唔洗等網絡 Delay 
            renderSidebar(); 

            const updates = {};
            updates['wedding_guests'] = allGuests;
            updates['unassigned_guests'] = unassignedPool;
            database.ref().update(updates);
        }
    } catch (err) { console.error(err); }
}

// 🌟 5. 新增一桌 (隨機放喺畫布中間位置方便拖拉)
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
    }).then(() => { alert(`✅ 成功建立「第 ${cleanNum} 桌」！`); });
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
            alert("✅ 已成功刪除。");
            closeSettingsModal();
        });
    }
}