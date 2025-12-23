# Python Screen Laser Pointer Tool (PyQt6 + Win32API)

A lightweight desktop utility for real-time screen drawing and laser pointer trails.

## Features

- **Laser Pointer**: Smooth, fading trails for highlighting.
- **Box/Circle Annotations**: Quick shapes for focus.
- **Mouse-Through**: Draw while interacting with underlying apps.
- **Customizable**: Adjust colors, hotkeys, and FPS via UI.

---

## Developer Setup (For Source Code Editing)

1. **Install Python 3.10+**
2. **Install Dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

## How to Run

Directly run the main script:

```bash
python main.py
```

## How to Build (EXE)

We use **PyInstaller** to package the app into a single executable.

```bash
# Recommended command
pyinstaller --noconsole --onefile --name "LaserPointer" --icon="icon.ico" main.py
```

*(Note: Ensure all `.py` files are in the same directory during build.)*

## Binary Downloads

Binary releases are hosted on GitHub Releases to keep the repository clean.

[**Download Latest Release**](https://github.com/ArpowChao/arpowchao.github.io/releases)

---

Developed by Arpow Chao.
