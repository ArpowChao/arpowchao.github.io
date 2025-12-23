from PyQt6.QtWidgets import QSystemTrayIcon, QMenu
from PyQt6.QtGui import QAction
from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import QApplication, QStyle

class SystemTray(QSystemTrayIcon):
    open_settings = pyqtSignal()
    toggle_enabled = pyqtSignal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        
        self.setIcon(QApplication.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon))
        self.setToolTip("Laser Pointer Overlay")
        
        self.menu = QMenu()
        
        # Toggle Action
        self.toggle_action = QAction("Enabled", self.menu)
        self.toggle_action.setCheckable(True)
        self.toggle_action.setChecked(True)
        self.toggle_action.triggered.connect(self.on_toggle)
        self.menu.addAction(self.toggle_action)
        
        self.menu.addSeparator()

        # Settings
        self.settings_action = QAction("Settings...", self.menu)
        self.settings_action.triggered.connect(self.open_settings.emit)
        self.menu.addAction(self.settings_action)
        
        self.menu.addSeparator()
        
        self.exit_action = QAction("Exit", self.menu)
        self.exit_action.triggered.connect(QApplication.quit)
        self.menu.addAction(self.exit_action)
        
        self.setContextMenu(self.menu)
        self.show()
        
        self.is_enabled = True

    def on_toggle(self, checked):
        self.is_enabled = checked
        self.toggle_enabled.emit(checked)
        if checked:
            self.setToolTip("Laser Pointer Overlay (Active)")
        else:
            self.setToolTip("Laser Pointer Overlay (Disabled)")
