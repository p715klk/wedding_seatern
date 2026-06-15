# Wedding Seat 商業化路線圖

> 由「單一婚宴工具」變成「可賣俾多對新人／婚禮統籌」嘅 SaaS / 服務

**域名目標：** `https://theweddingseat.com/p/{slug}`（例如 `chen-wong_20260915`）

---

## 0. 第一步：Copy Project + 新 Firebase（你而家應該做嘅嘢）

> 你計劃：copy 呢個 project 去新 repo + 開新 Firebase project。以下係建議順序，**唔使買 server，唔使每個客戶開一個 GitHub repo**。

### 0.1 先搞清楚兩樣嘢放邊

| 放咩 | 放邊 | 備註 |
|------|------|------|
| **網站 code**（HTML/JS/CSS） | **一個** GitHub repo | 全部客戶共用；`git push` 一次，所有人用新版 |
| **客戶 project 資料**（賓客、枱位、新人名） | **Firebase RTDB** `tenants/{slug}/...` | 唔係 GitHub repo；買咗服務 = Firebase 加一個 tenant |

```
❌ 唔好：客戶 A → repo A、客戶 B → repo B（難維護）
✅ 要咁：一個 repo + 一個 Firebase → 用 URL slug 分客戶
```

### 0.2 Week 1 行動清單（按順序做）

#### Step 1 — Fork / Copy 專案

- [ ] Copy `wedding_seat` 去新 folder 或新 GitHub repo（例如 `theweddingseat-platform`）
- [ ] **保留舊 repo 做個人婚禮用**；新 repo 專做商業版，兩邊唔好混
- [ ] 刪走或 `.gitignore` 舊 Firebase 憑證／敏感資料
- [ ] 更新 README：標明呢個係 platform 版

#### Step 2 — 開新 Firebase Project

- [ ] [Firebase Console](https://console.firebase.google.com/) → Create project（例如 `theweddingseat-prod`）
- [ ] Region 選 **asia-southeast1**（同而家一致）
- [ ] 開 **Realtime Database**（唔係 Firestore）
- [ ] 開 **Authentication** → Email/Password（後台 login 用）
- [ ] 記低新 `databaseURL`，之後取代 4 個檔案入面寫死嘅舊 URL：
  - `index_script.js`
  - `admin/admin_config.js`
  - `admin/seating.js`
  - `admin/admin.js`（如有用）

#### Step 3 — 集中 Firebase config（做一次就得）

- [ ] 新增 `js/firebase_config.js`（或 `shared/firebase_config.js`），**只喺呢度**寫 `databaseURL`
- [ ] 所有頁面 `<script src="...firebase_config.js">` 引用佢
- [ ] 之後換環境（dev/prod）只改一個檔

#### Step 4 — 加 `tenant_bootstrap.js`（最關鍵一步）

- [ ] 新增 `js/tenant_bootstrap.js`，負責：
  - 從 URL 讀 `slug`（`/p/chen-wong_20260915` 或 local dev 用 `?slug=demo`）
  - 提供 `tenantRef('wedding_guests')` → 自動加 prefix `tenants/{slug}/`
  - 載入 `tenants/{slug}/meta`，檢查 `status`（active / expired）
- [ ] **本地開發**：暫時用 `?slug=demo` 或固定 `demo`，唔使即刻搞 SPA routing

#### Step 5 — 手動建立第一個測試 tenant

喺 Firebase Console 直接加（未寫 Super Admin 前）：

```json
// tenants/demo/meta
{
  "couple_names": "測試新人",
  "venue_name": "測試酒店",
  "venue_hall": "Grand Hall",
  "wedding_date": "2026-12-01",
  "theme_color": "#b91c1c",
  "status": "active",
  "slug": "demo"
}

// slugs/demo → "demo"（slug 查詢用，之後可改 UUID）
```

- [ ] 將而家 root 嘅 `wedding_guests`、`table_settings` 等 **搬入** `tenants/demo/`（可用 export/import 或 `scripts/migrate-to-tenant.js`）
- [ ] 改 frontend 全部 `database.ref('wedding_guests')` → 經 `tenantRef('wedding_guests')`

#### Step 6 — 動態 branding（快見效）

- [ ] `index.html` header 唔再寫死新人名／酒店；由 `meta` JS render
- [ ] 移除點名頁公開嘅「後台管理」連結（或改為要 login 先見）

#### Step 7 — Firebase Security Rules（基本版）

- [ ] RTDB Rules：未 login 只可以讀 `tenants/{slug}/meta` + 寫 `guest_status`（點名）
- [ ] 寫 `wedding_guests` / `table_settings` 要 Auth
- [ ] **測試**：用兩個 slug 確認 A 睇唔到 B 資料

#### Step 8 — Deploy 靜態站（無 server）

- [ ] Push 去 GitHub → 開 **GitHub Pages** 或 **Cloudflare Pages**（免費）
- [ ] 加 `404.html`（copy `index.html`）做 SPA fallback，令 `/p/demo` 唔會 404
- [ ] 買域名 `theweddingseat.com` → DNS CNAME 指向 Pages
- [ ] **GitHub Pro 唔急買**；免費 tier 夠做 MVP

#### Step 9 — 驗收第一個 milestone

- [ ] `https://theweddingseat.com/p/demo` 點名正常
- [ ] `/p/demo/admin` 後台改賓客 → 點名頁即時 sync
- [ ] 開第二個 slug `demo2`，確認資料完全隔離

### 0.3 第一步 **唔使做** 嘅嘢（避免分心）

| 暫時唔使 | 原因 |
|----------|------|
| Stripe 計費 | 未有第一個付費客戶 |
| 每客戶一個 GitHub repo | 完全唔需要 |
| 自己租 VPS / server | GitHub Pages + Firebase 夠 |
| Firebase Cloud Functions | 客少時手動喺 Console 開 tenant 就得 |
| 自訂 domain 以外嘅複雜 routing | 先搞掂 `?slug=demo`，再上 `/p/{slug}` |

### 0.4 建議本地開發順序（務實）

```
Phase 0a（1–2 天）  新 Firebase + 集中 config + 手動 tenants/demo 資料
Phase 0b（3–5 天）  tenant_bootstrap.js + 改晒所有 database.ref
Phase 0c（1–2 天）  meta 動態 header + 移除公開 admin link
Phase 0d（1 天）    Security Rules 基本版
Phase 0e（1 天）    GitHub Pages deploy + 404 fallback
Phase 0f（之後）    正式 /p/{slug} URL + 買 domain + Super Admin 頁
```

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
    │     ├── 點名頁：https://theweddingseat.com/p/chen-wong_20260915
    │     ├── 後台：https://theweddingseat.com/p/chen-wong_20260915/admin
    │     ├── 畫布：https://theweddingseat.com/p/chen-wong_20260915/seating
    │     └── 可改：新人名、酒店、枱數、標籤、平面圖等（存 Firebase，唔使 redeploy）
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

### 3.2 開新 Project（一鍵 provision）

開新 tenant 需要 **Admin 權限**（API key 唔可以放喺 browser）。**唔使自己租 server**，可以用 serverless：

| 階段 | 做法 | 你要做咩 |
|------|------|----------|
| **MVP（而家）** | Firebase Console 手動加 `tenants/{slug}` | 客少時夠用；WhatsApp 收錢後你手動開 |
| **早期** | Firebase Cloud Functions | 一個 function：`createTenant(slug, meta)` |
| **規模化** | Cloud Functions + Stripe webhook | 付款自動開 tenant + 發 email |

**傳統 Node server 係可選，唔係必須。**

**核心 API 清單（Cloud Functions 或日後 backend）：**

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
7. 回傳專屬 URL：https://theweddingseat.com/p/chen-wong_20260915
```

**有人買咗之後嘅實際 flow：**

```
1. 客戶付款（Stripe / 轉數 / 你手動開都得）
2. 你（或 webhook）喺 Firebase 建立 tenants/{slug}/meta + 空資料
3. 發俾客戶兩條 link：
   - 點名：https://theweddingseat.com/p/chen-wong_20260915
   - 後台：https://theweddingseat.com/p/chen-wong_20260915/admin
4. 客戶改資料 → 寫入 Firebase → 即時生效，唔使 redeploy
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
| 點名頁（公開／半公開） | `/p/chen-wong_20260915` | MC、帶位同事 |
| 後台 | `/p/chen-wong_20260915/admin` | 新人、統籌（要 login） |
| 畫布排位 | `/p/chen-wong_20260915/seating` | 統籌（要 login） |
| Super Admin | `/super` 或 `/super/tenants` | 只有你 |

**Slug 格式建議：**

| 格式 | 例子 | 備註 |
|------|------|------|
| ✅ 推薦 | `chen-wong_20260915` | 拼音 + 日期；短、易 share |
| ✅ 最安全 | `x7k2m9` | 隨機；頁面顯示名從 `meta.couple_names` 讀 |
| ⚠️ 慎用 | `陳大文_李小美_20260915` | 中文 URL 會變 `%E9%99%B3...`，好長 |
| ❌ 避免 | 只用姓名無日期 | 同名新人會撞 slug |

`slug` 喺 provision 時生成；`tenantId` 可用 UUID 放 DB，`slugs/{slug}` 做查詢索引。

**Frontend 讀 slug：**

```javascript
// pathname = /p/chen-wong_20260915/admin
const parts = window.location.pathname.split('/').filter(Boolean);
const slug = parts[1];                    // chen-wong_20260915
const page = parts[2] || 'checkin';       // checkin | admin | seating

// 本地 dev 暫用：?slug=demo
const devSlug = new URLSearchParams(location.search).get('slug');
```

**靜態 host 點 handle `/p/xxx`：** GitHub Pages / Cloudflare Pages 本身冇 server routing，要用 SPA fallback（見 §3.11）。

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

### 3.10 DevOps / 部署（無 server 方案）

| 項目 | 建議 | 成本 |
|------|------|------|
| **前端 host** | GitHub Pages 或 Cloudflare Pages | 免費 |
| **Code repo** | 一個 GitHub repo（唔係每客戶一個） | 免費；Pro 唔急買 |
| **資料庫** | Firebase RTDB（新 project） | Spark 免費起步；用量大先 Blaze |
| **域名** | `theweddingseat.com` | ~USD 10–15/年 |
| **開 tenant** | 初期手動；之後 Cloud Functions | Functions 用量少幾乎免費 |
| **CI** | GitHub Actions：`push main` → deploy | 免費 tier 夠 MVP |

Backend 同 frontend 分開 deploy；環境變數用 GitHub Secrets，**唔好 commit Firebase Admin key**。

### 3.11 Hosting、Link 同 GitHub（零 server 架構）

```
┌──────────────────────────────────────────────────────────┐
│  theweddingseat.com                                       │
│  DNS → GitHub Pages / Cloudflare Pages（免費、無 VPS）    │
│  一個 repo deploy 一次 → serve 全部 /p/* link             │
└────────────────────────────┬─────────────────────────────┘
                             │ 瀏覽器載入 JS
                             ▼
┌──────────────────────────────────────────────────────────┐
│  Firebase RTDB（新 project）                              │
│  tenants/chen-wong_20260915/wedding_guests/...          │
│  tenants/chen-wong_20260915/meta/...                      │
│  slugs/chen-wong_20260915 → tenantId                      │
│  Firebase Auth（後台 login）                              │
└──────────────────────────────────────────────────────────┘
```

**GitHub Pages SPA routing（`/p/xxx` 唔 404）：**

- 將 `index.html` copy 做 `404.html`；未知 path 會 fallback 載入 SPA，再由 JS parse slug
- 或改用 **Cloudflare Pages**：加 `_redirects` 檔：`/*  /index.html  200`

**域名設定：**

1. 買 `theweddingseat.com`
2. DNS：`www` CNAME → `yourusername.github.io`（GitHub Pages）
3. GitHub repo → Settings → Pages → Custom domain
4. Apex domain（無 www）用 Cloudflare DNS 會較易

**GitHub Pro 要唔要？**

| 功能 | 需要嗎 |
|------|--------|
| Private repo | 可選；public repo + Pages 已夠 |
| 更多 Actions minutes | MVP 免費版通常夠 |
| 同 `/p/{slug}` hosting 關係 | **唔大；唔使為呢個買 Pro** |

---

## 4. 建議實施階段

### Phase 0 — 新 Repo + 新 Firebase（1–2 週）← **你而家喺呢度**

- [ ] Copy project 去新 repo（同舊婚禮 repo 分開）
- [ ] 開新 Firebase project（asia-southeast1）
- [ ] 集中 `firebase_config.js`；換晒舊 `databaseURL`
- [ ] 加 `tenant_bootstrap.js` + `tenants/demo` 測試資料
- [ ] 改晒所有 `database.ref` 用 tenant path
- [ ] `meta` 動態 branding；移除公開 admin link
- [ ] 基本 Security Rules
- [ ] GitHub Pages deploy + `404.html` fallback

### Phase 1 — 可賣第一個客戶（4–6 週）

- [ ] 買域名 `theweddingseat.com` + 接 GitHub Pages
- [ ] 正式 `/p/{slug}` URL（唔再只靠 `?slug=demo`）
- [ ] Super Admin 最小頁：列表 + 手動「新增 Project」
- [ ] Firebase Auth + 後台 login
- [ ] 開第二個真實 slug 測試隔離

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
| 繼續用 Firebase？ | ✅ 是；copy 後開**新** Firebase project，同舊婚禮資料分開 |
| 要自己租 server 嗎？ | ❌ 唔使；GitHub Pages + Firebase 夠 MVP |
| 每個客戶一個 GitHub repo？ | ❌ 唔使；一個 repo + Firebase `tenants/{slug}` |
| 要唔要 GitHub Pro？ | 唔急；免費 tier 夠 deploy |
| 需唔需要重寫 frontend？ | 唔使；加 `tenant_bootstrap.js` 就得 |
| 一個 Firebase project 定多個？ | 平台用一個 + path 隔離；舊婚禮保留舊 project |
| Realtime 點名仲要快？ | 保留 RTDB；listen 範圍收窄到 `tenants/{slug}` |
| 開 tenant 點做？ | 初期 Firebase Console 手動；之後 Cloud Functions |

---

## 7. 零 Server 架構圖（推薦起步方案）

```
┌─────────────────┐                              ┌─────────────────┐
│  GitHub Repo    │  git push → GitHub Actions   │  GitHub Pages   │
│  （一個）        │ ───────────────────────────▶ │  theweddingseat │
│  HTML/JS/CSS    │                              │  .com/p/{slug}  │
└─────────────────┘                              └────────┬────────┘
                                                          │
┌─────────────────┐     手動 / Cloud Function          │ JS + Auth
│  Super Admin    │ ───────────────────────────▶         ▼
│  （你撳掣開 tenant）│                              ┌─────────────────┐
└─────────────────┘                              │  Firebase RTDB  │
                                                 │  tenants/…      │
                                                 └─────────────────┘
```

日後加 Stripe webhook → 同一個 Cloud Function 自動開 tenant，仍然唔使自己租 VPS。

---

## 8. Codebase 改動優先次序（對應 Phase 0）

1. **新 Firebase project** + 集中 `firebase_config.js`（取代 4 處寫死 URL）
2. **`tenant_bootstrap.js`** — 解析 slug、提供 `tenantRef()`
3. **Firebase 手動建 `tenants/demo`** — 搬現有資料入去
4. **改晒 `database.ref`** — `index_script.js`、`admin_api.js`、`seating.js`
5. **`meta` 動態 header** — 取代 `index.html` hardcode
6. **移除公開 admin link** + 基本 Security Rules
7. **GitHub Pages + `404.html`** — 本地先用 `?slug=demo` 開發
8. **Super Admin 頁** — Phase 1 先做最小版
9. **買 domain + `/p/{slug}`** — Phase 1
10. **Cloud Functions `createTenant`** — 有付費客戶後

---

## 9. 風險提醒

- **Firebase Rules 寫錯** → 客戶 A 睇到客戶 B 資料（致命）
- **無計費就開 tenant** → 免費用戶爆 quota
- **slug 太簡單** → 賓客名單被爬
- **無封存政策** → PDPO 風險
- **`database.ref().on('value')` 聽成個 DB** → 客戶多時慢同貴

---

*最後更新：2026-06-15（加 §0 第一步清單、§3.11 Hosting/GitHub、零 server 架構）*
