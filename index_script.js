// Firebase 設定
const firebaseConfig = {
    databaseURL: "https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app/" 
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const FLOOR_GRID_COLS = 4;
const TABLE_PLATE_CENTER = 210;
const EMPTY_FLOOR_ROW = ['.', '.', '.', '.'];

let dbData = {};
let statusState = {};
let currentFloorLayoutJson = '';
const floorPlan = document.getElementById('floor-plan');

function normalizeGuestTags(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(t => String(t).trim()).filter(t => t && t !== '未分類');
    const s = String(val).trim();
    if (!s || s === '未分類') return [];
    if (s.includes('|')) return s.split('|').map(t => t.trim()).filter(t => t && t !== '未分類');
    return [s];
}

function formatGuestTags(guest) {
    const tags = normalizeGuestTags(guest.group);
    return tags.length ? tags.join(' · ') : '未分類';
}

function guestTagSpans(guest) {
    const tags = normalizeGuestTags(guest.group);
    if (!tags.length) return `<span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700">未分類</span>`;
    return tags.map(t => `<span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700">${t}</span>`).join('');
}

function guestMatchesKeyword(guest, keyword) {
    const name = (guest.name || '').toLowerCase();
    const side = (guest.side || '').toLowerCase();
    const tags = normalizeGuestTags(guest.group);
    return name.includes(keyword) || side.includes(keyword) || tags.some(t => t.toLowerCase().includes(keyword));
}

function normalizeTableSettings(raw) {
    const normalized = {};
    if (!raw) return normalized;

    const entries = Array.isArray(raw)
        ? raw.map((settings, idx) => [String(idx), settings])
        : Object.entries(raw);

    entries.forEach(([key, settings]) => {
        const tableNum = parseInt(key, 10);
        if (!tableNum || tableNum < 1 || !settings || typeof settings !== 'object') return;
        if (settings.x == null || settings.y == null) return;
        normalized[String(tableNum)] = settings;
    });

    return normalized;
}

function resolveGridColumn(row, preferredCol) {
    if (row[preferredCol] === '.') return preferredCol;
    for (let d = 1; d < FLOOR_GRID_COLS; d++) {
        if (preferredCol - d >= 0 && row[preferredCol - d] === '.') return preferredCol - d;
        if (preferredCol + d < FLOOR_GRID_COLS && row[preferredCol + d] === '.') return preferredCol + d;
    }
    return -1;
}

// 依 seating 畫布 x/y 推算 4 欄靚仔格子（枱數不限）
function computeFloorLayoutFromTableSettings(settings) {
    const normalized = normalizeTableSettings(settings);
    const nums = Object.keys(normalized);
    if (!nums.length) return [EMPTY_FLOOR_ROW.slice()];

    const tables = nums.map(num => ({
        num: String(num),
        cx: normalized[num].x + TABLE_PLATE_CENTER,
        cy: normalized[num].y + TABLE_PLATE_CENTER
    }));

    const allCx = tables.map(t => t.cx);
    const globalMinX = Math.min(...allCx);
    const globalMaxX = Math.max(...allCx);
    const globalSpan = Math.max(globalMaxX - globalMinX, 1);

    function xToColumn(cx) {
        return Math.min(
            FLOOR_GRID_COLS - 1,
            Math.max(0, Math.round(((cx - globalMinX) / globalSpan) * (FLOOR_GRID_COLS - 1)))
        );
    }

    tables.sort((a, b) => a.cy - b.cy || a.cx - b.cx);

    const rowThreshold = 320;
    const rowGroups = [];
    let bucket = [];
    let rowCenterY = null;

    tables.forEach(t => {
        if (rowCenterY === null || Math.abs(t.cy - rowCenterY) > rowThreshold) {
            if (bucket.length) rowGroups.push(bucket);
            bucket = [t];
            rowCenterY = t.cy;
        } else {
            bucket.push(t);
            rowCenterY = bucket.reduce((sum, item) => sum + item.cy, 0) / bucket.length;
        }
    });
    if (bucket.length) rowGroups.push(bucket);

    const layout = [];

    rowGroups.forEach(group => {
        const gridRow = EMPTY_FLOOR_ROW.slice();
        const overflow = [];

        group.sort((a, b) => a.cx - b.cx);
        group.forEach(t => {
            let col = resolveGridColumn(gridRow, xToColumn(t.cx));
            if (col >= 0) {
                gridRow[col] = t.num;
            } else {
                overflow.push(t);
            }
        });

        layout.push(gridRow);

        overflow.forEach(t => {
            const extraRow = EMPTY_FLOOR_ROW.slice();
            extraRow[xToColumn(t.cx)] = t.num;
            layout.push(extraRow);
        });
    });

    return layout.length ? layout : [EMPTY_FLOOR_ROW.slice()];
}

function renderFloorPlan(layout) {
    const grid = Array.isArray(layout) && layout.length ? layout : [EMPTY_FLOOR_ROW.slice()];
    floorPlan.innerHTML = '';
    grid.forEach(row => {
        row.forEach(cell => {
            const div = document.createElement('div');
            if (cell === '.') {
                div.className = 'h-20';
            } else {
                div.className = 'bg-white p-2 rounded-xl shadow-md border-2 border-gray-200 flex flex-col justify-between items-center h-24 cursor-pointer hover:border-red-400 transition active:scale-95';
                div.id = `table-card-${cell}`;
                div.setAttribute('onclick', `openModal('${cell}')`);
                div.innerHTML = `
                    <span class="text-sm font-bold text-gray-500">第 ${cell} 桌</span>
                    <div class="w-12 h-12 rounded-full border-4 border-gray-300 flex items-center justify-center text-xs font-black text-gray-400" id="table-circle-${cell}">0%</div>
                `;
            }
            floorPlan.appendChild(div);
        });
    });
}

renderFloorPlan([EMPTY_FLOOR_ROW.slice()]);

// Firebase 即時監聽 — 排位跟 table_settings 動態更新
database.ref().on('value', (snapshot) => {
    const root = snapshot.val() || {};
    dbData = root.wedding_guests || {};
    statusState = root.guest_status || {};

    const layout = computeFloorLayoutFromTableSettings(root.table_settings);
    const layoutJson = JSON.stringify(layout);
    if (layoutJson !== currentFloorLayoutJson) {
        currentFloorLayoutJson = layoutJson;
        renderFloorPlan(layout);
    }

    updateFloorPlanSummary();
    
    const currentTable = document.getElementById('guest-modal').getAttribute('data-current-table');
    if (currentTable) renderModalContent(currentTable);

    const keyword = document.getElementById('search-input').value;
    if (keyword.trim() !== '') handleSearch();
});

function updateFloorPlanSummary() {
    Object.keys(dbData).forEach(table => {
        const guests = dbData[table] || [];
        let arrivedCount = 0;
        let activeCount = 0;

        guests.forEach(guest => {
            const state = statusState[`${table}_${guest.name}`] || { arrived: '未到' };
            if (state.arrived !== '取消') {
                activeCount++;
                if (state.arrived === '已到') arrivedCount++;
            }
        });
        
        const percent = activeCount ? Math.round((arrivedCount / activeCount) * 100) : 0;
        const circle = document.getElementById(`table-circle-${table}`);
        const card = document.getElementById(`table-card-${table}`);
        
        if (circle && card) {
            circle.innerText = `${percent}%`;
            if (percent === 100 && activeCount > 0) {
                circle.className = "w-12 h-12 rounded-full border-4 border-green-500 bg-green-50 flex items-center justify-center text-xs font-black text-green-600";
                card.className = card.className.replace(/border-gray-200|border-orange-300/, 'border-green-500');
            } else if (percent > 0) {
                circle.className = "w-12 h-12 rounded-full border-4 border-orange-400 bg-orange-50 flex items-center justify-center text-xs font-black text-orange-500";
                card.className = card.className.replace(/border-gray-200|border-green-500/, 'border-orange-300');
            } else {
                circle.className = "w-12 h-12 rounded-full border-4 border-gray-300 bg-white flex items-center justify-center text-xs font-black text-gray-400";
                card.className = card.className.replace(/border-green-500|border-orange-300/, 'border-gray-200');
            }
        }
    });
}

function openModal(tableNum) {
    document.getElementById('guest-modal').classList.remove('hidden');
    document.getElementById('guest-modal').setAttribute('data-current-table', tableNum);
    renderModalContent(tableNum);
}

function closeModal() {
    document.getElementById('guest-modal').classList.add('hidden');
    document.getElementById('guest-modal').setAttribute('data-current-table', "");
}

function renderModalContent(tableNum) {
    const container = document.getElementById('modal-content');
    container.innerHTML = '';
    
    let guests = dbData[tableNum] || [];
    
    guests = [...guests].sort((a, b) => {
        const sortA = a.sort !== undefined ? parseInt(a.sort) : 999;
        const sortB = b.sort !== undefined ? parseInt(b.sort) : 999;
        return sortA - sortB;
    });
    
    guests.forEach((guest, index) => {
        const name = guest.name;
        const side = guest.side || "";
        const key = `${tableNum}_${name}`;
        
        let rawArrived = statusState[key]?.arrived;
        let currentArrivedStatus = '未到';
        if (rawArrived === true || rawArrived === '已到') currentArrivedStatus = '已到';
        else if (rawArrived === '取消') currentArrivedStatus = '取消';
        
        const currentGift = statusState[key]?.gift || '未交';
        const isJwsRow = name.includes("眷屬");

        const row = document.createElement('div');
        row.className = `p-2.5 rounded-lg border flex justify-between items-center gap-2 shadow-sm ${currentArrivedStatus === '取消' ? 'bg-red-50/50 opacity-50 line-through border-red-200' : isJwsRow ? 'bg-gray-100/70 border-dashed border-gray-300' : 'bg-gray-50 border-gray-200'}`;
        
        row.innerHTML = `
            <div class="flex flex-col flex-1 text-left">
                <span class="font-bold text-gray-800 ${isJwsRow ? 'text-gray-500 text-sm pl-3 italic' : ''}">${name}</span>
                <div class="flex gap-1 mt-1">
                    <span class="px-2 py-0.5 rounded text-xs font-bold ${side === '女方' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${side}</span>
                    ${guestTagSpans(guest)}
                </div>
            </div>
            <div class="flex gap-1 items-center">
                <button onclick="cycleArrivedStatus('${tableNum}', '${name}', '${currentArrivedStatus}')" class="px-2.5 py-2 text-xs font-black rounded border shadow-sm ${getArrivedStyle(currentArrivedStatus)}">
                    ${getArrivedLabel(currentArrivedStatus)}
                </button>
                <button onclick="cycleGift('${tableNum}', '${name}', '${currentGift}')" class="px-2.5 py-2 text-xs font-black rounded border shadow-sm ${getGiftStyle(currentGift)}">
                    ${getGiftLabel(currentGift)}
                </button>
            </div>
        `;
        container.appendChild(row);
    });

    renderTableFooterAndTitle(tableNum, guests);
}

function renderTableFooterAndTitle(tableNum, guests) {
    let currentSeatOccupied = 0;
    guests.forEach(guest => {
        const state = statusState[`${tableNum}_${guest.name}`] || { arrived: '未到' };
        if (state.arrived !== '取消') {
            currentSeatOccupied++;
        }
    });

    document.getElementById('modal-title').innerText = `第 ${tableNum} 桌賓客名單 (現坐 ${currentSeatOccupied}/12 位)`;

    const footerAction = document.getElementById('modal-footer-action');
    const contentContainer = document.getElementById('modal-content');

    if (currentSeatOccupied < 12) {
        footerAction.classList.remove('hidden');
        footerAction.innerHTML = `
            <button onclick="addNewGuestInline('${tableNum}')" class="w-full py-2.5 text-sm font-bold rounded-lg border-2 border-dashed border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition shadow-sm">
                + 填入此桌新賓客 / 臨時帶伴 (餘下 ${12 - currentSeatOccupied} 空位)
            </button>
        `;
    } else {
        footerAction.innerHTML = '';
        footerAction.classList.add('hidden');

        const lockRow = document.createElement('div');
        lockRow.className = "w-full text-center text-xs font-bold text-gray-400 bg-gray-200/50 py-2.5 rounded-lg border border-dashed border-gray-300 mt-2";
        lockRow.innerText = "🔒 此圍已滿 12 人 (如需加人，請先將其他賓客設為「取消」釋放座位)";
        contentContainer.appendChild(lockRow);
    }
}

function addNewGuestInline(tableNum) {
    const currentGuestsArray = dbData[tableNum] || [];
    const nextIndex = currentGuestsArray.length; 

    const newName = prompt("請輸入新賓客姓名 (若是眷屬，請遵循：主客姓名 眷屬 X):");
    if (!newName || newName.trim() === "") return;
    const side = prompt("男方 定 女方？", "男方");
    const group = prompt("屬於邊個分類？多個請用 | 分隔 (例如: 家人|LK)", "現場加座");
    
    database.ref(`wedding_guests/${tableNum}/${nextIndex}`).set({
        name: newName.trim(),
        side: side ? side.trim() : "男方",
        group: normalizeGuestTags(group ? group.trim() : "現場加座")
    });
}

function cycleArrivedStatus(table, name, currentStatus) {
    let sanitizedStatus = currentStatus;
    if (currentStatus === true || currentStatus === '已到') sanitizedStatus = '已到';
    else if (currentStatus === false || currentStatus === '未到') sanitizedStatus = '未到';

    const statusFlow = { '未到': '已到', '已到': '取消', '取消': '未到' };
    const nextStatus = statusFlow[sanitizedStatus] || '未到';
    database.ref(`guest_status/${table}_${name}/arrived`).set(nextStatus);
}

function getArrivedLabel(status) {
    if (status === '已到') return "🟢 已到";
    if (status === '取消') return "❌ 取消";
    return "⚪ 未到";
}

function getArrivedStyle(status) {
    if (status === '已到') return "bg-green-600 text-white border-green-700";
    if (status === '取消') return "bg-red-100 text-red-700 border-red-300";
    return "bg-gray-200 text-gray-700 border-gray-300";
}

function handleSearch() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search');
    const resultsContainer = document.getElementById('search-results');
    const keyword = input.value.trim().toLowerCase();

    if (keyword === '') {
        clearSearch();
        return;
    }

    clearBtn.classList.remove('hidden');
    resultsContainer.classList.remove('hidden');
    resultsContainer.innerHTML = '';

    let hasResults = false;

    Object.keys(dbData).forEach(tableNum => {
        const guests = dbData[tableNum] || [];
        guests.forEach(guest => {
            const name = guest.name;
            const side = guest.side || "";
            if (guestMatchesKeyword(guest, keyword)) {
                
                hasResults = true;
                const key = `${tableNum}_${name}`;
                
                let rawArrived = statusState[key]?.arrived;
                let currentArrivedStatus = '未到';
                if (rawArrived === true || rawArrived === '已到') currentArrivedStatus = '停到';
                if (rawArrived === true || rawArrived === '已到') currentArrivedStatus = '已到';
                else if (rawArrived === '取消') currentArrivedStatus = '取消';
                
                const currentGift = statusState[key]?.gift || '未交';
                
                const row = document.createElement('div');
                row.className = `p-2 rounded-lg flex justify-between items-center gap-2 border transition shadow-sm ${currentArrivedStatus === '取消' ? 'bg-red-50/40 opacity-50 line-through border-red-200' : 'bg-red-50 hover:bg-red-100 border-red-100'}`;
                row.innerHTML = `
                    <div class="flex flex-col text-left cursor-pointer flex-1" onclick="openModalAndHighlight('${tableNum}')">
                        <span class="font-bold text-gray-800">${name}</span>
                        <span class="text-xs text-red-700 font-medium mt-1">
                            第 ${tableNum} 桌 • 
                            <span class="px-1.5 py-0.5 rounded text-xs font-bold ${side === '女方' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${side}</span>
                            ${guestTagSpans(guest)}
                        </span>
                    </div>
                    <div class="flex gap-1 items-center">
                        <button onclick="cycleArrivedStatus('${tableNum}', '${name}', '${currentArrivedStatus}')" class="px-2 py-1 text-xs font-black rounded border ${getArrivedStyle(currentArrivedStatus)}">
                            ${getArrivedLabel(currentArrivedStatus)}
                        </button>
                        <button onclick="cycleGift('${tableNum}', '${name}', '${currentGift}')" class="px-2 py-1 text-xs font-black rounded border ${getGiftStyle(currentGift)}">
                            ${getGiftLabel(currentGift)}
                        </button>
                    </div>
                `;
                resultsContainer.appendChild(row);
            }
        });
    });

    if (!hasResults) {
        resultsContainer.innerHTML = '<p class="text-gray-400 text-sm py-2">找不到匹配的賓客或分類</p>';
    }
}

function cycleGift(table, name, currentStatus) {
    const stages = ['未交', '人情', '送金器', '電子人情'];
    let nextIndex = (stages.indexOf(currentStatus) + 1) % stages.length;
    database.ref(`guest_status/${table}_${name}/gift`).set(stages[nextIndex]);
}

function getGiftLabel(status) {
    if (status === '人情') return "✉️ 人情";
    if (status === '送金器') return "👑 金器";
    if (status === '電子人情') return "📱 電子人情";
    return "⚪ 禮金";
}

function getGiftStyle(status) {
    if (status !== '未交') {
        return "bg-red-600 text-white border-red-700";
    }
    return "bg-gray-200 text-gray-600 border-gray-300";
}

document.getElementById('guest-modal').addEventListener('click', function(e) {
    if(e.target === this) closeModal();
});

function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('clear-search').classList.add('hidden');
    document.getElementById('search-results').classList.add('hidden');
    document.getElementById('search-results').innerHTML = '';
}

function openModalAndHighlight(tableNum) {
    clearSearch();
    openModal(tableNum);
}

// ----------------------------------------------------
// 📌 前台：iPhone Safari 完美安全鎖死雙指縮放與 Double-tap 放大
// ----------------------------------------------------
(function() {
    let indexLastTouchEnd = 0;

    document.addEventListener('touchstart', function (event) {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('touchmove', function (event) {
        if (event.scale !== undefined && event.scale !== 1) {
            event.preventDefault();
        }
    }, { passive: false });

    document.addEventListener('gesturestart', function (event) {
        event.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', function (event) {
        const now = (new Date()).getTime();
        if (now - indexLastTouchEnd <= 300) {
            event.preventDefault();
        }
        indexLastTouchEnd = now;
    }, false);
})();

document.addEventListener('contextmenu', event => event.preventDefault());

document.addEventListener('keydown', event => {
    if (
        event.key === 'F12' ||
        (event.ctrlKey && event.shiftKey && (event.key === 'I' || event.key === 'C' || event.key === 'J')) ||
        (event.ctrlKey && event.key === 'u')
    ) {
        event.preventDefault();
    }
});
