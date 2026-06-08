// ==========================================
// 📌 2. Firebase 雙節點精準讀取
// ==========================================
function loadFirebaseData() {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400 font-bold">⏳ 正在從 Firebase 載入名單數據...</td></tr>`;
    
    Promise.all([
        database.ref('wedding_guests').once('value'),
        database.ref('unassigned_guests').once('value')
    ]).then(([snapshot1, snapshot2]) => {
        const weddingGuests = snapshot1.val() || {};
        const unassignedGuests = snapshot2.val() || [];

        // 避免喺打字或選單揀緊嘢時重新渲染打斷使用者
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
            processFirebaseData(weddingGuests, unassignedGuests);
        }
    }).catch(err => {
        console.error("Firebase 載入失敗:", err);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500 font-bold">❌ 數據載入失敗: ${err.message}</td></tr>`;
    });
}

// 解析 Firebase 數據並合併至 localGuestsList
function processFirebaseData(weddingGuests, unassignedGuests) {
    localGuestsList = [];

    // 1. 處理已分配桌次賓客
    Object.keys(weddingGuests).forEach(tableNum => {
        const list = weddingGuests[tableNum];
        if (Array.isArray(list)) {
            list.forEach(guest => {
                if (guest && guest.name) {
                    localGuestsList.push({
                        name: guest.name,
                        side: guest.side || '男方',
                        group: guest.group || '未分類',
                        table: parseInt(tableNum), 
                        sort: guest.sort || 1
                    });
                }
            });
        }
    });

    // 2. 處理未分配賓客 (unassigned)
    if (Array.isArray(unassignedGuests)) {
        unassignedGuests.forEach(guest => {
            if (guest && guest.name) {
                localGuestsList.push({
                    name: guest.name,
                    side: guest.side || '男方',
                    group: guest.group || '未分類',
                    table: '', 
                    sort: 99
                });
            }
        });
    }

    if (localGuestsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400 font-bold">🎉 目前名單內沒有任何賓客，請點右上角「新增賓客」開始建立。</td></tr>`;
        return;
    }

    renderDOMRows(); // 呼叫 UI 模組進行渲染
}

// ==========================================
// 📌 3. 收集 DOM 數據並儲存回 Firebase 雙節點
// ==========================================
function saveAllToFirebase() {
    const rows = tbody.querySelectorAll('tr');
    let newWeddingGuests = {};   
    let newUnassignedGuests = [];

    rows.forEach((row) => {
        const inputs = row.querySelectorAll('input');
        const selects = row.querySelectorAll('select');

        if (inputs.length < 2 || selects.length < 2) return;

        const gTableRaw = inputs[0].value.trim(); 
        const gName = inputs[1].value.trim();
        const gSide = selects[0].value;
        const gGroup = selects[1].value;

        if (!gName) return; 

        if (gTableRaw === "" || isNaN(gTableRaw)) {
            newUnassignedGuests.push({
                name: gName,
                side: gSide,
                group: gGroup,
                sort: 99
            });
        } else {
            const targetTable = parseInt(gTableRaw);
            if (!newWeddingGuests[targetTable]) {
                newWeddingGuests[targetTable] = [];
            }
            const currentSeatCount = newWeddingGuests[targetTable].length + 1;
            newWeddingGuests[targetTable].push({
                name: gName,
                side: gSide,
                group: gGroup,
                sort: currentSeatCount 
            });
        }
    });

    Promise.all([
        database.ref('wedding_guests').set(newWeddingGuests),
        database.ref('unassigned_guests').set(newUnassignedGuests)
    ]).then(() => {
        alert("✨ 【數據同步成功】！\n數據已完美同步至排位畫布。");
        loadFirebaseData();
    }).catch(err => {
        alert("❌ 儲存失敗: " + err.message);
    });
}

// ==========================================
// 📌 4. CSV 匯出與匯入備份邏輯
// ==========================================
function exportToCSV() {
    if (localGuestsList.length === 0) { alert("目前沒有數據可導出！"); return; }
    let csvContent = "\uFEFF姓名,來源(男方/女方),群組,分配桌次\n";
    
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const selects = row.querySelectorAll('select');
        if(inputs.length >= 2 && selects.length >= 2) {
            const table = inputs[0].value.trim();
            const name = inputs[1].value.trim();
            const side = selects[0].value;
            const group = selects[1].value;
            if (name) {
                csvContent += `"${name}","${side}","${group}","${table}"\n`;
            }
        }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `wedding_guests_backup_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importCSVAction() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) { alert("請先選擇一個 CSV 檔案！"); return; }

    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split('\n');
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
                        name: name,
                        side: side,
                        group: group,
                        table: tableRaw !== "" ? parseInt(tableRaw) : ""
                    });
                }
            }
        }

        localGuestsList = importedGuests;
        renderDOMRows();
        toggleSidePanel();
        alert(`成功解析 ${importedGuests.length} 位賓客！確認無誤後請點擊「儲存變更」。`);
    };
    reader.readAsText(file, 'UTF-8');
}