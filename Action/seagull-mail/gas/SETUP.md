# 5 分鐘串接 Google Apps Script 即時後端指南

接上 Google Apps Script（GAS）與 Google 試算表後，所有現場觀眾掃描 QR Code 寫出的信都會存入你的 Google Sheet，並在數秒內讓大螢幕飛出一隻閃亮的「`NEW!` 特快海鷗」。

---

## 步驟 1：建立 Google 試算表與貼入腳本
1. 前往 [Google 試算表](https://sheets.new) 建立一份新的試算表（例如命名為 `海風專題信箱留言`）。
2. 上方選單點選 **「擴充功能」→「Apps Script」**。
3. 將原有的程式碼清空，把 [Code.gs](./Code.gs) 的內容全部複製貼上並按 `Ctrl + S` 儲存。

## 步驟 2：初始化工作表
1. 在 Apps Script 上方工具列的函式下拉選單選擇 **`setupSheets`**，點擊 **「執行」**。
2. 第一次執行會跳出 Google 帳號權限視窗：點選 **「進階」→「前往…（不安全）」→「允許」**。
3. 回到試算表看，應該已自動建立好兩個分頁：
   - **`Messages`**：收集所有留言（可在 `G` 欄直接手動改成 `approved` / `pending` / `hidden`）。
   - **`Config`**：可隨時調整 `moderation_mode`、`max_length`、`cooldown_sec`、`banned_words`。

## 步驟 3：部署成網頁應用程式（Web App）
1. 回到 Apps Script，點選右上角 **「部署」→「新增部署」**。
2. 左側齒輪選擇 **「網頁應用程式（Web App）」**：
   - **執行身分**：選擇 **「我（你的帳號）」**
   - **誰可以存取**：務必選擇 **「所有人（Anyone）」**（這樣學生／來賓掃 QR Code 時**不用登入 Google 帳號**就能寫信）
3. 點擊「部署」，複製產生的 **網頁應用程式網址**（以 `https://script.google.com/macros/s/.../exec` 結尾）。

## 步驟 4：將網址接進網頁
以下兩種方法擇一即可：
- **方法 A（免改程式碼・現場即時測試用）**：
  打開大螢幕舞台頁（`Action/seagull-mail/index.html`），點擊右上角 **「展示模式（點此接 GAS）」** 徽章，貼上 `/exec` 網址按儲存；右下角 QR Code 也會自動把網址帶給掃碼的手機！
- **方法 B（寫死在設定檔・正式發布用）**：
  打開 [`../config.js`](../config.js)，把 `gasUrl: ''` 填入你的 `/exec` 網址並推上 GitHub Pages，所有裝置打開預設就是即時連線。

---

## 現場管理小撇步
- **課堂／即時模式（預設）**：`Config` 分頁中的 `moderation_mode` 設為 `instant`。觀眾送出後直接設為 `approved`，下一輪輪詢（預設 12 秒）就會衝進大螢幕。若遇到惡搞留言，直接把該列 `status` 改成 `hidden`，20 秒快取更新後即會消失。
- **公開活動先審後播模式**：將 `moderation_mode` 改成 `moderate`。新留言進試算表會標成 `pending`（不會馬上上大螢幕），助教或主持人確認無誤後在 `G` 欄下拉選成 `approved` 才會起飛！
- **修改完 `Code.gs` 記得要重新部署**：每次改完 GAS 程式，必須點「部署」→「管理部署」→ 編輯（鉛筆圖示）→ 版本選「建立新版本」才會生效。
