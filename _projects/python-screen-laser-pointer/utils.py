import time
from PyQt6.QtCore import QPointF
from PyQt6.QtGui import QColor

class LaserStroke:
    def __init__(self, color: QColor, lifetime: float = 3.0):
        self.points = []  # List of (QPointF, timestamp)
        self.color = color
        self.lifetime = lifetime
        self.creation_time = time.time()
        self.is_finished = False # Set when stroke is done (mouse released)

    def add_point(self, point: QPointF):
        current_time = time.time()
        
        if not self.points:
            self.points.append((point, current_time))
            return
            
        last_point, last_time = self.points[-1]
        dist = ((point.x() - last_point.x())**2 + (point.y() - last_point.y())**2)**0.5
        
        # Interpolate if gap > 2 pixels (Finer smoothness)
        if dist > 2:
            steps = int(dist / 2)
            for i in range(1, steps):
                t = i / steps
                x = last_point.x() + (point.x() - last_point.x()) * t
                y = last_point.y() + (point.y() - last_point.y()) * t
                # Interpolate time as well? Yes, to keep smooth fade
                interpolated_time = last_time + (current_time - last_time) * t
                self.points.append((QPointF(x, y), interpolated_time))
        
        self.points.append((point, current_time))

    def is_expired(self):
        if not self.points:
            return True
        # Check if the last point is older than lifetime? 
        # Or maybe the whole stroke fades out based on its individual point ages?
        # Simpler: The whole stroke fades out after the last point is added?
        # User asked for "about 3 seconds it will disappear".
        # Let's say points fade individually or the stroke fades as a whole.
        # "Laser tail" usually means old points disappear. 
        # "Disappear after 3 seconds" might mean the ink stays for 3s then fades?
        # Let's go with: Points have a timestamp. We render segments. Opacity based on age.
        return len(self.points) == 0

    def prune(self, current_time):
        # Remove points older than lifetime
        self.points = [p for p in self.points if current_time - p[1] < self.lifetime]

