// Firebase 初始化
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 全局變數狀態
let allGuests = [];         // 來自 Firebase 的 wedding_guests (Array 格式)
let unassignedPool = [];    // 來自 Firebase 的 unassigned_guests (獨立 Node)
let tableSettings = {};     // 來自 Firebase 的 table_settings
let currentSideFilter = 'all';
let activeSettingTableNum = null;

// 監聽 Firebase 數據根目錄
database.ref().on('value', (snapshot) => {
    const root = snapshot.val() || {};
    allGuests = root.wedding_guests || [];
    unassignedPool = root.unassigned_guests || [];
    tableSettings = root.table_settings || {};

    // 自動初始化 table_settings (預設 1 到 14 桌，每桌上限 12 人)
    let updatedSettings = false;
    for(let i = 1; i <= 14; i++) {
        if (!tableSettings[i]) {
            tableSettings[i] = { max_seats: 12 };
            updatedSettings = true;
        }
    }
    if (updatedSettings) {
        database.ref('table_settings').update(tableSettings);
        return; 
    }

    // 數據就位，刷新畫面
    renderSidebar();
    renderCanvasTables();
    updateGlobalStats();
});

// 計算總人數統計
function updateGlobalStats() {
    let total = 0;
    let assigned = 0;
    
    // 計算已分配人數
    allGuests.forEach(table => {
        if (Array.isArray(table)) {
            table.forEach(g => { if (g && g.name) { total++; assigned++; } });
        }
    });
    // 計算未分配人數
    unassignedPool.forEach(g => { if (g && g.name) { total++; } });

    document.getElementById('global-stats').innerText = `已排位: ${assigned} / 總人數: ${total} 人`;
}

// 側邊欄篩選切換
function setSideFilter(side) {
    currentSideFilter = side;
    ['filter-all', 'filter-male', 'filter-female'].forEach(id => {
        document.getElementById(id).className = "px-2 py-1 rounded bg-gray-100 text-gray-600";
    });
    if (side === 'all') document.getElementById('filter-all').className = "px-2 py-1 rounded bg-gray-700 text-white font-bold";
    if (side === '男方') document.getElementById('filter-male').className = "px-2 py-1 rounded bg-blue-600 text-white font-bold";
    if (side === '女方') document.getElementById('filter-female').className = "px-2 py-1 rounded bg-red-600 text-white font-bold";
    renderSidebar();
}

// 🌟 1. 渲染左側「未安排賓客」
function renderSidebar() {
    const poolContainer = document.getElementById('unassigned-pool');
    poolContainer.innerHTML = '';
    const searchKey = document.getElementById('sidebar-search').value.trim().toLowerCase();

    // 排除因為刪除可能產生的 null
    const cleanPool = unassignedPool.filter(g => g && g.name);

    if (cleanPool.length === 0) {
        poolContainer.innerHTML = `<div class="text-center text-gray-400 text-xs py-8">🎉 所有賓客已安排入座！</div>`;
        return;
    }

    // 按 Group 分組
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
        groupWrap.className = "bg-gray-50 p-2 rounded-xl border border-gray-200 shadow-sm";
        groupWrap.innerHTML = `<h4 class="text-xs font-black text-purple-700 mb-2 px-1">📍 ${groupName} (${groups[groupName].length}人)</h4>`;
        
        const chipsContainer = document.createElement('div');
        chipsContainer.className = "flex flex-wrap gap-1.5";

        groups[groupName].forEach(item => {
            const chip = document.createElement('div');
            chip.className = `guest-chip text-xs font-bold px-2 py-1 rounded shadow-sm border transition-transform hover:scale-105 ${item.data.side === '女方' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`;
            chip.innerText = item.data.name;
            chip.setAttribute('draggable', 'true');
            
            chip.addEventListener('dragstart', (e) => {
                // 用 "POOL" 代表它是從左邊未分配水池拉出來的
                e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: "POOL", index: item.originalIndex, name: item.data.name }));
                document.getElementById('trash-zone').className = "p-4 bg-red-100 border-t-2 border-dashed border-red-400 text-center text-red-700 font-bold text-sm scale-105 transition-all";
            });
            chip.addEventListener('dragend', () => {
                document.getElementById('trash-zone').className = "p-4 bg-red-50 border-t-2 border-dashed border-red-200 text-center text-red-700 font-bold text-sm";
            });

            chipsContainer.appendChild(chip);
        });

        groupWrap.appendChild(chipsContainer);
        poolContainer.appendChild(groupWrap);
    });
}

// 🌟 2. 渲染右側大畫布圓枱
function renderCanvasTables() {
    const grid = document.getElementById('tables-grid');
    grid.innerHTML = '';

    // 獲取所有有效的桌號
    const sortedTableNums = Object.keys(tableSettings).sort((a,b) => parseInt(a) - parseInt(b));

    sortedTableNums.forEach(tableNum => {
        const idx = parseInt(tableNum);
        const maxSeats = tableSettings[tableNum].max_seats || 12;
        
        // 讀取該桌的賓客 Array
        const guestsInTable = allGuests[idx] || [];
        const activeGuests = guestsInTable.filter(g => g && g.name);
        const currentCount = activeGuests.length;

        const tableCard = document.createElement('div');
        tableCard.className = "bg-white p-4 rounded-2xl shadow-md border-2 border-gray-200 flex flex-col items-center justify-between relative min-h-[240px] pt-14 pb-4";
        tableCard.setAttribute('ondragover', 'allowDrop(event)');
        tableCard.setAttribute('ondrop', `handleDropOnTable(event, "${tableNum}")`);

        const setBtn = document.createElement('button');
        setBtn.className = "absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-sm p-1";
        setBtn.innerHTML = "⚙️ 設定";
        setBtn.onclick = () => openSettingsModal(tableNum, maxSeats);
        tableCard.appendChild(setBtn);

        const title = document.createElement('div');
        title.className = "absolute top-3 left-4 text-sm font-black text-gray-700";
        title.innerText = `第 ${tableNum} 桌`;
        tableCard.appendChild(title);

        const circleTable = document.createElement('div');
        circleTable.className = "w-28 h-28 rounded-full border-4 border-gray-200 flex flex-col items-center justify-center bg-gray-50 relative shadow-inner z-10";
        circleTable.innerHTML = `
            <span class="text-2xl font-black text-gray-700">${currentCount}</span>
            <span class="text-[10px] text-gray-400 font-bold">上限 ${maxSeats}人</span>
        `;
        tableCard.appendChild(circleTable);

        // 畫環形座位點
        for (let i = 0; i < maxSeats; i++) {
            const seatDot = document.createElement('div');
            const angle = (i * 2 * Math.PI) / maxSeats - Math.PI / 2;
            const radius = 74; 
            const x = 56 + radius * Math.cos(angle); 
            const y = 56 + radius * Math.sin(angle);

            seatDot.className = "seat-dot w-6 h-6 rounded-full border flex items-center justify-center text-[9px] font-black shadow-sm z-20 transition-all";
            seatDot.style.left = `${x}px`;
            seatDot.style.top = `${y}px`;

            if (activeGuests[i]) {
                const guest = activeGuests[i];
                seatDot.innerText = guest.name.substring(0, 2);
                seatDot.title = guest.name;
                seatDot.setAttribute('draggable', 'true');
                
                if (guest.side === '女方') {
                    seatDot.className += " bg-red-500 text-white border-red-600 cursor-grab";
                } else {
                    seatDot.className += " bg-blue-500 text-white border-blue-600 cursor-grab";
                }

                seatDot.addEventListener('dragstart', (e) => {
                    const realIndex = guestsInTable.findIndex(g => g && g.name === guest.name);
                    e.dataTransfer.setData('text/plain', JSON.stringify({ fromTable: tableNum, index: realIndex, name: guest.name }));
                });
            } else {
                seatDot.innerText = `${i+1}`;
                seatDot.className += " bg-white text-gray-300 border-gray-200";
            }
            circleTable.appendChild(seatDot);
        }

        const textSummary = document.createElement('div');
        textSummary.className = "w-full text-[11px] text-gray-500 mt-4 text-center truncate px-2 border-t pt-2 border-gray-100";
        textSummary.innerText = currentCount > 0 ? activeGuests.map(g=>g.name).join(', ') : '🈳 目前此桌無人';
        tableCard.appendChild(textSummary);

        grid.appendChild(tableCard);
    });
}

function allowDrop(e) { e.preventDefault(); }

// 🌟 3. 處理賓客拖放到圓枱
function handleDropOnTable(e, toTableNum) {
    e.preventDefault();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { fromTable, index } = data;
        const toIdx = parseInt(toTableNum);

        if (String(fromTable) === String(toTableNum)) return;

        // 檢查目標桌是否已滿
        const maxSeats = tableSettings[toTableNum].max_seats || 12;
        if (!allGuests[toIdx]) allGuests[toIdx] = [];
        const currentActiveCount = allGuests[toIdx].filter(g => g && g.name).length;

        if (currentActiveCount >= maxSeats) {
            alert(`❌ 唔好意思，第 ${toTableNum} 桌已經滿座 (${maxSeats}人)！`);
            return;
        }

        let movingGuestObj = null;

        // A. 提取賓客數據
        if (fromTable === "POOL") {
            // 從未安排水池中拔出
            movingGuestObj = unassignedPool[index];
            unassignedPool.splice(index, 1);
        } else {
            // 從其他圓枱陣列中拔出
            const fromIdx = parseInt(fromTable);
            movingGuestObj = allGuests[fromIdx][index];
            allGuests[fromIdx].splice(index, 1);
            // 重新排列原桌子的 sort 順序
            allGuests[fromIdx] = allGuests[fromIdx].filter(g => g && g.name);
            allGuests[fromIdx].forEach((g, i) => g.sort = i + 1);
        }

        // B. 塞入新桌子
        allGuests[toIdx] = allGuests[toIdx].filter(g => g && g.name);
        movingGuestObj.sort = allGuests[toIdx].length + 1;
        allGuests[toIdx].push(movingGuestObj);

        // C. 同步回 Firebase
        const updates = {};
        updates['wedding_guests'] = allGuests;
        updates['unassigned_guests'] = unassignedPool;
        database.ref().update(updates);

    } catch (err) { console.error(err); }
}

// 🌟 4. 處理拖入垃圾桶（移出座位，退回左側大水池）
function handleDropTrash(e) {
    e.preventDefault();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { fromTable, index } = data;

        if (fromTable === "POOL") return; // 本身就在水池中

        const fromIdx = parseInt(fromTable);
        let movingGuestObj = allGuests[fromIdx][index];
        
        // 從圓枱移除
        allGuests[fromIdx].splice(index, 1);
        allGuests[fromIdx] = allGuests[fromIdx].filter(g => g && g.name);
        allGuests[fromIdx].forEach((g, i) => g.sort = i + 1);

        // 退回到獨立的未安排池
        if (!unassignedPool) unassignedPool = [];
        movingGuestObj.sort = 99; // 標記未排位狀態
        unassignedPool.push(movingGuestObj);

        // 更新 Firebase
        const updates = {};
        updates['wedding_guests'] = allGuests;
        updates['unassigned_guests'] = unassignedPool;
        database.ref().update(updates);
    } catch (err) { console.error(err); }
}

// 🌟 5. 後台功能：動態新增全新一桌
function createNewTablePrompt() {
    const newNum = prompt("請輸入新桌子的編號 (例如輸入: 15):");
    if (!newNum || newNum.trim() === "") return;
    const cleanNum = newNum.trim();

    if (tableSettings[cleanNum]) {
        alert("⚠️ 呢個桌號已經存在。");
        return;
    }

    const maxSeats = prompt(`請輸入第 ${cleanNum} 桌的人數上限：`, "12");
    const cleanMax = parseInt(maxSeats) || 12;

    database.ref(`table_settings/${cleanNum}`).set({ max_seats: cleanMax })
        .then(() => { alert(`✅ 成功新增「第 ${cleanNum} 桌」(上限 ${cleanMax} 人)！`); });
}

// 🌟 6. 後台功能：單桌進階設定視窗控制 (改人數上限/刪桌)
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
    
    if (confirm(`⚠️ 確定要刪除「第 ${activeSettingTableNum} 桌」嗎？\n入面所有人會安全退回左側【未安排賓客清單】！`)) {
        const idx = parseInt(activeSettingTableNum);
        const guestsInTable = allGuests[idx] || [];
        
        if (!unassignedPool) unassignedPool = [];
        
        guestsInTable.forEach(g => {
            if (g && g.name) {
                g.sort = 99;
                unassignedPool.push(g);
            }
        });
        
        // 清空該桌陣列數據，防止留下 null 殘留
        allGuests[idx] = [];
        
        Promise.all([
            database.ref(`wedding_guests/${idx}`).remove(),
            database.ref(`unassigned_guests`).set(unassignedPool),
            database.ref(`table_settings/${activeSettingTableNum}`).remove()
        ]).then(() => {
            alert(`✅ 第 ${activeSettingTableNum} 桌已成功拆除！`);
            closeSettingsModal();
        });
    }
}
