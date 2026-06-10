// ==========================================
// 📌 依文字長度估算欄寬
// ==========================================
function colWidthByText(text, { min = 40, max = 280, pad = 24, charW = 13 } = {}) {
    const len = [...String(text)].length;
    return Math.min(max, Math.max(min, len * charW + pad));
}

function getLabelColumnWidth(colKey, colName) {
    const options = categoriesByColumn[colKey] || [];
    const longest = options.reduce((a, b) => (a.length >= b.length ? a : b), colName);
    let sample = longest;
    if (localGuestsList.length) {
        const widestGuest = localGuestsList.reduce((a, g) => {
            const txt = normalizeTags(g[colKey]).join(' ');
            return txt.length > a.length ? txt : a;
        }, '');
        if (widestGuest.length > sample.length) sample = widestGuest;
    }
    return colWidthByText(sample, { min: colWidthByText(colName, { min: 160, max: 220 }), max: 300 });
}

function readTagsFromRow(row, columnKey) {
    const container = row.querySelector(`.row-multi-tags[data-column-key="${columnKey}"]`);
    if (!container) return [];
    return [...container.querySelectorAll('.tag-chip')].map(chip => chip.dataset.tag);
}

function buildTagChipHTML(tag, columnKey) {
    const safe = tag.replace(/"/g, '&quot;');
    return `<span class="tag-chip inline-flex items-center gap-0.5 bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-bold" data-tag="${safe}">${tag}<button type="button" onclick="removeTagFromRow(this,'${columnKey}')" class="text-red-500 hover:text-red-700 font-black leading-none">×</button></span>`;
}

function buildTagAddSelectHTML(columnKey, selectedTags) {
    const optionsArr = categoriesByColumn[columnKey] || ['未分類'];
    const available = optionsArr.filter(cat => !selectedTags.includes(cat));
    let optsHTML = `<option value="">＋</option>`;
    optsHTML += available.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    optsHTML += `<option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂...</option>`;
    return `<select onchange="handleTagAdd(this, '${columnKey}')" class="row-tag-add-select row-tag-add-select-${columnKey} border border-red-200 bg-red-50/20 rounded px-1 py-0.5 font-bold focus:bg-white shrink-0">${optsHTML}</select>`;
}

function buildNumberSpinInputHTML({ value = '', min = 1, max = 99, inputClass, oninput = '' }) {
    const valAttr = value !== '' && value != null ? `value="${value}"` : '';
    const oninputAttr = oninput ? ` oninput="${oninput}"` : '';
    const wrapClass = inputClass.replace('-input', '-wrap');
    const spinClass = inputClass.replace('-input', '-spin');
    return `
        <div class="${wrapClass}">
            <input type="number" min="${min}" max="${max}" placeholder="—" ${valAttr}${oninputAttr}
                   class="${inputClass} font-mono font-bold bg-transparent focus:outline-none">
            <div class="${spinClass}-btns">
                <button type="button" tabindex="-1" onclick="stepNumberSpinInput(this, 1)" class="${spinClass}-up" aria-label="增加">▲</button>
                <button type="button" tabindex="-1" onclick="stepNumberSpinInput(this, -1)" class="${spinClass}-down" aria-label="減少">▼</button>
            </div>
        </div>
    `;
}

function buildTableInputHTML(value = '') {
    return buildNumberSpinInputHTML({
        value,
        min: 1,
        max: 99,
        inputClass: 'row-table-input',
        oninput: 'syncSeatCellForRow(this.closest(\'tr\'))'
    });
}

function buildSeatInputHTML(value = '', tableNum = null) {
    const maxSeats = tableNum != null ? getMaxSeatsForTable(tableNum) : ABSOLUTE_MAX_SEATS_PER_TABLE;
    return buildNumberSpinInputHTML({
        value,
        min: 1,
        max: maxSeats,
        inputClass: 'row-seat-input'
    });
}

function buildSeatCellContent(tableNum, seatValue = '') {
    const seatInputHTML = buildSeatInputHTML(seatValue, tableNum);
    return `<span class="row-seat-label inline-flex items-center gap-0.5 font-mono font-bold text-gray-600 flex-wrap justify-center">第 <span class="row-table-display-num">${tableNum}</span> 桌 - 第 ${seatInputHTML} 位</span>`;
}

function stepNumberSpinInput(btn, delta) {
    const wrap = btn.closest('.row-table-wrap, .row-seat-wrap');
    const input = wrap?.querySelector('.row-table-input, .row-seat-input');
    if (!input) return;
    const max = parseInt(input.max, 10) || 99;
    const min = parseInt(input.min, 10) || 1;
    let v = parseInt(input.value, 10);
    if (isNaN(v)) {
        if (delta > 0) v = min;
        else return;
    } else {
        v = Math.min(max, Math.max(min, v + delta));
    }
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function stepTableInput(btn, delta) {
    stepNumberSpinInput(btn, delta);
}

function buildMultiTagCellHTML(columnKey, tags) {
    const chips = tags.map(t => buildTagChipHTML(t, columnKey)).join('');
    return `
        <td class="py-2 px-2 align-middle">
            <div class="row-multi-tags flex flex-wrap items-center gap-1" data-column-key="${columnKey}">
                ${chips}
                ${buildTagAddSelectHTML(columnKey, tags)}
            </div>
        </td>
    `;
}

function insertTagChipBeforeSelect(row, columnKey, tag) {
    const select = row.querySelector(`.row-tag-add-select-${columnKey}`);
    if (!select) return;
    const current = readTagsFromRow(row, columnKey);
    if (!current.includes(tag)) {
        select.insertAdjacentHTML('beforebegin', buildTagChipHTML(tag, columnKey));
    }
}

function refreshTagAddSelect(row, columnKey) {
    const select = row.querySelector(`.row-tag-add-select-${columnKey}`);
    if (!select) return;
    const selected = readTagsFromRow(row, columnKey);
    select.outerHTML = buildTagAddSelectHTML(columnKey, selected);
}

function refreshAllTagAddSelects(columnKey) {
    tbody.querySelectorAll('tr').forEach(row => {
        if (row.querySelector('.row-name-input')) refreshTagAddSelect(row, columnKey);
    });
}

function handleTagAdd(selectEl, columnKey) {
    const val = selectEl.value;
    if (!val) return;
    if (val === '__NEW__') {
        activeSelectElement = selectEl;
        activeColumnKey = columnKey;
        document.getElementById('custom-category-input').value = '';
        document.getElementById('custom-dialog-overlay').classList.remove('hidden');
        selectEl.value = '';
        return;
    }
    const row = selectEl.closest('tr');
    insertTagChipBeforeSelect(row, columnKey, val);
    refreshTagAddSelect(row, columnKey);
}

function removeTagFromRow(btn, columnKey) {
    const row = btn.closest('tr');
    btn.closest('.tag-chip').remove();
    refreshTagAddSelect(row, columnKey);
}

function collectGuestFromRow(row) {
    const nameInput = row.querySelector('.row-name-input');
    if (!nameInput) return null;
    let guest = {
        name: nameInput.value.trim(),
        side: row.querySelector('.row-side-select').value,
        table: row.querySelector('.row-table-input').value.trim(),
        sort: (() => {
            const seatInput = row.querySelector('.row-seat-input');
            if (seatInput && seatInput.value.trim() !== '') return seatInput.value.trim();
            return '99';
        })(),
        group: readTagsFromRow(row, PRIMARY_TAG_KEY)
    };
    return guest.name ? guest : null;
}

// ==========================================
// 📌 手動拉伸調整 Column 寬度邏輯
// ==========================================
function initResizableColumns() {
    const ths = document.querySelectorAll('#excel-thead-tr th');
    ths.forEach(th => {
        if (th.querySelector('.col-resizer')) return;

        const resizer = document.createElement('div');
        resizer.className = 'col-resizer';
        resizer.title = '拖拉調整欄寬';
        resizer.setAttribute('aria-label', '拖拉調整欄寬');
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
            const minW = parseInt(th.dataset.minWidth, 10) || 32;
            if (width >= minW) { 
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

function thCell(label, width, { className = 'text-sm font-bold text-gray-600', align = 'center' } = {}) {
    const minW = Math.max(32, width - 8);
    return `<th class="py-2 px-2 text-${align} ${className} border-b border-gray-200" style="width:${width}px" data-min-width="${minW}">${label}</th>`;
}

// 📌 動態建立表頭（順序：排序 → 拖拉 → 分配桌次 → 桌次座位 → 姓名 → 來源 → 標籤 → 操作）
function renderThead() {
    const theadTr = document.getElementById('excel-thead-tr');
    if (!theadTr) return;

    let html = '';
    html += thCell('順序', colWidthByText('99', { min: 24, max: 28, pad: 14, charW: 10 }), { className: 'text-sm font-bold text-gray-500' });
    html += thCell('拖動', colWidthByText('☰', { min: 24, max: 28, pad: 14, charW: 10 }), { className: 'text-sm font-bold text-gray-500' });
    html += thCell('桌號', colWidthByText('分配桌次', { min: 40, max: 50 }));
    html += thCell('桌次座位', colWidthByText('第 99 桌 - 第 99 位', { min: 88, max: 100 }), { align: 'center' });
    html += thCell('賓客姓名', colWidthByText('賓客姓名', { min: 128, max: 150 }), { align: 'left' });
    html += thCell('來源', colWidthByText('女方', { min: 50, max: 56, pad: 30 }));

    labelColumnsKeys.forEach((key, i) => {
        const name = labelColumnsNames[i];
        const w = getLabelColumnWidth(key, name);
        html += `<th class="py-2 px-2 text-left text-sm font-bold text-red-700 bg-red-50/40 border-b border-gray-200" style="width:${w}px" data-min-width="${Math.max(64, w - 12)}">${name}</th>`;
    });

    html += thCell('操作', colWidthByText('❌ 刪除', { min: 56, max: 64 }));
    
    theadTr.innerHTML = html;
    initResizableColumns(); 
}

// 表格數據列渲染
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
            <select class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-side-select">
                <option value="男方" ${guest.side === '男方' ? 'selected' : ''}>男方</option>
                <option value="女方" ${guest.side === '女方' ? 'selected' : ''}>女方</option>
            </select>
        `;

        const tableInputHTML = buildTableInputHTML(guest.table || '');

        const tags = normalizeTags(guest[PRIMARY_TAG_KEY]);
        tags.forEach(t => {
            const pool = categoriesByColumn[PRIMARY_TAG_KEY] || [];
            if (!pool.includes(t)) pool.push(t);
        });
        const labelsTdHTML = buildMultiTagCellHTML(PRIMARY_TAG_KEY, tags);
        const seatCellHTML = guest.table
            ? buildSeatCellContent(guest.table, guest.sort || 1)
            : '<span class="text-gray-400">未安排</span>';

        tr.innerHTML = `
            <td class="py-2 px-1 text-center font-mono text-gray-400 font-bold row-sort-num row-sort-cell">${index + 1}</td>
            <td class="py-2 px-1 text-center drag-handle text-gray-400 text-base select-none cursor-row-resize row-drag-cell">☰</td>
            <td class="py-2 px-1 row-table-cell">${tableInputHTML}</td>
            <td class="py-2 px-2 text-center row-seat-txt-cell">${seatCellHTML}</td>
            <td class="py-2 px-2">
                <input type="text" value="${guest.name}" class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-name-input">
            </td>
            <td class="py-2 px-1 row-side-cell">${sideSelectHTML}</td>
            ${labelsTdHTML}
            <td class="py-2 px-2 text-center">
                <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold p-1 transition">❌ 刪除</button>
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
        <select class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-side-select">
            <option value="男方" selected>男方</option>
            <option value="女方">女方</option>
        </select>
    `;

    const tableInputHTML = buildTableInputHTML();

    const labelsTdHTML = buildMultiTagCellHTML(PRIMARY_TAG_KEY, []);

    const nextIndex = tbody.children.length + 1;

    tr.innerHTML = `
        <td class="py-2 px-1 text-center font-mono text-gray-400 font-bold row-sort-num row-sort-cell">${nextIndex}</td>
        <td class="py-2 px-1 text-center drag-handle text-gray-400 text-base select-none cursor-row-resize row-drag-cell">☰</td>
        <td class="py-2 px-1 row-table-cell">${tableInputHTML}</td>
        <td class="py-2 px-2 text-center row-seat-txt-cell"><span class="text-gray-400">未安排</span></td>
        <td class="py-2 px-2">
            <input type="text" value="" placeholder="請輸入姓名" class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-name-input">
        </td>
        <td class="py-2 px-1 row-side-cell">${sideSelectHTML}</td>
        ${labelsTdHTML}
        <td class="py-2 px-2 text-center">
            <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold p-1 transition">❌ 刪除</button>
        </td>
    `;

    tbody.appendChild(tr);
    scrollContainer.scrollTop = scrollContainer.scrollHeight; 
}

function closeCustomCategoryDialog(isConfirm) {
    const overlay = document.getElementById('custom-dialog-overlay');
    const inputEl = document.getElementById('custom-category-input');
    overlay.classList.add('hidden');

    if (isConfirm && activeSelectElement && activeColumnKey) {
        const newCat = inputEl.value.trim();
        if (newCat && !categoriesByColumn[activeColumnKey].includes(newCat)) {
            categoriesByColumn[activeColumnKey].push(newCat);
            refreshAllTagAddSelects(activeColumnKey);
            const row = activeSelectElement.closest('tr');
            insertTagChipBeforeSelect(row, activeColumnKey, newCat);
            refreshTagAddSelect(row, activeColumnKey);
        }
    }
    activeSelectElement = null;
    activeColumnKey = null;
}

function deleteRowAction(btn) {
    btn.closest('tr').remove();
    recalculateSortNumbersFromDOM();
}

function getOccupiedSeatsOnTable(tableNum, excludeRow = null) {
    const occupied = new Set();
    tbody.querySelectorAll('tr').forEach(r => {
        if (r === excludeRow) return;
        const tableInput = r.querySelector('.row-table-input');
        const seatInput = r.querySelector('.row-seat-input');
        if (!tableInput || !seatInput) return;
        const tVal = tableInput.value.trim();
        if (tVal === '' || isNaN(tVal) || parseInt(tVal, 10) !== tableNum) return;
        const seat = parseInt(seatInput.value, 10);
        if (!isNaN(seat) && seat >= 1) occupied.add(seat);
    });
    return occupied;
}

function getSmallestAvailableSeat(tableNum, excludeRow = null) {
    const occupied = getOccupiedSeatsOnTable(tableNum, excludeRow);
    const tableMax = getMaxSeatsForTable(tableNum);
    let highest = 0;
    occupied.forEach(seat => { if (seat > highest) highest = seat; });
    const limit = Math.min(Math.max(tableMax, highest + 1), ABSOLUTE_MAX_SEATS_PER_TABLE);
    for (let i = 1; i <= limit; i++) {
        if (!occupied.has(i)) return i;
    }
    return limit;
}

function syncSeatCellForRow(row) {
    const tableInput = row.querySelector('.row-table-input');
    const txtCell = row.querySelector('.row-seat-txt-cell');
    if (!tableInput || !txtCell) return;

    const tVal = tableInput.value.trim();
    if (tVal === '' || isNaN(tVal)) {
        txtCell.innerHTML = '<span class="text-gray-400">未安排</span>';
        return;
    }

    const tableNum = parseInt(tVal, 10);
    const existingSeat = row.querySelector('.row-seat-input');
    const displayNum = txtCell.querySelector('.row-table-display-num');
    const prevTable = displayNum ? parseInt(displayNum.textContent, 10) : NaN;

    if (existingSeat && prevTable === tableNum) {
        if (displayNum) displayNum.textContent = tableNum;
        existingSeat.max = getMaxSeatsForTable(tableNum);
        return;
    }

    const seatVal = getSmallestAvailableSeat(tableNum, row);
    txtCell.innerHTML = buildSeatCellContent(tableNum, seatVal);
}

function setSeatValueForRow(row, tableNum, seatNum) {
    const txtCell = row.querySelector('.row-seat-txt-cell');
    if (!txtCell) return;

    const existingSeat = row.querySelector('.row-seat-input');
    const displayNum = txtCell.querySelector('.row-table-display-num');
    const prevTable = displayNum ? parseInt(displayNum.textContent, 10) : NaN;
    const maxSeats = getMaxSeatsForTable(tableNum);
    const seatVal = Math.min(maxSeats, Math.max(1, seatNum));

    if (existingSeat && prevTable === tableNum) {
        existingSeat.value = seatVal;
        existingSeat.max = maxSeats;
        if (displayNum) displayNum.textContent = tableNum;
        return;
    }

    txtCell.innerHTML = buildSeatCellContent(tableNum, seatVal);
}

function reassignSeatsByDomOrderPerTable() {
    const tableSeatCounter = {};

    tbody.querySelectorAll('tr').forEach(row => {
        if (!row.querySelector('.row-name-input')) return;

        const tableInput = row.querySelector('.row-table-input');
        const txtCell = row.querySelector('.row-seat-txt-cell');
        if (!tableInput || !txtCell) return;

        const tVal = tableInput.value.trim();
        if (tVal === '' || isNaN(tVal)) {
            txtCell.innerHTML = '<span class="text-gray-400">未安排</span>';
            return;
        }

        const tableNum = parseInt(tVal, 10);
        tableSeatCounter[tableNum] = (tableSeatCounter[tableNum] || 0) + 1;
        setSeatValueForRow(row, tableNum, tableSeatCounter[tableNum]);
    });
}

function recalculateSortNumbersFromDOM() {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row, idx) => {
        const numEl = row.querySelector('.row-sort-num');
        if (numEl) numEl.innerText = idx + 1;
    });
    reassignSeatsByDomOrderPerTable();
}

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