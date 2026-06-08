// ==========================================
// 📌 5. DOM 表格渲染與互動處理
// ==========================================
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
        
        // 📥 修正 2：男女方拔除 ICON，只留純文字
        const sideSelectHTML = `
            <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none">
                <option value="男方" ${guest.side === '男方' ? 'selected' : ''}>男方</option>
                <option value="女方" ${guest.side === '女方' ? 'selected' : ''}>女方</option>
            </select>
        `;

        let groupOptions = currentCategories.map(cat => `<option value="${cat}" ${guest.group === cat ? 'selected' : ''}>${cat}</option>`).join('');
        
        // 📥 修正 3：Dropdown 保留「+ 新增自訂分類...」功能，隨時可以加新標籤
        const groupSelectHTML = `
            <select onchange="handleGroupChange(this)" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none">
                ${groupOptions}
                <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂分類...</option>
            </select>
        `;

        const tableInputHTML = `
            <input type="number" min="1" max="99" placeholder="未安排" value="${guest.table || ''}" 
                   oninput="recalculateSortNumbersFromDOM()" 
                   class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center bg-transparent focus:bg-white row-table-input">
        `;

        // Column 順序：拖拉 -> 排序 -> 分配桌次 -> 桌次座位 -> 賓客姓名 -> 來源分類 -> 標籤 -> 操作
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

function addNewGuestRow() {
    if (tbody.querySelector('td[colspan="8"]')) {
        tbody.innerHTML = '';
    }

    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition bg-white";

    // 📥 修正 2：手動新增列同樣移除男女方 ICON
    const sideSelectHTML = `
        <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white">
            <option value="男方" selected>男方</option>
            <option value="女方">女方</option>
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
               oninput="recalculateSortNumbersFromDOM()" 
               class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center bg-transparent focus:bg-white row-table-input">
    `;

    const nextIndex = tbody.children.length + 1;

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

// 自訂群組彈窗控制
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

// 📥 修正 1：加強重新計算邏輯，當你拖放完或者改桌號，會自動根據 DOM 由上而下順序，精準計算出每個人喺各別桌子嘅「桌次座位」第幾個！
function recalculateSortNumbersFromDOM() {
    const rows = tbody.querySelectorAll('tr');
    let tableCounters = {}; // 用嚟記住每張桌子目前數到第幾個位

    rows.forEach((row, idx) => {
        // 更新左邊嘅總「排序」
        const numEl = row.querySelector('.row-sort-num');
        if (numEl) numEl.innerText = idx + 1;

        // 重新動態掃描「分配桌次」與計算「桌次座位」
        const tableInput = row.querySelector('.row-table-input');
        const seatEl = row.querySelector('.row-seat-num');
        
        if (tableInput && seatEl) {
            const tVal = tableInput.value.trim();
            if (tVal === "" || isNaN(tVal)) {
                seatEl.innerText = '-';
            } else {
                const tableNum = parseInt(tVal);
                if (!tableCounters[tableNum]) {
                    tableCounters[tableNum] = 0;
                }
                tableCounters[tableNum]++; // 每見到同桌多一個人，座位號就 +1
                seatEl.innerText = tableCounters[tableNum];
            }
        }
    });
}

// ==========================================
// 📌 6. 頁面就緒生命週期初始化
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    tbody = document.getElementById('excel-tbody');
    scrollContainer = document.getElementById('table-scroll-container');

    // 正確綁定 SortableJS 到 tbody
    if (typeof Sortable !== 'undefined' && tbody) {
        sortableInstance = Sortable.create(tbody, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function () {
                recalculateSortNumbersFromDOM(); // 拖拉完成放手，即時觸發重算
            }
        });
    }

    // 啟動數據讀取
    loadFirebaseData();
});

// 📱 手機多指防錯位安全鎖
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