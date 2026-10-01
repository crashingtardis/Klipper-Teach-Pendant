#!/bin/bash

# Define standard paths for a typical Klipper/Moonraker installation
MOONRAKER_COMPONENTS_DIR="${HOME}/moonraker/moonraker/components"
CONFIG_DIR="${HOME}/printer_data/config"

# Get the absolute path of the directory containing this script
REPO_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "Installing Teach Pendant Plugin..."

# 1. Link the Moonraker Python Component
if [ -d "$MOONRAKER_COMPONENTS_DIR" ]; then
    ln -sf "${REPO_DIR}/teach_pendant.py" "${MOONRAKER_COMPONENTS_DIR}/teach_pendant.py"
    echo "✓ Linked teach_pendant.py to Moonraker"
else
    echo "Error: Moonraker components directory not found at $MOONRAKER_COMPONENTS_DIR"
    exit 1
fi

# 2. Link the Klipper Macro Config
if [ -d "$CONFIG_DIR" ]; then
    ln -sf "${REPO_DIR}/teach_pendant.cfg" "${CONFIG_DIR}/teach_pendant.cfg"
    echo "✓ Linked teach_pendant.cfg to Klipper config directory"
    echo "⚠️  IMPORTANT: Add [include teach_pendant.cfg] to your printer.cfg"
else
    echo "Error: Klipper config directory not found at $CONFIG_DIR"
    exit 1
fi

# 3. Restart Moonraker to load the new python component
echo "Restarting Moonraker service..."
sudo systemctl restart moonraker

echo "Installation complete!"