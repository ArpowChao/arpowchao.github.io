---
layout: post
title: "Python Screen Laser Pointer Tool (PyQt6 + Win32API)"
date: 2025-12-19 16:30:00 +0800
categories: [Programming, Python]
tags: [python, pyqt6, desktop-app]
description: A desktop screen drawing tool developed with Python and PyQt6, supporting laser pointer trails and real-time annotations.
---

This project is a lightweight desktop utility designed to draw "laser pointer" trails and geometric shapes (boxes, circles) on the screen, making it ideal for online teaching or presentations.

## Core Technologies

The project is written in **Python 3** and relies on the following technologies:

1. **PyQt6**: Used to create transparent overlays and handle graphics rendering.
2. **Win32 API (pywin32)**: Used to control the "mouse-through" property of the window, allowing normal computer operation when not drawing.
3. **QPainter**: Handles the glow effects and path smoothing of the laser pointer.

## Code Architecture Analysis

### 1. Transparent Overlay Window

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

When the user presses the hotkey to start drawing, the app switches to **Interactive Mode** to capture mouse input. Once released, it switches back to **Transparent Mode** to allow normal interaction with other apps.

### 2. Laser Pointer Trail Rendering

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

### 3. Multi-Monitor Support

In `main.py`, the program detects all system screens and creates an independent `Overlay` instance for each one.

## Features Summary

- **Laser Mode**: Mouse movement leaves trails that automatically fade away.
- **Box Mode**: Supports drawing rectangular or circular annotations.
- **Tray App**: Runs in the system tray to save taskbar space.
- **Highly Customizable**: Adjust colors, thickness, and hotkeys via the UI settings.

---

## User Interface & Settings

### 1. System Tray

![Tray Menu](/assets/img/posts/laser-pointer/tray_menu.png)

_Quickly toggle functions, enter settings, or exit via the system tray._

### 2. General Settings

![General Settings](/assets/img/posts/laser-pointer/settings_general.png)

_Adjust Update Rate (FPS), Smoothing, and predefined Hotkeys here._

- **FPS**: Supports up to 240 FPS for ultra-smooth trails.
- **Smoothing**: Smooths mouse paths to eliminate jitters.
- **Ink Duration**: Controls the duration of the ink trail.

### 3. Visual Settings

![Visual Settings](/assets/img/posts/laser-pointer/settings_visuals.png)

_Customize styles for the laser pointer and annotation boxes._

- **Cursor Style**: Offers various cursor styles (e.g., dot, crosshair).
- **Rainbow Gradient**: Enables rainbow gradient trails.
- **Glow Strength**: Adjusts the glow intensity of the trail.

---

## How to Use

1. **Start**: Run `main.py` or the compiled `.exe`.
2. **Draw**:
   - Hold `Alt` (default) and move mouse to draw **laser trails**.
   - Hold `Ctrl` (default) and drag to draw **box annotations**.
3. **Clear**: Trails fade automatically based on settings.

---

## Download & Installation

You can download the compiled executable (Windows) from the link below:

[**Download Now: Python Screen Laser Pointer v1.0 (GitHub Release)**](https://github.com/ArpowChao/arpowchao.github.io/releases/latest/download/laser-pointer-v1.0.zip)

---

This project demonstrates how to combine PyQt's drawing capabilities with low-level Windows APIs to create practical desktop tools.
