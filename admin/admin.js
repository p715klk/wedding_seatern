// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const tbody = document.getElementById('excel-tbody');
const scrollContainer = document.getElementById('table-scroll-container');
let localGuestsList = []; 

// 全局維護的分類清單
let currentCategories = ['LK', '家人', '男方親戚', '女方親戚', '中學同學'];
let activeSelectElement = null; 
let sortableInstance = null;    

// 初始化 SortableJS
sortableInstance = Sortable.create(tbody, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function () {
        recalculateSortNumbersFromDOM();
    }
});

// 🎯 同時監聽成個婚宴根節點，確保未分配同已分配一齊撈出嚟
database.ref().on('value', (snapshot) => {
    const rootData = snapshot.val() || {};
    const weddingGuests = rootData.wedding_guests || {};
    const unassignedGuests = rootData.unassigned_guests || [];
    
    // 如果使用者目前正在打字或選選單，唔好打斷使用者
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        mergeAndRenderExcel(weddingGuests, unassignedGuests);
    }
});

// 🎯 核心重構：合併名單並渲染，徹底解決「睇唔到未安排賓客」嘅問題
function mergeAndRenderExcel(weddingGuests, unassignedGuests) {
    localGuestsList = [];
    tbody.innerHTML = '';

    // 1. 放入有分配桌次嘅人
    Object.keys(weddingGuests).forEach(tableNum => {
        const list = weddingGuests[tableNum];
        if (Array.isArray(list)) {
            list.forEach(guest => {
                if (guest && guest.name) {
                    localGuestsList.push({
                        name: guest.name,
                        side: guest.side || '男方',
                        group: guest.group || '未分類',
                        table: parseInt(tableNum), // 有桌次
                        sort: guest.sort || 1
                    });
                }
            });
        }
    });

    // 2. 放入完全冇分配桌次（未安排）嘅人
    if (Array.isArray(unassignedGuests)) {
        unassignedGuests.forEach(guest => {
            if (guest && guest.name) {
                localGuestsList.push({
                    name: guest.name,
                    side: guest.side || '男方',
                    group: guest.group || '未分類',
                    table: '', // 桌次直接留空！代表未安排
                    sort: 99
                });
            }
        });
    }

    // 依照原本嘅順序排列顯示
    renderDOMRows();
}

// 將資料陣列繪製成真實 HTML 橫列
function renderDOMRows() {
    tbody.innerHTML = '';
    
    // 收集現有數據中所有出現過嘅群組，自動擴充下拉選單
    localGuestsList.forEach(g => {
        if (g.group && !currentCategories.includes(g.group)) {
            currentCategories.push(g.group);
        }
    });

    localGuestsList.forEach((guest, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition bg-white";
        
        // 來源 Side 下拉
        const sideSelectHTML = `
            <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold table-select bg-transparent focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none">
                <option value="男方" ${guest.side === '男方' ? 'selected' : ''}>♂️ 男方</option>
                <option value="女方" ${guest.side === '女方' ? 'selected' : ''}>♀️ 女方</option>
            </select>
        `;

        // 群組 Group 下拉
        let groupOptions = currentCategories.map(cat => `<option value="${cat}" ${guest.group === cat ? 'selected' : ''}>${cat}</option>`).join('');
        const groupSelectHTML = `
            <select onchange="handleGroupChange(this)" class="w-full border border-gray-200 rounded p-1 text-xs font-bold table-select bg-transparent focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none">
                ${groupOptions}
                <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂分類...</option>
            </select>
        `;

        // 🎯 修正重點：桌次由選擇框直接改成 <input type="number">，你想填咩就填咩，空白就是未安排
        const tableInputHTML = `
            <input type="number" min="1" max="99" placeholder="未安排" value="${guest.table !== undefined ? guest.table : ''}" 
                   class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center excel-input bg-transparent focus:bg-white">
        `;

        tr.innerHTML = `
            <td class="py-2 px-3 text-center font-mono text-gray-400 font-bold row-sort-num">${index + 1}</td>
            <td class="py-2 px-3 text-center drag-handle text-gray-400 text-base select-none">☰</td>
            <td class="py-2 px-3">
                <input type="text" value="${guest.name}" class="w-full border border-gray-200 rounded p-1 text-xs font-bold excel-input bg-transparent focus:bg-white">
            </td>
            <td class="py-2 px-3">${sideSelectHTML}</td>
            <td class="py-2 px-3">${groupSelectHTML}</td>
            <td class="py-2 px-3">${tableInputHTML}</td>
            <td class="py-2 px-3 text-center">
                <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold text-xs p-1 transition">❌ 刪除</button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

// 🎯 修正重點：新增賓客列時，桌次（Table）絕對是預設空白！
function addNewGuestRow() {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition bg-white new-row-animate";

    const sideSelectHTML = `
        <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold table-select bg-transparent focus:bg-white">
            <option value="男方" selected>♂️ 男方</option>
            <option value="女方">♀️ 女方</option>
        </select>
    `;

    let groupOptions = currentCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    const groupSelectHTML = `
        <select onchange="handleGroupChange(this)" class="w-full border border-gray-200 rounded p-1 text-xs font-bold table-select bg-transparent focus:bg-white">
            ${groupOptions}
            <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂分類...</option>
        </select>
    `;

    // 預設直接是空白，不綁死任何數字桌次
    const tableInputHTML = `
        <input type="number" min="1" max="99" placeholder="未安排" value="" 
               class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center excel-input bg-transparent focus:bg-white">
    `;

    const nextIndex = tbody.children.length + 1;

    tr.innerHTML = `
        <td class="py-2 px-3 text-center font-mono text-gray-400 font-bold row-sort-num">${nextIndex}</td>
        <td class="py-2 px-3 text-center drag-handle text-gray-400 text-base select-none">☰</td>
        <td class="py-2 px-3">
            <input type="text" value="" placeholder="請輸入姓名" class="w-full border border-gray-200 rounded p-1 text-xs font-bold excel-input bg-transparent focus:bg-white">
        </td>
        <td class="py-2 px-3">${sideSelectHTML}</td>
        <td class="py-2 px-3">${groupSelectHTML}</td>
        <td class="py-2 px-3">${tableInputHTML}</td>
        <td class="py-2 px-3 text-center">
            <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold text-xs p-1 transition">❌ 刪除</button>
        </td>
    `;

    tbody.appendChild(tr);
    scrollContainer.scrollTop = scrollContainer.scrollHeight; 
}

// 監聽群組自訂選取
function handleGroupChange(selectEl) {
    if (selectEl.value === '__NEW__') {
        activeSelectElement = selectEl;
        document.getElementById('custom-category-input').value = '';
        document.getElementById('custom-dialog-overlay').classList.remove('hidden');
        selectEl.value = currentCategories[0] || ''; 
    }
}

function closeCustomCategoryDialog(isConfirm) {
    const overlay = document.getElementById('custom-dialog-overlay');
    const inputEl = document.getElementById('custom-category-input');
    overlay.classList.add('hidden');

    if (isConfirm && activeSelectElement) {
        const newCat = inputEl.value.trim();
        if (newCat && !currentCategories.includes(newCat)) {
            currentCategories.push(newCat);
            
            // 刷新所有人的下拉選單
            const allSelects = tbody.querySelectorAll('td:nth-child(5) select');
            allSelects.forEach(sel => {
                const savedVal = sel.value;
                let groupOptions = currentCategories.map(cat => `<option value="${cat}" ${savedVal === cat ? 'selected' : ''}>${cat}</option>`).join('');
                sel.innerHTML = `
                    ${groupOptions}
                    <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂分類...</option>
                `;
            });
            activeSelectElement.value = newCat;
        }
    }
    activeSelectElement = null;
}

function deleteRowAction(btn) {
    const row = btn.closest('tr');
    row.remove();
    recalculateSortNumbersFromDOM();
}

function recalculateSortNumbersFromDOM() {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row, idx) => {
        row.querySelector('.row-sort-num').innerText = idx + 1;
    });
}

// 🎯 核心重構：儲存至 Firebase 邏輯（完美拆解已分配與未安排，丟回畫布）
function saveAllToFirebase() {
    const rows = tbody.querySelectorAll('tr');
    
    let newWeddingGuests = {};   // 存放有填桌號的人
    let newUnassignedPool = [];  // 存放桌號空白的人

    rows.forEach((row) => {
        const inputs = row.querySelectorAll('input');
        const selects = row.querySelectorAll('select');

        const gName = inputs[0].value.trim();
        const gSide = selects[0].value;
        const gGroup = selects[1].value;
        const gTableRaw = inputs[1].value.trim(); // 拿取輸入框嘅數字

        if (!gName) return; // 跳過空姓名

        // 如果有填桌次（係有效數字）
        if (gTableRaw !== "" && !isNaN(gTableRaw)) {
            const tableNum = parseInt(gTableRaw);
            if (!newWeddingGuests[tableNum]) {
                newWeddingGuests[tableNum] = [];
            }
            
            // 計算目前呢張桌子內排到第幾位座位
            const currentSeatCount = newWeddingGuests[tableNum].length + 1;

            newWeddingGuests[tableNum].push({
                name: gName,
                side: gSide,
                group: gGroup,
                sort: currentSeatCount // 在該桌內的座位號碼
            });
        } else {
            // 冇填桌次，一律丟進未安排名單
            newUnassignedPool.push({
                name: gName,
                side: gSide,
                group: gGroup,
                sort: 99
            });
        }
    });

    // 將整理乾淨嘅新結構一次過寫入 Firebase 覆蓋更新
    const finalPayload = {
        wedding_guests: newWeddingGuests,
        unassigned_guests: newUnassignedPool
    };

    database.ref().update(finalPayload).then(() => {
        alert("✨ 【後台數據同步成功】！\n所有修改與排序已即時同步至前台與畫布。");
    }).catch(err => {
        alert("❌ 儲存失敗: " + err.message);
    });
}

// 匯出成 CSV
function exportToCSV() {
    if (localGuestsList.length === 0) { alert("目前沒有數據可導出！"); return; }
    
    let csvContent = "\uFEFF姓名,來源(男方/女方),群組,分配桌次\n";
    
    // 依目前 DOM 上嘅真實狀況導出
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const selects = row.querySelectorAll('select');
        const name = inputs[0].value.trim();
        const side = selects[0].value;
        const group = selects[1].value;
        const table = inputs[1].value.trim();
        if (name) {
            csvContent += `"${name}","${side}","${group}","${table}"\n`;
        }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `wedding_guests_backup_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// CSV 匯入邏輯
function importCSVAction() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) { alert("請先選擇一個 CSV 檔案！"); return; }

    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split('\n');
        let importedGuests = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // 簡單處理逗號切分（未處理複雜引號）
            const parts = line.split(',');
            if (parts.length >= 2) {
                const name = parts[0].replace(/"/g, '').trim();
                const side = parts[1] ? parts[1].replace(/"/g, '').trim() : '男方';
                const group = parts[2] ? parts[2].replace(/"/g, '').trim() : '未分類';
                const tableRaw = parts[3] ? parts[3].replace(/"/g, '').trim() : '';

                if (name) {
                    importedGuests.push({
                        name: name,
                        side: side,
                        group: group,
                        table: tableRaw !== "" ? parseInt(tableRaw) : ""
                    });
                }
            }
        }

        // 將匯入數據轉為真實 rows
        localGuestsList = importedGuests;
        renderDOMRows();
        alert(`成功解析 ${importedGuests.length} 位賓客！確認無誤後請點擊「儲存變更」。`);
    };
    reader.readAsText(file, 'UTF-8');
}

// 鎖定 iPhone 行為與右鍵阻擋
(function() {
    let adminLastTouchEnd = 0;
    document.addEventListener('touchstart', function (event) {
        if (event.touches.length > 1) event.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', function (event) {
        if (event.scale !== undefined && event.scale !== 1) event.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - adminLastTouchEnd <= 300) event.preventDefault();
        adminLastTouchEnd = now;
    }, false);
})();
document.addEventListener('contextmenu', event => event.preventDefault());