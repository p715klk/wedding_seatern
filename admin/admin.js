// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const tbody = document.getElementById('excel-tbody');
let localGuestsList = []; 

// 📌 初始化 SortableJS 拖拉功能
Sortable.create(tbody, {
    handle: '.drag-handle', // 只有按住 ☰ 才可以拖動，方便輸入框打字
    animation: 150,        // 拖動動畫速度
    ghostClass: 'sortable-ghost', // 拖動時的預覽樣式
    onEnd: function () {
        // 核心邏輯：當用家拖拉放手後，重新根據畫面的 DOM 順序刷新 localGuestsList 並重編 sort 數字
        recalculateSortNumbersFromDOM();
    }
});

database.ref('wedding_guests').on('value', (snapshot) => {
    const weddingGuests = snapshot.val();
    if (!weddingGuests) {
        renderExcelTable({});
        return;
    }
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        renderExcelTable(weddingGuests);
    }
});

function renderExcelTable(weddingGuests) {
    localGuestsList = [];
    tbody.innerHTML = '';

    Object.keys(weddingGuests).forEach(tableNum => {
        const guests = weddingGuests[tableNum] || [];
        guests.forEach(guest => {
            if (guest && guest.name) {
                let cleanTable = String(tableNum).replace(/[^0-9]/g, '') || "1";
                localGuestsList.push({
                    table: parseInt(cleanTable),
                    sort: guest.sort !== undefined ? parseInt(guest.sort) : 10,
                    name: guest.name,
                    side: guest.side || '男方',
                    group: guest.group || ''
                });
            }
        });
    });

    // 第一次由 Firebase 載入時，先跟枱號、再跟 sort 排序
    sortLocalList();

    if (localGuestsList.length === 0) {
        tbody.innerHTML = '';
        addNewRow();
        return;
    }

    refreshTableUI();
}

// 將目前的 localGuestsList 渲染上網頁畫面
function refreshTableUI() {
    tbody.innerHTML = '';
    localGuestsList.forEach((guest, index) => {
        if (guest) createRowDOM(guest, index);
    });
}

function createRowDOM(guest, index) {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition bg-white";
    tr.id = `excel-row-${index}`;
    // 儲存目前在陣列的 index 方便追蹤
    tr.setAttribute('data-index', index); 

    let tableOptions = '';
    for(let i=1; i<=14; i++) {
        tableOptions += `<option value="${i}" ${guest.table == i ? 'selected' : ''}>${i}</option>`;
    }

    tr.innerHTML = `
        <td class="p-2 text-center bg-gray-50 text-gray-400 drag-handle text-base font-bold">☰</td>
        
        <td class="p-1 text-center bg-gray-50">
            <select onchange="updateLocalData(${index}, 'table', this.value); onTableChange();" class="w-full text-center p-1.5 bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-green-500 font-bold text-gray-700 table-select">
                ${tableOptions}
            </select>
        </td>
        <td class="p-1 text-center bg-gray-50">
            <input type="number" value="${guest.sort}" readonly class="sort-input w-full p-1.5 bg-transparent border-0 text-center font-mono text-gray-400 font-bold" placeholder="10">
        </td>
        <td class="p-1">
            <input type="text" value="${guest.name}" oninput="updateLocalData(${index}, 'name', this.value)" class="excel-input w-full p-1.5 bg-transparent border-0 font-bold text-gray-800" placeholder="輸入姓名...">
        </td>
        <td class="p-1">
            <select onchange="updateLocalData(${index}, 'side', this.value)" class="w-full p-1.5 bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-green-500">
                <option value="男方" ${guest.side === '男方' ? 'selected' : ''}>男方</option>
                <option value="女方" ${guest.side === '女方' ? 'selected' : ''}>女方</option>
            </select>
        </td>
        <td class="p-1">
            <input type="text" value="${guest.group}" oninput="updateLocalData(${index}, 'group', this.value)" class="excel-input w-full p-1.5 bg-transparent border-0" placeholder="例如: LK / 家人...">
        </td>
        <td class="p-1 text-center">
            <button onclick="deleteRow(${index})" class="text-red-500 hover:text-red-700 font-bold text-xs p-1.5 border border-red-200 rounded bg-red-50 hover:bg-red-100 transition">
                🗑️ 刪除
            </button>
        </td>
    `;
    tbody.appendChild(tr);
}

function updateLocalData(index, field, value) {
    if (localGuestsList[index]) {
        localGuestsList[index][field] = (field === 'sort' || field === 'table') ? parseInt(value) || 0 : value.trim();
    }
}

// 📌 當用家手動改咗某個人嘅「桌次」，我哋自動重新編排兼排序，等同枱嘅人聚返埋一齊
function onTableChange() {
    recalculateSortNumbersFromDOM();
    sortLocalList();
    refreshTableUI();
}

// 📌 核心重編：跟據目前畫面的 DOM 行列次序，重新洗牌每一桌內部的 sort 權重數字
function recalculateSortNumbersFromDOM() {
    const rows = tbody.querySelectorAll('tr');
    const tableCounters = {}; // 用來記錄每張枱目前數到第幾個人

    const updatedList = [];

    rows.forEach(row => {
        const oldIndex = row.getAttribute('data-index');
        const guest = localGuestsList[oldIndex];
        
        if (guest) {
            // 攞返目前呢行畫面上選取嘅桌次
            const currentTable = parseInt(row.querySelector('.table-select').value) || 1;
            guest.table = currentTable;

            // 初始化或累加該桌人數計數器
            if (!tableCounters[currentTable]) tableCounters[currentTable] = 1;
            else tableCounters[currentTable]++;

            // 重新賦予 sort 數字：1, 2, 3...
            guest.sort = tableCounters[currentTable];
            
            // 即時更新畫面上的唯讀數字輸入框
            row.querySelector('.sort-input').value = guest.sort;

            updatedList.push(guest);
        }
    });

    // 將網頁上看到的順序，寫回背後的暫存記憶體
    localGuestsList = updatedList;
    // 重新綁定 index，確保打字更新不會錯位
    rows.forEach((row, newIdx) => {
        row.setAttribute('data-index', newIdx);
    });
}

function sortLocalList() {
    localGuestsList.sort((a, b) => {
        if (a.table !== b.table) return a.table - b.table;
        return a.sort - b.sort;
    });
}

function addNewRow() {
    const newGuest = { table: 1, sort: 99, name: "", side: "男方", group: "" };
    localGuestsList.push(newGuest);
    refreshTableUI();
    recalculateSortNumbersFromDOM();
}

function deleteRow(index) {
    if (confirm("確定要刪除這位賓客嗎？(需要點擊儲存才會生效)")) {
        localGuestsList[index] = null;
        recalculateSortNumbersFromDOM();
        refreshTableUI();
    }
}

function saveExcelToFirebase() {
    const finalWeddingGuestsJSON = {};

    localGuestsList.forEach(guest => {
        if (guest && guest.name) {
            const table = guest.table;
            if (!finalWeddingGuestsJSON[table]) {
                finalWeddingGuestsJSON[table] = [];
            }
            finalWeddingGuestsJSON[table].push({
                name: guest.name,
                side: guest.side,
                group: guest.group,
                sort: guest.sort
            });
        }
    });

    if (confirm("🚨 確定要儲存 Excel 變更並覆蓋 Firebase 嗎？")) {
        database.ref('wedding_guests').set(finalWeddingGuestsJSON)
            .then(() => { alert("✅ 儲存成功！拖拉排序已完美同步。"); })
            .catch((error) => { alert("❌ 儲存失敗: " + error.message); });
    }
}

// CSV 匯入也支援自動重編排序
function handleCSVUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        if(lines.length <= 1) return;

        const headers = lines[0].split(',').map(h => h.trim());
        const nameIdx = headers.indexOf("姓名");
        const sideIdx = headers.indexOf("分類"); 
        const groupIdx = headers.indexOf("子分類"); 
        const tableIdx = headers.indexOf("桌次");

        if(nameIdx === -1 || tableIdx === -1) {
            alert("❌ CSV 格式不符！必須包含『姓名』同『桌次』欄位。");
            return;
        }

        localGuestsList = [];
        for(let i = 1; i < lines.length; i++) {
            if(!lines[i].trim()) continue;
            const row = lines[i].split(',').map(r => r.trim());
            let cleanTable = row[tableIdx].replace(/[^0-9]/g, '') || "1";
            
            localGuestsList.push({
                table: parseInt(cleanTable),
                sort: 99, // 暫代
                name: row[nameIdx],
                side: sideIdx !== -1 ? (row[sideIdx] || "男方") : "男方",
                group: groupIdx !== -1 ? (row[groupIdx] || "") : ""
            });
        }

        sortLocalList();
        refreshTableUI();
        recalculateSortNumbersFromDOM(); // 全自動賦予 1, 2, 3...

        alert(`📂 成功從 CSV 載入 ${localGuestsList.length} 位賓客！確認無誤後請點擊「儲存變更」。`);
    };
    reader.readAsText(file, 'UTF-8');
}
