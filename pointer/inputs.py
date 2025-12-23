from pynput import keyboard, mouse
from PyQt6.QtCore import QObject, pyqtSignal, QPointF

class InputMonitor(QObject):
    # Signal: alt, ctrl, shift
    mode_changed = pyqtSignal(bool, bool, bool)
    
    # Mouse signals (x, y, button_name)
    mouse_moved = pyqtSignal(float, float)
    mouse_pressed = pyqtSignal(float, float, str)
    mouse_released = pyqtSignal(float, float, str)
    key_pressed = pyqtSignal(str) # Emit char code for combo checking

    def __init__(self):
        super().__init__()
        self.alt_pressed = False
        self.shift_pressed = False
        self.ctrl_pressed = False
        
        # Keyboard Listener
        self.kb_listener = keyboard.Listener(
            on_press=self.on_press,
            on_release=self.on_release
        )
        self.kb_listener.start()
        
        # Mouse Listener
        self.mouse_listener = mouse.Listener(
            on_move=self.on_move,
            on_click=self.on_click
        )
        self.mouse_listener.start()

    def on_press(self, key):
        changed = False
        try:
            if hasattr(key, 'char') and key.char:
                k = key.char.lower()
                self.key_pressed.emit(k)
            # else:
                # Special keys (e.g., F1, arrow keys) are not emitted as 'char'
                # Modifiers are handled below
                # For now, other special keys are ignored by key_pressed signal
        except AttributeError:
            # This can happen if key is a special key without a 'char' attribute
            pass
        except Exception as e:
            # Catch any other unexpected errors during key processing
            print(f"Error in on_press char handling: {e}")

        if key == keyboard.Key.alt_l or key == keyboard.Key.alt_r:
            if not self.alt_pressed:
                self.alt_pressed = True
                changed = True
        elif key == keyboard.Key.shift_l or key == keyboard.Key.shift_r: # Corrected from 'shift' to 'shift_l'/'shift_r' for consistency
            if not self.shift_pressed:
                self.shift_pressed = True
                changed = True
        elif key == keyboard.Key.ctrl_l or key == keyboard.Key.ctrl_r:
            if not self.ctrl_pressed:
                self.ctrl_pressed = True
                changed = True
                
        if changed:
            self.emit_state()

    def on_release(self, key):
        changed = False
        if key == keyboard.Key.alt_l or key == keyboard.Key.alt_r:
            if self.alt_pressed:
                self.alt_pressed = False
                changed = True
        
        if key == keyboard.Key.shift_l or key == keyboard.Key.shift_r: # Corrected from 'shift' to 'shift_l'/'shift_r' for consistency
            if self.shift_pressed:
                self.shift_pressed = False
                changed = True

        if key == keyboard.Key.ctrl_l or key == keyboard.Key.ctrl_r:
            if self.ctrl_pressed:
                self.ctrl_pressed = False
                changed = True
                
        if changed:
            self.emit_state()

    def emit_state(self):
        self.mode_changed.emit(self.alt_pressed, self.ctrl_pressed, self.shift_pressed)

    def on_move(self, x, y):
        self.mouse_moved.emit(float(x), float(y))
        
    def on_click(self, x, y, button, pressed):
        btn_str = str(button)
        if pressed:
            self.mouse_pressed.emit(float(x), float(y), btn_str)
        else:
            self.mouse_released.emit(float(x), float(y), btn_str)

    def stop(self):
        self.kb_listener.stop()
        self.mouse_listener.stop()
