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
            database.ref('unassigned_guests').once('value'),
            database.ref('table_settings').once('value')
        ]);
    }).then(([snapshot1, snapshot2, snapshot3]) => {
        const weddingGuests = snapshot1.val() || {};
        const unassignedGuests = snapshot2.val() || [];
        tableSettingsCache = snapshot3.val() || {};

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
        const seatInput = row.querySelector('.row-seat-input');
        const gSeatRaw = seatInput ? seatInput.value.trim() : '';

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
            let seatNum = parseInt(gSeatRaw, 10);
            if (isNaN(seatNum) || seatNum < 1) seatNum = 1;
            guestData.sort = Math.min(ABSOLUTE_MAX_SEATS_PER_TABLE, seatNum);
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
    const headers = ["順序", "桌號", "座位", "姓名", "來源(男方/女方)", "標籤(多選以;分隔)"];
    let csvContent = "\uFEFF" + headers.join(",") + "\n";
    let seq = 0;

    tbody.querySelectorAll('tr').forEach(row => {
        const nameEl = row.querySelector('.row-name-input');
        if (!nameEl) return;
        const name = nameEl.value.trim();
        const table = row.querySelector('.row-table-input').value.trim();
        const side = row.querySelector('.row-side-select').value;
        const seatInput = row.querySelector('.row-seat-input');
        const seat = seatInput ? seatInput.value.trim() : '';

        if (name) {
            seq += 1;
            const tags = readTagsFromRow(row, PRIMARY_TAG_KEY);
            const rowCells = [
                `"${seq}"`,
                `"${table}"`,
                `"${seat}"`,
                `"${name}"`,
                `"${side}"`,
                `"${tags.join(';')}"`
            ];
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

function openCSVFilePicker() {
    const fileInput = document.getElementById('csv-file-input');
    fileInput.value = '';
    fileInput.click();
}

function importCSVAction() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const lines = e.target.result.replace(/^\uFEFF/, '').split(/\r?\n/);
        let importedGuests = [];
        const headerParts = parseCSVLine((lines[0] || '').trim());
        const isNewFormat = headerParts[0] === '順序' || headerParts.includes('桌號');

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = parseCSVLine(line);
            const clean = (idx) => (parts[idx] ?? '').replace(/^"|"$/g, '').trim();

            if (isNewFormat && parts.length >= 4) {
                const tableRaw = clean(1);
                const seatRaw = clean(2);
                const name = clean(3);
                const side = clean(4) || '男方';
                const tagsRaw = clean(5);
                const seatNum = parseInt(seatRaw, 10);

                if (name) {
                    importedGuests.push({
                        name,
                        side,
                        table: tableRaw !== '' && !isNaN(parseInt(tableRaw, 10)) ? parseInt(tableRaw, 10) : '',
                        sort: !isNaN(seatNum) && seatNum >= 1 ? seatNum : 1,
                        group: normalizeTags(tagsRaw)
                    });
                }
            } else if (parts.length >= 2) {
                const name = clean(0);
                const side = clean(1) || '男方';
                const tableRaw = clean(2);
                const tagsRaw = clean(3);

                if (name) {
                    importedGuests.push({
                        name,
                        side,
                        group: normalizeTags(tagsRaw),
                        table: tableRaw !== '' && !isNaN(parseInt(tableRaw, 10)) ? parseInt(tableRaw, 10) : ''
                    });
                }
            }
        }

        fileInput.value = '';

        if (importedGuests.length === 0) {
            alert('❌ 未能讀取任何賓客資料，請確認 CSV 格式是否正確。');
            return;
        }

        localGuestsList = isNewFormat ? importedGuests : sortGuestsListByTableAndSeat(importedGuests);
        renderDOMRows();
        refreshRowSequenceNumbersOnly();
        alert(`✅ 已匯入 ${importedGuests.length} 位賓客。\n\n請檢查名單後按「💾 儲存變更」同步至 Firebase。`);
    };
    reader.onerror = function () {
        fileInput.value = '';
        alert('❌ 讀取 CSV 檔案失敗，請重試。');
    };
    reader.readAsText(file, 'UTF-8');
}