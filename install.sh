#!/bin/bash

# --- Configuration Paths (Modify if your setup differs) ---
CONFIG_DIR="${HOME}/printer_data/config"
MOONRAKER_CONF="${CONFIG_DIR}/moonraker.conf"
WEB_DIR="${HOME}/printer_data/system/klipper-teach-pendant" # Adjust to your web client directory if needed

# 1. Create web directory if it doesn't exist
mkdir -p "${WEB_DIR}"

# 2. Copy front-end and backend files
cp index.html styles.css app.js klipper-logo.png "${WEB_DIR}/"
# Copy your python backend component script to your moonraker extra args / components folder if applicable

echo "Files successfully copied to ${WEB_DIR}"

# 3. Automatically add Update Manager entry to moonraker.conf
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
        echo "Added [update_manager klipper-teach-pendant] to $MOONRAKER_CONF"
    else
        echo "Update manager block already exists in moonraker.conf"
    fi
else
    echo "Warning: moonraker.conf not found at ${MOONRAKER_CONF}. Please add the update manager block manually."
fi

# --- Register inside Mainsail Navigation ---
THEME_DIR="${HOME}/printer_data/config/.theme"
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

echo "Custom navigation added to Mainsail!"
echo "Installation complete! Please restart Moonraker."
