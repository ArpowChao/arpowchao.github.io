from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                               QSlider, QPushButton, QColorDialog, QCheckBox, 
                               QTabWidget, QComboBox, QGroupBox, QFormLayout, QLineEdit)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor

class SettingsUI(QWidget):
    settings_changed = pyqtSignal() # Emitted when config is updated

    def __init__(self, config_manager):
        super().__init__()
        self.cfg = config_manager
        self.setWindowTitle("Settings")
        self.resize(400, 500)
        self.setup_ui()

    def closeEvent(self, event):
        event.ignore()
        self.hide()

    def setup_ui(self):
        layout = QVBoxLayout()
        layout.addWidget(QLabel("Changes are saved automatically."))
        self.tabs = QTabWidget()
        
        self.tabs.addTab(self.create_general_tab(), "General")
        self.tabs.addTab(self.create_visuals_tab(), "Visuals")
        
        layout.addWidget(self.tabs)
        self.setLayout(layout)

    def create_general_tab(self):
        widget = QWidget()
        layout = QFormLayout()

        # FPS Slider
        self.fps_slider = QSlider(Qt.Orientation.Horizontal)
        self.fps_slider.setRange(30, 240)
        self.fps_slider.setValue(self.cfg.config['fps'])
        self.fps_label = QLabel(f"{self.cfg.config['fps']} FPS")
        self.fps_slider.valueChanged.connect(self.on_fps_changed)
        
        fps_layout = QHBoxLayout()
        fps_layout.addWidget(self.fps_slider)
        fps_layout.addWidget(self.fps_label)
        layout.addRow("Update Rate (FPS):", fps_layout)

        # Smoothing Slider
        self.smooth_slider = QSlider(Qt.Orientation.Horizontal)
        self.smooth_slider.setRange(1, 100) # 0.01 to 1.00
        val = int(self.cfg.config['smoothing'] * 100)
        self.smooth_slider.setValue(val)
        self.smooth_label = QLabel(f"{val}%")
        self.smooth_slider.valueChanged.connect(self.on_smooth_changed)
        
        smooth_layout = QHBoxLayout()
        smooth_layout.addWidget(self.smooth_slider)
        smooth_layout.addWidget(self.smooth_label)
        layout.addRow("Smoothing:", smooth_layout)

        # Lifetime Slider
        self.life_slider = QSlider(Qt.Orientation.Horizontal)
        self.life_slider.setRange(1, 10) # 1s to 10s
        self.life_slider.setValue(int(self.cfg.config.get('lifetime', 3.0)))
        self.life_label = QLabel(f"{self.life_slider.value()}s")
        self.life_slider.valueChanged.connect(self.on_life_changed)
        
        life_layout = QHBoxLayout()
        life_layout.addWidget(self.life_slider)
        life_layout.addWidget(self.life_label)
        layout.addRow("Ink Duration:", life_layout)

        # Hotkeys
        self.laser_combo = QComboBox()
        self.laser_combo.addItems(["alt", "ctrl", "shift"])
        self.laser_combo.setCurrentText(self.cfg.config['hotkeys']['laser_key'])
        self.laser_combo.currentTextChanged.connect(lambda t: self.update_hotkey('laser_key', t))
        layout.addRow("Drawing Key:", self.laser_combo)
        
        # Box Key
        self.box_combo = QComboBox()
        self.box_combo.addItems(["alt", "ctrl", "shift"])
        self.box_combo.setCurrentText(self.cfg.config['hotkeys']['box_key'])
        self.box_combo.currentTextChanged.connect(lambda t: self.update_hotkey('box_key', t))
        layout.addRow("Box Key:", self.box_combo)

        # Global Hotkeys
        self.toggle_key_edit = QLineEdit(self.cfg.config['hotkeys'].get('toggle_hotkey', 'ctrl+shift+e'))
        self.toggle_key_edit.setPlaceholderText("e.g. ctrl+shift+e")
        self.toggle_key_edit.editingFinished.connect(lambda: self.update_hotkey('toggle_hotkey', self.toggle_key_edit.text()))
        layout.addRow("Toggle Enable:", self.toggle_key_edit)

        self.exit_key_edit = QLineEdit(self.cfg.config['hotkeys'].get('exit_hotkey', 'ctrl+shift+q'))
        self.exit_key_edit.setPlaceholderText("e.g. ctrl+shift+q")
        self.exit_key_edit.editingFinished.connect(lambda: self.update_hotkey('exit_hotkey', self.exit_key_edit.text()))
        layout.addRow("Exit App:", self.exit_key_edit)
        
        widget.setLayout(layout)
        return widget

    def create_visuals_tab(self):
        widget = QWidget()
        layout = QVBoxLayout()

        # Cursor Group
        cursor_group = QGroupBox("Cursor Settings")
        c_layout = QFormLayout()
        
        self.cursor_style = QComboBox()
        self.cursor_style.addItems(["dot", "cross", "none"])
        self.cursor_style.setCurrentText(self.cfg.config.get('cursor_style', 'dot'))
        self.cursor_style.currentTextChanged.connect(lambda t: self.update_global('cursor_style', t))
        c_layout.addRow("Style:", self.cursor_style)
        
        cursor_group.setLayout(c_layout)
        layout.addWidget(cursor_group)

        # Laser Group
        laser_group = QGroupBox("Laser Settings")
        l_layout = QFormLayout()
        
        self.laser_color_btn = QPushButton()
        self.update_btn_color(self.laser_color_btn, self.cfg.config['laser']['color'])
        self.laser_color_btn.clicked.connect(lambda: self.pick_color('laser'))
        l_layout.addRow("Color:", self.laser_color_btn)

        self.laser_size = QSlider(Qt.Orientation.Horizontal)
        self.laser_size.setRange(2, 50)
        self.laser_size.setValue(self.cfg.config['laser']['size'])
        self.laser_size.valueChanged.connect(lambda v: self.update_val('laser', 'size', v))
        l_layout.addRow("Size:", self.laser_size)
        
        self.laser_grad = QCheckBox("Use Gradient (Rainbow)")
        self.laser_grad.setChecked(self.cfg.config['laser']['gradient'])
        self.laser_grad.toggled.connect(lambda v: self.update_val('laser', 'gradient', v))
        l_layout.addRow(self.laser_grad)

        laser_group.setLayout(l_layout)
        layout.addWidget(laser_group)

        # Box Group
        box_group = QGroupBox("Box Settings")
        b_layout = QFormLayout()
        
        self.box_color_btn = QPushButton()
        self.update_btn_color(self.box_color_btn, self.cfg.config['box']['color'])
        self.box_color_btn.clicked.connect(lambda: self.pick_color('box'))
        b_layout.addRow("Color:", self.box_color_btn)

        self.box_style = QComboBox()
        self.box_style.addItems(["sharp", "rounded", "circle"])
        self.box_style.setCurrentText(self.cfg.config['box']['style'])
        self.box_style.currentTextChanged.connect(lambda t: self.update_val('box', 'style', t))
        b_layout.addRow("Style:", self.box_style)

        self.box_radius = QSlider(Qt.Orientation.Horizontal)
        self.box_radius.setRange(0, 100)
        self.box_radius.setValue(self.cfg.config['box'].get('radius', 15))
        self.box_radius_lbl = QLabel(f"{self.box_radius.value()}px")
        self.box_radius.valueChanged.connect(self.on_radius_changed)
        
        rad_layout = QHBoxLayout()
        rad_layout.addWidget(self.box_radius)
        rad_layout.addWidget(self.box_radius_lbl)
        b_layout.addRow("Radius:", rad_layout)

        self.box_grad = QCheckBox("Use Gradient")
        self.box_grad.setChecked(self.cfg.config['box']['gradient'])
        self.box_grad.toggled.connect(lambda v: self.update_val('box', 'gradient', v))
        b_layout.addRow(self.box_grad)

        box_group.setLayout(b_layout)
        layout.addWidget(box_group)

        # Global Glow
        glow_layout = QHBoxLayout()
        glow_slider = QSlider(Qt.Orientation.Horizontal)
        glow_slider.setRange(0, 30) # 0.0 to 3.0
        glow_val = int(self.cfg.config['laser']['glow_strength'] * 10)
        glow_slider.setValue(glow_val)
        glow_slider.valueChanged.connect(self.on_glow_changed)
        glow_layout.addWidget(QLabel("Glow Strength:"))
        glow_layout.addWidget(glow_slider)
        
        layout.addLayout(glow_layout)
        
        widget.setLayout(layout)
        return widget

    def update_btn_color(self, btn, color_hex):
        btn.setStyleSheet(f"background-color: {color_hex}; border: 1px solid #555;")
        btn.setText(color_hex)

    def pick_color(self, type_):
        curr = self.cfg.config[type_]['color']
        c = QColorDialog.getColor(QColor(curr), self, f"Select {type_.title()} Color")
        if c.isValid():
            hex_c = c.name()
            self.cfg.config[type_]['color'] = hex_c
            if type_ == 'laser': self.update_btn_color(self.laser_color_btn, hex_c)
            else: self.update_btn_color(self.box_color_btn, hex_c)
            self.cfg.save_config()
            self.settings_changed.emit()

    def update_val(self, section, key, val):
        self.cfg.config[section][key] = val
        self.cfg.save_config()
        self.settings_changed.emit()

    def update_hotkey(self, key, val):
        self.cfg.config['hotkeys'][key] = val
        self.cfg.save_config()
        self.settings_changed.emit()

    def on_fps_changed(self, val):
        self.fps_label.setText(f"{val} FPS")
        self.cfg.set('fps', val)
        self.settings_changed.emit()

    def on_life_changed(self, val):
        self.life_label.setText(f"{val}s")
        self.cfg.set('lifetime', float(val))
        self.settings_changed.emit()

    def update_global(self, key, val):
        self.cfg.set(key, val)
        self.settings_changed.emit()

    def on_radius_changed(self, val):
        self.box_radius_lbl.setText(f"{val}px")
        self.cfg.config['box']['radius'] = val
        self.cfg.save_config()
        self.settings_changed.emit()

    def on_smooth_changed(self, val):
        float_val = val / 100.0
        self.smooth_label.setText(f"{val}%")
        self.cfg.set('smoothing', float_val)
        self.settings_changed.emit()

    def on_glow_changed(self, val):
        float_val = val / 10.0
        self.cfg.config['laser']['glow_strength'] = float_val
        self.cfg.save_config()
        self.settings_changed.emit()
