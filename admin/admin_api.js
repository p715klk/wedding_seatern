// ==========================================
// 📌 2. Firebase 雙節點精準讀取
// ==========================================
function loadFirebaseData() {
    tbody.innerHTML = `<tr><td class="text-center py-8 text-gray-400 font-bold">⏳ 正在從 Firebase 載入名單數據...</td></tr>`;
    
    // 同步拿取架構欄位配置
    database.ref('meta_label_columns').once('value').then(metaSnapshot => {
        const meta = metaSnapshot.val();
        if (meta && meta.keys && meta.names) {
            labelColumnsKeys = meta.keys;
            labelColumnsNames = meta.names;
            categoriesByColumn = meta.categories || { 'group': ['LK', '家人', '男方親戚', '女方親戚', '中學同學'] };
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
        tbody.innerHTML = `<tr><td class="text-center py-8 text-red-500 font-bold">❌ 數據載入失敗: ${err.message}</td></tr>`;
    });
}

// 解析 Firebase 數據並合併
function processFirebaseData(weddingGuests, unassignedGuests) {
    localGuestsList = [];

    // 1. 已分配
    Object.keys(weddingGuests).forEach(tableNum => {
        const list = weddingGuests[tableNum];
        if (Array.isArray(list)) {
            list.forEach(guest => {
                if (guest && guest.name) {
                    // 承接多重標籤
                    let dynamicLabels = {};
                    labelColumnsKeys.forEach(k => {
                        dynamicLabels[k] = guest[k] || '未分類';
                    });

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

    // 2. 未分配
    if (Array.isArray(unassignedGuests)) {
        unassignedGuests.forEach(guest => {
            if (guest && guest.name) {
                let dynamicLabels = {};
                labelColumnsKeys.forEach(k => {
                    dynamicLabels[k] = guest[k] || '未分類';
                });

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

    renderThead();
    renderDOMRows(); 
}

// ==========================================
// 📌 3. 收集多標籤 DOM 數據並儲存回 Firebase
// ==========================================
function saveAllToFirebase() {
    const rows = tbody.querySelectorAll('tr');
    let newWeddingGuests = {};   
    let newUnassignedGuests = [];

    // 先儲存動態欄位架構 meta 數據
    database.ref('meta_label_columns').set({
        keys: labelColumnsKeys,
        names: labelColumnsNames,
        categories: categoriesByColumn
    });

    rows.forEach((row) => {
        const inputs = row.querySelectorAll('input[type="text"], input[type="number"]');
        const selects = row.querySelectorAll('select');

        if (inputs.length < 2 || selects.length < 1) return;

        const gTableRaw = row.querySelector('.row-table-input').value.trim(); 
        const gName = row.querySelector('.row-name-input').value.trim();
        const gSide = row.querySelector('.row-side-select').value;

        if (!gName) return; 

        // 動態抓取這一列所有自訂擴充標籤嘅選取值
        let guestData = {
            name: gName,
            side: gSide
        };

        labelColumnsKeys.forEach((key, idx) => {
            const labelSelect = row.querySelector(`.row-label-select-${key}`);
            if (labelSelect) {
                guestData[key] = labelSelect.value;
            } else {
                guestData[key] = '未分類';
            }
        });

        if (gTableRaw === "" || isNaN(gTableRaw)) {
            guestData.sort = 99;
            newUnassignedGuests.push(guestData);
        } else {
            const targetTable = parseInt(gTableRaw);
            if (!newWeddingGuests[targetTable]) {
                newWeddingGuests[targetTable] = [];
            }
            guestData.sort = newWeddingGuests[targetTable].length + 1;
            newWeddingGuests[targetTable].push(guestData);
        }
    });

    Promise.all([
        database.ref('wedding_guests').set(newWeddingGuests),
        database.ref('unassigned_guests').set(newUnassignedGuests)
    ]).then(() => {
        alert("✨ 【動態多重標籤數據同步成功】！");
        loadFirebaseData();
    }).catch(err => {
        alert("❌ 儲存失敗: " + err.message);
    });
}

// ==========================================
// 📌 4. CSV 匯出邏輯 (自動適應未知長度嘅自訂標籤行)
// ==========================================
function exportToCSV() {
    if (localGuestsList.length === 0) { alert("目前沒有數據可導出！"); return; }
    
    // 動態組成 Header 行
    let headers = ["姓名", "來源(男方/女方)", "分配桌次"];
    labelColumnsNames.forEach(n => headers.push(n));
    let csvContent = "\uFEFF" + headers.join(",") + "\n";
    
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
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
    link.setAttribute("download", `wedding_multi_labels_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}