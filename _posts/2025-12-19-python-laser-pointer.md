---
layout: post
title: "Python 螢幕雷射筆工具 (PyQt6 + Win32API)"
date: 2025-12-19 16:30:00 +0800
categories: [Programming, Python]
tags: [python, pyqt6, desktop-app]
description: 一個使用 Python 與 PyQt6 開發的桌面螢幕繪圖工具，支援雷射筆軌跡與即時標註，並利用 Win32 API 實現滑鼠穿透功能。
---

這個專案是一個輕量級的桌面輔助工具，主要功能是在螢幕上繪製「雷射筆」軌跡與幾何圖形（方框、圓形），適合線上教學或簡報時使用。

## 核心技術

專案使用 **Python 3** 撰寫，主要依賴以下技術：

1. **PyQt6**: 用於建立透明覆蓋視窗 (Overlay) 與圖形繪製。
2. **Win32 API (pywin32)**: 用於控制視窗的「滑鼠穿透」屬性，讓使用者在不繪圖時可以正常操作電腦。
3. **QPainter**: 處理雷射筆的發光效果與路徑平滑。

## 程式碼架構解析

### 1. 透明覆蓋視窗 (Overlay)

程式的核心是一個全螢幕的透明視窗，它覆蓋在所有視窗最上層。最關鍵的部分是如何實現「既能看見繪圖，又能點擊下方視窗」的功能。

這部分由 `overlay.py` 中的 `set_interactive` 函式控制：

```python
# overlay.py
def set_interactive(self, interactive: bool):
    self.interactive_mode = interactive
    # 設定 Qt 屬性：是否讓滑鼠事件穿透 Qt 視窗
    self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, not interactive)
    
    # 使用 Win32 API 修改視窗樣式
    hwnd = int(self.winId())
    style = win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE)
    
    if interactive:
        # 互動模式：移除穿透樣式，讓視窗捕捉滑鼠點擊
        style &= ~win32con.WS_EX_TRANSPARENT
        self.setCursor(Qt.CursorShape.BlankCursor)
    else:
        # 穿透模式：加入 WS_EX_TRANSPARENT，讓滑鼠直接穿過視窗
        style |= win32con.WS_EX_TRANSPARENT
        self.setCursor(Qt.CursorShape.ArrowCursor)
        
    win32gui.SetWindowLong(hwnd, win32con.GWL_EXSTYLE, style)
```

當使用者按下快捷鍵（如 Ctrl+L）開始繪圖時，程式切換到 **Interactive Mode**，攔截滑鼠輸入進行繪畫；鬆開後則切回 **Transparent Mode**，讓使用者可以繼續操作電腦。

### 2. 雷射筆軌跡繪製

雷射筆的拖尾效果是透過儲存一系列的滑鼠座標點，並根據時間計算透明度來實現的。

```python
# overlay.py - draw_stroke 函式簡化邏輯
for i in range(len(points) - 1):
    pt1, t1 = points[i]
    pt2, t2 = points[i+1]
    
    # 計算點的存活時間
    age = current_time - t1
    if age > lifetime: continue

    # 根據時間計算淡出效果
    opacity = max(0, min(1.0, 1 - age / lifetime))
    
    # 繪製發光的外暈 (Glow)
    painter.setPen(glow_pen)
    painter.drawLine(pt1, pt2)

    # 繪製白色的核心 (Core)
    painter.setPen(core_pen)
    painter.drawLine(pt1, pt2)
```

### 3. 多螢幕支援

在 `main.py` 中，程式會偵測系統所有的螢幕，並為每一個螢幕建立一個獨立的 `Overlay` 實例，確保跨螢幕操作時都能正常顯示。

```python
# main.py
screens = QApplication.screens()
for i, screen in enumerate(screens):
    # 為每個螢幕建立一個覆蓋層，共享筆劃資料 (shared_strokes)
    ov = Overlay(geometry=screen.geometry(), shared_strokes=shared_strokes, config=cfg.config)
    ov.show()
    overlays.append(ov)
```

## 功能總結

- **雷射筆模式**：滑鼠移動會留下會自動消失的軌跡。
- **方框模式**：支援繪製矩形、圓角矩形或圓形標註。
- **系統列常駐**：程式最小化至系統列，不佔用工具列空間。
- **高度客製化**：透過 `config.json` 或 UI 設定介面調整顏色、粗細、快速鍵與平滑度。

---

## 使用者介面與設定 (UI & Settings)

這個工具提供了直覺的圖形化設定介面，讓使用者可以根據需求自訂雷射筆與方框的外觀。

### 1. 系統列選單 (System Tray)

![Tray Menu](/assets/img/posts/laser-pointer/tray_menu.png)

_透過系統列選單，可以快速開關功能、進入設定頁面或退出程式。_

### 2. 一般設定 (General Settings)

![General Settings](/assets/img/posts/laser-pointer/settings_general.png)

_在這裡可以調整更新率 (FPS)、平滑度以及預定義的快捷鍵。_

- **FPS**: 支援高達 240 FPS，確保軌跡極度流暢。
- **Smoothing**: 平滑處理滑鼠軌跡，消除抖動。
- **Ink Duration**: 控制雷射筆留下的軌跡長度。

### 3. 視覺效果設定 (Visual Settings)

![Visual Settings](/assets/img/posts/laser-pointer/settings_visuals.png)

_自訂雷射筆與標註方框的樣式。_

- **Cursor Style**: 提供不同的鼠標樣式（如點狀、十字等）。
- **Rainbow Gradient**: 讓軌跡呈現漸層彩虹色，增加視覺動態感。
- **Glow Strength**: 調整軌跡的外暈亮度，模擬真空管或雷射的效果。

---

## 如何使用 (How to Use)

1. **啟動**: 執行 `main.py` 或打包好的 `.exe`。
2. **繪製**:
   - 按住 `Alt` (預設) 並移動滑鼠：繪製**雷射筆軌跡**。
   - 按住 `Ctrl` (預設) 並拖曳：繪製**方框標註**。
3. **清除**: 軌跡會依據設定時間自動消失，無需手動清除。

---

## 下載與安裝 (Download)

您可以從以下連結下載打包好的執行檔 (Windows)：

[**立即下載：Python 螢幕雷射筆 v1.0 (GitHub Release)**](https://github.com/ArpowChao/arpowchao.github.io/releases/latest/download/laser-pointer-v1.0.zip)

---

這個專案展現了如何結合 PyQt 的繪圖能力與底層 Windows API 來製作實用的桌面工具。
