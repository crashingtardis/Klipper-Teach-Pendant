# teach_pendant.py

import logging
import os
import re

class TeachPendant:
    def __init__(self, config):
        self.server = config.get_server()
        self.name = config.get_name()
        self.config_dir = os.path.join(config.get('data_path', '/home/pi/printer_data'), "config")
        
        # Register remote methods
        self.server.register_remote_method("save_taught_point", self.save_taught_point)
        self.server.register_remote_method("get_pendant_macros", self.get_pendant_macros)
        
        logging.info("Teach Pendant component loaded with macro parsing and stepping capabilities.")

    def _get_file_path(self, target_file):
        safe_filename = os.path.basename(target_file)
        return os.path.join(self.config_dir, safe_filename)

    async def save_taught_point(self, **kwargs):
        macro_name = kwargs.get('MACRO_NAME', 'TOOL_PATH').upper()
        location_name = kwargs.get('LOCATION_NAME', 'point_1').lower()
        target_file = kwargs.get('FILE', 'teach_pendant.cfg')
        coord_mode = kwargs.get('MODE', 'ABSOLUTE')
        x = kwargs.get('X', 0.0)
        y = kwargs.get('Y', 0.0)
        z = kwargs.get('Z', 0.0)

        file_path = self._get_file_path(target_file)
        mode_cmd = "G90" if coord_mode == "ABSOLUTE" else "G91"

        try:
            content = ""
            if os.path.exists(file_path):
                with open(file_path, 'r') as f:
                    content = f.read()

            macro_header = f"[gcode_macro {macro_name}]"
            
            if macro_header in content:
                # Macro exists, insert the new point before the end of the block or append inside
                parts = content.split(macro_header)
                macro_body = parts[1].split('[gcode_macro')[0] # Grab this macro's section
                
                new_point_code = f"    # Location: {location_name}\n    {mode_cmd}\n    G1 X{x:.2f} Y{y:.2f} Z{z:.2f} F3000\n"
                
                # Insert right after the 'gcode:' line
                if "gcode:" in macro_body:
                    body_parts = macro_body.split("gcode:")
                    updated_macro_body = body_parts[0] + "gcode:\n" + new_point_code + body_parts[1]
                    content = parts[0] + macro_header + updated_macro_body + "".join(['[gcode_macro' + p for p in parts[1].split('[gcode_macro')[1:]]) if len(parts[1].split('[gcode_macro')) > 1 else parts[0] + macro_header + updated_macro_body
            else:
                # Create a new macro block
                new_macro_block = f"\n{macro_header}\ndescription: Taught point sequence\ngcode:\n    # Location: {location_name}\n    {mode_cmd}\n    G1 X{x:.2f} Y{y:.2f} Z{z:.2f} F3000\n"
                content += new_macro_block

            with open(file_path, 'w') as f:
                f.write(content)

            return {"status": "success", "macro": macro_name, "location": location_name}

        except Exception as e:
            logging.error(f"Teach Pendant Save Error: {str(e)}")
            return {"status": "error", "message": str(e)}

    async def get_pendant_macros(self, **kwargs):
        target_file = kwargs.get('FILE', 'teach_pendant.cfg')
        file_path = self._get_file_path(target_file)
        
        macros = {}
        if not os.path.exists(file_path):
            return {"macros": {}}

        with open(file_path, 'r') as f:
            lines = f.readlines()

        current_macro = None
        current_loc = "unknown_point"

        for line in lines:
            line_str = line.strip()
            macro_match = re.match(r'\[gcode_macro\s+([A-Za-z0-9_]+)\]', line_str, re.IGNORECASE)
            if macro_match:
                current_macro = macro_match.group(1)
                macros[current_macro] = []
                continue
            
            if line_str.startswith('# Location:'):
                current_loc = line_str.replace('# Location:', '').strip()
                continue

            if current_macro and line_str.startswith('G1 '):
                macros[current_macro].append({"location": current_loc, "gcode": line_str})

        return {"macros": macros}

def load_component(config):
    return TeachPendant(config)