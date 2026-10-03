# 🎛️ Klipper Teach Pendant

A physical-style virtual teach pendant web interface designed for Klipper/Moonraker 3D printers. It provides intuitive manual jogging (via individual buttons or a constrained analog-style virtual joystick), real-time coordinate readouts, emergency stop controls, step-through macro playback, and direct point touch-up capabilities.

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

### Quick Install via SSH

1. Connect to your Klipper host machine via SSH:
2. Clone the repository directly from GitHub:

   ```bash
   git clone https://github.com/crashingtardis/Klipper-Teach-Pendant.git 

3. Navigate into the cloned directory:

   ```bash
   cd Klipper-Teach-Pendant

3. Run the following command to execute the installer:

   ```bash
   chmod +x install.sh
   ./install.sh

---

## 📖 Usage Guide

⚡ Power On Motors: Click or tap the Motors key-switch at the top right of the pendant. The switch will rotate into the ON position, enabling the jog buttons and virtual joystick.

🎚️ Select Jog Mode: Under the hardware control column, use the toggle to choose between Buttons or Joystick.

📏 Change Step Distance: Click any of the step size buttons (0.1mm, 0.5mm, 1mm, 5mm, 10mm, 25mm) to adjust your incremental movement size.

📍 Save Points: Enter your overall Macro Name and individual Location Name in the "Add Point to Macro File" panel, then click Save Point to Macro.

▶️ Step-Through Playback:

Select your macro from the dropdown list.

Click Run to execute the entire macro sequence, or use Prev and Next to step through individual moves one at a time while viewing active targets highlighted in the console log.

🎯 Touch Up Points: While stepping through a macro, if a position needs adjustment, jog the machine to the correct location and click Touch Up / Update Active Point to update those coordinates instantly.

---
