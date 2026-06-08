// ==========================================
// 📌 1. Firebase 初始化與全局狀態維護
// ==========================================
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 全局核心數據狀態
let localGuestsList = []; 

// 關鍵變更：將原本單一分類列表，改為二維陣列儲存，動態跟隨你開左幾多個標籤 Column 
let labelColumnsKeys = ['group']; // 預設只有 1 個標籤，隨意加後會變成 ['group', 'label2', 'label3'...]
let labelColumnsNames = ['標籤']; // 欄位顯示名稱，例如 ['標籤', '標籤 2', '標籤 3'...]

// 每個標籤欄位各自擁有嘅選單可選選項
let categoriesByColumn = {
    'group': ['LK', '家人', '男方親戚', '女方親戚', '中學同學']
};

// UI 元素快取與實例
let tbody = null;
let scrollContainer = null;
let activeSelectElement = null; 
let activeColumnKey = null; // 紀錄目前係邊個標籤欄加緊自訂選項
let sortableInstance = null;