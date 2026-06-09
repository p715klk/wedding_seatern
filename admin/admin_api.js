// ==========================================
// 📌 2. Firebase 精準讀取與多重標籤解析
// ==========================================
function loadFirebaseData() {
    tbody.innerHTML = `<tr><td class="text-center py-8 text-gray-400 font-bold">⏳ 正在從 Firebase 載入名單數據...</td></tr>`;
    
    database.ref('meta_label_columns').once('value').then(metaSnapshot => {
        const meta = metaSnapshot.val();
        if (meta && meta.keys && meta.names) {
            const legacyKeys = meta.keys;
            const mergedPool = new Set(categoriesByColumn[PRIMARY_TAG_KEY] || []);
            legacyKeys.forEach(k => {
                (meta.categories?.[k] || []).forEach(c => mergedPool.add(c));
            });
            labelColumnsKeys = [PRIMARY_TAG_KEY];
            labelColumnsNames = ['標籤 (可多選)'];
            categoriesByColumn = { [PRIMARY_TAG_KEY]: [...mergedPool] };
            window._legacyLabelKeys = legacyKeys.length > 1 ? legacyKeys : null;
        } else {
            window._legacyLabelKeys = null;
        }

        return Promise.all([
            database.ref('wedding_guests').once('value'),
            database.ref('unassigned_guests').once('value')
        ]);
    }).then(([snapshot1, snapshot2]) => {
        const weddingGuests = snapshot1.val() || {};
        const unassignedGuests = snapshot2.val() || [];

        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
            processFirebaseData(weddingGuests, unassignedGuests);
        }
    }).catch(err => {
        console.error("Firebase 載入失敗:", err);
        tbody.innerHTML = `<tr><td class="text-center py-8 text-red-500 font-bold">❌ 數據載入失敗</td></tr>`;
    });
}

function sortGuestsListByTableAndSeat(list) {
    list.sort((a, b) => {
        const tableA = (a.table === '' || a.table == null || isNaN(a.table)) ? 9999 : parseInt(a.table, 10);
        const tableB = (b.table === '' || b.table == null || isNaN(b.table)) ? 9999 : parseInt(b.table, 10);
        if (tableA !== tableB) return tableA - tableB;
        const seatA = parseInt(a.sort, 10);
        const seatB = parseInt(b.sort, 10);
        return (isNaN(seatA) ? 99 : seatA) - (isNaN(seatB) ? 99 : seatB);
    });
    return list;
}

function processFirebaseData(weddingGuests, unassignedGuests) {
    localGuestsList = [];

    // 已分配桌次賓客
    Object.keys(weddingGuests).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).forEach(tableNum => {
        const list = weddingGuests[tableNum];
        if (Array.isArray(list)) {
            list.forEach(guest => {
                if (guest && guest.name) {
                    const mergeKeys = window._legacyLabelKeys || labelColumnsKeys;
                    localGuestsList.push({
                        name: guest.name,
                        side: guest.side || '男方',
                        table: parseInt(tableNum), 
                        sort: guest.sort || 1,
                        group: mergeGuestLabelsToTags(guest, mergeKeys)
                    });
                }
            });
        }
    });

    // 未分配賓客
    if (Array.isArray(unassignedGuests)) {
        unassignedGuests.forEach(guest => {
            if (guest && guest.name) {
                const mergeKeys = window._legacyLabelKeys || labelColumnsKeys;
                localGuestsList.push({
                    name: guest.name,
                    side: guest.side || '男方',
                    table: '', 
                    sort: 99,
                    group: mergeGuestLabelsToTags(guest, mergeKeys)
                });
            }
        });
    }

    sortGuestsListByTableAndSeat(localGuestsList);

    renderThead();   // 呼叫 UI 模組生成表頭
    renderDOMRows(); // 呼叫 UI 模組渲染行數
}

// ==========================================
// 📌 3. 儲存雙節點與欄位架構
// ==========================================
function saveAllToFirebase() {
    const rows = tbody.querySelectorAll('tr');
    let newWeddingGuests = {};   
    let newUnassignedGuests = [];

    database.ref('meta_label_columns').set({
        keys: labelColumnsKeys,
        names: labelColumnsNames,
        categories: categoriesByColumn
    });

    rows.forEach((row) => {
        const nameInput = row.querySelector('.row-name-input');
        if (!nameInput) return;

        const gName = nameInput.value.trim();
        const gSide = row.querySelector('.row-side-select').value;
        const gTableRaw = row.querySelector('.row-table-input').value.trim(); 

        if (!gName) return; 

        let guestData = { name: gName, side: gSide };
        const tags = readTagsFromRow(row, PRIMARY_TAG_KEY);
        guestData[PRIMARY_TAG_KEY] = tags.length ? tags : [];

        if (gTableRaw === "" || isNaN(gTableRaw)) {
            guestData.sort = 99;
            newUnassignedGuests.push(guestData);
        } else {
            const targetTable = parseInt(gTableRaw);
            if (!newWeddingGuests[targetTable]) newWeddingGuests[targetTable] = [];
            guestData.sort = newWeddingGuests[targetTable].length + 1;
            newWeddingGuests[targetTable].push(guestData);
        }
    });

    Promise.all([
        database.ref('wedding_guests').set(newWeddingGuests),
        database.ref('unassigned_guests').set(newUnassignedGuests)
    ]).then(() => {
        alert("✨ 【後台數據同步成功】！已完美推送至畫布。");
        loadFirebaseData();
    }).catch(err => alert("❌ 儲存失敗: " + err.message));
}

// ==========================================
// 📌 4. CSV 備份
// ==========================================
function exportToCSV() {
    if (localGuestsList.length === 0) return;
    let headers = ["姓名", "來源(男方/女方)", "分配桌次", "標籤(多選以|分隔)"];
    let csvContent = "\uFEFF" + headers.join(",") + "\n";
    
    tbody.querySelectorAll('tr').forEach(row => {
        const nameEl = row.querySelector('.row-name-input');
        if (!nameEl) return;
        const name = nameEl.value.trim();
        const table = row.querySelector('.row-table-input').value.trim();
        const side = row.querySelector('.row-side-select').value;

        if (name) {
            const tags = readTagsFromRow(row, PRIMARY_TAG_KEY);
            let rowCells = [`"${name}"`, `"${side}"`, `"${table}"`, `"${tags.join('|')}"`];
            csvContent += rowCells.join(",") + "\n";
        }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `wedding_guests_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importCSVAction() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const lines = e.target.result.split('\n');
        let importedGuests = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(',');
            if (parts.length >= 2) {
                const name = parts[0].replace(/"/g, '').trim();
                const side = parts[1] ? parts[1].replace(/"/g, '').trim() : '男方';
                const tableRaw = parts[2] ? parts[2].replace(/"/g, '').trim() : '';
                const tagsRaw = parts[3] ? parts[3].replace(/"/g, '').trim() : '';

                if (name) {
                    importedGuests.push({
                        name: name, side: side,
                        group: normalizeTags(tagsRaw),
                        table: tableRaw !== "" ? parseInt(tableRaw) : ""
                    });
                }
            }
        }
        localGuestsList = sortGuestsListByTableAndSeat(importedGuests);
        renderDOMRows();
        recalculateSortNumbersFromDOM();
    };
    reader.readAsText(file, 'UTF-8');
}