# 網站設計與開發規範 (Website Design & Development Guidelines)

本文件旨在記錄網站的通用設計規範與慣例，以確保未來使用 Gemini CLI 或其他工具進行開發時，能維持高度的視覺與結構一致性。

---

## 1. 更新日誌 (Changelog)

更新日誌位於 `index.html` 的側邊欄，用於記錄網站的重大更新。

- **位置**: `index.html` 內的 `<aside id="changelog-sidebar">`
- **格式**: 每個項目都是一個 `<li>` 元素，包含：
    - 一個帶有 `log-date` class 的 `<p>` 標籤，內容為日期 (格式：YYYY年MM月DD日)。
    - 一個帶有 `log-entry` class 的 `<p>` 標籤，內容為更新紀要。

**範例程式碼：**
```html
<li>
    <p class="log-date">2025年10月19日</p>
    <p class="log-entry">新增「探究與實作」引導工具，並完成全站樣式統一。</p>
</li>
```

---

## 2. 頁面版面佈局 (Page Layouts)

網站主要包含兩種版面配置。

### 2.1. 首頁版面 (`index.html`)

- **結構**: 採用 `main-layout` CSS class，為一個 `grid` 佈局，左側為 `changelog-sidebar`，右側為 `content-area`。
- **用途**: 用於展示專案卡片與網站的整體概覽。

### 2.2. 內容頁面版面 (Content Pages)

內容頁面（如 `movable_pulley.html`, `inquiry_and_practice.html`）採用單欄式佈局，專注於內容呈現。

- **結構**:
    1.  頁面頂部固定一個「回首頁」按鈕。
    2.  所有內容應被一個 `content-wrapper` 或類似的 class 包裹，以實現最大寬度限制與置中。
- **「回首頁」按鈕**: 這是所有內容頁面的標準導覽元件。
    - **樣式**: 使用行內樣式 (inline style) 固定在左上角。
    - **範例程式碼**:
      ```html
      <a href="index.html" style="position: fixed; top: 20px; left: 20px; padding: 10px 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; z-index: 1000;">回首頁</a>
      ```

---

## 3. 視覺設計系統 (Visual Design System)

### 3.1. 色彩

#### 首頁 (深色/淺色主題)
- **深色主題 (預設)**:
  - `--bg-color: #121212` (背景)
  - `--surface-color: #1e1e1e` (卡片/表面)
  - `--primary-color: #00aaff` (主色)
  - `--text-primary: #e0e0e0` (主要文字)
  - `--text-secondary: #a0a0a0` (次要文字)
- **淺色主題**:
  - `--bg-color: #f0f2f5` (背景)
  - `--surface-color: #ffffff` (卡片/表面)
  - `--primary-color: #007bff` (主色)
  - `--text-primary: #212529` (主要文字)
  - `--text-secondary: #6c757d` (次要文字)

#### 內容頁面 (淺色主題)
- **背景**: `#f0f2f5`
- **表面**: `#ffffff`
- **主色**: `#007bff`
- **主要文字**: `#212529`
- **次要文字**: `#495057`

### 3.2. 字體

- **主要字體**: `Inter`, `Noto Sans TC`, `sans-serif`
- **引入方式**: 透過 Google Fonts 在 `<head>` 中引入。

### 3.3. 元件 (Components)

- **標題 (`h1`-`h5`)**: 應有左側邊框（`border-left`）作為視覺強調，顏色使用主色 (`--primary-color` 或 `#007bff`)。
- **按鈕 (`.action-button`)**: 頁面中的主要操作按鈕，應使用主色作為背景，提供清晰的懸停 (`hover`) 效果。
- **輸入框 (`textarea`)**: 應有圓角、清晰的邊框，並在焦點 (`focus`) 時顯示外發光效果以提升使用者體驗。
- **範例/提示框 (`.example-box`)**: 用於補充說明，應有不同的背景色 (`#e7f3ff`) 和邊框色 (`#cce5ff`)，以和主要內容區分。

---

## 4. 開發建議

- **CSS**: 盡量將通用樣式集中管理。對於特定頁面的樣式，可以寫在該頁面的 `<style>` 標籤中。
- **JavaScript**: 頁面邏輯應與全域腳本（如主題切換）分離。
- **一致性**: 在創建新頁面時，應優先參考「內容頁面版面」的結構與樣式，以確保使用者體驗的統一。

---

## 5. 數學公式渲染 (Math Rendering with KaTeX)

若要在獨立的 HTML 頁面中加入 LaTeX 數學公式渲染，請使用 KaTeX 函式庫。為避免腳本衝突和載入問題，請務必遵循以下特定的實作模式。

### 問題總結

不正確地載入或設定 KaTeX 會導致多種問題：
1.  **重複渲染**: 公式出現重複或錯亂 (例如 `\sqrt` 變成 `√{rac{...}}`)。這通常發生在有多個腳本試圖同時渲染數學公式時。
2.  **資源被封鎖**: 如果 CDN 連結的 `integrity` 安全雜湊值不正確，瀏覽器會基於安全考量封鎖腳本載入，導致渲染完全失敗。
3.  **脆弱的執行時機**: 依賴 `DOMContentLoaded` 或全域設定物件等方法，可能會產生「競爭條件」，導致渲染腳本在錯誤的時機執行。

### 正確的實作方式

為確保渲染穩定且正確，應在 `<head>` 中載入 KaTeX 腳本，並使用 `onload` 屬性來觸發渲染。這能保證渲染動作只在腳本載入完成後執行一次。

**不建議使用 `integrity` 雜湊值**，除非您能確保它們是完全正確且即時更新的，否則這很容易出錯。

**正確範例：**
```html
<head>
    ...
    <!-- KaTeX for LaTeX rendering -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body, { delimiters: [ {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false} ] });"></script>
    ...
</head>
```

此方法已在本專案的 `movable_pulley.html` 和 `Uncertainty.html` 中被驗證為可以正常運作。