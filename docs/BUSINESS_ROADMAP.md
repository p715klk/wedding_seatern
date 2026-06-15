# Wedding Seat 商業化路線圖

> 由「單一婚宴工具」變成「可賣俾多對新人／婚禮統籌」嘅 SaaS / 服務

---

## 1. 而家嘅現狀（基線）

| 項目 | 現況 | 商業化問題 |
|------|------|------------|
| 架構 | 靜態 HTML + JS，直接連 Firebase RTDB | 無 server-side 控制，難做多客戶 |
| 資料庫 | 單一 `databaseURL` 寫死喺 4 個檔案 | 所有客戶會共用同一個 DB |
| 資料結構 | Root 節點：`wedding_guests`、`table_settings`、`guest_status` 等 | 無 tenant / project 隔離 |
| 品牌 | `index.html` 寫死「Vanna&Michael」「EATON HOTEL」 | 每個客戶要改 code 先 |
| 權限 | 點名頁有直接連去 `admin/admin.html` | 任何人可改賓客名單 |
| 監聽 | `index_script.js` 用 `database.ref().on('value')` 聽成個 DB | 多 project 時效能同安全都有問題 |

**結論：** 產品功能已經有用，但係 **單租戶（single-tenant）原型**，未具備「賣服務」所需嘅隔離、配置、計費同營運能力。

---

## 2. 目標產品形態

```
你（平台營運者）
    │
    ├── Super Admin Portal（你專用）
    │     └── [一鍵建立新 Project] → 自動 provision DB + 預設資料 + 專屬 URL
    │
    ├── Customer A（新人 A）
    │     ├── 點名頁：https://a.yourdomain.com 或 /p/abc123
    │     ├── 後台：admin + seating（只有授權用戶可入）
    │     └── 可改：新人名、酒店、枱數、標籤、平面圖等
    │
    └── Customer B（新人 B）
          └── 完全獨立資料，互不可見
```

---

## 3. 必須做嘅核心工程（除咗 Auth 之外）

### 3.1 Multi-tenancy（多租戶隔離）— 最優先

三種常見做法：

| 方案 | 做法 | 優點 | 缺點 | 適合階段 |
|------|------|------|------|----------|
| **A. 每客戶一個 Firebase Project** | Backend 用 Firebase Admin SDK 開新 project | 隔離最強、規則簡單 | 管理成本高、Firebase 配額分散 | MVP / 客戶少（<50） |
| **B. 單一 Firebase，路徑隔離** | `tenants/{tenantId}/wedding_guests/...` | 一個 console 管理 | Security Rules 要寫得好嚴 | 中期規模 |
| **C. 搬去 Postgres（Supabase 等）** | Backend API + SQL | 查詢、報表、計費都方便 | 要重寫 realtime 層 | 長期 SaaS |

**建議：** MVP 用 **方案 B**（改動最少，沿用現有 RTDB realtime）；客戶量上去再考慮 C。

**資料結構建議：**

```json
{
  "tenants": {
    "{tenantId}": {
      "meta": {
        "couple_names": "陳大文 & 李小美",
        "venue_name": "帝景酒店",
        "venue_hall": "Maggie Hall",
        "wedding_date": "2026-09-15",
        "theme_color": "#b91c1c",
        "logo_url": "https://...",
        "status": "active",
        "plan": "standard",
        "created_at": 1718000000
      },
      "wedding_guests": { },
      "unassigned_guests": [ ],
      "table_settings": { },
      "floor_layout": [ ],
      "meta_label_columns": { },
      "guest_status": { }
    }
  }
}
```

而家所有 `database.ref('wedding_guests')` 要變成 `database.ref(\`tenants/${tenantId}/wedding_guests\`)`。

---

### 3.2 Backend API（一鍵開 project）

**一定要有 server**，唔可以只靠前端 Firebase，因為：

- 開新 tenant 需要 **Admin 權限**（API key 唔可以放喺 browser）
- 計費、停用帳號、備份都要 server 做
- Auth token 要同 tenant 綁定

**建議技術棧（擇一）：**

- Node.js + Express/Fastify + Firebase Admin SDK
- 或 Supabase Edge Functions + Postgres
- 或 Cloudflare Workers + D1

**核心 API 清單：**

| Endpoint | 用途 |
|----------|------|
| `POST /admin/tenants` | 建立新 project（你按掣） |
| `GET /admin/tenants` | 列出所有客戶 |
| `PATCH /admin/tenants/:id/meta` | 改新人、酒店、主題色等 |
| `POST /admin/tenants/:id/clone-template` | 從酒店模板複製枱位佈局 |
| `PATCH /admin/tenants/:id/status` | 停用 / 封存 |
| `GET /tenants/:slug` | 公開讀取 meta（點名頁用） |
| `POST /webhooks/stripe` | 付款成功後自動開 tenant |

**Provision 流程（一鍵建立）：**

```
1. 生成 tenantId + 短 slug（例如 chen-wong-2026）
2. 寫入 tenants/{id}/meta（預設值）
3. 寫入預設 table_settings（例如 10 枱空白佈局）
4. 寫入預設 meta_label_columns（標籤欄）
5. 建立 Firebase Auth 用戶（新人 / 統籌 email）
6. 發送 onboarding email（登入連結 + 教學）
7. 回傳專屬 URL：https://app.yourservice.com/p/chen-wong-2026
```

---

### 3.3 可配置資料層（Project Config）

而家寫死喺 HTML 嘅嘢，全部搬去 `tenants/{id}/meta`：

| 欄位 | 現況 | 改後 |
|------|------|------|
| 頁面 title | `index.html` 寫死 | 從 `meta.couple_names` 動態載入 |
| 副標題（酒店） | 寫死 EATON HOTEL | `meta.venue_name` + `meta.venue_hall` |
| 主題色 | CSS 紅色寫死 | `meta.theme_color` 或 preset theme |
| 預設標籤 | `admin_config.js` 寫死 LK、家人… | `meta_label_columns` per tenant |
| 每枱座位上限 | 全域常數 12 | 已有 `table_settings.max_seats`，保持 |
| 語言 | 繁中 | 可選 `meta.locale` |

前端改動：開頁時先讀 `meta`，再 render header；唔再 hardcode。

---

### 3.4 路由同 URL 策略

| 類型 | URL 範例 | 誰用 |
|------|----------|------|
| 點名頁（公開／半公開） | `/p/{slug}` | MC、帶位同事 |
| 後台 | `/p/{slug}/admin` | 新人、統籌 |
| 畫布排位 | `/p/{slug}/seating` | 統籌 |
| Super Admin | `/super/tenants` | 只有你 |

`slug` 由 backend 喺 provision 時生成；`tenantId` 用 UUID 放 DB 入面。

**可選升級：** 自訂 domain（`wedding.chen.com`）— 要 DNS + SSL 自動化，可以 Phase 3 先做。

---

### 3.5 Authorization

唔止「有 login」，要定 **角色（RBAC）**：

| 角色 | 權限 |
|------|------|
| `platform_admin` | 開/停 tenant、改 plan、睇所有客戶 |
| `tenant_owner` | 改 meta、賓客、排位、匯入 CSV |
| `tenant_editor` | 改賓客同排位，唔可以刪 project |
| `checkin_staff` | 只可以改 `guest_status`（點名） |
| `viewer` | 只讀（給家長睇進度） |

Firebase Security Rules 範例概念：

```
match /tenants/{tenantId}/wedding_guests {
  allow read: if isStaffOf(tenantId) || isCheckinStaff(tenantId);
  allow write: if isEditorOf(tenantId);
}
```

點名頁 **唔可以再顯示「後台管理」連結** 俾未登入用戶；改為 QR code 分開：一個俾帶位（只點名），一個俾統籌（full admin）。

---

### 3.6 計費同訂閱

| 項目 | 建議 |
|------|------|
| 計費模式 | 按場計費（一場婚宴一個 project）最合理 |
| 價格參考 | HK$800–3000/場，視乎功能（模板、支援、自訂 domain） |
| 技術 | Stripe（香港可用）+ webhook 開 tenant |
| 試用 | 14 天或 50 賓客上限免費 |
| 到期 | `meta.status = expired` → 點名頁顯示「已結束」，後台唯讀 |

**Lifecycle：**

```
trial → active → wedding_day → archived → (30天後) deleted
```

婚宴完咗要自動封存，避免無限儲存個人資料（PDPO 相關）。

---

### 3.7 營運同支援工具（Super Admin 要有）

你個 backend 除咗「開 project」，仲要有：

- **客戶列表**：姓名、婚期、狀態、賓客數、最後活動時間
- **一鍵進入客戶後台**（impersonate，要 audit log）
- **資料匯出**：幫客戶 backup CSV
- **錯誤監控**：Sentry 睇 frontend crash
- **用量儀表板**：Firebase 讀寫量、避免爆 quota
- **模板庫**：常見酒店枱位預設（已有 `floor_layout` 概念，可做成 template）

---

### 3.8 安全同合規（處理賓客 PII）

賓客名單係 **個人資料**，賣俾商業客戶要考慮：

| 項目 | 要做咩 |
|------|--------|
| 私隱政策 | 平台 DPA + 客戶使用條款 |
| 資料存放 | Firebase region 選 `asia-southeast1`（已用） |
| 資料保留 | 婚後 N 天自動刪除，可選讓客戶下載 backup |
| 存取記錄 | 邊個幾時改咗邊個賓客（audit log） |
| 公開連結 | slug 要夠隨機（唔好用 `chan-tai-man` 太易估） |

---

### 3.9 前端重構

而家每個客戶如果改 HTML 就要 redeploy。商業化應該：

```
一套 frontend codebase
    ↓
讀 URL 入面嘅 slug / tenantId
    ↓
動態載入該 tenant 嘅 meta + 資料
```

**要改嘅檔案（高層）：**

- `index_script.js`、`admin_config.js`、`seating.js` — 統一 tenant path
- `index.html` — header 改為 JS 動態 render
- 新增 `tenant_bootstrap.js` — 解析 slug、載入 config、處理 404/expired

Firebase config 可以共用一個 project，只改 path prefix。

---

### 3.10 DevOps / 部署

| 現況 | 目標 |
|------|------|
| 可能係靜態 host | 前端：Vercel / Cloudflare Pages |
| 無 CI | GitHub Actions：lint + test + deploy |
| 無環境分離 | `dev` / `staging` / `prod` 三套 Firebase |

Backend 同 frontend 分開 deploy；環境變數用 secret manager，唔好 commit API key。

---

## 4. 建議實施階段

### Phase 1 — 可賣第一個客戶（4–6 週）

- [ ] Backend：CRUD tenant + provision 預設資料
- [ ] 資料搬到 `tenants/{id}/...`
- [ ] Firebase Auth + 基本 login
- [ ] `meta` 動態 branding（新人、酒店）
- [ ] Super Admin 一頁：列表 + 「新增 Project」掣
- [ ] 點名頁移除公開 admin 連結

### Phase 2 — 可以規模化（6–10 週）

- [ ] Stripe 計費 + 自動開通
- [ ] RBAC 多角色
- [ ] 酒店枱位模板庫
- [ ] Onboarding email + 簡單教學頁
- [ ] 婚後自動封存

### Phase 3 — 專業 SaaS（之後）

- [ ] 自訂 domain
- [ ] 多語言
- [ ] 報表（到場率、禮金統計 export）
- [ ] 婚禮統籌 B2B 帳號（一個統籌管多場）
- [ ] 搬 Postgres（如需要複雜報表）

---

## 5. 產品包裝建議

| Plan | 內容 | 參考價 |
|------|------|--------|
| **Basic** | 點名 + 平面圖 + 200 賓客 | $988/場 |
| **Pro** | + 畫布排位 + CSV + 多標籤 | $1,688/場 |
| **Concierge** | + 幫手 setup + 酒店模板 | $2,888/場 |

可加 **B2B 渠道**：婚禮統籌公司帳號，佢哋自己開 project 俾新人，你收月費或分成。

---

## 6. 技術決策速查

| 問題 | 建議 |
|------|------|
| 繼續用 Firebase？ | MVP 可以；中期加 Backend API 包住 Admin 操作 |
| 需唔需要重寫 frontend？ | 唔使；加 tenant bootstrap 層就得 |
| 一個 Firebase project 定多個？ | 起步一個 + path 隔離；大客戶可升級獨立 project |
| Realtime 點名仲要快？ | 保留 RTDB；只收窄 listen 範圍到 `tenants/{id}` |
| 現有 `repair-firebase-data.js` | 變成 backend 嘅 migration / repair tool |

---

## 7. 最小可行 Backend 架構圖

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Super Admin UI │────▶│  Your Backend    │────▶│ Firebase RTDB   │
│  (React/Vue)    │     │  Node + Admin SDK│     │ tenants/{id}/…  │
└─────────────────┘     └────────┬─────────┘     └────────▲────────┘
                                 │                        │
┌─────────────────┐              │ Stripe webhook           │ realtime
│  Customer Pages │──────────────┘                          │
│  index/admin/   │  Auth token ───────────────────────────┘
│  seating        │  (Firebase Auth)
└─────────────────┘
```

---

## 8. Codebase 改動優先次序

1. **抽出 `tenant_bootstrap`** — 所有頁面共用，解析 slug
2. **統一 Firebase path** — 唔好再 `ref('wedding_guests')` 寫死 root
3. **新增 `project_meta` 節點** — 取代 HTML hardcode
4. **Backend provision script** — 手動 call API 開第一個測試 tenant
5. **Auth + 隱藏 admin 入口**
6. **Super Admin 最小 UI** — 一個 table + Create button 已夠試賣

---

## 9. 風險提醒

- **Firebase Rules 寫錯** → 客戶 A 睇到客戶 B 資料（致命）
- **無計費就開 tenant** → 免費用戶爆 quota
- **slug 太簡單** → 賓客名單被爬
- **無封存政策** → PDPO 風險
- **`database.ref().on('value')` 聽成個 DB** → 客戶多時慢同貴

---

*最後更新：2026-06-15*
