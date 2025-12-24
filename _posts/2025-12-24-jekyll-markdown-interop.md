---
title: "Jekyll 寫作進階：HTML 與 Markdown 的完美混用"
date: 2025-12-24 19:50:00 +0800
categories: [Programming, Jekyll]
tags: [jekyll, markdown, kramdown, html, tutorial]
description: 解決在 Jekyll 中使用 HTML 標籤（如 details）時，內部的 Markdown 語法失效的問題。
---

當您在 Jekyll 文章中使用 `<details>`、`<div>` 或 `<section>` 等原始 HTML 標籤時，常會發現裡面的 Markdown 語法（如粗體、清單、LaTeX）突然失效了。這是因為解析器 Kramdown 的運作邏輯所致。

---

## 1. 核心原理：解析器的「切割」行為

Kramdown 在掃描文件時，一旦遇到 HTML 標籤，它會自動將該區塊標記為 **"Raw HTML"**。在這種模式下，為了避免意外破壞 HTML 結構，它會停止嘗試尋找 Markdown 標記。

### 失效範例
```html
<details>
  * 這是一個列表嗎？ (解析器會回答：不，這只是純文字)
</details>
```

---

## 2. 解決方案：`markdown="1"` 的魔法

這是一個特殊的 Kramdown 屬性，用來告訴解析器：「即使我現在在 HTML 標籤裡，也請幫我處理裡面的內容」。

### 正確做法
```html
<details markdown="1">
  <summary>展開查看列表</summary>

  * 現在我是一個真正的列表了！
  * 甚至支援 `程式碼` 與 **粗體**。
</details>
```

---

## 3. 避坑三大守則

為了確保渲染 100% 成功，請務必遵守以下規範：

1.  **前後空格**：HTML 標籤與上方的段落、下方的內容之間，必須保留一個「完全空白的空行」。這有助於解析器識別區塊的邊界。
2.  **屬性位置**：`markdown="1"` 必須放在**起始標籤**內（例如 `<div markdown="1">`），而不是結束標籤。
3.  **縮進一致性**：HTML 標籤內部的內容，建議與標籤保持相同的縮進水平，或者不縮進，以避免被誤認為是代碼塊。

---

## 4. 為什麼這在 Jekyll 很重要？

在像 HackMD 這樣的現代編輯器中，背景通常會幫您進行預處理。但在 Jekyll 這種嚴謹的靜態網站生成器中，了解底層解析邏輯能讓您在排版複雜頁面（如總整理、長文章）時，擁有更強大的控制力。

> [!TIP]
> 如果您發現圖片無法顯示或表格跑掉，第一直覺請檢查：標籤有沒有加 `markdown="1"`？前後有沒有留空行？
