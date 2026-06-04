// Firebase 設定 (與 index 一致)
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const jsonTextarea = document.getElementById('json-textarea');
let currentRawData = {};

// 監聽整個 Database 節點
database.ref().on('value', (snapshot) => {
    currentRawData = snapshot.val() || {};
    
    // 如果 Firebase 還沒有任何節點，幫忙初始化結構
    if (!currentRawData.wedding_guests) currentRawData.wedding_guests = {};
    if (!currentRawData.guest_status) currentRawData.guest_status = {};

    // 將 JSON 物件轉化為排版好、有縮排（4格空位）的字串放入 Textarea
    // 只有在使用者沒有 focus 在裏面時才主動更新，避免打字打到一半被刷走
    if (document.activeElement !== jsonTextarea) {
        jsonTextarea.value = JSON.stringify(currentRawData, null, 4);
    }
});

// 一鍵複製功能
function copyJSON() {
    jsonTextarea.select();
    document.execCommand('copy');
    alert('📋 JSON 數據已成功複製到剪貼簿！');
}

// 儲存並覆蓋 Firebase 功能 (防呆驗證)
function saveJSONToFirebase() {
    const rawValue = jsonTextarea.value.trim();
    
    if (!rawValue) {
        alert("❌ 錯誤：不能儲存空的數據！");
        return;
    }

    try {
        // 第一關：檢查是否符合 JSON 語法格式
        const parsedData = JSON.parse(rawValue);

        // 第二關：防呆，確保關鍵節點沒有被意外抹煞
        if (!parsedData.hasOwnProperty('wedding_guests')) {
            alert("❌ 儲存失敗：JSON 結構中缺少了必要的 'wedding_guests' 欄位！");
            return;
        }

        // 確認提示
        if (confirm("🚨 警告！此操作會直接修改或覆蓋整個 Firebase 資料庫，前台工作人員的數據會立刻同步。確定要儲存嗎？")) {
            database.ref().set(parsedData)
                .then(() => {
                    alert("✅ 成功！Firebase 數據已即時同步更新。");
                })
                .catch((error) => {
                    alert("❌ 寫入 Firebase 失敗: " + error.message);
                });
        }

    } catch (e) {
        // JSON 格式錯誤提示（例如少咗逗號、括號不對稱等）
        alert("❌ JSON 格式有語法錯誤，請檢查！\n錯誤訊息: " + e.message);
    }
}
