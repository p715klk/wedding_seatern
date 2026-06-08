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
const PRIMARY_TAG_KEY = 'group';

let labelColumnsKeys = ['group']; 
let labelColumnsNames = ['標籤 (可多選)']; 
let categoriesByColumn = {
    'group': ['LK', '家人', '男方親戚', '女方親戚', '中學同學']
};

function normalizeTags(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(t => String(t).trim()).filter(t => t && t !== '未分類');
    const s = String(val).trim();
    if (!s || s === '未分類') return [];
    if (s.includes('|')) return s.split('|').map(t => t.trim()).filter(t => t && t !== '未分類');
    return [s];
}

function mergeGuestLabelsToTags(guest, keys) {
    const tags = new Set();
    keys.forEach(k => normalizeTags(guest[k]).forEach(t => tags.add(t)));
    return [...tags];
}

// UI 元素與實例快取
let tbody = null;
let scrollContainer = null;
let activeSelectElement = null; 
let activeColumnKey = null; 
let sortableInstance = null;