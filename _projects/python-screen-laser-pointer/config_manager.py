import json
import os

class ConfigManager:
    DEFAULT_CONFIG = {
        "fps": 120,
        "smoothing": 0.4,
        "lifetime": 3.0, # seconds
        "cursor_style": "dot", # dot, cross, none
        "hotkeys": {
            "laser_key": "alt",         
            "box_key": "alt",
            "toggle_hotkey": "ctrl+shift+e", # Global toggle
            "exit_hotkey": "ctrl+shift+q",   # Global exit
            "box_button": "right",     
            "laser_button": "left"
        },
        "laser": {
            "color": "#FF0000",
            "size": 10,
            "gradient": False, 
            "glow_strength": 1.0
        },
        "box": {
            "color": "#0000FF",
            "style": "sharp", # sharp, rounded, circle
            "radius": 15,
            "gradient": False
        }
    }

    def __init__(self, filepath="config.json"):
        self.filepath = filepath
        self.config = self.load_config()

    def load_config(self):
        if not os.path.exists(self.filepath):
            return self.DEFAULT_CONFIG.copy()
        try:
            with open(self.filepath, "r") as f:
                data = json.load(f)
                # Merge with default to ensure new keys exist
                merged = self.DEFAULT_CONFIG.copy()
                self._recursive_update(merged, data)
                return merged
        except:
            return self.DEFAULT_CONFIG.copy()

    def _recursive_update(self, d, u):
        for k, v in u.items():
            if isinstance(v, dict) and k in d:
                self._recursive_update(d[k], v)
            else:
                d[k] = v

    def save_config(self):
        try:
            with open(self.filepath, "w") as f:
                json.dump(self.config, f, indent=4)
        except Exception as e:
            print(f"Error saving config: {e}")

    def get(self, key, default=None):
        return self.config.get(key, default)

    def set(self, key, value):
        self.config[key] = value
        self.save_config()
