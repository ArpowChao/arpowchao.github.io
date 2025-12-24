---
title: "Jekyll 主題樣式自定義：顏色與變數鎖定篇"
date: 2025-12-24 20:00:00 +0800
categories: [Programming, Jekyll]
tags: [jekyll, css, scss, chirpy, tutorial]
description: 在自定義 Jekyll 主題時，最常遇到的挫折就是樣式被鎖定。這篇文章教您如何透過 CSS 變數與權重控制來掌握網站色彩。
---

在自定義 Jekyll 主題（特別是 Chirpy）時，最常遇到的挫折就是「明明改了 CSS 但預覽沒變」，或者「重新整理後顏色又跳回預設值」。這篇文章將深入探討如何有效操控樣式系統。

---

## 1. 核心觀念：CSS 變數系統 (`--var`)

現代 Jekyll 主題大多使用 CSS 變數來管理顏色。這意義著您不應該去修改具體的 `.class { color: ... }`，而是應該覆蓋底層的變數。

### 重點變數參考
*   `--heading-color`: 控制所有標題 (H1~H6) 的顏色。
*   `--main-wrapper-bg`: 控制主要內容區塊的背景。
*   `--nav-link-color`: 側邊欄或導航欄的連結顏色。

---

## 2. 解決樣式被「鎖死」的經驗分享

### 情境：Chirpy 主題強制覆蓋了您的顏色
Chirpy 的 JS 會根據深淺色模式切換屬性，如果您只定義在 `:root`，往往會被 `[data-mode='light']` 等更具體的選擇器改回去。

### 必殺技：使用高權重選擇器
我們採用的解決方案是直接鎖定屬性選擇器：

```scss
/* 鎖定淺色模式下的標題顏色 */
[data-mode='light'] {
  --heading-color: #b79210; /* 金色系 */
  --nav-link-color: #004aad; /* 深藍色 */
}

/* 鎖定深色模式下的標題顏色 */
[data-mode='dark'] {
  --heading-color: #ffe082; /* 亮金色 */
}
```

> [!TIP]
> **為什麼有效？** 
> 因為 `[data-mode='xxx']` 屬性選擇器的權重高於單純的 `:root`。透過這種方式，您可以確保無論主題腳本如何切換，顏色都會固定在您設定的範圍內。

---

## 3. Premium 感的視覺進階：透明度與模糊

為了達成您要求的「Premium」質感，我們引入了「玻璃擬態」(Glassmorphism) 的設計：

### 背景模糊 (Backdrop Blur)
在摺疊區塊或是頂欄使用以下 CSS，能讓背景透出微光的質感：
```css
details {
  background: rgba(var(--details-bg-rgb), 0.7); /* 半透明背景 */
  backdrop-filter: blur(8px); /* 關鍵：背景模糊 */
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

---

## 4. 除錯心法：利用開發者工具
如果顏色還是不對：
1.  在瀏覽器對目標元素按 **右鍵 > 檢查**。
2.  查看右側的 **Styles** 面板。
3.  尋找是否有被劃劃掉的線？有的話，看是哪個 `.class` 壓過了您。
4.  **這時請加強您的選擇器**，例如從 `.title` 改成 `article .title`。

> [!IMPORTANT]
> **盡量避免使用 `!important`**。雖然它很快，但會讓未來的維護變得很困難。優先使用增加選擇器具體性 (Specificity) 或覆蓋 CSS 變數的做法。
