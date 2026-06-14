// ==========================================
// 📌 2. Firebase 精準讀取與多重標籤解析
// ==========================================
let guestStatusCache = {};

function getGuestArrivalStatus(tableNum, guestName) {
    if (tableNum == null || tableNum === '' || !guestName) return '未到';
    const key = `${tableNum}_${guestName}`;
    const raw = guestStatusCache[key]?.arrived;
    if (raw === '取消') return '取消';
    if (raw === true || raw === '已到') return '已到';
    return '未到';
}

function isGuestCanceled(tableNum, guestName) {
    return getGuestArrivalStatus(tableNum, guestName) === '取消';
}

function resolveGuestSeatNumber(tableNum, guest, tableGuests, guestStatus) {
    const existingSort = parseInt(guest.sort, 10);
    if (!isNaN(existingSort) && existingSort >= 1) return existingSort;

    const occupiedActive = new Set();
    tableGuests.forEach(g => {
        if (g === guest || !g?.name) return;
        const key = `${tableNum}_${g.name}`;
        if (guestStatus?.[key]?.arrived === '取消') return;
        const sort = parseInt(g.sort, 10);
        if (!isNaN(sort) && sort >= 1) occupiedActive.add(sort);
    });

    const maxSeats = getMaxSeatsForTable(tableNum);
    for (let i = 1; i <= maxSeats; i++) {
        if (!occupiedActive.has(i)) return i;
    }
    return 1;
}

function loadFirebaseData(forceRender = false) {
    tbody.innerHTML = `<tr><td class="text-center py-8 text-gray-400 font-bold">⏳ 正在從 Firebase 載入名單數據...</td></tr>`;

    return database.ref('meta_label_columns').once('value').then(metaSnapshot => {
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
            database.ref('table_settings').once('value'),
            database.ref('guest_status').once('value')
        ]);
    }).then(([snapshot1, snapshot2, snapshot3, snapshot4]) => {
        const weddingGuests = snapshot1.val() || {};
        const unassignedGuests = snapshot2.val() || [];
        tableSettingsCache = snapshot3.val() || {};
        guestStatusCache = snapshot4.val() || {};

        if (csvImportInProgress) return;

        if (forceRender || (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT')) {
            processFirebaseData(weddingGuests, unassignedGuests);
        }
    }).catch(err => {
        console.error("Firebase 載入失敗:", err);
        tbody.innerHTML = `<tr><td class="text-center py-8 text-red-500 font-bold">❌ 數據載入失敗</td></tr>`;
        throw err;
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
        if (!Array.isArray(list)) return;

        const tableGuests = list.filter(g => g && g.name);
        const tableNumInt = parseInt(tableNum, 10);

        tableGuests.forEach(guest => {
            const mergeKeys = window._legacyLabelKeys || labelColumnsKeys;
            const rawSort = parseInt(guest.sort, 10);
            const isCanceled = isGuestCanceled(tableNumInt, guest.name);
            const preservedSort = !isNaN(rawSort) && rawSort >= 1 ? rawSort : null;
            localGuestsList.push({
                name: guest.name,
                side: guest.side || '男方',
                table: tableNumInt,
                sort: preservedSort ?? resolveGuestSeatNumber(tableNumInt, guest, tableGuests, guestStatusCache),
                isCanceled,
                preservedSort,
                group: mergeGuestLabelsToTags(guest, mergeKeys)
            });
        });
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
    markAdminClean();
}

// ==========================================
// 📌 3. 儲存雙節點與欄位架構
// ==========================================
function saveAllToFirebase(options = {}) {
    const { successMessage = null, reloadAfterSave = true } = options;
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
        const isCanceledRow = row.dataset.guestCanceled === '1';

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
            let seatNum;
            if (isCanceledRow) {
                const preserved = parseInt(row.dataset.preservedSort, 10);
                seatNum = !isNaN(preserved) && preserved >= 1
                    ? preserved
                    : parseInt(gSeatRaw, 10);
            } else {
                seatNum = parseInt(gSeatRaw, 10);
            }
            if (isNaN(seatNum) || seatNum < 1) seatNum = 1;
            guestData.sort = Math.min(ABSOLUTE_MAX_SEATS_PER_TABLE, seatNum);
            newWeddingGuests[targetTable].push(guestData);
        }
    });

    return Promise.all([
        database.ref('wedding_guests').set(newWeddingGuests),
        database.ref('unassigned_guests').set(newUnassignedGuests)
    ]).then(() => {
        markAdminClean();
        if (reloadAfterSave) return loadFirebaseData(true);
    }).then(() => {
        if (successMessage) alert(successMessage);
    }).catch(err => {
        alert("❌ 儲存失敗: " + err.message);
        throw err;
    });
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
        const seat = row.dataset.guestCanceled === '1'
            ? '已釋放'
            : (seatInput ? seatInput.value.trim() : '');

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

function parseImportedGuestFromCSVRow(parts, colMap) {
    const clean = (idx) => {
        if (idx == null || idx < 0) return '';
        return (parts[idx] ?? '').replace(/^"|"$/g, '').trim();
    };

    const name = clean(colMap.name);
    if (!name) return null;

    const sideRaw = clean(colMap.side);
    const side = sideRaw === '女方' ? '女方' : (sideRaw === '男方' ? '男方' : (sideRaw || '男方'));

    const tableRaw = clean(colMap.table);
    const seatRaw = clean(colMap.seat);
    const tableNum = parseInt(tableRaw, 10);
    const seatNum = parseInt(seatRaw, 10);
    const hasTable = tableRaw !== '' && !isNaN(tableNum) && tableNum >= 1;
    const hasSeat = seatRaw !== '' && !isNaN(seatNum) && seatNum >= 1;

    return {
        name,
        side,
        table: hasTable ? tableNum : '',
        sort: hasTable ? (hasSeat ? seatNum : 1) : 99,
        group: normalizeTags(clean(colMap.tags))
    };
}

function importCSVAction() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const lines = e.target.result.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) {
            alert('❌ CSV 檔案是空的。');
            return;
        }

        const headerParts = parseCSVLine(lines[0].trim());
        let colMap = buildCSVColumnMap(headerParts);

        // 無表頭或表頭無法辨識時，假設為匯出格式：順序,桌號,座位,姓名,來源,標籤
        const firstDataParts = lines.length > 1 ? parseCSVLine(lines[1].trim()) : [];
        if (colMap.name == null) {
            const looksLikeNewExport = firstDataParts.length >= 4
                && !isNaN(parseInt(firstDataParts[0], 10))
                && !isNaN(parseInt(firstDataParts[1], 10));
            if (looksLikeNewExport) {
                colMap = { seq: 0, table: 1, seat: 2, name: 3, side: 4, tags: 5 };
            } else {
                // 舊格式：姓名,來源,群組,分配桌次
                colMap = { name: 0, side: 1, tags: 2, table: 3 };
            }
        }

        const dataStartIndex = colMap.name != null && buildCSVColumnMap(headerParts).name != null ? 1 : 0;
        let importedGuests = [];
        let assignedCount = 0;

        for (let i = dataStartIndex; i < lines.length; i++) {
            const parts = parseCSVLine(lines[i].trim());
            const guest = parseImportedGuestFromCSVRow(parts, colMap);
            if (!guest) continue;
            if (guest.table !== '' && guest.table != null) assignedCount += 1;
            importedGuests.push(guest);
        }

        fileInput.value = '';

        if (importedGuests.length === 0) {
            alert('❌ 未能讀取任何賓客資料，請確認 CSV 格式是否正確。\n\n預期表頭包含：桌號、座位、姓名（或舊版：姓名、分配桌次）');
            return;
        }

        csvImportInProgress = true;
        localGuestsList = sortGuestsListByTableAndSeat(importedGuests);
        renderThead();
        renderDOMRows();
        refreshRowSequenceNumbersOnly();

        const assignedTables = importedGuests.map(g => g.table).filter(t => t !== '' && t != null);
        const focusTable = assignedTables.length ? assignedTables[assignedTables.length - 1] : null;
        const unassignedCount = importedGuests.length - assignedCount;

        saveAllToFirebase({
            successMessage: `✅ 已匯入並同步 ${importedGuests.length} 位賓客至 Firebase！\n\n• 已分配枱位：${assignedCount} 位\n• 未分配：${unassignedCount} 位\n\n畫布排位頁面亦會更新。`,
            reloadAfterSave: true
        }).then(() => {
            if (focusTable) scrollToTableInList(focusTable);
        }).finally(() => {
            csvImportInProgress = false;
        });
    };
    reader.onerror = function () {
        fileInput.value = '';
        csvImportInProgress = false;
        alert('❌ 讀取 CSV 檔案失敗，請重試。');
    };
    reader.readAsText(file, 'UTF-8');
}

function shouldAutoReloadAdminRows() {
    if (isAdminPageDirty()) return false;
    const active = document.activeElement;
    if (!active) return true;
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return false;
    return !active.closest('#custom-dialog-overlay, #delete-tag-dialog-overlay, #leave-page-dialog-overlay');
}

function startAdminRealtimeSync() {
    database.ref('wedding_guests').on('value', (snapshot) => {
        if (csvImportInProgress || !shouldAutoReloadAdminRows()) return;

        Promise.all([
            Promise.resolve(snapshot.val() || {}),
            database.ref('unassigned_guests').once('value'),
            database.ref('guest_status').once('value')
        ]).then(([weddingGuests, unassignedSnap, statusSnap]) => {
            if (csvImportInProgress || !shouldAutoReloadAdminRows()) return;
            guestStatusCache = statusSnap.val() || {};
            processFirebaseData(weddingGuests, unassignedSnap.val() || []);
        });
    });

    database.ref('guest_status').on('value', (snapshot) => {
        if (csvImportInProgress || !shouldAutoReloadAdminRows()) return;
        guestStatusCache = snapshot.val() || {};
        database.ref('wedding_guests').once('value').then(guestSnap => {
            if (csvImportInProgress || !shouldAutoReloadAdminRows()) return;
            database.ref('unassigned_guests').once('value').then(unassignedSnap => {
                processFirebaseData(guestSnap.val() || {}, unassignedSnap.val() || []);
            });
        });
    });
}