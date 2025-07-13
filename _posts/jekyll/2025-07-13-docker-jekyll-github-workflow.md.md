---
layout: post
title: "從零到專業：一個 GitHub Jekyll 網站的建立案例研究"
title_en: "From Zero to Pro: A Case Study on Setting Up a GitHub Jekyll Site"
date: 2025-07-13 22:00:00 +0800
categories: [Tech, Tutorial]
tags: [docker, vscode, jekyll, dev-environment, wsl, github, cli]
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

#### 1.1 建築藍圖 (`Dockerfile`) - 包含 GitHub CLI

在 `.devcontainer` 資料夾中，建立一個名為 `Dockerfile` 的檔案。這是我們開發環境的「建築藍圖」，它指示 Docker 如何從無到有建立一個包含所有必要工具的「小電腦」。**這個版本新增了 GitHub CLI (`gh`) 的安裝步驟。**

> In the `.devcontainer` folder, create a file named `Dockerfile`. This is the "blueprint" for our development environment, instructing Docker on how to build a "mini-computer" containing all the necessary tools from scratch. **This version adds the installation step for the GitHub CLI (`gh`).**

```dockerfile
# Dockerfile

# Step 1: 選擇基礎作業系統與工具
FROM ruby:3.2-bullseye

# Step 2: 安裝額外的系統依賴
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# 【新增步驟】安裝 GitHub CLI (gh)
# 這是官方建議的安裝步驟，目的是將 GitHub 的軟體庫加入到我們的系統中
# ---
# [NEW STEP] Install GitHub CLI (gh)
# These are the official installation steps to add the GitHub repository to our system.
RUN curl -fsSL [https://cli.github.com/packages/githubcli-archive-keyring.gpg](https://cli.github.com/packages/githubcli-archive-keyring.gpg) | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
&& chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] [https://cli.github.com/packages](https://cli.github.com/packages) stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
&& apt-get update \
&& apt-get install gh -y

# Step 3: 設定工作目錄
WORKDIR /workspace

# Step 4: 安裝專案依賴 (Ruby Gems)
COPY Gemfile ./
RUN bundle install

# Step 5: 安裝專案依賴 (Node.js Packages)
RUN if [ -f package.json ]; then \
    npm install; \
    fi

# Step 6: 複製整個專案
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

#### 2.2 Node.js 與快捷指令 (`package.json`) - 包含一鍵發布

這個版本的 `package.json` 新增了 `"pr"` 指令，讓你可以從終端機一鍵建立 Pull Request。

> This version of `package.json` adds the `"pr"` script, allowing you to create a Pull Request with a single command from your terminal.

```json
{
  "name": "my-jekyll-blog",
  "version": "1.0.0",
  "description": "My awesome blog",
  "scripts": {
    "dev": "bundle exec jekyll serve --host 0.0.0.0 --livereload",
    "sync": "git checkout main && git pull origin main && git checkout -",
    "save": "git add . && git commit",
    "push": "git push",
    "pr": "gh pr create --fill"
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

### 【進階技巧】終端機驅動的完整工作流程

當你熟悉了基本流程後，你會發現每次發布都要打開瀏覽器很繁瑣。我們可以透過 GitHub CLI (`gh`) 這個官方工具，實現從頭到尾都在終端機完成的專業流程。

> **[Advanced Tip] A Terminal-Driven Full Workflow**
>
> Once you're familiar with the basic flow, you'll find opening a browser for every release tedious. We can achieve a professional, end-to-end terminal workflow using the official GitHub CLI (`gh`) tool.

1.  **安裝與授權 `gh`**:

    - 我們的 `Dockerfile` 新版本已經包含了安裝 `gh` 的步驟。在重建容器後，你需要執行一次性的登入授權：
    - `gh auth login`
    - 跟隨提示，選擇 `Login with a web browser`，並在瀏覽器中完成授權。

2.  **同步主幹更新**:

    - 有時在你開發的過程中，`main` 分支可能已經有了新的更新（例如你加入了 `pr` 指令）。為了避免衝突，你需要將這些更新同步到你目前的工作分支。
    - `git merge main`
    - 這個指令會將 `main` 的最新進度合併到你目前的分支。

3.  **一鍵發布**:
    - 在你的文章分支上，完成 `npm run save` 和 `npm run push` 之後，直接執行：
    - `npm run pr`
    - `gh` 會自動幫你建立 Pull Request，並詢問你是否要立即合併。從此告別網頁介面！

---

### 常見問題與解決方案 (Troubleshooting)

- **【終極手段】問題：** `npm run pr` 執行時持續提示 `could not find any commits between...`。
- **解決方案：** 這代表您的分支歷史與 `main` 分支的關係已經混亂。最乾淨的解決方法是使用 `cherry-pick`（摘櫻桃）來重建一個乾淨的分支：
  1.  `git log` (找到並複製您要發布的文章 commit 的 hash 值，例如 `517e00a`)
  2.  `git checkout main`
  3.  `git pull origin main` (確保 main 是最新的)
  4.  `git checkout -b <一個全新的分支名>` (例如 `feature/publish-article-final`)
  5.  `git cherry-pick <您複製的commit-hash>` (將您的文章嫁接到新分支上)
  6.  `git push --set-upstream origin <您全新的分支名>`
  7.  `npm run pr` (這次一定會成功)

> - **[Ultimate Fix] Problem:** Running `npm run pr` persistently shows a `could not find any commits between...` error.
> - **Solution:** This indicates your branch history has become tangled with `main`. The cleanest solution is to rebuild a pristine branch using `cherry-pick`:
>   1.  `git log` (Find and copy the commit hash of the post you want to publish, e.g., `517e00a`)
>   2.  `git checkout main`
>   3.  `git pull origin main` (Ensure main is up-to-date)
>   4.  `git checkout -b <a-brand-new-branch-name>` (e.g., `feature/publish-article-final`)
>   5.  `git cherry-pick <the-commit-hash-you-copied>` (Graft your article commit onto the new branch)
>   6.  `git push --set-upstream origin <your-new-branch-name>`
>   7.  `npm run pr` (This will now succeed)

- **問題：** `npm run pr` 執行時提示 `missing script: pr`。
- **解決方案：** 這代表你目前的分支是從「舊的」`main` 分支出來的，當時的 `package.json` 還沒有 `"pr"` 指令。請執行 `git merge main` 將主幹的最新修改同步過來即可解決。

> - **Problem:** Running `npm run pr` shows a `missing script: pr` error.
> - **Solution:** This means your current branch was created from an "older" `main` branch where `package.json` didn't have the `"pr"` script yet. Simply run `git merge main` to sync the latest changes from the main branch to resolve this.

- **問題：** `git commit` 時提示 `Author identity unknown`。
- **解決方案：** 這是因為容器是全新的，還不認識你。每個新容器都需要執行一次性的身分設定：`git config --global user.name "Your Name"` 和 `git config --global user.email "you@example.com"`。

> - **Problem:** `git commit` prompts `Author identity unknown`.
> - **Solution:** This is because the container is brand new and doesn't know who you are. Each new container requires a one-time identity setup: `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.

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
