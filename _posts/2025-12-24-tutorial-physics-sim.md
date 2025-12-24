---
title: "專案深度解析：物理互動模擬 APP 的設計與實作"
date: 2025-12-24 19:10:00 +0800
categories: [Programming, Physics]
tags: [javascript, canvas, physics, education, simulation, tutorial]
description: 探討如何利用 Web 技術（Canvas、KaTeX、JS Math）將抽象的物理概念轉化為直觀的互動體驗。
---

在 2025-12-19 發佈的系列文中，我們展示了多個物理模擬 APP。這篇文章將以《測量不確定度指南》為例，解釋如何用 Web 技術將抽象的科學概念轉化為直觀的互動體驗。

---

## 1. 視覺化核心：Canvas 常態分佈渲染

為了展示「標準差」的機率意義，我們使用 HTML5 Canvas 動態繪製鐘形曲線。

### 機率密度函數 (PDF) 實作
我們使用了常態分佈公式來計算曲線座標：
```javascript
function normalPDF(x, mu, sigma) {
    const sigma2 = Math.pow(sigma, 2);
    // 標準常態分佈公式
    return (1 / Math.sqrt(2 * Math.PI * sigma2)) * 
           Math.exp(-Math.pow(x - mu, 2) / (2 * sigma2));
}
```

### 動態區間著色
當使用者拖動滑桿時，程式會計算積分範圍（使用 `erf` 誤差函數）並將該區域著色：
```javascript
// 使用誤差函數計算平均值正負 k 倍標準差內的機率
function updateBellValues() {
    const k = parseFloat(sigmaSlider.value);
    const probability = erf(k / Math.sqrt(2));
    probValueSpan.textContent = (probability * 100).toFixed(1) + '%';
    drawBellChart(); // 重繪 Canvas
}
```

---

## 2. 數學公式的高級渲染：KaTeX

物理文章離不開複雜公式。我們選擇了 **KaTeX** 而非 MathJax，因為它具備更快的預渲染速度，這對於互動式頁面至關重要。

### 配置技巧
```html
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/auto-render.min.js" 
        onload="renderMathInElement(document.body, { 
            delimiters: [ {left: '$$', right: '$$', display: true} ] 
        });">
</script>
```
這讓您可以直接在 HTML 寫 `$ E=mc^2 $`，載入時會自動轉化為精美的數學排版。

---

## 3. CSS 技巧：純 CSS 刻度尺

不確定度的互動尺並不是圖片，而是利用 `repeating-linear-gradient` 實作的 CSS 刻度：

```css
.ruler-bg {
    background-image:
        linear-gradient(to right, #ccc 1px, transparent 1px), /* 細刻度 */
        linear-gradient(to right, #888 1px, transparent 1px); /* 主刻度 */
    background-size: 10% 100%, 100% 100%;
}
```

---

## 4. 總結：教學型 App 的開發邏輯

1.  **感官先行**：先讓使用者「動手操作」（如拖動尺、切換標準差），再給予理論數據。
2.  **數據準確性**：物理模擬的底層邏輯（如 `erf` 函數、`s/sqrt(n)`）必須嚴謹，教學才有意義。
3.  **輕量化**：這些 App 都是純前端實作，不依賴後端，這讓它們能在靜態網誌（Jekyll）中完美運行。

> [!IMPORTANT]
> **寫給開發者的筆記**：在處理物理運算時，請注意浮點數精密度問題。建議使用 `.toFixed()` 處理最後顯示的位數，以符合科學有效位數的規範。
