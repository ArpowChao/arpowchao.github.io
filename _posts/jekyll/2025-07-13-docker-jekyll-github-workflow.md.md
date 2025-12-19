---
layout: post
title: "手把手教學：從零到專業的 GitHub Jekyll 網站建置全紀錄"
date: 2025-12-19 12:00:00 +0800
categories: [Web Development, Tutorial]
tags: [jekyll, docker, beginner-guide]
description: 專為初學者設計的深度教學。從 Docker 容器環境建置、Jekyll 架構解析到語法實戰，一步步帶您了解現代化靜態網站的運作原理。
---

這篇文章不是為了展示成果，而是為了記錄**過程**。如果你覺得寫網頁很難，或者搞不懂什麼是「容器」、「靜態網站產生器」，這篇文章就是為你寫的。我經歷過同樣的困惑，所以我想把這一切拆解得更清楚。

## 第一部分：環境建置 (為什麼要用容器？)

在學習開發時，最令人崩潰的往往不是寫程式，而是「環境設定」。
*   「我的 Ruby 版本不對...」
*   「我的套件安裝失敗...」
*   「在 Windows 上跑不起來...」

為了解決這個問題，我使用了 **Docker** 和 **DevContainers**。簡單來說，就是把開發環境打包成一個「箱子」，無論你在什麼電腦上，打開箱子，裡面的工具都準備好了。

### 1. 核心檔案解析

#### `Dockerfile` (環境的食譜)
這個檔案告訴電腦如何「煮」出我們的開發環境。看看這個專案的設定：

```dockerfile
# 1. 選擇基底：我們使用 Ruby 3.2 版本的 Debian 系統
FROM ruby:3.2-bullseye

# 2. 安裝工具：Git, Node.js, npm
RUN apt-get update && apt-get install -y git nodejs npm

# 3. 安裝 GitHub CLI (讓我們能在終端機操作 GitHub)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg ... && apt-get install gh -y

# 4. 指定工作目錄：我們所有的程式碼都會放在這裡
WORKDIR /workspace

# 5. 安裝 Jekyll 必要的套件 (Gems)
COPY Gemfile ./
RUN bundle install
```

#### `.devcontainer/devcontainer.json` (VS Code 的設定檔)
這個檔案告訴 VS Code：「請用上面的 Dockerfile 來開啟這個專案，並且幫我也裝好這些擴充套件。」

```json
{
  "name": "Jekyll 開發環境",
  "build": { "dockerfile": "Dockerfile" },
  "customizations": {
    "vscode": {
      "extensions": [
        "Shopify.ruby-lsp",  // Ruby 語法提示
        "sgarcial.vscode-liquid" // Liquid 語法上色
      ]
    }
  }
}
```

### 2. 如何啟動？
只要您安裝了 Docker Desktop 和 VS Code，打開專案時右下角會跳出通知，點擊 **"Reopen in Container"**，一切就自動完成了。

---

## 第二部分：Jekyll 架構 vs 一般 HTML 網站

初學者最容易搞混的，就是 Jekyll 的檔案結構。

### 傳統 HTML 網站
以前我們寫網站，每一個頁面都是獨立的：
*   `index.html` (首頁：包含導航列、頁尾、內容)
*   `about.html` (關於：包含導航列、頁尾、內容)

**缺點**：如果我要改導航列的文字，我要打開所有檔案一個一個改，非常痛苦。

### Jekyll (靜態網站產生器) 架構
Jekyll 讓我們把「重複的部分」切開來。

```text
_layouts/       # 模版 (像是房屋的骨架)
  ├── default.html  # 定義了整個網站的 HTML 結構 (<html>...</html>)
  └── post.html     # 專門給文章用的模版
_includes/      # 小零件 (像是積木)
  ├── head.html     # 放 <head> 裡的東西
  ├── topbar.html   # 上方的導航列
  └── sidebar.html  # 側邊欄
_posts/         # 內容 (只寫文章，不管排版)
  └── 2025-12-19-demo.md
index.html      # 組合起來！
```

**運作原理**：
當您執行 `jekyll build` 時，Jekyll 會像拼圖一樣，把 `_layouts` + `_includes` + `_posts` 組合起來，**自動產生**出傳統的 HTML 檔案。

---

## 第三部分：語法入門 (Markdown 與 Liquid)

在 Jekyll 中，我們主要使用兩種語法。

### 1. Markdown (寫內容用)
這是一種讓您專注於寫作的語法。
*   `# 標題` = `<h1>標題</h1>`
*   `**粗體**` = `<strong>粗體</strong>`
*   `[連結](url)` = `<a href="url">連結</a>`

### 2. Liquid (寫邏輯用)
這就是 Jekyll 的「程式語言」，用大括號包起來。

*   **輸出變數** `{% raw %}{{ }}{% endraw %}`：
    ```html
    {% raw %}
    <h1>{{ page.title }}</h1>
    {% endraw %}
    <!-- 如果文章標題是 "Hello"，這裡就會變成 <h1>Hello</h1> -->
    ```

*   **邏輯控制** `{% raw %}{% %}{% endraw %}`：
    ```html
    {% raw %}
    {% if page.title == "Home" %}
      <p>歡迎回家！</p>
    {% else %}
      <p>這是內頁。</p>
    {% endif %}
    {% endraw %}
    ```

*   **迴圈** (最常用在導航列)：
    ```html
    {% raw %}
    <ul>
    {% for post in site.posts %}
      <li><a href="{{ post.url }}">{{ post.title }}</a></li>
    {% endfor %}
    </ul>
    {% endraw %}
    ```
    這段程式碼會自動把所有文章列出來，不用自己手寫！

---

## 第四部分：實戰操作 (常用指令)

在容器內的終端機 (Terminal)，我們使用以下指令來操作網站。

### 1. 預覽網站 (最常用)
```bash
bundle exec jekyll serve --host 0.0.0.0 --livereload
```
*   `bundle exec`: 確保使用專案指定的版本執行。
*   `jekyll serve`: 啟動網頁伺服器。
*   `--host 0.0.0.0`: 讓瀏覽器可以連線。
*   `--livereload`: 當您存檔時，瀏覽器會自動重新整理 (超實用！)。

### 2. 建立新文章
在 `_posts` 資料夾內建立檔案，檔名格式必須是：
`年-月-日-標題.md`
例如：`2025-12-19-my-first-post.md`

內容開頭必須包含 **Front Matter** (被三條線包住的區塊)：
```yaml
---
layout: post
title: "我的第一篇文章"
date: 2025-12-19 12:00:00 +0800
categories: [日記]
---
這裡開始寫內容...
```

### 3. 發布到 GitHub
```bash
git add .
git commit -m "新增文章"
git push
```
只要推送到 GitHub，GitHub Pages 就會自動幫您打包並發布更新。

## 結語

從 HTML 到 Jekyll，再到 Docker 環境，學習曲線確實存在。但一旦建置好這套流程，您就擁有了一個**可隨身攜帶的專業開發工廠**。希望這篇手把手的紀錄，能減少您摸索的時間！
