# Python Screen Laser Pointer Tool (PyQt6 + Win32API)

A lightweight desktop utility for real-time screen drawing and laser pointer trails.
一個輕量級的桌面輔助工具，用於即時螢幕繪圖與雷射筆軌跡。

## Features

- **Laser Pointer**: Smooth, fading trails for highlighting. | **雷射筆**: 平滑且會自動消失的軌跡。
- **Box/Circle Annotations**: Quick shapes for focus. | **方框/圓形標註**: 快速繪製幾何圖形。
- **Mouse-Through**: Draw while interacting with underlying apps. | **滑鼠穿透**: 在繪圖的同時仍可操作下方的程式。
- **Customizable**: Adjust colors, hotkeys, and FPS via UI. | **高度客製化**: 透過介面調整顏色、快捷鍵與 FPS。

---

## Developer Setup (For Source Code Editing)

1. **Install Python 3.10+** | **安裝 Python 3.10 以上版本**
2. **Install Dependencies** | **安裝依賴套件**:

   ```bash
   pip install -r requirements.txt
   ```

## How to Run

Directly run the main script: | 直接執行主程式:

```bash
python main.py
```

## How to Build (EXE)

We use **PyInstaller** to package the app into a single executable. | 我們使用 **PyInstaller** 將程式打包成獨立的 `.exe`。

```bash
# Recommended command | 建議指令
pyinstaller --noconsole --onefile --name "LaserPointer" --icon="icon.ico" main.py
```

*(Note: Ensure all `.py` files are in the same directory during build.)*

## Binary Downloads

Binary releases are hosted on GitHub Releases to keep the repository clean.
為了保持倉庫簡潔，打包好的執行檔託管於 GitHub Releases。

[**Download Latest Release | 下載最新版本**](https://github.com/ArpowChao/arpowchao.github.io/releases)

---

Developed by Arpow Chao.
