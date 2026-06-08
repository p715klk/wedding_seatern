// ==========================================
// 📌 5. 動態生成表頭 (適應動態增加的多重標籤欄)
// ==========================================
function renderThead() {
    const theadTr = document.getElementById('excel-thead-tr');
    if (!theadTr) return;

    let html = `
        <th class="py-2.5 px-3 text-center text-xs font-bold text-gray-600 w-12">拖拉</th>
        <th class="py-2.5 px-3 text-center text-xs font-bold text-gray-600 w-12">排序</th>
        <th class="py-2.5 px-3 text-center text-xs font-bold text-gray-600 w-24">分配桌次</th>
        <th class="py-2.5 px-3 text-center text-xs font-bold text-gray-600 w-24">桌次座位</th>
        <th class="py-2.5 px-3 text-xs font-bold text-gray-600 w-44">賓客姓名</th>
        <th class="py-2.5 px-3 text-xs font-bold text-gray-600 w-28">來源分類</th>
    `;

    // 橫向動態增添自訂標籤 Th 數量
    labelColumnsNames.forEach(name => {
        html += `<th class="py-2.5 px-3 text-xs font-bold text-red-700 w-40 bg-red-50/50">${name}</th>`;
    });

    html += `<th class="py-2.5 px-3 text-center text-xs font-bold text-gray-600 w-20">操作</th>`;
    theadTr.innerHTML = html;
}

// 橫向隨意擴充多一個全新的「標籤分類欄」
function addNewCustomLabelColumn() {
    const colNum = labelColumnsKeys.length + 1;
    const newKey = `label_${Date.now()}`; // 產生不重複欄位代號
    const newName = `標籤 ${colNum}`;

    labelColumnsKeys.push(newKey);
    labelColumnsNames.push(newName);
    categoriesByColumn[newKey] = ['未分類', '朋友', '同事', '重要長輩']; // 預設新欄位初始選項

    // 即時重新刷表頭及當前視圖，實現橫向加分類
    renderThead();
    
    // 從現有 DOM 提取數據重新生成，防止未儲存資料被沖走
    const rows = tbody.querySelectorAll('tr');
    let currentDOMList = [];
    rows.forEach(row => {
        const nameInput = row.querySelector('.row-name-input');
        if (!nameInput) return;
        
        let guest = {
            name: nameInput.value.trim(),
            side: row.querySelector('.row-side-select').value,
            table: row.querySelector('.row-table-input').value.trim(),
            sort: row.querySelector('.row-seat-num').innerText
        };
        labelColumnsKeys.forEach(k => {
            const sel = row.querySelector(`.row-label-select-${k}`);
            guest[k] = sel ? sel.value : '未分類';
        });
        currentDOMList.push(guest);
    });

    localGuestsList = currentDOMList;
    renderDOMRows();
}

// ==========================================
// 📌 6. DOM 表格渲染與互動處理 (多標籤自適應版)
// ==========================================
function renderDOMRows() {
    tbody.innerHTML = '';
    
    localGuestsList.forEach((guest, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition bg-white";
        
        // 純文字男女方 (無 ICON)
        const sideSelectHTML = `
            <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none row-side-select">
                <option value="男方" ${guest.side === '男方' ? 'selected' : ''}>男方</option>
                <option value="女方" ${guest.side === '女方' ? 'selected' : ''}>女方</option>
            </select>
        `;

        const tableInputHTML = `
            <input type="number" min="1" max="99" placeholder="未安排" value="${guest.table || ''}" 
                   oninput="recalculateSortNumbersFromDOM()" 
                   class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center bg-transparent focus:bg-white row-table-input">
        `;

        // 核心：根據目前開咗幾多個標籤欄位，橫向生成對應數量嘅 <td> 選單
        let labelsTdHTML = '';
        labelColumnsKeys.forEach(key => {
            const currentVal = guest[key] || '未分類';
            const optionsArr = categoriesByColumn[key] || ['未分類'];
            
            if (!optionsArr.includes(currentVal)) {
                optionsArr.push(currentVal);
            }

            let optsHTML = optionsArr.map(cat => `<option value="${cat}" ${currentVal === cat ? 'selected' : ''}>${cat}</option>`).join('');
            
            labelsTdHTML += `
                <td class="py-2 px-3 w-44">
                    <select onchange="handleGroupChange(this, '${key}')" class="w-full border border-red-200 bg-red-50/20 rounded p-1 text-xs font-bold focus:bg-white focus:ring-1 focus:ring-red-500 focus:outline-none row-label-select-${key}">
                        ${optsHTML}
                        <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂選項...</option>
                    </select>
                </td>
            `;
        });

        tr.innerHTML = `
            <td class="py-2 px-3 text-center drag-handle text-gray-400 text-base select-none w-12 cursor-row-resize">☰</td>
            <td class="py-2 px-3 text-center font-mono text-gray-400 font-bold row-sort-num w-12">${index + 1}</td>
            <td class="py-2 px-3 w-24">${tableInputHTML}</td>
            <td class="py-2 px-3 text-center font-mono font-bold text-gray-500 text-xs row-seat-num w-24">${(guest.table && guest.sort !== '99') ? guest.sort : '-'}</td>
            <td class="py-2 px-3 w-44">
                <input type="text" value="${guest.name}" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white row-name-input">
            </td>
            <td class="py-2 px-3 w-28">${sideSelectHTML}</td>
            ${labelsTdHTML}
            <td class="py-2 px-3 text-center w-20">
                <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold text-xs p-1 transition">❌ 刪除</button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function addNewGuestRow() {
    if (tbody.querySelector('td[colspan]')) {
        tbody.innerHTML = '';
    }

    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition bg-white";

    const sideSelectHTML = `
        <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white row-side-select">
            <option value="男方" selected>男方</option>
            <option value="女方">女方</option>
        </select>
    `;

    const tableInputHTML = `
        <input type="number" min="1" max="99" placeholder="未安排" value="" 
               oninput="recalculateSortNumbersFromDOM()" 
               class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center bg-transparent focus:bg-white row-table-input">
    `;

    let labelsTdHTML = '';
    labelColumnsKeys.forEach(key => {
        const optionsArr = categoriesByColumn[key] || ['未分類'];
        let optsHTML = optionsArr.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        
        labelsTdHTML += `
            <td class="py-2 px-3 w-44">
                <select onchange="handleGroupChange(this, '${key}')" class="w-full border border-red-200 bg-red-50/20 rounded p-1 text-xs font-bold focus:bg-white row-label-select-${key}">
                    ${optsHTML}
                    <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂選項...</option>
                </select>
            </td>
        `;
    });

    const nextIndex = tbody.children.length + 1;

    tr.innerHTML = `
        <td class="py-2 px-3 text-center drag-handle text-gray-400 text-base select-none w-12 cursor-row-resize">☰</td>
        <td class="py-2 px-3 text-center font-mono text-gray-400 font-bold row-sort-num w-12">${nextIndex}</td>
        <td class="py-2 px-3 w-24">${tableInputHTML}</td>
        <td class="py-2 px-3 text-center font-mono font-bold text-gray-500 text-xs row-seat-num w-24">-</td>
        <td class="py-2 px-3 w-44">
            <input type="text" value="" placeholder="請輸入姓名" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white row-name-input">
        </td>
        <td class="py-2 px-3 w-28">${sideSelectHTML}</td>
        ${labelsTdHTML}
        <td class="py-2 px-3 text-center w-20">
            <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold text-xs p-1 transition">❌ 刪除</button>
        </td>
    `;

    tbody.appendChild(tr);
    scrollContainer.scrollTop = scrollContainer.scrollHeight; 
}

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

// 處理個別分類標籤新增選項
function handleGroupChange(selectEl, columnKey) {
    if (selectEl.value === '__NEW__') {
        activeSelectElement = selectEl;
        activeColumnKey = columnKey;
        document.getElementById('custom-category-input').value = '';
        document.getElementById('custom-dialog-overlay').classList.remove('hidden');
        selectEl.value = categoriesByColumn[columnKey][0] || '未分類'; 
    }
}

function closeCustomCategoryDialog(isConfirm) {
    const overlay = document.getElementById('custom-dialog-overlay');
    const inputEl = document.getElementById('custom-category-input');
    overlay.classList.add('hidden');

    if (isConfirm && activeSelectElement && activeColumnKey) {
        const newCat = inputEl.value.trim();
        if (newCat && !categoriesByColumn[activeColumnKey].includes(newCat)) {
            categoriesByColumn[activeColumnKey].push(newCat);
            
            // 刷新該特定動態標籤列嘅所有選單
            const allSelects = tbody.querySelectorAll(`.row-label-select-${activeColumnKey}`);
            allSelects.forEach(sel => {
                const savedVal = sel.value;
                let optsHTML = categoriesByColumn[activeColumnKey].map(cat => `<option value="${cat}" ${savedVal === cat ? 'selected' : ''}>${cat}</option>`).join('');
                sel.innerHTML = `
                    ${optsHTML}
                    <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂選項...</option>
                `;
            });
            activeSelectElement.value = newCat;
        }
    }
    activeSelectElement = null;
    activeColumnKey = null;
}

function deleteRowAction(btn) {
    const row = btn.closest('tr');
    row.remove();
    recalculateSortNumbersFromDOM();
}

function recalculateSortNumbersFromDOM() {
    const rows = tbody.querySelectorAll('tr');
    let tableCounters = {}; 

    rows.forEach((row, idx) => {
        const numEl = row.querySelector('.row-sort-num');
        if (numEl) numEl.innerText = idx + 1;

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
                tableCounters[tableNum]++;
                seatEl.innerText = tableCounters[tableNum];
            }
        }
    });
}

// ==========================================
// 📌 7. 頁面就緒生命週期初始化
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    tbody = document.getElementById('excel-tbody');
    scrollContainer = document.getElementById('table-scroll-container');

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

    loadFirebaseData();
});

// 📱 手機防縮放
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