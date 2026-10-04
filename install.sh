#!/usr/bin/env bash
set -e

# ==============================================================================
# Klipper Teach Pendant Installer
#
# KEY DESIGN: Web files are served DIRECTLY from the git repo directory so that
# Moonraker's update manager (git pull) serves new files IMMEDIATELY.
# No file-copying step is needed -- updates are always live.
# ==============================================================================

# --- Color formatting ---
SR_RESET="$(tput sgr0)"
SR_GREEN="$(tput setaf 2)"
SR_YELLOW="$(tput setaf 3)"
SR_BLUE="$(tput setaf 4)"
SR_CYAN="$(tput setaf 6)"
SR_BOLD="$(tput bold)"

report_status() { echo -e "${SR_CYAN}${SR_BOLD}[INFO] ${SR_RESET}${SR_BOLD}$1${SR_RESET}"; }
report_ok()     { echo -e "${SR_GREEN}${SR_BOLD}[OK] ${SR_RESET}$1"; }
report_warning(){ echo -e "${SR_YELLOW}${SR_BOLD}[WARN] ${SR_RESET}$1"; }
report_error()  { echo -e "${SR_RED}${SR_BOLD}[ERROR] ${SR_RESET}$1"; exit 1; }

USER_DIR="/home/${USER}"
REPO_DIR="${USER_DIR}/Klipper-Teach-Pendant"

# Detect printer data / config directory
if [ -d "${USER_DIR}/printer_data/config" ]; then
    CONFIG_DIR="${USER_DIR}/printer_data/config"
elif [ -d "${USER_DIR}/klipper_config" ]; then
    CONFIG_DIR="${USER_DIR}/klipper_config"
else
    report_error "Could not detect a standard Klipper environment."
fi

MOONRAKER_CONF="${CONFIG_DIR}/moonraker.conf"
PRINTER_CONF="${CONFIG_DIR}/printer.cfg"
PENDANT_CFG="${CONFIG_DIR}/teach_pendant.cfg"
THEME_DIR="${CONFIG_DIR}/.theme"

echo -e "${SR_BLUE}${SR_BOLD}"
echo "=================================================="
echo "    Installing Klipper Teach Pendant"
echo "=================================================="
echo -e "${SR_RESET}"

# ------------------------------------------------------------------------------
# 1. Moonraker Update Manager
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# 2. Klipper configuration: teach_pendant.cfg + printer.cfg include
# ------------------------------------------------------------------------------
report_status "Setting up Klipper configuration..."
if [ ! -f "$PENDANT_CFG" ]; then
    echo "# Teach Pendant Saved Points" > "$PENDANT_CFG"
fi
if [ -f "$PRINTER_CONF" ] && ! grep -q "\[include teach_pendant.cfg\]" "$PRINTER_CONF"; then
    if grep -q "<---------------------- SAVE_CONFIG ---------------------->" "$PRINTER_CONF"; then
        sed -i "/#\*# <---------------------- SAVE_CONFIG ---------------------->/i [include teach_pendant.cfg]\n" "$PRINTER_CONF"
    else
        echo -e "\n[include teach_pendant.cfg]" >> "$PRINTER_CONF"
    fi
    report_ok "Injected teach_pendant.cfg into printer.cfg"
fi

# ------------------------------------------------------------------------------
# 3. Mainsail Sidebar Navigation
# ------------------------------------------------------------------------------
report_status "Configuring Mainsail Sidebar UI tab..."
mkdir -p "${THEME_DIR}"
cat << 'NAVEOF' > "${THEME_DIR}/navi.json"
[
  {
    "title": "Teach Pendant",
    "href": "/klipper-teach-pendant/index.html",
    "target": "_blank",
    "position": 35,
    "icon": "M13,6V11H18V8L22,12L18,16V13H13V18H16L12,22L8,18H11V13H6V16L2,12L6,8V11H11V6H8L12,2L16,6H13Z"
  }
]
NAVEOF
report_ok "Navigation registered."

# ------------------------------------------------------------------------------
# 4. Nginx Routing -- alias points DIRECTLY at the git repo directory.
#    Every git pull by the update manager = files live immediately.
#    No file copying ever needed again.
# ------------------------------------------------------------------------------
report_status "Configuring Nginx routing (serving directly from git repo)..."
NGINX_CONF="/etc/nginx/sites-available/mainsail"

python3 - << PYEOF
import re, sys

path = "${NGINX_CONF}"
repo_dir = "${REPO_DIR}"

try:
    with open(path, "r") as f:
        content = f.read()

    block = (
        "\n    # Klipper Teach Pendant - served directly from git repo\n"
        "    location /klipper-teach-pendant/ {\n"
        "        alias " + repo_dir + "/;\n"
        "        index index.html;\n"
        '        try_files $uri $uri/ =404;\n'
        "    }\n"
    )

    if "klipper-teach-pendant" in content:
        updated = re.sub(
            r'(location /klipper-teach-pendant/\s*\{[^}]*?alias\s+)[^\n;]+;',
            r'\g<1>' + repo_dir + '/;',
            content,
            flags=re.DOTALL
        )
        if updated != content:
            with open(path, "w") as f:
                f.write(updated)
            print("Updated existing Nginx alias to repo path.")
        else:
            print("Nginx block already correct.")
    else:
        idx = content.rfind("}")
        if idx != -1:
            new_content = content[:idx] + block + "\n}"
            with open(path, "w") as f:
                f.write(new_content)
            print("Nginx routing block injected.")
        else:
            print("Could not find closing brace in Nginx config.")
            sys.exit(1)
except Exception as e:
    print(f"Error updating Nginx config: {e}")
    sys.exit(1)
PYEOF

if sudo -n true 2>/dev/null; then
    if sudo nginx -t 2>&1; then
        sudo systemctl reload nginx
        report_ok "Nginx reloaded successfully."
    else
        echo -e "${SR_YELLOW}[WARN] Nginx config test failed. Check /etc/nginx/sites-available/mainsail manually.${SR_RESET}"
    fi
else
    echo -e "${SR_YELLOW}Run: sudo nginx -t && sudo systemctl reload nginx${SR_RESET}"
fi

echo ""
echo -e "${SR_GREEN}${SR_BOLD}   Installation Complete!${SR_RESET}"
echo -e "${SR_GREEN}   Web files served from: ${REPO_DIR}${SR_RESET}"
echo -e "${SR_GREEN}   Future Mainsail updates take effect immediately -- no reinstall needed.${SR_RESET}"
