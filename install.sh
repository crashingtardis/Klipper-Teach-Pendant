#!/usr/bin/env bash
set -e

# ==============================================================================
# Klipper Teach Pendant Installer (Final Stable Version)
# ==============================================================================

# --- Color formatting ---
SR_RESET="$(tput sgr0)"
SR_GREEN="$(tput setaf 2)"
SR_YELLOW="$(tput setaf 3)"
SR_BLUE="$(tput setaf 4)"
SR_CYAN="$(tput setaf 6)"
SR_BOLD="$(tput bold)"

report_status() { echo -e "${SR_CYAN}${SR_BOLD}[INFO] ${SR_RESET}${SR_BOLD}$1${SR_RESET}"; }
report_ok() { echo -e "${SR_GREEN}${SR_BOLD}[OK] ${SR_RESET}$1"; }
report_warning() { echo -e "${SR_YELLOW}${SR_BOLD}[WARN] ${SR_RESET}$1"; }
report_error() { echo -e "${SR_RED}${SR_BOLD}[ERROR] ${SR_RESET}$1"; exit 1; }

USER_DIR="/home/${USER}"
REPO_DIR="${USER_DIR}/Klipper-Teach-Pendant"
PRINTER_DATA="${USER_DIR}/printer_data"
WEB_DIR="${PRINTER_DATA}/klipper-teach-pendant"

if [ -d "${PRINTER_DATA}/config" ]; then
    CONFIG_DIR="${PRINTER_DATA}/config"
elif [ -d "${USER_DIR}/klipper_config" ]; then
    CONFIG_DIR="${USER_DIR}/klipper_config"
else
    report_error "Could not detect a standard Klipper environment."
fi

MOONRAKER_CONF="${CONFIG_DIR}/moonraker.conf"
PRINTER_CONF="${CONFIG_DIR}/printer.cfg"
PEARL_CFG="${CONFIG_DIR}/teach_pendant.cfg"
THEME_DIR="${CONFIG_DIR}/.theme"

echo -e "${SR_BLUE}${SR_BOLD}"
echo "=================================================="
echo "    Installing Klipper Teach Pendant"
echo "=================================================="
echo -e "${SR_RESET}"

# 1. Deploy Frontend Web Assets
report_status "Deploying front-end web files to ${WEB_DIR}..."
mkdir -p "${WEB_DIR}"
if [ -f "index.html" ]; then
    cp -f index.html styles.css app.js klipper-logo.png "${WEB_DIR}/" 2>/dev/null || true
elif [ -f "${REPO_DIR}/index.html" ]; then
    cp -f "${REPO_DIR}/index.html" "${REPO_DIR}/styles.css" "${REPO_DIR}/app.js" "${REPO_DIR}/klipper-logo.png" "${WEB_DIR}/" 2>/dev/null || true
fi
report_ok "Web files deployed."

# 2. Configure Moonraker Update Manager
report_status "Configuring Moonraker Update Manager..."
if [ -f "$MOONRAKER_CONF" ]; then
    if grep -q "\[update_manager klipper-teach-pendant\]" "$MOONRAKER_CONF"; then
        sed -i '/\[update_manager klipper-teach-pendant\]/,/^$/d' "$MOONRAKER_CONF"
    fi
    cat << EOF >> "$MOONRAKER_CONF"

[update_manager klipper-teach-pendant]
type: git_repo
path: ${REPO_DIR}
origin: https://github.com/crashingtardis/Klipper-Teach-Pendant.git
primary_branch: main
is_system_service: False
managed_services: klipper
install_script: install.sh
EOF
    report_ok "Added Update Manager to moonraker.conf."
fi

# 3. Setup teach_pendant.cfg and printer.cfg include
report_status "Setting up Klipper configuration..."
if [ ! -f "$PEARL_CFG" ]; then 
    echo "# Teach Pendant Saved Points" > "$PEARL_CFG"
fi
if [ -f "$PRINTER_CONF" ] && ! grep -q "\[include teach_pendant.cfg\]" "$PRINTER_CONF"; then
    if grep -q "<---------------------- SAVE_CONFIG ---------------------->" "$PRINTER_CONF"; then
        sed -i '/#\*# <---------------------- SAVE_CONFIG ---------------------->/i [include teach_pendant.cfg]\n' "$PRINTER_CONF"
    else
        echo -e "\n[include teach_pendant.cfg]" >> "$PRINTER_CONF"
    fi
    report_ok "Injected teach_pendant.cfg into printer.cfg"
fi

# 4. Mainsail Sidebar Navigation Integration
report_status "Configuring Mainsail Sidebar UI tab..."
mkdir -p "${THEME_DIR}"
cat << 'EOF' > "${THEME_DIR}/navi.json"
[
  {
    "title": "Teach Pendant",
    "route": "iframe",
    "params": {
      "url": "/klipper-teach-pendant/index.html"
    },
    "position": 35,
    "icon": "M18.41,4L16,6.41V6.59L18.41,9H22V11H17.59L16,9.41V12H15A2,2 0 0,1 13,10V7.5H9.86C9.77,7.87 9.62,8.22 9.42,8.55L15.18,19H20A2,2 0 0,1 22,21V22H2V21A2,2 0 0,1 4,19H10.61L5.92,10.5C4.12,10.47 2.56,9.24 2.11,7.5C1.56,5.36 2.87,3.05 5,2.5C7.14,1.96 9.45,3.27 10,5.41C10.27,6.5 10.07,7.58 9.54,8.45H13V5A2,2 0 0,1 15,3H16V4L18.41,4Z"
  }
]
EOF
report_ok "Navigation registered."

# 5. Configure Nginx Server Routing (Requires Sudo)
report_status "Configuring Nginx routing block..."
python3 -c '
path = "/etc/nginx/sites-available/mainsail"
try:
    with open(path, "r") as f:
        content = f.read()

    block = """
    # Klipper Teach Pendant Routing
    location /klipper-teach-pendant/ {
        alias '"${WEB_DIR}"'/;
        index index.html;
        try_files $uri $uri/ =404;
    }
"""

    if "klipper-teach-pendant" not in content:
        idx = content.rfind("}")
        if idx != -1:
            new_content = content[:idx] + block + "\n}"
            with open(path, "w") as f:
                f.write(new_content)
            print("✔ Nginx routing block injected successfully.")
        else:
            print("✖ Could not find closing brace.")
    else:
        print("ℹ Nginx routing block already exists.")
except Exception as e:
    print(f"Error updating Nginx config: {e}")
'

if sudo -n true 2>/dev/null; then
    sudo nginx -t && sudo systemctl restart nginx
    report_ok "Nginx routing configured and restarted."
else
    echo -e "${SR_YELLOW}Run 'sudo nginx -t && sudo systemctl restart nginx' via SSH if prompted.${SR_RESET}"
fi

echo -e "${SR_GREEN}${SR_BOLD}   Installation Complete!${SR_RESET}"
