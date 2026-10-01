#!/bin/bash

# --- Configuration Paths ---
CONFIG_DIR="${HOME}/printer_data/config"
MOONRAKER_CONF="${CONFIG_DIR}/moonraker.conf"
PRINTER_CONF="${CONFIG_DIR}/printer.cfg"
PEARL_CFG="${CONFIG_DIR}/teach_pendant.cfg"
WEB_DIR="${HOME}/printer_data/system/klipper-teach-pendant"

echo "=================================================="
echo "Installing Klipper Teach Pendant..."
echo "=================================================="

# 1. Create web directory and copy files
mkdir -p "${WEB_DIR}"
if [ -f "index.html" ]; then
    cp index.html styles.css app.js klipper-logo.png "${WEB_DIR}/"
    echo "✔ Front-end files copied to ${WEB_DIR}"
else
    echo "✖ Error: Front-end files not found in the current directory."
    exit 1
fi

# 2. Automatically add Update Manager entry to moonraker.conf
if [ -f "$MOONRAKER_CONF" ]; then
    if ! grep -q "\[update_manager klipper-teach-pendant\]" "$MOONRAKER_CONF"; then
        echo "" >> "$MOONRAKER_CONF"
        echo "[update_manager klipper-teach-pendant]" >> "$MOONRAKER_CONF"
        echo "type: git_repo" >> "$MOONRAKER_CONF"
        echo "path: ${HOME}/Klipper-Teach-Pendant" >> "$MOONRAKER_CONF"
        echo "origin: https://github.com/crashingtardis/Klipper-Teach-Pendant.git" >> "$MOONRAKER_CONF"
        echo "primary_branch: main" >> "$MOONRAKER_CONF"
        echo "is_system_service: False" >> "$MOONRAKER_CONF"
        echo "managed_services: klipper" >> "$MOONRAKER_CONF"
        echo "✔ Added [update_manager klipper-teach-pendant] to moonraker.conf"
    else
        echo "ℹ Update manager block already exists in moonraker.conf"
    fi
else
    echo "⚠ Warning: moonraker.conf not found at ${MOONRAKER_CONF}."
fi

# 3. Create teach_pendant.cfg if it does not exist
if [ ! -f "$PEARL_CFG" ]; then
    touch "$PEARL_CFG"
    echo "# Teach Pendant Saved Points" > "$PEARL_CFG"
    echo "✔ Created empty teach_pendant.cfg"
else
    echo "ℹ teach_pendant.cfg already exists."
fi

# 4. Add [include teach_pendant.cfg] to printer.cfg before SAVE_CONFIG block if missing
if [ -f "$PRINTER_CONF" ]; then
    if ! grep -q "\[include teach_pendant.cfg\]" "$PRINTER_CONF"; then
        if grep -q "<---------------------- SAVE_CONFIG ---------------------->" "$PRINTER_CONF"; then
            # Insert right before the SAVE_CONFIG comment block using sed
            sed -i '/#\*# <---------------------- SAVE_CONFIG ---------------------->/i [include teach_pendant.cfg]\n' "$PRINTER_CONF"
            echo "✔ Added [include teach_pendant.cfg] to printer.cfg before SAVE_CONFIG block"
        else
            # Fallback to appending at the end if SAVE_CONFIG block isn't found
            echo "" >> "$PRINTER_CONF"
            echo "[include teach_pendant.cfg]" >> "$PRINTER_CONF"
            echo "✔ Added [include teach_pendant.cfg] to the end of printer.cfg"
        fi
    else
        echo "ℹ [include teach_pendant.cfg] already present in printer.cfg"
    fi
else
    echo "⚠ Warning: printer.cfg not found at ${PRINTER_CONF}."
fi

# 5. Register inside Mainsail Navigation
THEME_DIR="${CONFIG_DIR}/.theme"
mkdir -p "${THEME_DIR}"

cat << 'EOF' > "${THEME_DIR}/navi.json"
[
  {
    "title": "Teach Pendant",
    "href": "/teach_pendant/index.html",
    "target": "_self",
    "position": 35,
    "icon": "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,7V11H7V13H11V17H13V13H17V11H13V7H11Z"
  }
]
EOF
echo "✔ Custom navigation registered in Mainsail"

echo "=================================================="
echo "Installation Complete!"
echo "Please restart Moonraker and Klipper to apply changes."
echo "=================================================="
