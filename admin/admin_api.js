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

function applyMetaLabelColumns(meta) {
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
}

/** 只讀 admin 需要嘅節點（唔讀成個 root），初次載入會快過下載全部 guest_status 等資料 */
function fetchAdminFirebaseBundle() {
    return Promise.all([
        database.ref('meta_label_columns').once('value'),
        database.ref('wedding_guests').once('value'),
        database.ref('unassigned_guests').once('value'),
        database.ref('table_settings').once('value'),
        database.ref('guest_status').once('value')
    ]).then(([metaSnap, guestsSnap, unassignedSnap, settingsSnap, statusSnap]) => ({
        meta_label_columns: metaSnap.val(),
        wedding_guests: guestsSnap.val() || {},
        unassigned_guests: unassignedSnap.val() || [],
        table_settings: settingsSnap.val() || {},
        guest_status: statusSnap.val() || {}
    }));
}

function applyAdminFirebaseData(data, forceRender = false) {
    const bundle = data || {};
    applyMetaLabelColumns(bundle.meta_label_columns);
    tableSettingsCache = bundle.table_settings || {};
    guestStatusCache = bundle.guest_status || {};

    if (csvImportInProgress) return;
    if (!forceRender && !shouldAutoReloadAdminRows()) return;

    processFirebaseData(bundle.wedding_guests || {}, bundle.unassigned_guests || []);
}

function refreshAdminFromFirebase(forceRender = false) {
    return fetchAdminFirebaseBundle().then(bundle => {
        try {
            applyAdminFirebaseData(bundle, forceRender);
        } catch (err) {
            if (forceRender) showAdminLoadError(err);
            throw err;
        }
    });
}

function showAdminLoadError(err) {
    console.error('Firebase 載入失敗:', err);
    if (!tbody) return;
    const detail = err?.message ? `：${err.message}` : '';
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500 font-bold">❌ 數據載入失敗${detail}<br><button type="button" onclick="loadFirebaseData(true)" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold">🔄 重試</button></td></tr>`;
}

function loadFirebaseData(forceRender = false) {
    if (!tbody) return Promise.resolve();
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400 font-bold">⏳ 正在從 Firebase 載入名單數據...</td></tr>`;

    return refreshAdminFromFirebase(forceRender).catch(err => {
        showAdminLoadError(err);
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
    const { successMessage = null, successAutoDismissMs = null, reloadAfterSave = true } = options;
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
        const useToast = successMessage && successAutoDismissMs && typeof showAdminToast === 'function';
        if (successMessage) {
            if (useToast) showAdminToast(successMessage, successAutoDismissMs);
            else alert(successMessage);
        }
        if (reloadAfterSave) {
            const reloadDelay = useToast ? 80 : 0;
            return new Promise(resolve => setTimeout(resolve, reloadDelay)).then(() => loadFirebaseData(true));
        }
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

function emptyAllGuests() {
    if (typeof closeSettingsMenu === 'function') closeSettingsMenu();
    if (!localGuestsList.length) {
        if (typeof showAdminToast === 'function') showAdminToast('目前沒有賓客可清空', 2000);
        return;
    }
    const count = localGuestsList.length;
    const ok = confirm(`確定要清空所有賓客嗎？\n\n將移除 ${count} 位賓客，需按「儲存變更」才會同步到 Firebase。`);
    if (!ok) return;
    localGuestsList = [];
    renderDOMRows();
    markAdminDirty();
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
    const seatReleased = /已釋放|released/i.test(seatRaw);
    const tableNum = parseInt(tableRaw, 10);
    const seatNum = parseInt(seatRaw, 10);
    const hasTable = tableRaw !== '' && !isNaN(tableNum) && tableNum >= 1;
    const hasSeat = !seatReleased && seatRaw !== '' && !isNaN(seatNum) && seatNum >= 1;

    return {
        name,
        side,
        table: hasTable ? tableNum : '',
        sort: hasTable ? (hasSeat ? seatNum : 1) : 99,
        group: normalizeTags(clean(colMap.tags)),
        seatReleased
    };
}

function diffGuestPlacement(before, after) {
    const changes = [];
    const beforeTable = before.table === '' || before.table == null ? '未分配' : `第 ${before.table} 桌`;
    const afterTable = after.table === '' || after.table == null ? '未分配' : `第 ${after.table} 桌`;
    if (String(before.table) !== String(after.table)) {
        changes.push(`枱位 ${beforeTable} → ${afterTable}`);
    }
    const beforeSeat = before.isCanceled ? '已釋放' : String(before.sort || 1);
    const afterSeat = after.isCanceled ? '已釋放' : String(after.sort || 1);
    if (before.table && after.table && beforeSeat !== afterSeat) {
        changes.push(`座位 ${beforeSeat} → ${afterSeat}`);
    }
    return changes;
}

function mergeImportedOverExisting(existing, incoming) {
    const merged = {
        ...existing,
        name: incoming.name,
        side: incoming.side,
        group: [...incoming.group]
    };

    if (existing.isCanceled && incoming.seatReleased) {
        merged.table = incoming.table !== '' && incoming.table != null ? incoming.table : existing.table;
        merged.sort = existing.preservedSort ?? existing.sort;
        merged.isCanceled = true;
        merged.preservedSort = existing.preservedSort ?? existing.sort;
    } else {
        merged.table = incoming.table;
        merged.sort = incoming.sort;
        merged.isCanceled = existing.isCanceled;
        merged.preservedSort = existing.preservedSort;
    }

    return merged;
}

function findDuplicateImportKeys(importedGuests) {
    const seen = new Map();
    const duplicates = [];
    importedGuests.forEach((guest, index) => {
        const key = guestIdentityKey(guest);
        if (seen.has(key)) {
            duplicates.push({
                row: index + 1,
                name: guest.name,
                side: guest.side,
                tags: formatGuestTagsLabel(guest.group)
            });
        } else {
            seen.set(key, index);
        }
    });
    return duplicates;
}

function buildCSVImportPlan(importedGuests, existingGuests, mode) {
    const existing = existingGuests.map(normalizeGuestForList);
    const importedRaw = importedGuests.map(normalizeGuestForList);
    const duplicates = findDuplicateImportKeys(importedRaw);
    const imported = dedupeImportedGuestsLastWins(importedRaw);
    const existingByKey = new Map();

    existing.forEach((guest) => {
        existingByKey.set(guestIdentityKey(guest), guest);
    });

    const importedKeys = new Set();
    const added = [];
    const updated = [];
    const unchanged = [];
    const resultByKey = new Map();

    if (mode === 'merge') {
        existing.forEach((guest) => {
            resultByKey.set(guestIdentityKey(guest), { ...guest });
        });
    }

    imported.forEach((incoming) => {
        const key = guestIdentityKey(incoming);
        importedKeys.add(key);
        const before = existingByKey.get(key);

        if (!before) {
            added.push(incoming);
            resultByKey.set(key, { ...incoming });
            return;
        }

        const merged = mergeImportedOverExisting(before, incoming);
        const changes = diffGuestPlacement(before, merged);
        if (changes.length) {
            updated.push({ before, after: merged, changes });
        } else {
            unchanged.push(merged);
        }
        resultByKey.set(key, merged);
    });

    const kept = mode === 'merge'
        ? existing.filter((guest) => !importedKeys.has(guestIdentityKey(guest)))
        : [];
    const removed = mode === 'replace'
        ? existing.filter((guest) => !importedKeys.has(guestIdentityKey(guest)))
        : [];

    const resultGuests = mode === 'replace'
        ? sortGuestsListByTableAndSeat(imported.map((guest) => ({ ...guest })))
        : sortGuestsListByTableAndSeat([...resultByKey.values()].map((guest) => ({ ...guest })));

    const assignedCount = resultGuests.filter((g) => g.table !== '' && g.table != null).length;

    return {
        mode,
        resultGuests,
        duplicates,
        preview: { added, updated, unchanged, kept, removed },
        stats: {
            csvTotal: imported.length,
            existingTotal: existing.length,
            resultTotal: resultGuests.length,
            added: added.length,
            updated: updated.length,
            unchanged: unchanged.length,
            kept: kept.length,
            removed: removed.length,
            assigned: assignedCount,
            unassigned: resultGuests.length - assignedCount
        }
    };
}

function parseCSVFileContent(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) {
        return { error: '❌ CSV 檔案是空的。' };
    }

    const headerParts = parseCSVLine(lines[0].trim());
    let colMap = buildCSVColumnMap(headerParts);
    const firstDataParts = lines.length > 1 ? parseCSVLine(lines[1].trim()) : [];

    if (colMap.name == null) {
        const looksLikeNewExport = firstDataParts.length >= 4
            && !isNaN(parseInt(firstDataParts[0], 10))
            && !isNaN(parseInt(firstDataParts[1], 10));
        if (looksLikeNewExport) {
            colMap = { seq: 0, table: 1, seat: 2, name: 3, side: 4, tags: 5 };
        } else {
            colMap = { name: 0, side: 1, tags: 2, table: 3 };
        }
    }

    const dataStartIndex = colMap.name != null && buildCSVColumnMap(headerParts).name != null ? 1 : 0;
    const importedGuests = [];

    for (let i = dataStartIndex; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i].trim());
        const guest = parseImportedGuestFromCSVRow(parts, colMap);
        if (guest) importedGuests.push(guest);
    }

    if (importedGuests.length === 0) {
        return {
            error: '❌ 未能讀取任何賓客資料，請確認 CSV 格式是否正確。\n\n預期表頭包含：桌號、座位、姓名（或舊版：姓名、分配桌次）'
        };
    }

    return { importedGuests };
}

function buildCSVImportSuccessMessage(plan) {
    const { stats, mode } = plan;
    const modeLabel = mode === 'merge' ? '合併匯入' : '完全取代';
    let message = `✅ 已${modeLabel}並同步 ${stats.resultTotal} 位賓客至 Firebase！\n\n`;
    message += `• CSV 讀取：${stats.csvTotal} 位\n`;
    message += `• 新增：${stats.added} 位\n`;
    message += `• 更新：${stats.updated} 位\n`;
    message += `• 不變：${stats.unchanged} 位\n`;
    if (mode === 'merge') {
        message += `• 保留（CSV 冇寫到）：${stats.kept} 位\n`;
    } else {
        message += `• 刪除（CSV 冇寫到）：${stats.removed} 位\n`;
    }
    message += `• 已分配枱位：${stats.assigned} 位\n`;
    message += `• 未分配：${stats.unassigned} 位\n\n畫布排位頁面亦會更新。`;
    return message;
}

function applyConfirmedCSVImport(plan) {
    csvImportInProgress = true;
    localGuestsList = plan.resultGuests;
    renderThead();
    renderDOMRows();
    refreshRowSequenceNumbersOnly();

    const assignedTables = plan.resultGuests.map((g) => g.table).filter((t) => t !== '' && t != null);
    const focusTable = assignedTables.length ? assignedTables[assignedTables.length - 1] : null;

    return saveAllToFirebase(getAdminSaveSuccessOptions({
        successMessage: buildCSVImportSuccessMessage(plan),
        reloadAfterSave: true
    })).then(() => {
        if (focusTable) scrollToTableInList(focusTable);
    }).finally(() => {
        csvImportInProgress = false;
        pendingCSVImportData = null;
    });
}

function importCSVAction() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const parsed = parseCSVFileContent(e.target.result);
        fileInput.value = '';

        if (parsed.error) {
            alert(parsed.error);
            return;
        }

        const existingGuests = typeof collectGuestsFromDOM === 'function'
            ? collectGuestsFromDOM()
            : localGuestsList;

        pendingCSVImportData = {
            fileName: file.name,
            importedGuests: parsed.importedGuests,
            existingGuests
        };

        openCSVImportPreviewDialog();
    };
    reader.onerror = function () {
        fileInput.value = '';
        pendingCSVImportData = null;
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
    return !active.closest('#custom-dialog-overlay, #delete-tag-dialog-overlay, #leave-page-dialog-overlay, #csv-import-dialog-overlay');
}

let adminRealtimeActive = false;
let adminSyncTimer = null;

function scheduleAdminRealtimeRefresh() {
    if (!adminRealtimeActive || csvImportInProgress) return;
    clearTimeout(adminSyncTimer);
    adminSyncTimer = setTimeout(() => {
        refreshAdminFromFirebase(false).catch(err => {
            console.error('Admin 即時同步失敗:', err);
            if (tbody && !tbody.querySelector('.row-name-input')) {
                showAdminLoadError(err);
            }
        });
    }, 150);
}

function startAdminRealtimeSync() {
    ['wedding_guests', 'unassigned_guests', 'guest_status', 'meta_label_columns'].forEach((path) => {
        database.ref(path).on('value', scheduleAdminRealtimeRefresh);
    });
}

function enableAdminRealtimeSync() {
    adminRealtimeActive = true;
}