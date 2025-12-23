import sys
import time
import math
import win32gui
import win32con
from PyQt6.QtWidgets import QMainWindow
from PyQt6.QtCore import Qt, QTimer, QPointF, pyqtSlot
from PyQt6.QtGui import QPainter, QPen, QColor, QBrush, QLinearGradient, QPainterPath

class Overlay(QMainWindow):
    def __init__(self, geometry=None, shared_strokes=None, config=None):
        super().__init__()
        self.strokes = shared_strokes if shared_strokes is not None else []
        self.cfg = config if config else {} 
        
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool 
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        # Default to Transparent (Click-through)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        
        if geometry:
            self.setGeometry(geometry)
            self.offset_x = geometry.x()
            self.offset_y = geometry.y()
        else:
            self.offset_x = 0
            self.offset_y = 0
            
        self.cursor_pos = None
        self.drawing_active = False
        self.box_mode = False 
        self.box_preview_rect = None 
        
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_animation)
        fps = self.cfg.get('fps', 120)
        self.timer.start(1000 // fps)
        
        self.interactive_mode = False

    def set_interactive(self, interactive: bool):
        self.interactive_mode = interactive
        # If interactive=True, we WANT to block clicks (catch them).
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, not interactive)
        
        # Modify Windows EX Style
        # WS_EX_TRANSPARENT (0x20) = Click extraction/Passthrough
        hwnd = int(self.winId())
        style = win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE)
        
        if interactive:
            # Remove Transparent style
            style &= ~win32con.WS_EX_TRANSPARENT
            # Might want to set Cursor to Blank if we are handling it?
            self.setCursor(Qt.CursorShape.BlankCursor)
        else:
            # Add Transparent style
            style |= win32con.WS_EX_TRANSPARENT
            self.setCursor(Qt.CursorShape.ArrowCursor)
            
        win32gui.SetWindowLong(hwnd, win32con.GWL_EXSTYLE, style)
        # FORCE UPDATE
        win32gui.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 
            win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_NOZORDER | win32con.SWP_FRAMECHANGED)

    # --- INPUT CONSUMPTION ---
    # We must implement these and accept events to prevent them from
    # "falling through" to the OS/Background when interactive=True.
    def mousePressEvent(self, event):
        event.accept()

    def mouseReleaseEvent(self, event):
        event.accept()

    def mouseMoveEvent(self, event):
        event.accept()
    # -------------------------

    def update_config(self, new_config):
        self.cfg = new_config
        # Update Timer if FPS changed
        fps = self.cfg.get('fps', 120)
        interval = 1000 // fps
        if self.timer.interval() != interval:
            self.timer.stop()
            self.timer.start(interval)
        self.update()

    def update_animation(self):
        self.update()

    @pyqtSlot(bool, bool)
    def toggle_mode(self, active: bool, box_mode: bool):
        self.drawing_active = active
        self.box_mode = box_mode
        self.update()

    def set_box_preview(self, rect):
        self.box_preview_rect = rect

    @pyqtSlot(int, int)
    def set_cursor_pos(self, x, y):
        self.cursor_pos = QPointF(x, y)

    def paintEvent(self, event):
        painter = QPainter(self)
        
        # FIX: Ensure window is hit-testable when interactive by drawing invisible background
        if self.interactive_mode:
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QColor(255, 255, 255, 1)) # Alpha 1/255
            painter.drawRect(self.rect())
            
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        try:
            painter.setRenderHint(QPainter.RenderHint.HighQualityAntialiasing)
        except: pass
        
        painter.translate(-self.offset_x, -self.offset_y)
        current_time = time.time()
        
        for stroke in self.strokes:
            self.draw_stroke(painter, stroke, current_time)
            
        if self.drawing_active and self.box_mode and self.box_preview_rect:
             self.draw_box_preview(painter)

        if self.drawing_active and self.cursor_pos:
            self.draw_cursor(painter)

    def draw_cursor(self, painter):
        style = self.cfg.get('cursor_style', 'dot')
        if style == 'none': return
        
        cx, cy = self.cursor_pos.x(), self.cursor_pos.y()
        
        painter.setPen(QPen(QColor(0, 0, 0, 150), 1))
        painter.setBrush(QBrush(QColor(255, 255, 255, 180)))
        
        if style == 'dot':
            painter.drawEllipse(QPointF(cx, cy), 4, 4)
        elif style == 'cross':
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawLine(int(cx-8), int(cy), int(cx+8), int(cy))
            painter.drawLine(int(cx), int(cy-8), int(cx), int(cy+8))
            
            # White core
            painter.setPen(QPen(QColor(255, 255, 255, 200), 2))
            painter.drawLine(int(cx-7), int(cy), int(cx+7), int(cy))
            painter.drawLine(int(cx), int(cy-7), int(cx), int(cy+7))

    def draw_stroke(self, painter, stroke, current_time):
        if len(stroke.points) < 2: return
        
        # Determine Color
        config_col = self.cfg['laser']['color']
        use_grad = self.cfg['laser']['gradient']
        base_color = QColor(config_col)
        
        glow_str = self.cfg['laser']['glow_strength']
        width = self.cfg['laser']['size']

        points = stroke.points
        
        # Simplification: Draw segments
        for i in range(len(points) - 1):
            pt1, t1 = points[i]
            pt2, t2 = points[i+1]
            
            age = current_time - t1
            life = stroke.lifetime
            if age > life: continue
                
            opacity = max(0, min(1.0, 1 - age / life))
            if opacity <= 0: continue
            
            if use_grad:
                # Rainbow based on age or screen pos? Let's do Rainbow Time
                hue = (current_time * 50 + i * 5) % 360
                seg_color = QColor.fromHsl(int(hue), 255, 150)
            else:
                seg_color = base_color

            # Draw Glow
            alpha = int(255 * opacity)
            seg_color.setAlpha(alpha // 3)
            
            glow_pen = QPen(seg_color)
            glow_pen.setWidth(int(width * glow_str))
            glow_pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            painter.setPen(glow_pen)
            painter.drawLine(pt1, pt2)

            # Draw Core
            core_color = QColor(255, 255, 255)
            core_color.setAlpha(min(255, int(alpha * 2)))
            core_pen = QPen(core_color)
            core_pen.setWidth(max(2, int(width * 0.3)))
            core_pen.setCapStyle(Qt.PenCapStyle.RoundCap)
            painter.setPen(core_pen)
            painter.drawLine(pt1, pt2)

    def draw_box_preview(self, painter):
        rect = self.box_preview_rect # x, y, w, h
        x, y, w, h = rect
        style = self.cfg['box']['style']
        use_grad = self.cfg['box']['gradient']
        col_hex = self.cfg['box']['color']
        
        base_col = QColor(col_hex)
        base_col.setAlpha(100)
        
        if use_grad:
            # Diagonal Gradient
            grad = QLinearGradient(x, y, x+w, y+h)
            grad.setColorAt(0, base_col)
            grad.setColorAt(1, QColor(255, 255, 255, 100))
            brush = QBrush(grad)
        else:
            brush = QBrush(Qt.BrushStyle.NoBrush)

        pen = QPen(base_col)
        pen.setWidth(int(8 * self.cfg['laser']['glow_strength'])) # consistent glow
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        
        painter.setPen(pen)
        painter.setBrush(brush)
        
        if style == "rounded":
            r = self.cfg['box'].get('radius', 15)
            painter.drawRoundedRect(*rect, r, r)
        elif style == "circle":
            painter.drawEllipse(*rect)
        else:
            painter.drawRect(*rect)
        
        # Core
        painter.setPen(QPen(QColor(255, 255, 255), 2))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        if style == "rounded":
            r = self.cfg['box'].get('radius', 15)
            painter.drawRoundedRect(*rect, r, r)
        elif style == "circle":
            painter.drawEllipse(*rect)
        else:
            painter.drawRect(*rect)
