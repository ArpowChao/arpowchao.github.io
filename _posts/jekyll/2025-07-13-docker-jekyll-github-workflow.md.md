---
layout: post
title: "從零到專業：一個 GitHub Jekyll 網站的建立案例研究"
title_en: "From Zero to Pro: A Case Study on Setting Up a GitHub Jekyll Site"
date: 2025-07-13 21:00:00 +0800
categories: [Tech, Tutorial]
tags: [docker, vscode, jekyll, dev-environment, wsl, github]
---

### 引言 (Introduction)

在本地端設定 Jekyll 開發環境，尤其是在 Windows 系統上，常常是一場與 Ruby 版本、套件依賴奮鬥的惡夢。這篇文章將以一個真實案例為基礎，引導你一步步建立一個基於 Docker 與 VS Code Dev Containers 的專業開發環境，讓你從此告別「在我電腦上可以跑」的窘境，享受一個乾淨、隔離、可重複、且極度穩定的開發體驗。

> Setting up a local Jekyll development environment, especially on Windows, can often be a nightmare of wrestling with Ruby versions and dependency conflicts. This article, based on a real-world case study, will guide you step-by-step to build a professional development environment based on Docker and VS Code Dev Containers. This setup will help you escape the "it works on my machine" dilemma and enjoy a clean, isolated, reproducible, and incredibly stable development experience.

---

### 事前準備 (Prerequisites)

在開始之前，請確保你的電腦已經安裝好以下三樣神器：

1.  **Docker Desktop**: 我們所有魔法的基礎，負責管理容器。
2.  **Visual Studio Code (VS Code)**: 我們的主力編輯器。
3.  **Dev Containers 擴充功能**: 在 VS Code 擴充功能市集搜尋 `ms-vscode-remote.remote-containers` 並安裝，這是連結 VS Code 與 Docker 的橋樑。

> Before we begin, make sure you have these three essential tools installed:
>
> 1.  **Docker Desktop**: The foundation for all our magic, responsible for managing containers.
> 2.  **Visual Studio Code (VS Code)**: Our main code editor.
> 3.  **Dev Containers extension**: Search for `ms-vscode-remote.remote-containers` in the VS Code Marketplace and install it. This is the bridge connecting VS Code and Docker.

---

### 步驟一：定義你的開發環境 (`.devcontainer` 資料夾)

我們的核心理念是「**環境即程式碼 (Environment as Code)**」。我們將用兩個檔案來精確地定義我們的開發環境。請在你的 Jekyll 專案根目錄下，建立一個名為 `.devcontainer` 的資料夾。

> Our core philosophy is "Environment as Code." We will use two files to precisely define our development environment. In the root of your Jekyll project, create a folder named `.devcontainer`.

#### 1.1 建築藍圖 (`Dockerfile`)

在 `.devcontainer` 資料夾中，建立一個名為 `Dockerfile` 的檔案。這是我們開發環境的「建築藍圖」，它指示 Docker 如何從無到有建立一個包含所有必要工具的「小電腦」。

> In the `.devcontainer` folder, create a file named `Dockerfile`. This is the "blueprint" for our development environment, instructing Docker on how to build a "mini-computer" containing all the necessary tools from scratch.

```dockerfile
# Dockerfile

# Step 1: 選擇基礎作業系統與工具
# 我們從一個已經安裝好 Ruby 3.2 的官方 Debian (Bullseye) 映像檔開始。
# ---
# Step 1: Choose the base operating system and tools.
# We start from an official Debian (Bullseye) image that already has Ruby 3.2 installed.
FROM ruby:3.2-bullseye

# Step 2: 安裝額外的系統依賴
# Jekyll 主題 (如 Chirpy) 可能需要 Node.js 來處理 JavaScript，所以我們一併安裝。
# `apt-get update` 是更新套件列表，`&&` 串接指令，`--no-install-recommends` 避免安裝非必要的套件。
# ---
# Step 2: Install additional system dependencies.
# Jekyll themes (like Chirpy) may require Node.js to process JavaScript, so we install it as well.
# `apt-get update` refreshes the package list, `&&` chains commands, and `--no-install-recommends` avoids installing non-essential packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Step 3: 設定工作目錄
# 在容器內建立一個名為 /workspace 的資料夾，並將其設定為預設路徑。
# ---
# Step 3: Set the working directory.
# Create a folder named /workspace inside the container and set it as the default path.
WORKDIR /workspace

# Step 4: 安裝專案依賴 (Ruby Gems)
# 為了利用 Docker 的快取機制，我們先只複製 Gemfile 並安裝，
# 這樣未來如果只有文章內容變動，就無需重裝所有套件，能大幅加快重建速度。
# ---
# Step 4: Install project dependencies (Ruby Gems).
# To leverage Docker's caching mechanism, we first copy only the Gemfile and install.
# This way, if only post content changes in the future, we won't need to reinstall all gems, significantly speeding up rebuilds.
COPY Gemfile ./
RUN bundle install

# Step 5: 安裝專案依賴 (Node.js Packages)
# 同樣地，先處理 Node.js 的依賴。
# ---
# Step 5: Install project dependencies (Node.js Packages).
# Similarly, we handle Node.js dependencies first.
RUN if [ -f package.json ]; then \
    npm install; \
    fi

# Step 6: 複製整個專案
# 最後，將專案的所有其他檔案（文章、設定檔等）複製到工作目錄。
# ---
# Step 6: Copy the entire project.
# Finally, copy all other project files (posts, configs, etc.) into the working directory.
COPY . .
```

#### 1.2 總指揮 (`devcontainer.json`)

在 `.devcontainer` 資料夾中，建立另一個名為 `devcontainer.json` 的檔案。這是 VS Code 的「總指揮」，它會使用上面的 `Dockerfile`，並自動化整個設定流程。

> In the `.devcontainer` folder, create another file named `devcontainer.json`. This is the "conductor" for VS Code, which will use the `Dockerfile` above and automate the entire setup process.

```json
{
  "name": "Jekyll Dev Environment",
  "build": {
    "dockerfile": "Dockerfile",
    "context": ".."
  },
  "postCreateCommand": "if [ -f tools/init.sh ]; then bash tools/init.sh; fi",
  "customizations": {
    "vscode": {
      "extensions": [
        "Shopify.ruby-lsp",
        "sgarcial.vscode-liquid",
        "redhat.vscode-yaml",
        "esbenp.prettier-vscode",
        "yzhang.markdown-all-in-one",
        "eamodio.gitlens"
      ]
    }
  },
  "forwardPorts": [4000],
  "remoteUser": "root"
}
```

---

### 步驟二：定義你的網站專案

現在，環境的藍圖已經好了，我們來看看專案本身的核心設定檔，它們都應該放在**專案的根目錄**。

> Now that the environment blueprint is ready, let's look at the project's core configuration files, which should all be placed in the **project root directory**.

#### 2.1 Ruby 依賴 (`Gemfile`)

```ruby
# Gemfile
source "[https://rubygems.org](https://rubygems.org)"

# 範例：使用 Chirpy 主題
# Example: Using the Chirpy theme
gem "jekyll-theme-chirpy", "~> 7.3"

# 其他你需要的 Jekyll 外掛...
# Other Jekyll plugins you need...
# gem "jekyll-feed"
# gem "jekyll-seo-tag"
```

#### 2.2 Node.js 與快捷指令 (`package.json`)

```json
{
  "name": "my-jekyll-blog",
  "version": "1.0.0",
  "description": "My awesome blog",
  "scripts": {
    "dev": "bundle exec jekyll serve --host 0.0.0.0 --livereload",
    "sync": "git checkout main && git pull origin main && git checkout -",
    "save": "git add . && git commit",
    "push": "git push"
  },
  "author": "Your Name",
  "license": "ISC"
}
```

---

### 步驟三：啟動與日常使用

1.  **首次啟動**：用 VS Code 開啟你的專案，按下 `F1` 執行 `Dev Containers: Rebuild and Reopen in Container`。耐心等待幾分鐘，讓 Docker 完成所有建造工作。
2.  **日常開發**：
    - **啟動預覽**：在 VS Code 的終端機執行 `npm run dev`。
    - **版本控制**：使用 `npm run sync`, `npm run save`, `npm run push` 和 `git checkout -b <分支名>` 來管理你的工作流程。

> 1.  **First Launch**: Open your project in VS Code, press `F1`, and run `Dev Containers: Rebuild and Reopen in Container`. Wait patiently for a few minutes as Docker completes the build process.
> 2.  **Daily Development**:
>     - **Start Preview**: Run `npm run dev` in the VS Code terminal.
>     - **Version Control**: Use `npm run sync`, `npm run save`, `npm run push`, and `git checkout -b <branch-name>` to manage your workflow.

---

### 常見問題與解決方案 (Troubleshooting)

- **問題：** `code .` 指令無法啟動 VS Code 或打開了錯誤的程式 (例如 Cursor)。
- **解決方案：** 這是本機電腦的 PATH 環境變數衝突。最徹底的解決方法是手動編輯 Windows 的「系統環境變數」，找到 `Path` 變數，將 VS Code 的 `bin` 資料夾路徑（例如 `C:\Users\YourName\AppData\Local\Programs\Microsoft VS Code\bin`）**上移到列表最頂端**。

> - **Problem:** The `code .` command fails to start VS Code or opens the wrong application (e.g., Cursor).
> - **Solution:** This is a PATH environment variable conflict on your local machine. The most definitive solution is to manually edit the Windows "System Environment Variables." Find the `Path` variable and **move the path to VS Code's `bin` folder** (e.g., `C:\Users\YourName\AppData\Local\Programs\Microsoft VS Code\bin`) **to the very top of the list**.

- **問題：** 容器建立失敗，日誌顯示 `... file not found`。
- **解決方案：** 這通常是 Docker 的 Build Context（建置視野）問題。請確保你的 `devcontainer.json` 中設定了 `"context": ".."`，並且 `Dockerfile` 中的 `COPY` 指令使用的是相對於專案根目錄的路徑（例如 `COPY Gemfile ./` 而不是 `../Gemfile`）。

> - **Problem:** The container build fails with a `... file not found` error in the logs.
> - **Solution:** This is typically a Docker Build Context issue. Ensure that your `devcontainer.json` includes `"context": ".."` and that the `COPY` commands in your `Dockerfile` use paths relative to the project root (e.g., `COPY Gemfile ./`, not `../Gemfile`).

- **問題：** Dev Container 無法啟動，日誌顯示 `Could not connect to WSL`。
- **解決方案：** 這通常與 Docker Desktop 或 WSL (Windows Subsystem for Linux) 本身有關。
  1.  確認 Docker Desktop 已經正常啟動。
  2.  嘗試在 Windows PowerShell 中執行 `wsl --shutdown`，然後重啟 Docker Desktop。
  3.  檢查 Docker Desktop 的設定，確保它使用的是 WSL 2 後端。

> - **Problem:** The Dev Container fails to start, with logs showing `Could not connect to WSL`.
> - **Solution:** This is often related to Docker Desktop or WSL itself.
>   1.  Make sure Docker Desktop is running properly.
>   2.  Try running `wsl --shutdown` in Windows PowerShell, then restart Docker Desktop.
>   3.  Check your Docker Desktop settings to ensure it's using the WSL 2 backend.

---

### 結論 (Conclusion)

這套設置的精華在於：**設定過程的複雜，是為了換取未來每一天開發的簡單、高效與安心。** 你現在擁有了一套專業、可移植、不受本機環境污染的開發工作流程。現在，去盡情創作吧！

> The essence of this setup is: **The complexity of the setup process is exchanged for the simplicity, efficiency, and peace of mind of every future day of development.** You now have a professional, portable development workflow that is immune to local environment pollution. Now, go and create something amazing!
