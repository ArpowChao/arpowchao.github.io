# 互動教學頁面：技術指令集教學

這份文件旨在說明我們共同建立的一系列互動式 HTML 頁面中所使用的核心網頁技術、語法與指令。希望能幫助您理解這些頁面的運作原理，並讓您未來可以輕鬆地進行修改與擴充。

---

## 一、核心技術：網頁三本柱

任何現代網頁都由以下三種技術構成，您可以把它們想像成蓋房子：

1.  **HTML5 (結構)**：如同房子的鋼筋骨架。它負責定義頁面的**結構和內容**，例如標題 (`<h1>`)、段落 (`<p>`)、按鈕 (`<button>`) 和畫布 (`<canvas>`)。

2.  **CSS3 (樣式)**：如同房子的裝潢與油漆。它負責定義頁面的**外觀和風格**，例如顏色、字體、邊距、排版（Flexbox、Grid）以及動畫效果。

3.  **JavaScript (互動)**：如同房子的水電管線與智慧家居系統。它負責頁面的**所有互動與動態功能**，是賦予頁面「生命力」的關鍵。

---

## 二、通用 JavaScript 指令解析

在所有互動頁面中，我們反覆使用了一些核心的 JavaScript 指令來操作頁面元素。

### 1. 獲取頁面元素

要讓 JavaScript 操作一個按鈕或一塊文字，首先要「抓到」它。最常用的方法是透過 `id`。

```javascript
// 透過元素的 id (例如 <button id="my-button">) 來獲取它
const myButton = document.getElementById('my-button');
```

### 2. 監聽使用者行為 (事件監聽)

抓到元素後，我們要告訴它「當使用者對你做某件事時，你要執行某個動作」。

```javascript
// 當 myButton 被點擊 (click) 時，執行名為 doSomething 的函式
myButton.addEventListener('click', doSomething);
```

我們用到的事件包括：
*   `click`：點擊事件 (用於按鈕)。
*   `input`：輸入事件 (用於滑桿 `range`)。
*   `mousedown` / `mousemove` / `mouseup`：滑鼠按下、移動、放開 (用於畫布拖曳)。
*   `DOMContentLoaded`：一個特殊的事件，表示整個 HTML 頁面都已經載入完成了，這時執行 JavaScript 最安全。

### 3. 改變頁面內容與樣式

在執行動作的函式中，我們可以改變元素的內容和外觀。

```javascript
function doSomething() {
    const infoBox = document.getElementById('info-box');

    // 改變文字內容
    infoBox.textContent = "新的資訊！";

    // 改變 CSS 樣式 (例如，將文字顏色變為紅色)
    infoBox.style.color = 'red';

    // 新增或移除 CSS class (常用於切換狀態，例如按鈕的 active 狀態)
    myButton.classList.add('active');
    myButton.classList.remove('disabled');
}
```

### 4. 製作流暢動畫的核心：`requestAnimationFrame`

在所有物理模擬中，我們使用 `requestAnimationFrame()` 來建立一個流暢的動畫循環。它會告訴瀏覽器：「嘿，在下一次重繪畫面之前，請執行這個函式。」

```javascript
function animate() {
    // 1. 更新物體的位置、速度等數據
    updatePhysics();

    // 2. 根據新的數據重新繪製整個畫布
    draw();

    // 3. 告訴瀏覽器，下一幀繼續執行 animate 函式
    requestAnimationFrame(animate);
}
```

---

## 三、Canvas 繪圖入門

`whiteboard.html`, `semiconductor.html`, `movable_pulley.html` 都使用了 `<canvas>` 元素來進行動態繪圖。

1.  **取得「畫筆」**：`getContext('2d')` 會回傳一個 2D 繪圖環境，我們可以把它想像成一支畫筆。
    ```javascript
    const canvas = document.getElementById('my-canvas');
    const ctx = canvas.getContext('2d');
    ```

2.  **常用繪圖指令**：
    *   `ctx.clearRect(x, y, width, height)`：清除一個矩形區域，用於在每一幀動畫開始時清空畫布。
    *   `ctx.fillRect(x, y, width, height)`：畫一個實心矩形 (用於繪製重物)。
    *   `ctx.arc(x, y, radius, startAngle, endAngle)`：畫一個圓弧 (用於繪製滑輪)。
    *   `ctx.beginPath()`：開始一個新的路徑。
    *   `ctx.moveTo(x, y)`：將畫筆移動到某個點。
    *   `ctx.lineTo(x, y)`：從目前點畫一條直線到新的點。
    *   `ctx.stroke()`：將剛剛畫的路徑實際描繪出來。

---

## 四、我們使用的外部函式庫 (Libraries)

為了快速實現複雜功能，我們引入了一些強大的外部 JavaScript 函式庫。

### 1. KaTeX (數學公式渲染)

*   **用途**：在 `Uncertainty.html`, `alpha.html`, `movable_pulley.html` 中，用於將 LaTeX 格式的數學語法渲染成精美的公式。
*   **運作方式**：它會自動尋找被 `$` 或 `$$` 符號包圍的文字，並將其轉換為數學排版。例如，`$a_1$` 會被渲染成 $a_1$。

### 2. Chart.js (圖表繪製)

*   **用途**：在 `random_sampler.html` 中，用於將統計數據視覺化，繪製成長條圖 (直方圖)。
*   **運作方式**：我們只需要提供數據的標籤 (`labels`) 和數值 (`data`) 陣列，它就能自動生成互動式的圖表。

### 3. GlowScript (3D 物理模擬)

*   **用途**：這是 `phy-vpython-baseball.html` 的核心。GlowScript 是一個能將 VPython (一個基於 Python 的 3D 程式設計環境) 程式碼轉換為 JavaScript，並在瀏覽器中運行的神奇工具。
*   **運作方式**：該檔案中的主要邏輯其實是 VPython 語法，GlowScript 函式庫負責解析並將其呈現在 3D 畫布上。

### 4. Tailwind CSS (CSS 樣式框架)

*   **用途**：在 `alpha.html` 和 `phy-olympic-wall-bar-move.html` 中使用。
*   **運作方式**：它提供了一系列「工具類 (utility classes)」，例如 `bg-blue-500`, `text-white`, `p-4` 等，讓開發者可以直接在 HTML 中快速組合出樣式，而不用寫太多的自訂 CSS。

---

## 總結

總體來說，我們的工作流程是：

1.  用 **HTML** 搭建頁面的基本骨架。
2.  用 **CSS** (或 Tailwind CSS) 美化頁面的外觀。
3.  用 **JavaScript** 獲取頁面元素，並透過**事件監聽**來回應使用者的操作。
4.  在需要動態繪圖的場景（如物理模擬），使用 **Canvas API**。
5.  在需要專業圖表或數學公式時，引入 **Chart.js** 或 **KaTeX** 這樣的外部函式庫來簡化工作。

希望這份文件對您有幫助！
