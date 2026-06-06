// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const tbody = document.getElementById('excel-tbody');
const scrollContainer = document.getElementById('table-scroll-container');
let localGuestsList = []; 

// 🌟 全局維護的分類清單（會隨數據載入、CSV匯入或手動新增自動動態擴充）
let currentCategories = ['LK', '家人', '男方親戚', '女方親戚', '中學同學'];
let activeSelectElement = null; // 紀錄目前係邊一行的下拉選單想新增自訂分類
let sortableInstance = null;    // 儲存 Sortable 實例

// 初始化 SortableJS
sortableInstance = Sortable.create(tbody, {
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
                let savedGroup = (guest.group || '').trim();
                
                // 🌟 自動收集 Firebase 原本存有但不在預設清單入面的自訂分類
                if (savedGroup && !currentCategories.includes(savedGroup)) {
                    currentCategories.push(savedGroup);
                }

                localGuestsList.push({
                    table: parseInt(cleanTable),
                    sort: guest.sort !== undefined ? parseInt(guest.sort) : 10,
                    name: guest.name,
                    side: guest.side || '男方',
                    group: savedGroup
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
    // 🌟 每次刷新 UI 後，檢查需唔需要套用現有的搜尋關鍵字
    filterGuests();
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

    // 🌟 動態生成分類下拉選單的 Option
    let categoryOptions = '';
    currentCategories.forEach(cat => {
        categoryOptions += `<option value="${cat}" ${guest.group === cat ? 'selected' : ''}>${cat}</option>`;
    });

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
            <input type="text" value="${guest.name}" oninput="updateLocalData(${index}, 'name', this.value)" class="excel-input w-full p-1.5 bg-transparent border-0 font-bold text-gray-800 guest-name-input" placeholder="輸入姓名...">
        </td>
        <td class="p-1">
            <select onchange="updateLocalData(${index}, 'side', this.value)" class="w-full p-1.5 bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-green-500 shadow-none">
                <option value="男方" ${guest.side === '男方' ? 'selected' : ''}>男方</option>
                <option value="女方" ${guest.side === '女方' ? 'selected' : ''}>女方</option>
            </select>
        </td>
        <td class="p-1">
            <select onchange="handleCategoryChange(this, ${index})" class="category-select w-full p-1.5 bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-green-500">
                ${categoryOptions}
                <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂...</option>
            </select>
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

function addNewRow() {
    const newGuest = { table: 14, sort: 99, name: "", side: "男方", group: currentCategories[0] || "" }; 
    localGuestsList.push(newGuest);
    
    const newIndex = localGuestsList.length - 1;
    const newRowDOM = createRowDOM(newGuest, newIndex);
    
    recalculateSortNumbersFromDOM();
    newRowDOM.classList.add('new-row-animate');

    setTimeout(() => {
        if(scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
        newRowDOM.querySelector('.guest-name-input').focus();
    }, 50);
}

function deleteRow(index) {
    if (confirm("確定要刪除這位賓客嗎？(需要點擊儲存才會生效)")) {
        localGuestsList[index] = null;
        recalculateSortNumbersFromDOM();
        refreshTableUI();
    }
}

// 🌟 功能 1：本地動態搜尋篩選（姓名、桌次、分類同步搜尋）
function filterGuests() {
    const searchInput = document.getElementById('guest-search-input');
    if (!searchInput) return;

    const keyword = searchInput.value.trim().toLowerCase();
    const rows = tbody.querySelectorAll('tr');

    // 安全防禦：如果正在搜尋，就暫停 Sortable 拖拉功能以免排序混亂；清空搜尋後恢復
    if (sortableInstance) {
        sortableInstance.option("disabled", keyword !== "");
    }

    rows.forEach(row => {
        const oldIndex = row.getAttribute('data-index');
        const guest = localGuestsList[oldIndex];
        if (!guest) return;

        const name = (guest.name || '').toLowerCase();
        const tableNum = String(guest.table);
        const group = (guest.group || '').toLowerCase();

        if (name.includes(keyword) || tableNum.includes(keyword) || group.includes(keyword)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

// 🌟 功能 2：處理下拉選單點擊「+ 新增自訂...」與刪除管理
function handleCategoryChange(selectObj, index) {
    if (selectObj.value === "__NEW__") {
        activeSelectElement = selectObj;
        
        // 1. 動態組裝「現有分類清單」，附帶刪除按鈕
        let listHtml = "";
        currentCategories.forEach(cat => {
            listHtml += `
                <div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200 text-sm">
                    <span class="font-medium text-gray-700">${cat}</span>
                    <button type="button" onclick="deleteCategoryFromPool('${cat}')" class="text-red-500 hover:text-red-700 font-bold text-xs px-1.5 py-0.5 hover:bg-red-50 rounded transition">
                        🗑️ 刪除
                    </button>
                </div>
            `;
        });
        
        // 2. 注入到 HTML 的對話框中（在輸入框上方顯示現有分類）
        const hintSelector = document.getElementById('custom-dialog-overlay').querySelector('p');
        
        // 移除舊的動態管理區（防止重複疊加）
        const oldManager = document.getElementById('category-manager-pool');
        if (oldManager) oldManager.remove();
        
        // 建立新管理區
        const managerDiv = document.createElement('div');
        managerDiv.id = "category-manager-pool";
        managerDiv.className = "space-y-1.5 max-h-32 overflow-y-auto mb-4 border-t border-b border-gray-100 py-2";
        managerDiv.innerHTML = `<p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">現有分類管理 (可在此刪除打錯的字)：</p>` + listHtml;
        
        // 插在提示文字與輸入框中間
        hintSelector.parentNode.insertBefore(managerDiv, document.getElementById('custom-category-input'));

        // 清空輸入框並彈窗
        document.getElementById('custom-category-input').value = "";
        document.getElementById('custom-dialog-overlay').classList.remove('hidden');
        document.getElementById('custom-category-input').focus();
    } else {
        // 正常切換現有選項，即時同步去 local 變數
        updateLocalData(index, 'group', selectObj.value);
    }
}

// 🌟 升級功能：專門用來刪除打錯字的分類
function deleteCategoryFromPool(catToDelete) {
    // 預設的基礎分類不給刪除，防止清空
    const defaultCats = ['LK', '家人', '男方親戚', '女方親戚', '中學同學'];
    if (defaultCats.includes(catToDelete) && !confirm(`⚠️ 「${catToDelete}」是預設分類，確定要強行刪除嗎？`)) {
        return;
    }

    if (confirm(`確定要將「${catToDelete}」從分類選項中完全刪除嗎？\n(原本已選取此分類的賓客會自動退回第一個預設分類)`)) {
        // 1. 從全局陣列中移除
        currentCategories = currentCategories.filter(c => c !== catToDelete);
        
        // 2. 遍歷所有賓客數據，如果有人用緊呢個被刪除嘅分類，幫佢打回原形（轉去第一個分類）
        localGuestsList.forEach(guest => {
            if (guest && guest.group === catToDelete) {
                guest.group = currentCategories[0] || "";
            }
        });
        
        // 3. 即時刷新彈窗內嘅管理列表
        let listHtml = "";
        currentCategories.forEach(cat => {
            listHtml += `
                <div class="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200 text-sm">
                    <span class="font-medium text-gray-700">${cat}</span>
                    <button type="button" onclick="deleteCategoryFromPool('${cat}')" class="text-red-500 hover:text-red-700 font-bold text-xs px-1.5 py-0.5 hover:bg-red-50 rounded transition">
                        🗑️ 刪除
                    </button>
                </div>
            `;
        });
        document.getElementById('category-manager-pool').innerHTML = `<p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">現有分類管理 (可在此刪除打錯的字)：</p>` + listHtml;
        
        // 4. 全局刷新全站所有 Select 下拉選單
        updateAllSelectElements();
    }
}

// 🌟 升級功能：抽離出來的刷新全站 Select 機制
function updateAllSelectElements() {
    document.querySelectorAll('.category-select').forEach((select) => {
        const tr = select.closest('tr');
        if (!tr) return;
        const rowIndex = tr.getAttribute('data-index');
        
        let optionsStr = "";
        currentCategories.forEach(c => {
            optionsStr += `<option value="${c}">${c}</option>`;
        });
        optionsStr += `<option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂...</option>`;
        select.innerHTML = optionsStr;
        
        // 還原該行最新數值
        if (localGuestsList[rowIndex]) {
            select.value = localGuestsList[rowIndex].group || currentCategories[0];
        }
    });
}

// 🌟 升級功能：關閉並確認自訂分類彈窗
function closeCustomCategoryDialog(isConfirm) {
    const overlay = document.getElementById('custom-dialog-overlay');
    overlay.classList.add('hidden');
    
    if (isConfirm && activeSelectElement) {
        const newCat = document.getElementById('custom-category-input').value.trim();
        const tr = activeSelectElement.closest('tr');
        const rowIndex = tr ? tr.getAttribute('data-index') : null;

        if (newCat && !currentCategories.includes(newCat)) {
            currentCategories.push(newCat);
            
            // 刷新全站
            updateAllSelectElements();
            
            // 將當前行直接套用新分類
            if (rowIndex !== null && localGuestsList[rowIndex]) {
                activeSelectElement.value = newCat;
                updateLocalData(rowIndex, 'group', newCat);
            }
        } else if (newCat && currentCategories.includes(newCat)) {
            if (rowIndex !== null && localGuestsList[rowIndex]) {
                activeSelectElement.value = newCat;
                updateLocalData(rowIndex, 'group', newCat);
            }
        } else {
            if (rowIndex !== null && localGuestsList[rowIndex]) {
                activeSelectElement.value = localGuestsList[rowIndex].group || currentCategories[0];
            }
        }
    } else if (activeSelectElement) {
        const tr = activeSelectElement.closest('tr');
        const rowIndex = tr ? tr.getAttribute('data-index') : null;
        if (rowIndex !== null && localGuestsList[rowIndex]) {
            activeSelectElement.value = localGuestsList[rowIndex].group || currentCategories[0];
        }
    }
    activeSelectElement = null;
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

function toggleSettingsModal(show) {
    const sidebar = document.getElementById('settings-sidebar');
    if (sidebar) {
        if (show) sidebar.classList.remove('hidden');
        else sidebar.classList.add('hidden');
    }
}

function exportTableToCSV() {
    if (localGuestsList.length === 0) {
        alert("目前沒有任何數據可以匯出。");
        return;
    }

    let csvContent = "姓名,分類,子分類,桌次,排序\n";

    localGuestsList.forEach(guest => {
        if (guest && guest.name) {
            const name = guest.name.replace(/,/g, ' ');
            const side = guest.side.replace(/,/g, ' ');
            const group = guest.group.replace(/,/g, ' ');
            csvContent += `${name},${side},${group},第${guest.table}桌,${guest.sort}\n`;
        }
    });

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Wedding_Guests_Backup_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toggleSettingsModal(false); 
}

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
            let importedGroup = groupIdx !== -1 ? (row[groupIdx] || "") : "";
            
            // 🌟 如果 CSV 內帶有新的分類，立刻納入下拉選單備用池
            if (importedGroup && !currentCategories.includes(importedGroup)) {
                currentCategories.push(importedGroup);
            }
            
            localGuestsList.push({
                table: parseInt(cleanTable),
                sort: 99, 
                name: row[nameIdx],
                side: sideIdx !== -1 ? (row[sideIdx] || "男方") : "男方",
                group: importedGroup
            });
        }

        sortLocalList();
        refreshTableUI();
        recalculateSortNumbersFromDOM();

        alert(`📂 成功從 CSV 載入 ${localGuestsList.length} 位賓客！確認無誤後請點擊「儲存變更」。`);
    };
    reader.readAsText(file, 'UTF-8');
}

// ----------------------------------------------------
// 📌 後台：iPhone Safari 完美安全鎖死雙指縮放與 Double-tap 放大
// ----------------------------------------------------
(function() {
    let adminLastTouchEnd = 0;

    document.addEventListener('touchstart', function (event) {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchmove', function (event) {
        if (event.scale !== undefined && event.scale !== 1) {
            event.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('gesturestart', function (event) {
        event.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - adminLastTouchEnd <= 300) {
            event.preventDefault();
        }
        adminLastTouchEnd = now;
    }, false);
})();

// 🔒 阻擋右鍵選單
document.addEventListener('contextmenu', event => event.preventDefault());

// 🔒 阻擋常用開發者工具快捷鍵 (F12, Ctrl+Shift+I, Ctrl+Shift+C, Ctrl+U 睇 Source)
document.addEventListener('keydown', event => {
    if (
        event.key === 'F12' ||
        (event.ctrlKey && event.shiftKey && (event.key === 'I' || event.key === 'C' || event.key === 'J')) ||
        (event.ctrlKey && event.key === 'u')
    ) {
        event.preventDefault();
    }
});
