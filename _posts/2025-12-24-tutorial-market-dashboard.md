---
title: "專案深度解析：如何實作一個「即時市場監控儀表板」"
date: 2025-12-24 19:30:00 +0800
categories: [Programming, JavaScript]
tags: [javascript, finance, api, stock-market, tutorial]
description: 拆解市場儀表板底層邏輯，學習如何處理金融 API、跨域 Proxy 與動態數據展示。
---

在 2025-11-13 的更新中，我們將原本的 Python (Pyodide) 版本升級到了高效的 Web 版本。這篇文章將帶您拆解這個 Web App 底層的程式碼邏輯，學習如何處理金融 API 與動態數據展示。

---

## 1. 數據獲取：Yahoo Finance API 的實戰應用

我們使用了 Yahoo Finance 的 `query1.finance.yahoo.com` 接口。這是一個非公開但極度穩定的 API。

### 核心代碼段
```javascript
async function fetchYahooData(ticker) {
    // 構造 API URL
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    
    // [重點] 跨域處理 (Proxy)
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    
    const response = await fetch(proxyUrl);
    const proxyData = await response.json();
    const data = JSON.parse(proxyData.contents);
    
    // 解析 JSON 結構並計算漲跌幅
    const meta = data.chart.result[0].meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    const changePercent = ((price - prevClose) / prevClose) * 100;

    return { price, changePercent };
}
```

### 關鍵教學點：為什麼要用 Proxy？
瀏覽器有 **CORS (跨來源資源共享)** 限制，直接請求 Yahoo 會被擋下。我們使用 `allorigins.win` 作為轉接中心，讓後端幫我們抓取數據再傳回前端，成功繞過限制。

---

## 2. 異步載入與進度回饋

金融數據量大時，同步載入會造成網頁卡死。我們使用了 `async/await` 搭配循環，並在 UI 上實時更新進度。

```javascript
for (const item of allTickers) {
    // 更新介面進度文字
    updateProgress(`⏳ 正在載入 ${item.ticker}...`);
    
    const data = await fetchYahooData(item.ticker);
    if (data) {
        allData.push({ ...item, ...data });
        // [技巧] 增量渲染：每抓到一條，表格就多出一行，使用者感受更流暢
        filterAndDisplay();
    }
    // [細節] 延遲請求：避免短時間發出幾十個請求被 API 鎖定 IP
    await new Promise(r => setTimeout(r, 50));
}
```

---

## 3. 動態 DOM 生成與過濾

儀表板採用了「分類顯示」的邏輯。我們不是寫死 HTML，而是根據 JSON 資料動態生成表格。

### 實作思路：
1.  **分組 (Grouping)**：使用一個 Object 將資料按 `category` 分組。
2.  **遍歷生成的表格**：針對每個組別創建 `<table>`。
3.  **條件樣式**：
    ```javascript
    // 根據漲跌自動切換顏色
    cell.className = "change " + (change >= 0 ? "positive" : "negative");
    ```

---

## 4. 總結：給開發者的建議

1.  **資料結構先行**：將所有 Ticker (代碼) 放在一個大的 Object 中維護，方便未來增刪標的而不用改動邏輯代碼。
2.  **處理邊界案例**：當 API 抓不到資料時（停牌或網路問題），一定要返回預設值（如 `N/A`），防止整個 App 崩潰。
3.  **UX 優化**：提供 CSV 匯出功能對專業投資者非常加分。

> [!TIP]
> **想挑戰更難的？** 您可以嘗試將數據存入 `localStorage`，這樣使用者重新整理網頁時，就不需要重新爬取所有資料，大幅提升載入速度！
