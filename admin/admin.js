// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const tbody = document.getElementById('excel-tbody');
const scrollContainer = document.getElementById('table-scroll-container');
let localGuestsList = []; 

// 初始化 SortableJS
Sortable.create(tbody, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function () {
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

    sortLocalList();

    if (localGuestsList.length === 0) {
        tbody.innerHTML = '';
        addNewRow();
        return;
    }

    refreshTableUI();
}

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
    return tr;
}

function updateLocalData(index, field, value) {
    if (localGuestsList[index]) {
        localGuestsList[index][field] = (field === 'sort' || field === 'table') ? parseInt(value) || 0 : value.trim();
    }
}

function onTableChange() {
    recalculateSortNumbersFromDOM();
    sortLocalList();
    refreshTableUI();
}

function recalculateSortNumbersFromDOM() {
    const rows = tbody.querySelectorAll('tr');
    const tableCounters = {};
    const updatedList = [];

    rows.forEach(row => {
        const oldIndex = row.getAttribute('data-index');
        const guest = localGuestsList[oldIndex];
        
        if (guest) {
            const currentTable = parseInt(row.querySelector('.table-select').value) || 1;
            guest.table = currentTable;

            if (!tableCounters[currentTable]) tableCounters[currentTable] = 1;
            else tableCounters[currentTable]++;

            guest.sort = tableCounters[currentTable];
            row.querySelector('.sort-input').value = guest.sort;
            updatedList.push(guest);
        }
    });

    localGuestsList = updatedList;
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

// 📌 1. 優化：新增一行賓客，全自動流暢滾動落底
function addNewRow() {
    const newGuest = { table: 14, sort: 99, name: "", side: "男方", group: "" }; // 設為最後一桌方便沉底
    localGuestsList.push(newGuest);
    
    // 渲染最後一行
    const newIndex = localGuestsList.length - 1;
    const newRowDOM = createRowDOM(newGuest, newIndex);
    
    recalculateSortNumbersFromDOM();
    
    // 加個漂亮的高亮綠色動畫，等工作人員一眼認到加咗邊行
    newRowDOM.classList.add('new-row-animate');

    // 關鍵：將 Excel 容器捲動到最底部
    setTimeout(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        // 自動聚焦去姓名輸入框，可以立即打字
        newRowDOM.querySelector('input[type="text"]').focus();
    }, 50);
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
            .then(() => { alert("✅ 儲存成功！"); })
            .catch((error) => { alert("❌ 儲存失敗: " + error.message); });
    }
}

// 📌 2. 新增：控制側邊欄 Setting Menu 顯示與隱藏
function toggleSettingsModal(show) {
    const sidebar = document.getElementById('settings-sidebar');
    if (show) {
        sidebar.classList.remove('hidden');
    } else {
        sidebar.classList.add('hidden');
    }
}

// 📌 3. 新增：匯出目前名單為 CSV 檔案
function exportTableToCSV() {
    if (localGuestsList.length === 0) {
        alert("目前沒有任何數據可以匯出。");
        return;
    }

    // 建立 CSV Header
    let csvContent = "姓名,分類,子分類,桌次,排序\n";

    // 將背後的數據逐筆寫入橫行
    localGuestsList.forEach(guest => {
        if (guest && guest.name) {
            // 清理可能污染 CSV 的逗號
            const name = guest.name.replace(/,/g, ' ');
            const side = guest.side.replace(/,/g, ' ');
            const group = guest.group.replace(/,/g, ' ');
            
            csvContent += `${name},${side},${group},第${guest.table}桌,${guest.sort}\n`;
        }
    });

    // 加上 UTF-8 BOM 檔頭 (\uFEFF)，防止 Microsoft Excel 直接開啟時出現中文字亂碼
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Wedding_Guests_Backup_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toggleSettingsModal(false); // 關閉側邊欄
}

// CSV 匯入邏輯 (保持並完美融合)
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
                sort: 99, 
                name: row[nameIdx],
                side: sideIdx !== -1 ? (row[sideIdx] || "男方") : "男方",
                group: groupIdx !== -1 ? (row[groupIdx] || "") : ""
            });
        }

        sortLocalList();
        refreshTableUI();
        recalculateSortNumbersFromDOM();

        alert(`📂 成功從 CSV 載入 ${localGuestsList.length} 位賓客！確認無誤後請點擊「儲存變更」。`);
    };
    reader.readAsText(file, 'UTF-8');
}
