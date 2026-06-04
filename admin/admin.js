// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const tbody = document.getElementById('excel-tbody');
let localGuestsList = []; // 用埋做本地緩存，格式：[{table: "1", name: "張三", side: "男方", group: "家人"}]

// 監聽 Firebase 數據
database.ref('wedding_guests').on('value', (snapshot) => {
    const weddingGuests = snapshot.val() || {};
    
    // 只有在工作人員沒有在打字/編輯時，才重新渲染表格，防止跳字
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        renderExcelTable(weddingGuests);
    }
});

// 將 JSON 轉成 Excel 行列
function renderExcelTable(weddingGuests) {
    localGuestsList = [];
    tbody.innerHTML = '';

    // 將原本按「桌號」分類的 JSON 拆開，方便好似 Excel 咁排序同加減
    Object.keys(weddingGuests).forEach(tableNum => {
        const guests = weddingGuests[tableNum] || [];
        guests.forEach(guest => {
            if (guest && guest.name) {
                localGuestsList.push({
                    table: tableNum,
                    name: guest.name,
                    side: guest.side || '男方',
                    group: guest.group || ''
                });
            }
        });
    });

    // 跟桌號 1-14 排序，方便工作人員睇
    localGuestsList.sort((a, b) => parseInt(a.table) - parseInt(b.table));

    if (localGuestsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">目前沒有賓客數據，請點擊「新增賓客一行」</td></tr>`;
        return;
    }

    // 渲染每一行 Excel
    localGuestsList.forEach((guest, index) => {
        createRowDOM(guest, index);
    });
}

// 產生單一行 Excel HTML
function createRowDOM(guest, index) {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition";
    tr.id = `excel-row-${index}`;

    // 桌次下拉選單 (1-14)
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
            <input type="text" value="${guest.group}" oninput="updateLocalData(${index}, 'group', this.value)" class="excel-input w-full p-1.5 bg-transparent border-0" placeholder="例如: LK / 飛機友 / 姑姐...">
        </td>
        <td class="p-1 text-center">
            <button onclick="deleteRow(${index})" class="text-red-500 hover:text-red-700 font-bold text-xs p-1.5 border border-red-200 rounded bg-red-50 hover:bg-red-100 transition">
                🗑️ 刪除
            </button>
        </td>
    `;
    tbody.appendChild(tr);
}

// 當工作人員喺 Excel 打字時，即時紀錄落邊一格
function updateLocalData(index, field, value) {
    if (localGuestsList[index]) {
        localGuestsList[index][field] = value.trim();
    }
}

// 新增一行 Excel
function addNewRow() {
    const newGuest = { table: "1", name: "", side: "男方", group: "現場排座" };
    localGuestsList.push(newGuest);
    const newIndex = localGuestsList.length - 1;
    createRowDOM(newGuest, newIndex);
    
    // 自動 focus 過去等用家可以直接打字
    const row = document.getElementById(`excel-row-${newIndex}`);
    if(row) row.getElementsByTagName('input')[0].focus();
}

// 刪除一行 Excel
function deleteRow(index) {
    if (confirm("確定要刪除這位賓客嗎？(需要點擊儲存才會生效)")) {
        document.getElementById(`excel-row-${index}`).remove();
        localGuestsList[index] = null; // 標記為已刪除
    }
}

// 💾 將 Excel 表格重新封裝成 JSON 結構並推上 Firebase
function saveExcelToFirebase() {
    const finalWeddingGuestsJSON = {};

    // 重新組裝打包
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

    if (confirm("🚨 確定要儲存 Excel 變更並覆蓋 Firebase 嗎？前台所有手機會即時刷新。")) {
        database.ref('wedding_guests').set(finalWeddingGuestsJSON)
            .then(() => {
                alert("✅ 儲存成功！Excel 名單已完美同步。");
            })
            .catch((error) => {
                alert("❌ 儲存失敗: " + error.message);
            });
    }
}
