---
layout: post
title: "如何在 Windows/Mac/Linux 安裝 Gemini CLI"
date: 2025-12-19 16:45:00 +0800
categories: [Tech, Tutorial]
tags: [gemini, cli, ai, npm]
description: 本篇教學將帶您在 Windows、macOS 與 Linux 系統上安裝 Gemini CLI 工具，讓您能直接在終端機與 Google Gemini AI 進行對話。
---

想要在終端機（Terminal）裡直接呼叫 Google Gemini AI 幫您寫程式、或是回答問題嗎？透過社群開發的 `gemini-chat-cli` 工具，我們可以輕鬆實現這個需求。

本篇教學將引導您在三大作業系統（Windows 11、macOS、Linux）上完成安裝與設定。

## 事前準備 (Prerequisites)

由於這個工具是基於 Node.js 開發的，因此無論您使用哪個作業系統，都必須先安裝 **Node.js**。

1.  前往 [Node.js 官網](https://nodejs.org/)。
2.  下載並安裝 **LTS (Long Term Support)** 版本。
3.  安裝完成後，打開終端機（Terminal 或 CMD），輸入以下指令確認安裝成功：

    ```bash
    node -v
    npm -v
    ```

    如果有出現版本號碼（例如 `v20.x.x`），代表準備就緒！

---

## 步驟一：安裝 Gemini CLI

我們將使用 `npm` (Node Package Manager) 來安裝這個工具。請根據您的作業系統選擇對應的方式：

### Windows 11 / 10

1.  按下 `Win + R`，輸入 `cmd` 或 `powershell` 開啟。
2.  執行以下安裝指令：

    ```powershell
    npm install -g gemini-chat-cli
    ```

### macOS (Mac)

1.  開啟「終端機 (Terminal)」。
2.  執行安裝指令（若遇權限問題，請在前面加 `sudo`）：

    ```bash
    sudo npm install -g gemini-chat-cli
    ```

### Linux (Ubuntu/Debian)

1.  打開您的 Shell。
2.  執行安裝指令：

    ```bash
    sudo npm install -g gemini-chat-cli
    ```

*(註：若您不想全域安裝，也可以透過 `npx gemini-chat-cli` 直接執行)*

---

## 步驟二：登入 Google 帳號

安裝完成後，無需手動申請 API Key，直接啟動程式即可進行登入驗證：

1.  在終端機輸入：
    ```bash
    gemini
    ```
2.  程式會自動開啟預設瀏覽器，引導您登入 Google 帳號。
3.  完成授權後，關閉瀏覽器回到終端機，您將看到登入成功的訊息。

---

## 步驟三：開始使用

設定完成後，您可以直接開始對話：

```bash
gemini "如何用 Python 寫一個 Hello World?"
```

或者進入互動模式：

```bash
gemini chat
```

## 常見指令參數

- `--help`：查看所有可用指令。
- `--version`：查看目前版本。
- `login`：登入 Google 帳號。
- `logout`：登出帳號。

現在，盡情享受在終端機與 AI 協作的高效體驗吧！
