---
title: "專案深度解析：Python 螢幕雷射指標工具 (PyQt6 + Win32)"
date: 2025-12-24 19:20:00 +0800
categories: [Programming, Python]
tags: [python, pyqt6, win32api, desktop-app, tutorial]
description: 解決如何在全螢幕繪圖的同時，還能點擊下方視窗。拆解穿透技術與動態尾跡渲染演算法。
---

這款工具（發佈於 2025-12-19）是為了教學演示而設計，它解決了一個核心技術難題：**如何在全螢幕繪圖的同時，還能點擊下方的視窗？**

---

## 1. 核心技術：視窗穿透 (Mouse-Through)

要實作「看得見畫筆但摸不到視窗」，必須動用到 Windows 底層的 API。我們透過 `pywin32` 庫來修改視窗的擴展屬性。

### 關鍵代碼
```python
import win32gui
import win32con

def set_mouse_through(self, enabled: bool):
    hwnd = int(self.winId())
    # 獲取當前視窗樣式
    style = win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE)
    
    if enabled:
        # 加上 WS_EX_TRANSPARENT 屬性：滑鼠點擊會穿過本視窗，點到下方應用程式
        style |= win32con.WS_EX_TRANSPARENT
    else:
        # 移除該屬性：本視窗開始接收滑鼠事件（用於繪圖模式）
        style &= ~win32con.WS_EX_TRANSPARENT
        
    win32gui.SetWindowLong(hwnd, win32con.GWL_EXSTYLE, style)
```

---

## 2. 雷射尾跡渲染演算法

雷射指標的「流星尾跡」效果並不是簡單的線段，而是具有隨時間衰減的透明度。

### 邏輯拆解
1.  **資料結構**：使用 `deque` (雙向隊列) 儲存點座標與時間戳 `(point, timestamp)`。
2.  **衰減計算**：在每幀刷新時，遍歷座標點，計算其「年齡」 (Age)。
3.  **繪製**：

```python
# QPainter 渲染邏輯
current_time = time.time()
for i in range(len(self.points) - 1):
    pt1, t1 = self.points[i]
    pt2, t2 = self.points[i+1]
    
    # 計算存活率 (0.0 ~ 1.0)
    life_ratio = 1.0 - (current_time - t1) / self.lifetime
    if life_ratio <= 0: continue
    
    # 設定畫筆顏色，將透明度與 life_ratio 掛鉤
    pen = QPen(QColor(255, 0, 0, int(255 * life_ratio)))
    painter.setPen(pen)
    painter.drawLine(pt1, pt2)
```

---

## 3. 高效能渲染 (60+ FPS)

因為是在全螢幕下繪圖，如果處理不好會造成電腦卡頓。
*   **Qt 定時器**：使用 `QTimer` 以 16ms (對應 60FPS) 的間隔調用 `update()`。
*   **局部刷新**：雖然範例中是全域重繪，但進階做法是計算 `dirty region` (僅重繪變動區域)。

---

## 4. 教學總結：跨平台與系統選擇

雖然 Python 開發這類工具非常迅速，但因為涉及 `win32gui`，這款工具目前僅限於 Windows。如果您想在 macOS 實作類似功能，需要改用語音 `Cocoa` 框架下的 `NSWindow` 屬性。

> [!TIP]
> **熱鍵整合**：推薦使用 `pynput` 庫來監聽全域熱鍵。當偵測到 `Alt` 按下時，調用 `set_mouse_through(False)` 開啟繪圖模式；放開時切換回 `True` 恢復穿透。這就是現代教學軟體的核心邏輯！
