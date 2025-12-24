---
title: "GitHub Pages 發佈實務：穩定性與 CI/CD 避坑指南"
date: 2025-12-24 19:40:00 +0800
categories: [DevOps, GitHub]
tags: [github-pages, github-actions, jekyll, deployment, ci-cd]
description: 總結修復建構失敗的經驗，涵蓋檔名編碼、標題 ID 規範化等關鍵細節。
---

當網站從單機運行轉向 GitHub Actions 自動化部署時，許多平時不被注意的「小細節」（如檔名、編碼、連結）都會變成致命的 Blockers。這篇文章總結了我們修復 Sanbu Space 建構失敗的經驗。

---

## 1. 檔名編碼與系統差異之痛

### 問題：本地可以看，線上建構失敗
最常見的錯誤是使用「中文檔名」或「包含空格」的檔名。
*   **Linux vs Windows**：GitHub Actions 的運作環境通常是 Linux，而開發者可能在 Windows。兩者對 UTF-8 檔名的處理細微處不同。
*   **Git LFS/Encoding**：有時 Git 會把中文檔名轉義成 `%E4%BD%A0...`，導致 Jekyll 找不到檔案。

### 解決方案：強制規範
*   **全英文小寫**：檔名建議僅使用 `a-z`, `0-9` 和 `-`。
*   **命名範例**：`2025-12-24-physics-summary.md`。

---

## 2. 內部錨點 (Anchor Links) 的規範化

### 問題：目錄點了沒反應？
如果您使用中文標題（如 `## 物理科學史`），Jekyll 預設產生的 ID 是中文轉碼。這在不同平台（HackMD 轉 Jekyll）移轉時最容易出錯。

### 解決方案：明確定義 ID
在標題後方手動宣告英文 ID：
```markdown
## 物理科學史總覽
{: #physics-history-overview}
```
**這樣做的好處：**
1.  **穩定性**：網址列會顯示 `...#physics-history-overview` 而不是亂碼。
2.  **SEO 友好**：連結結構一目瞭然。
3.  **相容性**：`html-proofer` 工具在檢查連結時不容易因為編碼問題報錯。

---

## 3. GitHub Actions 的除錯心法

如果您看到 **Htmlproofer** 報錯：
1.  **看 LOG**：它會明確告訴您哪一個 `.html` 檔案裡的哪一個 `href` 指向了不存在的路徑。
2.  **檢查 Fragment**：報錯 `#foo not found` 通常代表標題的 ID 寫錯了，或者您忘記在標題加上手動 ID。
3.  **表格完整性**：Jekyll 對 Markdown 表格的要求很嚴，如果某一列的欄位數量不對 (Column count mismatch)，整個建構也會崩潰。

---

## 4. 總結：自動化部署的關鍵

自動化部署（CI/CD）雖然方便，但它像是一個「挑剔的排版員」。保持標題 ID 規範化、檔名英文小寫、表格結構嚴謹，是確保網站穩定更新的不二法門。

> [!IMPORTANT]
> **本地測試是最好的預防**。雖然線上 Actions 很強，但如果能在本地先跑過 `bundle exec jekyll serve`，就能攔截 90% 的渲染與路徑問題。
