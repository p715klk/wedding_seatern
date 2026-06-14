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

function getRowGuestSide(row) {
    const el = row && row.querySelector('.row-side-select');
    return el && el.value === '女方' ? '女方' : '男方';
}

function tagChipSideClasses(side) {
    if (side === '女方') {
        return {
            chip: 'bg-rose-100 text-rose-800',
            btn: 'text-rose-500 hover:text-rose-700',
            select: 'border-rose-200 bg-rose-50/20'
        };
    }
    return {
        chip: 'bg-blue-100 text-blue-800',
        btn: 'text-blue-500 hover:text-blue-700',
        select: 'border-blue-200 bg-blue-50/20'
    };
}

function buildTagChipHTML(tag, columnKey, side = '男方') {
    const safe = tag.replace(/"/g, '&quot;');
    const c = tagChipSideClasses(side);
    return `<span class="tag-chip inline-flex items-center gap-0.5 ${c.chip} px-1.5 py-0.5 rounded font-bold" data-tag="${safe}">${tag}<button type="button" onclick="removeTagFromRow(this,'${columnKey}')" class="${c.btn} font-black leading-none">×</button></span>`;
}

function buildTagAddSelectHTML(columnKey, selectedTags, side = '男方') {
    const optionsArr = categoriesByColumn[columnKey] || ['未分類'];
    const available = optionsArr.filter(cat => !selectedTags.includes(cat));
    const c = tagChipSideClasses(side);
    let optsHTML = `<option value="">＋</option>`;
    optsHTML += available.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    optsHTML += `<option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂...</option>`;
    optsHTML += `<option value="__DELETE__" class="text-red-600 font-bold">− 刪除標籤...</option>`;
    return `<select onchange="handleTagAdd(this, '${columnKey}')" class="row-tag-add-select row-tag-add-select-${columnKey} border ${c.select} rounded px-1 py-0.5 font-bold focus:bg-white shrink-0">${optsHTML}</select>`;
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

function buildCanceledSeatCellContent(tableNum) {
    return `<span class="row-seat-released inline-flex items-center gap-0.5 font-mono font-bold text-red-500 flex-wrap justify-center">第 <span class="row-table-display-num">${tableNum}</span> 桌 - <span title="簽到頁已取消，座位已釋放；原座位資料仍保留於 Firebase">已釋放</span></span>`;
}

function isCanceledAdminRow(row) {
    return !!(row && row.dataset.guestCanceled === '1');
}

function applyCanceledRowDataset(row, preservedSort) {
    row.dataset.guestCanceled = '1';
    if (preservedSort != null && preservedSort >= 1) {
        row.dataset.preservedSort = String(preservedSort);
    }
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

function buildMultiTagCellHTML(columnKey, tags, side = '男方') {
    const chips = tags.map(t => buildTagChipHTML(t, columnKey, side)).join('');
    return `
        <td class="py-2 px-2 align-middle">
            <div class="row-multi-tags flex flex-wrap items-center gap-1" data-column-key="${columnKey}">
                ${chips}
                ${buildTagAddSelectHTML(columnKey, tags, side)}
            </div>
        </td>
    `;
}

function refreshRowTagColors(row) {
    const container = row.querySelector(`.row-multi-tags[data-column-key="${PRIMARY_TAG_KEY}"]`);
    if (!container) return;
    const tags = readTagsFromRow(row, PRIMARY_TAG_KEY);
    const side = getRowGuestSide(row);
    const chips = tags.map(t => buildTagChipHTML(t, PRIMARY_TAG_KEY, side)).join('');
    container.innerHTML = chips + buildTagAddSelectHTML(PRIMARY_TAG_KEY, tags, side);
}

function insertTagChipBeforeSelect(row, columnKey, tag) {
    const select = row.querySelector(`.row-tag-add-select-${columnKey}`);
    if (!select) return;
    const current = readTagsFromRow(row, columnKey);
    if (!current.includes(tag)) {
        select.insertAdjacentHTML('beforebegin', buildTagChipHTML(tag, columnKey, getRowGuestSide(row)));
    }
}

function refreshTagAddSelect(row, columnKey) {
    const select = row.querySelector(`.row-tag-add-select-${columnKey}`);
    if (!select) return;
    const selected = readTagsFromRow(row, columnKey);
    select.outerHTML = buildTagAddSelectHTML(columnKey, selected, getRowGuestSide(row));
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
    if (val === '__DELETE__') {
        openDeleteTagDialog(columnKey, selectEl);
        selectEl.value = '';
        return;
    }
    const row = selectEl.closest('tr');
    insertTagChipBeforeSelect(row, columnKey, val);
    refreshTagAddSelect(row, columnKey);
    markAdminDirty();
}

function collectGuestsFromDOM() {
    const guests = [];
    if (!tbody) return guests;
    tbody.querySelectorAll('tr').forEach(row => {
        const g = collectGuestFromRow(row);
        if (g) guests.push(g);
    });
    return guests;
}

function getGuestsUsingTagInAdmin(tag) {
    return findGuestsUsingTag(tag, collectGuestsFromDOM());
}

function populateDeleteTagSelect(columnKey) {
    const select = document.getElementById('delete-tag-select');
    const pool = (categoriesByColumn[columnKey] || []).filter(t => t && t !== '未分類');
    select.innerHTML = pool.length
        ? pool.map(t => `<option value="${t.replace(/"/g, '&quot;')}">${t}</option>`).join('')
        : '<option value="">（無可刪除標籤）</option>';
}

function updateDeleteTagUsageHint() {
    const select = document.getElementById('delete-tag-select');
    const hint = document.getElementById('delete-tag-usage-hint');
    const btn = document.getElementById('btn-confirm-delete-tag');
    const tag = select.value;
    if (!tag) {
        hint.textContent = '目前標籤清單為空。';
        btn.disabled = true;
        return;
    }
    const users = getGuestsUsingTagInAdmin(tag);
    if (users.length > 0) {
        const names = users.map(g => g.name).join('、');
        hint.innerHTML = `<span class="text-red-600 font-bold">尚有 ${users.length} 位賓客使用中：</span>${names}`;
        btn.disabled = true;
    } else {
        hint.innerHTML = '<span class="text-green-700 font-bold">無人使用此標籤，可安全刪除。</span>';
        btn.disabled = false;
    }
}

function openDeleteTagDialog(columnKey, selectEl) {
    activeSelectElement = selectEl;
    activeColumnKey = columnKey;
    populateDeleteTagSelect(columnKey);
    updateDeleteTagUsageHint();
    document.getElementById('delete-tag-dialog-overlay').classList.remove('hidden');
}

function closeDeleteTagDialog(isConfirm) {
    document.getElementById('delete-tag-dialog-overlay').classList.add('hidden');
    if (isConfirm && activeColumnKey) {
        const tag = document.getElementById('delete-tag-select').value;
        if (tag && getGuestsUsingTagInAdmin(tag).length === 0) {
            const pool = categoriesByColumn[activeColumnKey];
            const idx = pool.indexOf(tag);
            if (idx !== -1) {
                pool.splice(idx, 1);
                refreshAllTagAddSelects(activeColumnKey);
                markAdminDirty();
                alert(`✅ 已從標籤清單移除「${tag}」\n請記得按「儲存變更」同步至 Firebase。`);
            }
        }
    }
    if (activeSelectElement) activeSelectElement.value = '';
    activeSelectElement = null;
    activeColumnKey = null;
}

function removeTagFromRow(btn, columnKey) {
    const row = btn.closest('tr');
    btn.closest('.tag-chip').remove();
    refreshTagAddSelect(row, columnKey);
    markAdminDirty();
}

function collectGuestFromRow(row) {
    const nameInput = row.querySelector('.row-name-input');
    if (!nameInput) return null;
    let guest = {
        name: nameInput.value.trim(),
        side: row.querySelector('.row-side-select').value,
        table: row.querySelector('.row-table-input').value.trim(),
        sort: (() => {
            if (row.dataset.guestCanceled === '1') {
                const preserved = parseInt(row.dataset.preservedSort, 10);
                if (!isNaN(preserved) && preserved >= 1) return String(preserved);
            }
            const seatInput = row.querySelector('.row-seat-input');
            if (seatInput && seatInput.value.trim() !== '') return seatInput.value.trim();
            return '99';
        })(),
        group: readTagsFromRow(row, PRIMARY_TAG_KEY)
    };
    if (row.dataset.guestCanceled === '1') {
        guest.isCanceled = true;
        const preserved = parseInt(row.dataset.preservedSort, 10);
        if (!isNaN(preserved) && preserved >= 1) guest.preservedSort = preserved;
    }
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
        const isCanceled = !!guest.isCanceled;

        if (isCanceled) {
            tr.className = "row-guest-canceled hover:bg-red-50/60 transition bg-red-50/40";
            applyCanceledRowDataset(tr, guest.preservedSort ?? guest.sort);
        } else {
            tr.className = "hover:bg-gray-50 transition bg-white";
        }
        
        const sideSelectHTML = `
            <select onchange="refreshRowTagColors(this.closest('tr'))" class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-side-select">
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
        const guestSide = guest.side === '女方' ? '女方' : '男方';
        const labelsTdHTML = buildMultiTagCellHTML(PRIMARY_TAG_KEY, tags, guestSide);
        const seatCellHTML = !guest.table
            ? '<span class="text-gray-400">未安排</span>'
            : isCanceled
                ? buildCanceledSeatCellContent(guest.table)
                : buildSeatCellContent(guest.table, guest.sort || 1);

        const nameCellHTML = isCanceled
            ? `<div class="flex flex-col gap-0.5">
                <input type="text" value="${guest.name}" class="w-full border border-red-200 rounded p-1 font-bold bg-transparent focus:bg-white row-name-input text-gray-500">
                <span class="row-cancel-badge text-[10px] font-bold text-red-600 leading-tight">❌ 已取消（簽到頁）</span>
               </div>`
            : `<input type="text" value="${guest.name}" class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-name-input">`;

        const dragCellHTML = isCanceled
            ? '<span class="text-gray-300 text-sm" title="已取消賓客不可拖動排序">🔒</span>'
            : '☰';

        tr.innerHTML = `
            <td class="py-2 px-1 text-center font-mono text-gray-400 font-bold row-sort-num row-sort-cell">${index + 1}</td>
            <td class="py-2 px-1 text-center drag-handle text-gray-400 text-base select-none ${isCanceled ? 'cursor-not-allowed' : 'cursor-row-resize'} row-drag-cell">${dragCellHTML}</td>
            <td class="py-2 px-1 row-table-cell">${tableInputHTML}</td>
            <td class="py-2 px-2 text-center row-seat-txt-cell">${seatCellHTML}</td>
            <td class="py-2 px-2">${nameCellHTML}</td>
            <td class="py-2 px-1 row-side-cell">${sideSelectHTML}</td>
            ${labelsTdHTML}
            <td class="py-2 px-2 text-center">
                <button onclick="deleteRowAction(this)" class="text-red-500 hover:text-red-700 font-bold p-1 transition">❌ 刪除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    reinitTableSortable();
}

function scrollToTableInList(tableNum) {
    if (!tbody || !scrollContainer) return;
    const target = parseInt(tableNum, 10);
    if (isNaN(target)) return;

    for (const row of tbody.querySelectorAll('tr')) {
        const tableInput = row.querySelector('.row-table-input');
        if (!tableInput || parseInt(tableInput.value, 10) !== target) continue;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('ring-2', 'ring-yellow-400', 'bg-yellow-50');
        setTimeout(() => row.classList.remove('ring-2', 'ring-yellow-400', 'bg-yellow-50'), 2500);
        break;
    }
}

function reinitTableSortable() {
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
    if (typeof Sortable !== 'undefined' && tbody) {
        sortableInstance = Sortable.create(tbody, {
            handle: '.drag-handle',
            filter: '.row-guest-canceled',
            preventOnFilter: true,
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function () {
                recalculateSortNumbersFromDOM();
                markAdminDirty();
            }
        });
    }
}

function addNewGuestRow() {
    if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';

    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition bg-white";

    const sideSelectHTML = `
        <select onchange="refreshRowTagColors(this.closest('tr'))" class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-side-select">
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
    markAdminDirty();
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
            markAdminDirty();
        }
    }
    activeSelectElement = null;
    activeColumnKey = null;
}

function deleteRowAction(btn) {
    btn.closest('tr').remove();
    recalculateSortNumbersFromDOM();
    markAdminDirty();
}

function getOccupiedSeatsOnTable(tableNum, excludeRow = null) {
    const occupied = new Set();
    tbody.querySelectorAll('tr').forEach(r => {
        if (r === excludeRow || isCanceledAdminRow(r)) return;
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

    if (isCanceledAdminRow(row)) {
        txtCell.innerHTML = buildCanceledSeatCellContent(tableNum);
        return;
    }

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
    if (isCanceledAdminRow(row)) return;

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
        if (isCanceledAdminRow(row)) return;

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

function refreshRowSequenceNumbersOnly() {
    tbody.querySelectorAll('tr').forEach((row, idx) => {
        const numEl = row.querySelector('.row-sort-num');
        if (numEl) numEl.innerText = idx + 1;
    });
}

function recalculateSortNumbersFromDOM() {
    // 只更新「順序」欄（名單第幾行），唔好改動「桌次座位」實際 seat 編號。
    // 否則有留空位（例如 1、2、6–12）或簽到已取消釋放位時，會被壓成 1、2、3…
    refreshRowSequenceNumbersOnly();
}

function openLeavePageDialog(href) {
    pendingLeaveHref = href || null;
    document.getElementById('leave-page-dialog-overlay').classList.remove('hidden');
}

function closeLeavePageDialog() {
    document.getElementById('leave-page-dialog-overlay').classList.add('hidden');
    pendingLeaveHref = null;
}

function confirmLeaveAdminPage(action) {
    const href = pendingLeaveHref;
    closeLeavePageDialog();
    if (action === 'stay') return;

    if (action === 'discard') {
        markAdminClean();
        if (href) window.location.href = href;
        return;
    }

    if (action === 'save') {
        saveAllToFirebase({ reloadAfterSave: false })
            .then(() => {
                markAdminClean();
                if (href) window.location.href = href;
                else alert('✅ 已儲存變更');
            })
            .catch(() => {});
    }
}

// ==========================================
// 📌 CSV 匯入預覽對話框
// ==========================================
const CSV_IMPORT_PREVIEW_LIMIT = 12;

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getSelectedCSVImportMode() {
    const checked = document.querySelector('input[name="csv-import-mode"]:checked');
    return checked?.value === 'replace' ? 'replace' : 'merge';
}

function renderCSVImportPreviewSummary(plan) {
    const summaryEl = document.getElementById('csv-import-preview-summary');
    if (!summaryEl) return;

    const cards = [
        { label: 'CSV 讀取', value: plan.stats.csvTotal, tone: 'bg-gray-50 text-gray-700 border-gray-200' },
        { label: '新增', value: plan.stats.added, tone: 'bg-green-50 text-green-700 border-green-200' },
        { label: '更新', value: plan.stats.updated, tone: 'bg-blue-50 text-blue-700 border-blue-200' },
        { label: '不變', value: plan.stats.unchanged, tone: 'bg-slate-50 text-slate-700 border-slate-200' }
    ];

    if (plan.mode === 'merge') {
        cards.push({ label: '保留', value: plan.stats.kept, tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' });
    } else {
        cards.push({ label: '將刪除', value: plan.stats.removed, tone: 'bg-red-50 text-red-700 border-red-200' });
    }

    cards.push({
        label: '匯入後總數',
        value: plan.stats.resultTotal,
        tone: 'bg-amber-50 text-amber-800 border-amber-200'
    });

    summaryEl.innerHTML = cards.map((card) => `
        <div class="rounded-lg border px-2 py-2 ${card.tone}">
            <div class="text-[10px] font-bold uppercase tracking-wide opacity-80">${card.label}</div>
            <div class="text-lg font-black leading-tight">${card.value}</div>
        </div>
    `).join('');
}

function renderCSVImportPreviewGuestLine(guest, extra = '') {
    const tags = formatGuestTagsLabel(guest.group);
    const placement = formatGuestPlacementLabel(guest);
    return `<li class="leading-relaxed">
        <span class="font-bold text-gray-900">${escapeHtml(guest.name)}</span>
        <span class="text-gray-500"> · ${escapeHtml(guest.side)} · ${escapeHtml(tags)} · ${escapeHtml(placement)}</span>
        ${extra}
    </li>`;
}

function renderCSVImportPreviewSection(title, toneClass, items, renderItem) {
    if (!items.length) return '';
    const visible = items.slice(0, CSV_IMPORT_PREVIEW_LIMIT);
    const hiddenCount = items.length - visible.length;
    return `
        <section class="rounded-lg border p-3 ${toneClass}">
            <h4 class="font-bold mb-2">${title}（${items.length}）</h4>
            <ul class="space-y-1 list-disc pl-4 text-gray-700">
                ${visible.map(renderItem).join('')}
            </ul>
            ${hiddenCount > 0 ? `<p class="mt-2 text-gray-500">…另有 ${hiddenCount} 位未顯示</p>` : ''}
        </section>
    `;
}

function renderCSVImportPreviewDetails(plan) {
    const detailsEl = document.getElementById('csv-import-preview-details');
    if (!detailsEl) return;

    const sections = [
        renderCSVImportPreviewSection(
            '新增',
            'border-green-200 bg-green-50/40',
            plan.preview.added,
            (guest) => renderCSVImportPreviewGuestLine(guest)
        ),
        renderCSVImportPreviewSection(
            '更新',
            'border-blue-200 bg-blue-50/40',
            plan.preview.updated,
            (item) => renderCSVImportPreviewGuestLine(
                item.after,
                `<span class="block text-blue-700 font-bold mt-0.5">${escapeHtml(item.changes.join('；'))}</span>`
            )
        ),
        renderCSVImportPreviewSection(
            '不變',
            'border-slate-200 bg-slate-50/60',
            plan.preview.unchanged,
            (guest) => renderCSVImportPreviewGuestLine(guest)
        )
    ];

    if (plan.mode === 'merge') {
        sections.push(renderCSVImportPreviewSection(
            '保留（CSV 冇寫到）',
            'border-indigo-200 bg-indigo-50/40',
            plan.preview.kept,
            (guest) => renderCSVImportPreviewGuestLine(guest)
        ));
    } else {
        sections.push(renderCSVImportPreviewSection(
            '將刪除（CSV 冇寫到）',
            'border-red-200 bg-red-50/50',
            plan.preview.removed,
            (guest) => renderCSVImportPreviewGuestLine(guest)
        ));
    }

    const html = sections.filter(Boolean).join('');
    detailsEl.innerHTML = html || '<p class="text-gray-500">沒有可顯示的變更。</p>';
}

function renderCSVImportPreviewWarnings(plan) {
    const warningsEl = document.getElementById('csv-import-preview-warnings');
    if (!warningsEl) return;

    const warnings = [];
    if (plan.duplicates.length) {
        const sample = plan.duplicates.slice(0, 5).map((dup) =>
            `第 ${dup.row} 行：${dup.name}（${dup.side} · ${dup.tags}）`
        ).join('；');
        const more = plan.duplicates.length > 5 ? `…等 ${plan.duplicates.length} 筆` : '';
        warnings.push(`CSV 內有重複配對（姓名+來源+標籤相同），以最後一行為準：${sample}${more}`);
    }
    if (plan.mode === 'replace' && plan.stats.removed > 0) {
        warnings.push(`完全取代模式會刪除 ${plan.stats.removed} 位 CSV 冇寫到嘅賓客。`);
    }

    if (!warnings.length) {
        warningsEl.classList.add('hidden');
        warningsEl.innerHTML = '';
        return;
    }

    warningsEl.classList.remove('hidden');
    warningsEl.innerHTML = warnings.map((text) => `<p class="leading-relaxed">⚠️ ${escapeHtml(text)}</p>`).join('');
}

function refreshCSVImportPreview() {
    if (!pendingCSVImportData) return;

    const mode = getSelectedCSVImportMode();
    const plan = buildCSVImportPlan(
        pendingCSVImportData.importedGuests,
        pendingCSVImportData.existingGuests,
        mode
    );
    pendingCSVImportData.plan = plan;

    renderCSVImportPreviewSummary(plan);
    renderCSVImportPreviewWarnings(plan);
    renderCSVImportPreviewDetails(plan);

    const confirmBtn = document.getElementById('btn-confirm-csv-import');
    if (confirmBtn) {
        confirmBtn.textContent = mode === 'replace' ? '確認完全取代' : '確認合併匯入';
    }
}

function openCSVImportPreviewDialog() {
    if (!pendingCSVImportData) return;

    const fileNameEl = document.getElementById('csv-import-file-name');
    if (fileNameEl) {
        fileNameEl.textContent = `檔案：${pendingCSVImportData.fileName}`;
    }

    const mergeRadio = document.querySelector('input[name="csv-import-mode"][value="merge"]');
    if (mergeRadio) mergeRadio.checked = true;

    refreshCSVImportPreview();
    document.getElementById('csv-import-dialog-overlay').classList.remove('hidden');
}

function closeCSVImportDialog(isConfirm) {
    document.getElementById('csv-import-dialog-overlay').classList.add('hidden');

    if (!isConfirm || !pendingCSVImportData?.plan) {
        pendingCSVImportData = null;
        return;
    }

    const plan = pendingCSVImportData.plan;
    if (plan.mode === 'replace' && plan.stats.removed > 0) {
        const ok = confirm(`確定要完全取代名單嗎？\n\n將刪除 ${plan.stats.removed} 位 CSV 冇寫到嘅賓客，此操作會即時寫入 Firebase。`);
        if (!ok) {
            pendingCSVImportData = null;
            return;
        }
    }

    applyConfirmedCSVImport(plan).catch(() => {});
}

function setupAdminLeaveGuard() {
    if (!tbody) return;

    tbody.addEventListener('input', markAdminDirty);
    tbody.addEventListener('change', markAdminDirty);

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link || !isAdminPageDirty()) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        if (link.target === '_blank') return;
        e.preventDefault();
        openLeavePageDialog(link.href);
    }, true);

    window.addEventListener('beforeunload', (e) => {
        if (!isAdminPageDirty()) return;
        e.preventDefault();
        e.returnValue = '';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    tbody = document.getElementById('excel-tbody');
    scrollContainer = document.getElementById('table-scroll-container');

    reinitTableSortable();
    setupAdminLeaveGuard();
    loadFirebaseData();
    startAdminRealtimeSync();
});