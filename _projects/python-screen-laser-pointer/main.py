import sys
import time
import math
import ctypes
import traceback
from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt, QPointF, QTimer, pyqtSlot, QObject
from PyQt6.QtGui import QCursor, QColor

# Fix DPI Awareness
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2) 
except:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except:
        pass

from overlay import Overlay
from inputs import InputMonitor
from tray import SystemTray
from utils import LaserStroke
from config_manager import ConfigManager
from settings_ui import SettingsUI

def main():
    try:
        with open("debug.log", "w") as f: f.write("Starting app (Configurable)...\n")
        
        QApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
        app = QApplication(sys.argv)
        app.setQuitOnLastWindowClosed(False) # Important for Tray apps
        
        # Init Config
        cfg = ConfigManager()
        
        # Shared Data
        shared_strokes = []
        
        # Detect Screens and Spawn Overlays
        overlays = []
        screens = QApplication.screens()
        
        for i, screen in enumerate(screens):
            # Pass config.config to overlay (it's a dict reference, so updates might propagate via update_config)
            ov = Overlay(geometry=screen.geometry(), shared_strokes=shared_strokes, config=cfg.config)
            ov.show()
            overlays.append(ov)
            
        tray = SystemTray()
        settings_ui = SettingsUI(cfg)
        input_mon = InputMonitor()
        
        # Logic Controller
        class LogicController(QObject): # Inherit QObject for signals/slots if needed
            def __init__(self, monitor, config_manager, tray_instance):
                super().__init__()
                self.monitor = monitor
                self.cfg = config_manager
                self.tray = tray_instance

                # Connect Signals
                self.monitor.mode_changed.connect(self.on_mode_changed)
                self.monitor.key_pressed.connect(self.on_key_press)
                
                self.drawing = False
                self.box_mode = False
                self.active_button = None 
                self.box_start = None
                self.current_pos = QPointF(0, 0)
                self.smooth_pos = None
                self.last_pos = None 
                self.current_stroke_obj = None
                
                # Input State
                self.keys = {'alt': False, 'ctrl': False, 'shift': False}

            @pyqtSlot(str)
            def on_key_press(self, key_char):
                # Construct current combo
                parts = []
                if self.keys['ctrl']: parts.append('ctrl')
                if self.keys['alt']: parts.append('alt')
                if self.keys['shift']: parts.append('shift')
                parts.append(key_char.lower())
                
                current_combo = "+".join(sorted(parts)) 
                
                # Check Config
                toggle_chk = self.cfg.config['hotkeys'].get('toggle_hotkey', '').lower()
                exit_chk = self.cfg.config['hotkeys'].get('exit_hotkey', '').lower()
                
                def normalize(s): return "+".join(sorted(s.lower().split('+')))
                
                if toggle_chk and current_combo == normalize(toggle_chk):
                    # Toggle Enabled
                    new_state = not self.tray.is_enabled
                    # Directly toggle tray check state which triggers logic
                    self.tray.toggle_action.setChecked(new_state)
                    
                if exit_chk and current_combo == normalize(exit_chk):
                    QApplication.quit()

            def reload_config(self):
                # Update overlays
                for ov in overlays:
                    ov.update_config(cfg.config)

            def get_hotkey_state(self, key_name):
                # key_name e.g. "alt", "ctrl"
                return self.keys.get(key_name, False)

            def update_overlays(self):
                for ov in overlays:
                    ov.toggle_mode(self.drawing, self.box_mode)
                    if self.box_start:
                        curr = self.current_pos 
                        w = abs(curr.x() - self.box_start.x())
                        h = abs(curr.y() - self.box_start.y())
                        x = min(curr.x(), self.box_start.x())
                        y = min(curr.y(), self.box_start.y())
                        rect = (int(x), int(y), int(w), int(h))
                        ov.set_box_preview(rect)
                    else:
                        ov.set_box_preview(None)

            def update_interactivity(self):
                laser_key = cfg.config['hotkeys']['laser_key']
                box_key = cfg.config['hotkeys']['box_key']
                
                # Block if (Keys Held) OR (Currently Drawing/Dragging)
                # This ensures we don't unblock in the middle of a stroke
                keys_down = self.keys.get(laser_key, False) or self.keys.get(box_key, False)
                should_block = keys_down or self.drawing
                
                for ov in overlays:
                    ov.set_interactive(should_block)

            def on_mode_changed(self, alt, ctrl, shift):
                self.keys['alt'] = alt
                self.keys['ctrl'] = ctrl
                self.keys['shift'] = shift
                
                if not tray.is_enabled:
                    if self.drawing:
                        self.drawing = False
                        self.update_overlays()
                    return

                self.update_interactivity()

                # Rule Change: We DO NOT cancel stroke if key is released.
                # We wait for Mouse Release.
                # This prevents the "Window becomes transparent before Mouse Up" bug.

            def on_mouse_press(self, x, y, btn):
                try:
                    if not tray.is_enabled: return

                    laser_key = cfg.config['hotkeys']['laser_key']
                    box_key = cfg.config['hotkeys']['box_key']
                    
                    is_laser = self.get_hotkey_state(laser_key) and "left" in btn
                    is_box = self.get_hotkey_state(box_key) and "right" in btn
                    
                    if not (is_laser or is_box):
                        return

                    pt = QCursor.pos()
                    raw_p = QPointF(float(pt.x()), float(pt.y()))
                    
                    self.drawing = True
                    self.active_button = btn
                    self.box_start = raw_p
                    self.current_pos = raw_p
                    self.smooth_pos = raw_p 
                    
                    # Lock interactivity ON since we started drawing
                    self.update_interactivity() 
                    
                    if is_box:
                        self.box_mode = True
                    else:
                        self.box_mode = False
                        col = QColor(cfg.config['laser']['color'])
                        sz = cfg.config['laser']['size']
                        life = cfg.config.get('lifetime', 3.0)
                        self.current_stroke_obj = LaserStroke(col, lifetime=life)
                        self.current_stroke_obj.width = sz
                        self.current_stroke_obj.add_point(raw_p)
                        shared_strokes.append(self.current_stroke_obj)
                    
                    self.update_overlays()
                except Exception as e:
                     with open("debug.log", "a") as f: f.write(f"Press Error: {e}\n")

            def on_mouse_move(self, x, y):
                try:
                    pt = QCursor.pos()
                    raw_p = QPointF(float(pt.x()), float(pt.y()))
                    self.current_pos = raw_p
                    
                    # Stabilizer
                    smoothing_factor = cfg.config.get('smoothing', 0.4)
                    
                    if self.smooth_pos is None:
                        self.smooth_pos = raw_p
                    else:
                        sx = self.smooth_pos.x() * (1 - smoothing_factor) + raw_p.x() * smoothing_factor
                        sy = self.smooth_pos.y() * (1 - smoothing_factor) + raw_p.y() * smoothing_factor
                        self.smooth_pos = QPointF(sx, sy)
                    
                    if self.drawing:
                        if not self.box_mode and self.current_stroke_obj:
                            self.current_stroke_obj.add_point(self.smooth_pos)
                        self.update_overlays()
                    else:
                        if tray.is_enabled: 
                            for ov in overlays:
                                ov.set_cursor_pos(int(self.smooth_pos.x()), int(self.smooth_pos.y()))
                except Exception as e:
                     pass

            def on_mouse_release(self, x, y, btn):
                try:
                    if self.active_button and btn != self.active_button:
                        return
                        
                    pt = QCursor.pos()
                    if not self.drawing: return
                    
                    if self.box_mode and self.box_start:
                        self.add_box_stroke(self.box_start, QPointF(float(pt.x()), float(pt.y())))
                        self.box_start = None
                    
                    self.finish_stroke()
                    self.drawing = False
                    self.active_button = None
                    self.update_interactivity() # Re-evaluate state (unlocks if keys are up)
                    self.update_overlays()
                except Exception as e:
                     with open("debug.log", "a") as f: f.write(f"Release Error: {e}\n")

            def finish_stroke(self):
                self.current_stroke_obj = None

            def add_box_stroke(self, p1, p2):
                x1, y1 = p1.x(), p1.y()
                x2, y2 = p2.x(), p2.y()
                style = cfg.config['box']['style']
                
                # If Circle, we approximate ellipse with points? 
                # Or just store rect and let overlay draw it?
                # LaserStroke is technically a list of points. 
                # If we want PERSISTENT box, we need to convert it to points.
                # A circle as a polygon.
                
                col = QColor(cfg.config['box']['color'])
                sz = cfg.config['box']['size']
                life = cfg.config.get('lifetime', 3.0)
                
                stroke = LaserStroke(col, lifetime=life)
                stroke.width = sz
                ts = time.time()

                if style == 'circle':
                    # Approximate ellipse
                    cx, cy = (x1+x2)/2, (y1+y2)/2
                    rx, ry = abs(x2-x1)/2, abs(y2-y1)/2
                    start_angle = 0
                    segments = 36
                    for i in range(segments + 1):
                        ang = i * (2 * math.pi) / segments
                        px = cx + rx * math.cos(ang)
                        py = cy + ry * math.sin(ang)
                        stroke.points.append((QPointF(px, py), ts))
                        
                elif style == 'rounded':
                    r = cfg.config['box'].get('radius', 15)
                    # Clamp radius
                    w, h = abs(x2-x1), abs(y2-y1)
                    r = min(r, w/2, h/2)
                    
                    # Ensure consistent ordering
                    lx, rx = min(x1, x2), max(x1, x2)
                    ty, by = min(y1, y2), max(y1, y2)
                    
                    def add_arc(cx, cy, start_ang, end_ang):
                        steps = 5
                        for i in range(steps + 1):
                            a = start_ang + (end_ang - start_ang) * i / steps
                            px = cx + r * math.cos(a)
                            py = cy + r * math.sin(a)
                            stroke.points.append((QPointF(px, py), ts))

                    # Top Edge
                    stroke.points.append((QPointF(lx+r, ty), ts))
                    stroke.points.append((QPointF(rx-r, ty), ts))
                    # TR Corner
                    add_arc(rx-r, ty+r, -math.pi/2, 0)
                    # Right Edge
                    stroke.points.append((QPointF(rx, by-r), ts))
                    # BR Corner
                    add_arc(rx-r, by-r, 0, math.pi/2)
                    # Bottom Edge
                    stroke.points.append((QPointF(lx+r, by), ts))
                    # BL Corner
                    add_arc(lx+r, by-r, math.pi/2, math.pi)
                    # Left Edge
                    stroke.points.append((QPointF(lx, ty+r), ts))
                    # TL Corner
                    add_arc(lx+r, ty+r, math.pi, 3*math.pi/2)
                    # Close
                    stroke.points.append((QPointF(lx+r, ty), ts))

                else:
                    # Rect
                    pts = [QPointF(x1, y1), QPointF(x2, y1), QPointF(x2, y2), QPointF(x1, y2), QPointF(x1, y1)]
                    for pt in pts: stroke.points.append((pt, ts))

                shared_strokes.append(stroke)
                
            def toggle_app_enabled(self, enabled):
                # Tray handled visual feedback, we just respect 'tray.is_enabled' check in logic
                pass
                
        logic = LogicController(input_mon, cfg, tray)
        input_mon.mode_changed.connect(logic.on_mode_changed)
        input_mon.mouse_moved.connect(logic.on_mouse_move)
        input_mon.mouse_pressed.connect(logic.on_mouse_press)
        input_mon.mouse_released.connect(logic.on_mouse_release)
        
        tray.open_settings.connect(settings_ui.show)
        tray.toggle_enabled.connect(logic.toggle_app_enabled)
        
        settings_ui.settings_changed.connect(logic.reload_config)
        
        with open("debug.log", "a") as f: f.write("App Executing.\n")
        sys.exit(app.exec())
        
    except Exception as e:
        with open("debug.log", "a") as f:
            f.write(f"MAIN CRASH: {e}\n")
            f.write(traceback.format_exc())
            f.write("\n")

if __name__ == "__main__":
    main()
