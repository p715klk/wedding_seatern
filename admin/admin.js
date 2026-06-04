// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const tbody = document.getElementById('excel-tbody');
let localGuestsList = []; 

// 監聽 Firebase 數據
database.ref('wedding_guests').on('value', (snapshot) => {
    const weddingGuests = snapshot.val();
    
    // 📌 修正：如果 Firebase 數據完全是空 (null)，主動給予空物件，避免卡在「載入中」
    if (!weddingGuests) {
        renderExcelTable({});
        return;
    }
    
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        renderExcelTable(weddingGuests);
    }
}, (error) => {
    // 📌 修正：如果是權限或連線問題，彈出提示
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Firebase 連線失敗，請檢查權限或 Database URL！</td></tr>`;
});

function renderExcelTable(weddingGuests) {
    localGuestsList = [];
    tbody.innerHTML = '';

    Object.keys(weddingGuests).forEach(tableNum => {
        const guests = weddingGuests[tableNum] || [];
        guests.forEach(guest => {
            if (guest && guest.name) {
                // 相容寫法：將「第X桌」或「未排座」等字眼清洗，只保留純數字方便排序
                let cleanTable = String(tableNum).replace(/[^0-9]/g, '') || "1";
                localGuestsList.push({
                    table: cleanTable,
                    name: guest.name,
                    side: guest.side || '男方',
                    group: guest.group || ''
                });
            }
        });
    });

    localGuestsList.sort((a, b) => parseInt(a.table) - parseInt(b.table));

    // 📌 修正：當完全沒數據時，給一條空白 Row 給用家可以直接輸入，唔好卡畫面
    if (localGuestsList.length === 0) {
        tbody.innerHTML = '';
        addNewRow();
        return;
    }

    localGuestsList.forEach((guest, index) => {
        createRowDOM(guest, index);
    });
}

function createRowDOM(guest, index) {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition";
    tr.id = `excel-row-${index}`;

    let tableOptions = '';
    for(let i=1; i<=14; i++) {
        tableOptions += `<option value="${i}" ${guest.table == i ? 'selected' : ''}>${i}</option>`;
    }

    tr.innerHTML = `
        <td class="p-1 text-center bg-gray-50">
            <select onchange="updateLocalData(${index}, 'table', this.value)" class="w-full text-center p-1.5 bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-green-500 font-bold text-gray-700">
                ${tableOptions}
            </select>
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
        localGuestsList[index][field] = value.trim();
    }
}

function addNewRow() {
    const newGuest = { table: "1", name: "", side: "男方", group: "" };
    localGuestsList.push(newGuest);
    const newIndex = localGuestsList.length - 1;
    createRowDOM(newGuest, newIndex);
}

function deleteRow(index) {
    if (confirm("確定要刪除這位賓客嗎？(需要點擊儲存才會生效)")) {
        const rowDOM = document.getElementById(`excel-row-${index}`);
        if(rowDOM) rowDOM.remove();
        localGuestsList[index] = null;
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
                group: guest.group
            });
        }
    });

    if (confirm("🚨 確定要儲存 Excel 變更並覆蓋 Firebase 嗎？")) {
        database.ref('wedding_guests').set(finalWeddingGuestsJSON)
            .then(() => { alert("✅ 儲存成功！"); })
            .catch((error) => { alert("❌ 儲存失敗: " + error.message); });
    }
}

// 📌 新增：直接解析 Google Sheets 匯出的 CSV 名單
function handleCSVUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        if(lines.length <= 1) return;

        // 解析第一行 Header 定位欄位
        const headers = lines[0].split(',').map(h => h.trim());
        const nameIdx = headers.indexOf("姓名");
        const sideIdx = headers.indexOf("分類"); // 你的資料入面「男方/女方」通常放喺分類
        const groupIdx = headers.indexOf("子分類"); 
        const tableIdx = headers.indexOf("桌次");

        if(nameIdx === -1 || tableIdx === -1) {
            alert("❌ CSV 格式不符！必須包含『姓名』同『桌次』欄位。");
            return;
        }

        localGuestsList = []; // 清空原有緩存
        tbody.innerHTML = '';

        // 逐行讀取賓客
        for(let i = 1; i < lines.length; i++) {
            if(!lines[i].trim()) continue;
            const row = lines[i].split(',').map(r => r.trim());
            
            let rawTable = row[tableIdx] || "1";
            let cleanTable = rawTable.replace(/[^0-9]/g, '') || "1"; // 將 '第1桌' 轉成 '1'
            
            localGuestsList.push({
                table: cleanTable,
                name: row[nameIdx],
                side: sideIdx !== -1 ? (row[sideIdx] || "男方") : "男方",
                group: groupIdx !== -1 ? (row[groupIdx] || "") : ""
            });
        }

        // 重新排版 Excel 畫面
        localGuestsList.sort((a, b) => parseInt(a.table) - parseInt(b.table));
        localGuestsList.forEach((guest, index) => {
            createRowDOM(guest, index);
        });

        alert(`📂 成功從 CSV 載入 ${localGuestsList.length} 位賓客！確認無誤後請點擊「儲存變更」推上 Firebase。`);
    };
    reader.readAsText(file, 'UTF-8');
}
