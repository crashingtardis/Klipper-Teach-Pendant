# teach_pendant.py

import logging
import json
import os

class TeachPendant:
    def __init__(self, config):
        self.server = config.get_server()
        self.name = config.get_name()
        
        # Define a path to store the taught points (e.g., in the printer_data/config folder)
        self.data_path = os.path.join(config.get('data_path', '/home/pi/printer_data'), "config", "pendant_points.json")
        
        # Register the remote method so Klipper macros and Mainsail can trigger it
        self.server.register_remote_method(
            "save_taught_point",
            self.save_taught_point
        )
        
        logging.info("Teach Pendant component loaded.")

    def save_taught_point(self, **kwargs):
        """
        Receives coordinate data and saves it to a JSON file.
        Expected kwargs: point_name (str), x (float), y (float), z (float)
        """
        point_name = kwargs.get('point_name', 'default_point')
        x_pos = kwargs.get('x', 0.0)
        y_pos = kwargs.get('y', 0.0)
        z_pos = kwargs.get('z', 0.0)

        # Load existing points
        points = {}
        if os.path.exists(self.data_path):
            with open(self.data_path, 'r') as f:
                try:
                    points = json.load(f)
                except json.JSONDecodeError:
                    pass

        # Update and save the new point
        points[point_name] = {"X": x_pos, "Y": y_pos, "Z": z_pos}
        
        with open(self.data_path, 'w') as f:
            json.dump(points, f, indent=4)

        logging.info(f"Saved {point_name} at X:{x_pos} Y:{y_pos} Z:{z_pos}")
        
        # Return a success response to the API caller
        return {"status": "success", "point": point_name, "coordinates": points[point_name]}

# Moonraker expects this function to initialize the component
def load_component(config):
    return TeachPendant(config)