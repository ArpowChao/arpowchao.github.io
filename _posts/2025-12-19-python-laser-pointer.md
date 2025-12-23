---
layout: post
title: "Python 螢幕雷射筆工具 | Python Screen Laser Pointer Tool (PyQt6 + Win32API)"
date: 2025-12-19 16:30:00 +0800
categories: [Programming, Python]
tags: [python, pyqt6, desktop-app]
description: 一個使用 Python 與 PyQt6 開發的桌面螢幕繪圖工具，支援雷射筆軌跡與即時標註。 | A desktop screen drawing tool developed with Python and PyQt6, supporting laser pointer trails and real-time annotations.
---

這個專案是一個輕量級的桌面輔助工具，主要功能是在螢幕上繪製「雷射筆」軌跡與幾何圖形（方框、圓形），適合線上教學或簡報時使用。

This project is a lightweight desktop utility designed to draw "laser pointer" trails and geometric shapes (boxes, circles) on the screen, making it ideal for online teaching or presentations.

## 核心技術 | Core Technologies

專案使用 **Python 3** 撰寫，主要依賴以下技術：
The project is written in **Python 3** and relies on the following technologies:

1. **PyQt6**: 用於建立透明覆蓋視窗 (Overlay) 與圖形繪製。 | Used to create transparent overlays and handle graphics rendering.
2. **Win32 API (pywin32)**: 用於控制視窗的「滑鼠穿透」屬性，讓使用者在不繪圖時可以正常操作電腦。 | Used to control the "mouse-through" property of the window, allowing normal computer operation when not drawing.
3. **QPainter**: 處理雷射筆的發光效果與路徑平滑。 | Handles the glow effects and path smoothing of the laser pointer.

## 程式碼架構解析 | Code Architecture Analysis

### 1. 透明覆蓋視窗 (Overlay) | Transparent Overlay Window

程式的核心是一個全螢幕的透明視窗，它覆蓋在所有視窗最上層。最關鍵的部分是如何實現「既能看見繪圖，又能點擊下方視窗」的功能。

The core of the program is a full-screen transparent window that overlays everything. The key is implementing the ability to see drawings while still being able to click through to windows underneath.

```python
# overlay.py
def set_interactive(self, interactive: bool):
    self.interactive_mode = interactive
    self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, not interactive)
    
    hwnd = int(self.winId())
    style = win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE)
    
    if interactive:
        style &= ~win32con.WS_EX_TRANSPARENT
        self.setCursor(Qt.CursorShape.BlankCursor)
    else:
        style |= win32con.WS_EX_TRANSPARENT
        self.setCursor(Qt.CursorShape.ArrowCursor)
        
    win32gui.SetWindowLong(hwnd, win32con.GWL_EXSTYLE, style)
```

當使用者按下快捷鍵開始繪圖時，程式切換到 **Interactive Mode**，攔截滑鼠輸入進行繪畫；鬆開後則切回 **Transparent Mode**，讓使用者可以繼續操作電腦。

When the user presses the hotkey to start drawing, the app switches to **Interactive Mode** to capture mouse input. Once released, it switches back to **Transparent Mode** to allow normal interaction with other apps.

### 2. 雷射筆軌跡繪製 | Laser Pointer Trail Rendering

雷射筆的拖尾效果是透過儲存一系列的滑鼠座標點，並根據時間計算透明度來實現的。

The trailing effect of the laser pointer is achieved by storing a series of mouse coordinates and calculating transparency based on time.

```python
# overlay.py - Simplified Logic
for i in range(len(points) - 1):
    pt1, t1 = points[i]
    pt2, t2 = points[i+1]
    
    age = current_time - t1
    if age > lifetime: continue

    opacity = max(0, min(1.0, 1 - age / lifetime))
    
    # Draw Glow & Core
    painter.setPen(glow_pen)
    painter.drawLine(pt1, pt2)
    painter.setPen(core_pen)
    painter.drawLine(pt1, pt2)
```

### 3. 多螢幕支援 | Multi-Monitor Support

在 `main.py` 中，程式會偵測系統所有的螢幕，並為每一個螢幕建立一個獨立的 `Overlay` 實例。

In `main.py`, the program detects all system screens and creates an independent `Overlay` instance for each one.

## 功能總結 | Features Summary

- **雷射筆模式 (Laser Mode)**: 滑鼠移動會留下會自動消失的軌跡。 | Mouse movement leaves trails that automatically fade away.
- **方框模式 (Box Mode)**: 支援繪製矩形或圓形標註。 | Supports drawing rectangular or circular annotations.
- **系統列常駐 (Tray App)**: 程式最小化至系統列，不佔用工具列空間。 | Runs in the system tray to save taskbar space.
- **高度客製化 (Highly Customizable)**: 透過 UI 設定介面調整顏色、粗細、快速鍵。 | Adjust colors, thickness, and hotkeys via the UI settings.

---

## 使用者介面與設定 | User Interface & Settings

### 1. 系統列選單 (System Tray)

![Tray Menu](/assets/img/posts/laser-pointer/tray_menu.png)

_透過系統列選單，可以快速開關功能、進入設定頁面或退出程式。 | Quickly toggle functions, enter settings, or exit via the system tray._

### 2. 一般設定 (General Settings)

![General Settings](/assets/img/posts/laser-pointer/settings_general.png)

_在這裡可以調整更新率 (FPS)、平滑度以及預定義的快捷鍵。 | Adjust Update Rate (FPS), Smoothing, and predefined Hotkeys here._

- **FPS**: 支援高達 240 FPS，確保軌跡極度流暢。 | Supports up to 240 FPS for ultra-smooth trails.
- **Smoothing**: 平滑處理滑鼠軌跡，消除抖動。 | Smooths mouse paths to eliminate jitters.
- **Ink Duration**: 控制雷射筆留下的軌跡長度。 | Controls the duration of the ink trail.

### 3. 視覺效果設定 (Visual Settings)

![Visual Settings](/assets/img/posts/laser-pointer/settings_visuals.png)

_自訂雷射筆與標註方框的樣式。 | Customize styles for the laser pointer and annotation boxes._

- **Cursor Style**: 提供不同的鼠標樣式（如點狀、十字等）。 | Offers various cursor styles (e.g., dot, crosshair).
- **Rainbow Gradient**: 讓軌跡呈現漸層彩虹色。 | Enables rainbow gradient trails.
- **Glow Strength**: 調整軌跡的外暈亮度。 | Adjusts the glow intensity of the trail.

---

## 如何使用 | How to Use

1. **啟動 (Start)**: 執行 `main.py` 或打包好的 `.exe`。 | Run `main.py` or the compiled `.exe`.
2. **繪製 (Draw)**:
   - 按住 `Alt` (預設) 並移動滑鼠：繪製**雷射筆軌跡**。 | Hold `Alt` (default) and move mouse to draw **laser trails**.
   - 按住 `Ctrl` (預設) 並拖曳：繪製**方框標註**。 | Hold `Ctrl` (default) and drag to draw **box annotations**.
3. **清除 (Clear)**: 軌跡會依據設定時間自動消失。 | Trails fade automatically based on settings.

---

## 下載與安裝 | Download & Installation

您可以從以下連結下載打包好的執行檔 (Windows)：
You can download the compiled executable (Windows) from the link below:

[**立即下載：Python 螢幕雷射筆 v1.0 (GitHub Release) | Download Now**](https://github.com/ArpowChao/arpowchao.github.io/releases/latest/download/laser-pointer-v1.0.zip)

---

這個專案展現了如何結合 PyQt 的繪圖能力與底層 Windows API 來製作實用的桌面工具。
This project demonstrates how to combine PyQt's drawing capabilities with low-level Windows APIs to create practical desktop tools.
