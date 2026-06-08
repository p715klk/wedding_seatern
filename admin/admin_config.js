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
let labelColumnsKeys = ['group']; 
let labelColumnsNames = ['群組/標籤 (可自訂)']; 
let categoriesByColumn = {
    'group': ['LK', '家人', '男方親戚', '女方親戚', '中學同學']
};

// UI 元素與實例快取
let tbody = null;
let scrollContainer = null;
let activeSelectElement = null; 
let activeColumnKey = null; 
let sortableInstance = null;