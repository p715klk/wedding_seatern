// ==========================================
// 📌 5. 核心修正 1：手動拉伸調整 Column 寬度邏輯
// ==========================================
function initResizableColumns() {
    const ths = document.querySelectorAll('#excel-thead-tr th');
    ths.forEach(th => {
        if (th.querySelector('.resizer')) return; // 防止重複附加

        const resizer = document.createElement('div');
        resizer.className = 'resizer';
        th.style.position = 'relative';
        th.appendChild(resizer);

        let startX, startWidth;

        resizer.addEventListener('mousedown', function (e) {
            e.preventDefault();
            startX = e.pageX;
            startWidth = th.offsetWidth;
            resizer.classList.add('resizing');
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        });

        function drag(e) {
            const width = startWidth + (e.pageX - startX);
            if (width > 50) { 
                th.style.width = width + 'px';
            }
        }

        function stopDrag() {
            resizer.classList.remove('resizing');
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
        }
    });
}

// 📌 動態建立表頭
function renderThead() {
    const theadTr = document.getElementById('excel-thead-tr');
    if (!theadTr) return;

    let html = `
        <th class="py-2.5 px-3 text-center text-[11px] font-bold text-gray-500 border-b border-gray-200" style="width: 50px;">排序</th>
        <th class="py-2.5 px-3 text-center text-[11px] font-bold text-gray-500 border-b border-gray-200" style="width: 50px;">拖拉</th>
        <th class="py-2.5 px-3 text-xs font-bold text-gray-600 border-b border-gray-200" style="width: 160px;">桌次座位</th>
        <th class="py-2.5 px-3 text-xs font-bold text-gray-600 border-b border-gray-200" style="width: 150px;">賓客姓名</th>
        <th class="py-2.5 px-3 text-xs font-bold text-gray-600 border-b border-gray-200" style="width: 100px;">來源分類</th>
    `;

    labelColumnsNames.forEach(name => {
        html += `<th class="py-2.5 px-3 text-xs font-bold text-red-700 bg-red-50/40 border-b border-gray-200" style="width: 160px;">${name}</th>`;
    });

    html += `<th class="py-2.5 px-3 text-center text-xs font-bold text-gray-600 border-b border-gray-200" style="width: 100px;">分配桌次</th>`;
    html += `<th class="py-2.5 px-3 text-center text-xs font-bold text-gray-600 border-b border-gray-200" style="width: 80px;">操作</th>`;
    
    theadTr.innerHTML = html;
    initResizableColumns(); // 綁定拉伸事件
}

// 橫向擴充全新標籤分類欄
function addNewCustomLabelColumn() {
    const colNum = labelColumnsKeys.length + 1;
    const newKey = `label_${Date.now()}`;
    const newName = `標籤 ${colNum}`;

    labelColumnsKeys.push(newKey);
    labelColumnsNames.push(newName);
    categoriesByColumn[newKey] = ['未分類', '朋友', '同事', '重要長輩'];

    renderThead();
    
    const rows = tbody.querySelectorAll('tr');
    let currentDOMList = [];
    rows.forEach(row => {
        const nameInput = row.querySelector('.row-name-input');
        if (!nameInput) return;
        
        let guest = {
            name: nameInput.value.trim(),
            side: row.querySelector('.row-side-select').value,
            table: row.querySelector('.row-table-input').value.trim(),
            sort: row.querySelector('.row-seat-num') ? row.querySelector('.row-seat-num').innerText : '99'
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
// 📌 6. 表格數據渲染 (純文字來源、聯動輸入框)
// ==========================================
function renderDOMRows() {
    tbody.innerHTML = '';
    
    if (localGuestsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${6 + labelColumnsKeys.length}" class="text-center py-8 text-gray-400 font-bold">🎉 目前沒有賓客，請點右上角「新增賓客」。</td></tr>`;
        return;
    }

    localGuestsList.forEach((guest, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition bg-white";
        
        const sideSelectHTML = `
            <select class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white row-side-select">
                <option value="男方" ${guest.side === '男方' ? 'selected' : ''}>男方</option>
                <option value="女方" ${guest.side === '女方' ? 'selected' : ''}>女方</option>
            </select>
        `;

        const tableInputHTML = `
            <input type="number" min="1" max="99" placeholder="未安排" value="${guest.table || ''}" 
                   oninput="recalculateSortNumbersFromDOM()" 
                   class="w-full border border-gray-200 rounded p-1 text-xs font-mono font-bold text-center bg-transparent focus:bg-white row-table-input">
        `;

        let labelsTdHTML = '';
        labelColumnsKeys.forEach(key => {
            const currentVal = guest[key] || '未分類';
            const optionsArr = categoriesByColumn[key] || ['未分類'];
            if (!optionsArr.includes(currentVal)) optionsArr.push(currentVal);

            let optsHTML = optionsArr.map(cat => `<option value="${cat}" ${currentVal === cat ? 'selected' : ''}>${cat}</option>`).join('');
            labelsTdHTML += `
                <td class="py-2 px-3">
                    <select onchange="handleGroupChange(this, '${key}')" class="w-full border border-red-200 bg-red-50/20 rounded p-1 text-xs font-bold focus:bg-white row-label-select-${key}">
                        ${optsHTML}
                        <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂選項...</option>
                    </select>
                </td>
            `;
        });

        tr.innerHTML = `
            <td class="py-2 px-3 text-center font-mono text-gray-400 font-bold row-sort-num">${index + 1}</td>
            <td class="py-2 px-3 text-center drag-handle text-gray-400 text-base select-none cursor-row-resize">☰</td>
            <td class="py-2 px-3 text-left font-mono font-bold text-gray-600 text-xs row-seat-txt-cell">第 <span class="row-table-display-num">${guest.table || '-'}</span> 桌 - 第 <span class="row-seat-num">${guest.table ? guest.sort : '-'}</span> 位</td>
            <td class="py-2 px-3">
                <input type="text" value="${guest.name}" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white row-name-input">
            </td>
            <td class="py-2 px-3">${sideSelectHTML}</td>
            ${labelsTdHTML}
            <td class="py-2 px-3">${tableInputHTML}</td>
            <td class="py-2 px-3 text-center">
                <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold text-xs p-1 transition">❌ 刪除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function addNewGuestRow() {
    if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';

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
            <td class="py-2 px-3">
                <select onchange="handleGroupChange(this, '${key}')" class="w-full border border-red-200 bg-red-50/20 rounded p-1 text-xs font-bold focus:bg-white row-label-select-${key}">
                    ${optsHTML}
                    <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂選項...</option>
                </select>
            </td>
        `;
    });

    const nextIndex = tbody.children.length + 1;

    tr.innerHTML = `
        <td class="py-2 px-3 text-center font-mono text-gray-400 font-bold row-sort-num">${nextIndex}</td>
        <td class="py-2 px-3 text-center drag-handle text-gray-400 text-base select-none cursor-row-resize">☰</td>
        <td class="py-2 px-3 text-left font-mono font-bold text-gray-600 text-xs row-seat-txt-cell">未安排</td>
        <td class="py-2 px-3">
            <input type="text" value="" placeholder="請輸入姓名" class="w-full border border-gray-200 rounded p-1 text-xs font-bold bg-transparent focus:bg-white row-name-input">
        </td>
        <td class="py-2 px-3">${sideSelectHTML}</td>
        ${labelsTdHTML}
        <td class="py-2 px-3">${tableInputHTML}</td>
        <td class="py-2 px-3 text-center">
            <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold text-xs p-1 transition">❌ 刪除</button>
        </td>
    `;

    tbody.appendChild(tr);
    scrollContainer.scrollTop = scrollContainer.scrollHeight; 
}

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
            const allSelects = tbody.querySelectorAll(`.row-label-select-${activeColumnKey}`);
            allSelects.forEach(sel => {
                const savedVal = sel.value;
                let optsHTML = categoriesByColumn[activeColumnKey].map(cat => `<option value="${cat}" ${savedVal === cat ? 'selected' : ''}>${cat}</option>`).join('');
                sel.innerHTML = `${optsHTML}<option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂選項...</option>`;
            });
            activeSelectElement.value = newCat;
        }
    }
    activeSelectElement = null;
    activeColumnKey = null;
}

function deleteRowAction(btn) {
    btn.closest('tr').remove();
    recalculateSortNumbersFromDOM();
}

// 📌 桌次與內部座位號連動重算
function recalculateSortNumbersFromDOM() {
    const rows = tbody.querySelectorAll('tr');
    let tableCounters = {}; 

    rows.forEach((row, idx) => {
        const numEl = row.querySelector('.row-sort-num');
        if (numEl) numEl.innerText = idx + 1;

        const tableInput = row.querySelector('.row-table-input');
        const txtCell = row.querySelector('.row-seat-txt-cell');
        
        if (tableInput) {
            const tVal = tableInput.value.trim();
            if (tVal === "" || isNaN(tVal)) {
                if (txtCell) txtCell.innerHTML = "未安排";
            } else {
                const tableNum = parseInt(tVal);
                if (!tableCounters[tableNum]) tableCounters[tableNum] = 0;
                tableCounters[tableNum]++;
                
                if (txtCell) {
                    txtCell.innerHTML = `第 <span class="row-table-display-num">${tableNum}</span> 桌 - 第 <span class="row-seat-num">${tableCounters[tableNum]}</span> 位`;
                }
            }
        }
    });
}

// Lifecycle 生命週期就緒
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