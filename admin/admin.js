// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const tbody = document.getElementById('excel-tbody');
const scrollContainer = document.getElementById('table-scroll-container');
let localGuestsList = []; 

// 全局維護的分類標籤清單
let currentCategories = ['LK', '家人', '男方親戚', '女方親戚', '中學同學'];
let activeSelectElement = null; 
let sortableInstance = null;    

// 控制左側 Side Panel 開關
function toggleSidePanel() {
    const panel = document.getElementById('side-panel');
    const overlay = document.getElementById('side-panel-overlay');
    if (panel.classList.contains('-translate-x-full')) {
        panel.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        panel.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

// 初始化 SortableJS
if (typeof Sortable !== 'undefined' && tbody) {
    sortableInstance = Sortable.create(tbody, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function () {
            recalculateSortNumbersFromDOM();
        }
    });
}

// 🎯 實時監聽 wedding_guests 節點，實現與前台排位畫布完全同步
database.ref('wedding_guests').on('value', (snapshot) => {
    const weddingGuests = snapshot.val() || {};
    
    // 避免使用者正喺度輸入文字或點選選單時被刷新打斷
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        processAndRenderExcel(weddingGuests);
    }
});

// 解析前台畫布數據進後台
function processAndRenderExcel(weddingGuests) {
    localGuestsList = [];
    tbody.innerHTML = '';

    Object.keys(weddingGuests).forEach(tableNum => {
        const list = weddingGuests[tableNum];
        if (Array.isArray(list)) {
            list.forEach(guest => {
                if (guest && guest.name) {
                    // 枱號 99 喺前台定義為未安排
                    const isUnassigned = (tableNum === '99' || parseInt(tableNum) === 99);
                    
                    localGuestsList.push({
                        name: guest.name,
                        side: guest.side || '男方',
                        group: guest.group || '未分類',
                        table: isUnassigned ? '' : parseInt(tableNum), 
                        sort: guest.sort || 1
                    });
                }
            });
        }
    });

    if (localGuestsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400 font-bold">🎉 目前名單內沒有任何賓客，請點右上角「新增賓客」開始建立。</td></tr>`;
        return;
    }

    renderDOMRows();
}

// 🎯 重新依據指定嘅 8 個全新欄位順序進行繪製
function renderDOMRows() {
    tbody.innerHTML = '';
    
    localGuestsList.forEach(g => {
        if (g.group && !currentCategories.includes(g.group)) {
            currentCategories.push(g.group);
        }
    });

    localGuestsList.forEach((guest, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition bg-white";
        
        // 來源分類 (男方/女方)
        const sideSelectHTML = `
            <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none">
                <option value="男方" ${guest.side === '男方' ? 'selected' : ''}>♂️ 男方</option>
                <option value="女方" ${guest.side === '女方' ? 'selected' : ''}>♀️ 女方</option>
            </select>
        `;

        // 標籤 (群組自訂分類)
        let groupOptions = currentCategories.map(cat => `<option value="${cat}" ${guest.group === cat ? 'selected' : ''}>${cat}</option>`).join('');
        const groupSelectHTML = `
            <select onchange="handleGroupChange(this)" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none">
                ${groupOptions}
                <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂分類...</option>
            </select>
        `;

        // 分配桌次 Input (空白代表未安排)
        const tableInputHTML = `
            <input type="number" min="1" max="99" placeholder="未安排" value="${guest.table !== undefined && guest.table !== null ? guest.table : ''}" 
                   class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center bg-transparent focus:bg-white">
        `;

        // 🌟 欄位順序：拖拉(1) -> 排序(2) -> 分配桌次(3) -> 桌次座位(4) -> 賓客姓名(5) -> 來源分類(6) -> 標籤(7) -> 操作(8)
        tr.innerHTML = `
            <td class="py-2 px-3 text-center drag-handle text-gray-400 text-base select-none w-12 cursor-row-resize">☰</td>
            <td class="py-2 px-3 text-center font-mono text-gray-400 font-bold row-sort-num w-12">${index + 1}</td>
            <td class="py-2 px-3 w-24">${tableInputHTML}</td>
            <td class="py-2 px-3 text-center font-mono font-bold text-gray-500 text-xs row-seat-num w-24">${guest.table ? guest.sort : '-'}</td>
            <td class="py-2 px-3 w-44">
                <input type="text" value="${guest.name}" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white">
            </td>
            <td class="py-2 px-3 w-28">${sideSelectHTML}</td>
            <td class="py-2 px-3 w-40">${groupSelectHTML}</td>
            <td class="py-2 px-3 text-center w-20">
                <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold text-xs p-1 transition">❌ 刪除</button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

// 手動新增一列
function addNewGuestRow() {
    if (tbody.querySelector('td[colspan="8"]')) {
        tbody.innerHTML = '';
    }

    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition bg-white";

    const sideSelectHTML = `
        <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white">
            <option value="男方" selected>♂️ 男方</option>
            <option value="女方">♀️ 女方</option>
        </select>
    `;

    let groupOptions = currentCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    const groupSelectHTML = `
        <select onchange="handleGroupChange(this)" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white">
            ${groupOptions}
            <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂分類...</option>
        </select>
    `;

    const tableInputHTML = `
        <input type="number" min="1" max="99" placeholder="未安排" value="" 
               class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center bg-transparent focus:bg-white">
    `;

    const nextIndex = tbody.children.length + 1;

    // 依指定 8 大欄位順序排布
    tr.innerHTML = `
        <td class="py-2 px-3 text-center drag-handle text-gray-400 text-base select-none w-12 cursor-row-resize">☰</td>
        <td class="py-2 px-3 text-center font-mono text-gray-400 font-bold row-sort-num w-12">${nextIndex}</td>
        <td class="py-2 px-3 w-24">${tableInputHTML}</td>
        <td class="py-2 px-3 text-center font-mono font-bold text-gray-500 text-xs row-seat-num w-24">-</td>
        <td class="py-2 px-3 w-44">
            <input type="text" value="" placeholder="請輸入姓名" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white">
        </td>
        <td class="py-2 px-3 w-28">${sideSelectHTML}</td>
        <td class="py-2 px-3 w-40">${groupSelectHTML}</td>
        <td class="py-2 px-3 text-center w-20">
            <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold text-xs p-1 transition">❌ 刪除</button>
        </td>
    `;

    tbody.appendChild(tr);
    scrollContainer.scrollTop = scrollContainer.scrollHeight; 
}

// 新增自訂分類視窗
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
            
            const allSelects = tbody.querySelectorAll('select[onchange="handleGroupChange(this)"]');
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
        const numEl = row.querySelector('.row-sort-num');
        if (numEl) numEl.innerText = idx + 1;
    });
}

// 🎯 按鈕功能：儲存變更，完全對準全新 8 個 Column 的 DOM 節點位置進行讀取，精準 Sync 畫布
function saveAllToFirebase() {
    const rows = tbody.querySelectorAll('tr');
    let newWeddingGuests = {};   

    rows.forEach((row) => {
        const inputs = row.querySelectorAll('input');
        const selects = row.querySelectorAll('select');

        if (inputs.length < 2 || selects.length < 2) return;

        // inputs[0] 是分配桌次，inputs[1] 是賓客姓名
        const gTableRaw = inputs[0].value.trim(); 
        const gName = inputs[1].value.trim();
        const gSide = selects[0].value;
        const gGroup = selects[1].value;

        if (!gName) return; 

        // 空白為未安排，自動包裝成桌號 99 進前台待分配 Pool
        let targetTable = 99;
        if (gTableRaw !== "" && !isNaN(gTableRaw)) {
            targetTable = parseInt(gTableRaw);
        }

        if (!newWeddingGuests[targetTable]) {
            newWeddingGuests[targetTable] = [];
        }
        
        const currentSeatCount = newWeddingGuests[targetTable].length + 1;

        newWeddingGuests[targetTable].push({
            name: gName,
            side: gSide,
            group: gGroup,
            sort: targetTable === 99 ? 99 : currentSeatCount 
        });
    });

    database.ref('wedding_guests').set(newWeddingGuests).then(() => {
        alert("✨ 【數據同步成功】！\n新版 Tailwind 欄位格式之數據已完美同步至排位畫布。");
    }).catch(err => {
        alert("❌ 儲存失敗: " + err.message);
    });
}

// 匯出 CSV 備份
function exportToCSV() {
    if (localGuestsList.length === 0) { alert("目前沒有數據可導出！"); return; }
    let csvContent = "\uFEFF姓名,來源(男方/女方),群組,分配桌次\n";
    
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const selects = row.querySelectorAll('select');
        if(inputs.length >= 2 && selects.length >= 2) {
            const table = inputs[0].value.trim();
            const name = inputs[1].value.trim();
            const side = selects[0].value;
            const group = selects[1].value;
            if (name) {
                csvContent += `"${name}","${side}","${group}","${table}"\n`;
            }
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

// 匯入 CSV
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

        localGuestsList = importedGuests;
        renderDOMRows();
        toggleSidePanel(); // 自動收回側邊欄工具箱
        alert(`成功解析 ${importedGuests.length} 位賓客！確認無誤後請點擊「儲存變更」。`);
    };
    reader.readAsText(file, 'UTF-8');
}

// 手機雙指安全鎖與防右鍵
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

document.addEventListener('keydown', event => {
    if (
        event.key === 'F12' ||
        (event.ctrlKey && event.shiftKey && (event.key === 'I' || event.key === 'C')) ||
        (event.ctrlKey && event.key === 'u')
    ) {
        event.preventDefault();
    }
});