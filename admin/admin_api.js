// ==========================================
// 📌 2. Firebase 精準讀取與多重標籤解析
// ==========================================
function loadFirebaseData() {
    tbody.innerHTML = `<tr><td class="text-center py-8 text-gray-400 font-bold">⏳ 正在從 Firebase 載入名單數據...</td></tr>`;
    
    database.ref('meta_label_columns').once('value').then(metaSnapshot => {
        const meta = metaSnapshot.val();
        if (meta && meta.keys && meta.names) {
            labelColumnsKeys = meta.keys;
            labelColumnsNames = meta.names;
            categoriesByColumn = meta.categories || categoriesByColumn;
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

function processFirebaseData(weddingGuests, unassignedGuests) {
    localGuestsList = [];

    // 已分配桌次賓客
    Object.keys(weddingGuests).forEach(tableNum => {
        const list = weddingGuests[tableNum];
        if (Array.isArray(list)) {
            list.forEach(guest => {
                if (guest && guest.name) {
                    let dynamicLabels = {};
                    labelColumnsKeys.forEach(k => { dynamicLabels[k] = guest[k] || '未分類'; });
                    localGuestsList.push({
                        name: guest.name,
                        side: guest.side || '男方',
                        table: parseInt(tableNum), 
                        sort: guest.sort || 1,
                        ...dynamicLabels
                    });
                }
            });
        }
    });

    // 未分配賓客
    if (Array.isArray(unassignedGuests)) {
        unassignedGuests.forEach(guest => {
            if (guest && guest.name) {
                let dynamicLabels = {};
                labelColumnsKeys.forEach(k => { dynamicLabels[k] = guest[k] || '未分類'; });
                localGuestsList.push({
                    name: guest.name,
                    side: guest.side || '男方',
                    table: '', 
                    sort: 99,
                    ...dynamicLabels
                });
            }
        });
    }

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
        labelColumnsKeys.forEach(key => {
            const sel = row.querySelector(`.row-label-select-${key}`);
            guestData[key] = sel ? sel.value : '未分類';
        });

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
    let headers = ["姓名", "來源(男方/女方)", "分配桌次"];
    labelColumnsNames.forEach(n => headers.push(n));
    let csvContent = "\uFEFF" + headers.join(",") + "\n";
    
    tbody.querySelectorAll('tr').forEach(row => {
        const nameEl = row.querySelector('.row-name-input');
        if (!nameEl) return;
        const name = nameEl.value.trim();
        const table = row.querySelector('.row-table-input').value.trim();
        const side = row.querySelector('.row-side-select').value;

        if (name) {
            let rowCells = [`"${name}"`, `"${side}"`, `"${table}"`];
            labelColumnsKeys.forEach(key => {
                const sel = row.querySelector(`.row-label-select-${key}`);
                rowCells.push(`"${sel ? sel.value : ''}"`);
            });
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
                const group = parts[2] ? parts[2].replace(/"/g, '').trim() : '未分類';
                const tableRaw = parts[3] ? parts[3].replace(/"/g, '').trim() : '';

                if (name) {
                    importedGuests.push({
                        name: name, side: side, group: group,
                        table: tableRaw !== "" ? parseInt(tableRaw) : ""
                    });
                }
            }
        }
        localGuestsList = importedGuests;
        renderDOMRows();
        recalculateSortNumbersFromDOM();
    };
    reader.readAsText(file, 'UTF-8');
}