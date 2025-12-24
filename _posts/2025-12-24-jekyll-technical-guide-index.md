---
title: "Jekyll 技術專修：從入門到 Premium 🚀"
date: 2025-12-24 21:00:00 +0800
categories: [Programming, Tutorial]
tags: [jekyll, tutorial, web-development, python, devops]
description: 這是一套為 Sanbu Space 量身打造的技術叢書，總結了我們在優化、修復與美化過程中積累的所有精華。
---

這是一套為 Sanbu Space 量身打造的技術叢書，總結了我們在優化、修復與美化過程中積累的所有精華。我將其拆解為六篇專題文章，由淺入深帶您掌握 Jekyll 的進階控制：

---

## 🛠️ 系統優化與寫作指南

這部分教學如何「解鎖」Jekyll 的各種限制，讓您的寫作與設計更流暢：

### 📂 [專題一：顏色與樣式變數鎖定]({% post_url 2025-12-24-jekyll-style-system %})
*   **重點**：解決 CSS 改了沒反應、深淺色模式顏色跳回預設的問題。
*   **適合**：想要微調網站配色、增加玻璃擬態質感的時刻。

### 📂 [專題二：Markdown 與 HTML 渲染解鎖]({% post_url 2025-12-24-jekyll-markdown-interop %})
*   **重點**：深入解析 `markdown="1"` 屬性及其避坑守則。
*   **適合**：在文章中使用摺疊區塊、複雜排版卻發現格式亂掉時。

### 📂 [專題三：自動化部署與發佈穩定性]({% post_url 2025-12-24-github-pages-deployment %})
*   **重點**：規範檔名編碼、手動定義英文標題 ID 以防目錄失效。
*   **適合**：GitHub Actions 建構失敗 (Htmlproofer Error) 時的救命稻草。

---

## 🚀 深度專案複盤：從代碼到產品

這部分專門針對精選專案，進行了深入底層的「程式碼教學」，帶您了解功能實作細節：

### 📂 [【教學專刊一】市場儀表板：Web API 與異步渲染]({% post_url 2025-12-24-tutorial-market-dashboard %})
*   **技術點**：CORS 跨域 Bypass、Yahoo Finance 異步爬蟲、增量 DOM 渲染。

### 📂 [【教學專刊二】Python 螢幕工具：PyQt6 與系統底層整合]({% post_url 2025-12-24-tutorial-python-laser %})
*   **技術點**：Windows API 滑鼠穿透技術、動態尾跡 (Tail) 衰減演算法。

### 📂 [【教學專刊三】物理互動 APP：Canvas 繪圖與數值模擬]({% post_url 2025-12-24-tutorial-physics-sim %})
*   **技術點**：不確定度正態分佈 (Normal Distribution) 模擬、KaTeX 數學公式優化。

---

> [!TIP]
> **建議閱讀順序**：
> 如果您正準備寫新文章，請先看 **專題二**；如果您想改佈局美感，請看 **專題一**；如果推送到 GitHub 卻沒更新，請看 **專題三**。
