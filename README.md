# 🎛️ Klipper Teach Pendant

A physical-style virtual teach pendant web interface designed for Klipper/Moonraker 3D printers and CNC machines. It provides intuitive manual jogging (via individual buttons or a constrained analog-style virtual joystick), real-time coordinate readouts, emergency stop controls, step-through macro playback, and direct point touch-up capabilities.

---

## 🌟 Features

* **Dual Jogging Modes**: 🕹️ Seamlessly toggle between individual axis buttons (`+`/`-` for X, Y, Z) and a constrained multi-directional virtual joystick without layout shifting.
* **Macro Recording & Playback**: 💾 Save custom coordinate points into structured G-code macros and step through them sequentially (both forward and backward).
* **Point Touch-Up**: ✏️ Instantly overwrite and update existing macro location points with your live axis coordinates after adjusting position.
* **Configurable Settings**: ⚙️ Customize jog distances, step counts, joystick rates, default file names, and switch between dark and light themes.
* **Safety Features**: 🛑 Hardware-styled motorized key-switch interlock and a prominent E-stop button (`M112`).

---

## 📦 Installation

You can automate the installation using the provided `install.sh` script. It will automatically place your web files into your client directory and configure the backend Python extension for Moonraker.

### Quick Install via Script

1. Clone or download this repository onto your Klipper host machine.
2. Open your terminal and navigate to the folder containing the installation files.
3. Run the following command to execute the installer:
   ```bash
   chmod +x install.sh
   ./install.sh