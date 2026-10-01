#!/usr/bin/env bash
set -e

# ==============================================================================
# Klipper Teach Pendant Installer
# ==============================================================================

# --- Color formatting ---
SR_RESET="$(tput sgr0)"
SR_RED="$(tput setaf 1)"
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

if [ -d "${PRINTER_DATA}/config" ]; then
    CONFIG_DIR="${PRINTER_DATA}/config"
elif [ -d "${USER_DIR}/klipper_config" ]; then
    CONFIG_DIR="${USER_DIR}/klipper_config"
else
    report_error "Could not detect a standard Klipper environment."
fi

# *** THE FIX: Deploy web files INSIDE the theme folder which is already exposed via Nginx ***
THEME_DIR="${CONFIG_DIR}/.theme"
WEB_DIR="${THEME_DIR}/teach-pendant"

MOONRAKER_CONF="${CONFIG_DIR}/moonraker.conf"
PRINTER_CONF="${CONFIG_DIR}/printer.cfg"
PEARL_CFG="${CONFIG_DIR}/teach_pendant.cfg"

echo -e "${SR_BLUE}${SR_BOLD}"
echo "=================================================="
echo "    Installing Klipper Teach Pendant"
echo "=================================================="
echo -e "${SR_RESET}"

report_status "Detected configuration path: ${CONFIG_DIR}"
report_status "Detected target web path: ${WEB_DIR}"

# 1. Deploy Frontend Web Assets
report_status "Deploying front-end web files..."
mkdir -p "${WEB_DIR}"

if [ -f "index.html" ]; then
    cp -f index.html styles.css app.js klipper-logo.png "${WEB_DIR}/"
    report_ok "Front-end files forcefully updated in ${WEB_DIR}"
elif [ -f "${REPO_DIR}/index.html" ]; then
    cp -f "${REPO_DIR}/index.html" "${REPO_DIR}/styles.css" "${REPO_DIR}/app.js" "${REPO_DIR}/klipper-logo.png" "${WEB_DIR}/"
    report_ok "Front-end files forcefully updated from repo directory."
else
    report_error "Front-end source files not found."
fi

# 2. Configure Moonraker Update Manager
report_status "Configuring Moonraker Update Manager..."
if [ -f "$MOONRAKER_CONF" ]; then
    if grep -q "\[update_manager klipper-teach-pendant\]" "$MOONRAKER_CONF"; then
        sed -i '/\[update_manager klipper-teach-pendant\]/,/^$/d' "$MOONRAKER_CONF"
        report_ok "Removed legacy update manager block from moonraker.conf."
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
    report_ok "Added [update_manager klipper-teach-pendant] to moonraker.conf."
else
    report_warning "moonraker.conf not found."
fi

# 3. Prepare Klipper Config (teach_pendant.cfg)
report_status "Setting up Klipper configuration file..."
if [ ! -f "$PEARL_CFG" ]; then
    echo "# Teach Pendant Saved Points" > "$PEARL_CFG"
    report_ok "Created empty teach_pendant.cfg for point storage."
else
    report_ok "teach_pendant.cfg already exists (preserving user data)."
fi

# 4. Inject [include] into printer.cfg
report_status "Injecting configuration include into printer.cfg..."
if [ -f "$PRINTER_CONF" ]; then
    if ! grep -q "\[include teach_pendant.cfg\]" "$PRINTER_CONF"; then
        if grep -q "<---------------------- SAVE_CONFIG ---------------------->" "$PRINTER_CONF"; then
            sed -i '/#\*# <---------------------- SAVE_CONFIG ---------------------->/i [include teach_pendant.cfg]\n' "$PRINTER_CONF"
            report_ok "Added [include teach_pendant.cfg] before the SAVE_CONFIG block."
        else
            echo "" >> "$PRINTER_CONF"
            echo "[include teach_pendant.cfg]" >> "$PRINTER_CONF"
            report_ok "Added [include teach_pendant.cfg] to the bottom of printer.cfg."
        fi
    else
        report_ok "[include teach_pendant.cfg] is already present."
    fi
else
    report_warning "printer.cfg not found."
fi

# 5. Mainsail Navigation Integration
report_status "Configuring Mainsail Sidebar UI tab..."

# *** THE FIX: Point href to the pre-existing /theme route in Mainsail ***
cat << 'EOF' > "${THEME_DIR}/navi.json"
[
  {
    "title": "Teach Pendant",
    "href": "/theme/teach-pendant/index.html",
    "target": "_self",
    "position": 35,
    "icon": "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,7V11H7V13H11V17H13V13H17V11H13V7H11Z"
  }
]
EOF
report_ok "Custom navigation tab registered in ${THEME_DIR}/navi.json."

echo -e "${SR_GREEN}${SR_BOLD}"
echo "=================================================="
echo "   Installation Complete!"
echo "   Please hard-refresh Mainsail (Ctrl+F5)."
echo "=================================================="
echo -e "${SR_RESET}"
