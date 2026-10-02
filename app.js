// ==============================================================================
// Klipper Teach Pendant - Fully Restored Application Logic
// ==============================================================================

const API_BASE = ""; // Uses relative paths proxied by Nginx/Moonraker
let ws = null;
let currentPosition = { x: "0.00", y: "0.00", z: "0.00" };

document.addEventListener("DOMContentLoaded", () => {
    initWebSocket();
    setupEventListeners();
    loadMacrosList();
});

// ==============================================================================
// 1. WebSocket Connection & Live Coordinates
// ==============================================================================
function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/websocket`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        logToConsole("Connected to Moonraker WebSocket");
        sendWsCommand({
            jsonrpc: "2.0",
            method: "printer.objects.subscribe",
            params: {
                objects: {
                    toolhead: ["position", "homed_axes"],
                    gcode_move: ["gcode_position", "speed_factor"]
                }
            },
            id: 1
        });
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Handle Moonraker status updates
        if (data.params && data.params[0]) {
            const status = data.params[0];

            // Check for gcode_position or toolhead position
            const pos = status.gcode_move?.gcode_position || status.toolhead?.position;
            if (pos) {
                currentPosition.x = parseFloat(pos[0]).toFixed(2);
                currentPosition.y = parseFloat(pos[1]).toFixed(2);
                currentPosition.z = parseFloat(pos[2]).toFixed(2);
                updateUICoordinates();
            }

            // Update motor status badge if homed/enabled state changes
            if (status.toolhead?.homed_axes) {
                const badge = document.getElementById("motorStatusBadge");
                if (badge) {
                    badge.innerText = `Homed: ${status.toolhead.homed_axes.toUpperCase()}`;
                    badge.classList.add("active");
                }
            }
        }
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
    ws.onclose = () => {
        logToConsole("WebSocket disconnected. Reconnecting in 3s...");
        setTimeout(initWebSocket, 3000);
    };
}

function sendWsCommand(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

// ==============================================================================
// 2. G-Code & Console Helpers
// ==============================================================================
async function sendGcode(script) {
    try {
        const response = await fetch(`${API_BASE}/printer/gcode/script?script=${encodeURIComponent(script)}`, {
            method: "POST"
        });
        if (!response.ok) {
            logToConsole(`Failed to execute G-code: ${script}`);
        }
    } catch (err) {
        logToConsole(`Error sending G-code: ${err.message}`);
    }
}

function logToConsole(message) {
    const consoleBody = document.getElementById("consoleBody");
    if (consoleBody) {
        const line = document.createElement("div");
        line.className = "console-line";
        line.innerText = message;
        consoleBody.appendChild(line);
        consoleBody.scrollTop = consoleBody.scrollHeight;
    }
    console.log(message);
}

// ==============================================================================
// 3. UI Event Handlers (Jog, Save, Console Toggle, Joystick Mode)
// ==============================================================================
function setupEventListeners() {
    // Jog Buttons (.hw-jog-btn or .jog-btn)
    document.querySelectorAll(".hw-jog-btn, .jog-btn").forEach(button => {
        button.addEventListener("click", () => {
            const axis = button.dataset.axis;
            const dir = button.dataset.dir || "1";
            const dist = button.dataset.dist || "1";
            const moveVal = button.dataset.axis ? `${dir > 0 ? '' : '-'}${Math.abs(dist)}` : null;

            if (axis && moveVal) {
                sendGcode("G91");
                sendGcode(`G1 ${axis}${moveVal} F3000`);
                sendGcode("G90");
            }
        });
    });

    // Save Point Button Handler
    const saveButton = document.getElementById("saveLocationBtn");
    if (saveButton) {
        saveButton.addEventListener("click", () => {
            const macroName = document.getElementById("macroName")?.value || "TOOL_PATH";
            const locationName = document.getElementById("locationName")?.value || "PT1";
            savePendantPoint(macroName, locationName, currentPosition.x, currentPosition.y, currentPosition.z);
        });
    }

    // Refresh Macros Button
    const refreshBtn = document.getElementById("refreshMacrosBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => loadMacrosList());
    }

    // Console Side Toggle Button
    const consoleToggleBtn = document.getElementById("consoleToggleBtn");
    const pendantWrapper = document.getElementById("pendantWrapper");
    if (consoleToggleBtn && pendantWrapper) {
        consoleToggleBtn.addEventListener("click", () => {
            // Swap flex order or toggle side class
            const consoleCol = document.getElementById("consoleColumn");
            if (consoleCol) {
                const currentOrder = window.getComputedStyle(consoleCol).order;
                consoleCol.style.order = currentOrder === "1" ? "3" : "1";
                logToConsole("Toggled execution log position.");
            }
        });
    }

    // Joystick vs Buttons Mode Toggle (Radio Buttons)
    document.querySelectorAll('input[name="xyMode"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            const mode = e.target.value;
            const xyButtons = document.getElementById("xyButtons");
            const joystickOuter = document.getElementById("xyJoystickOuter");

            if (mode === "joystick") {
                if (xyButtons) xyButtons.style.display = "none";
                if (joystickOuter) joystickOuter.classList.remove("disabled");
                logToConsole("Switched to Joystick mode.");
            } else {
                if (xyButtons) xyButtons.style.display = "flex";
                if (joystickOuter) joystickOuter.classList.add("disabled");
                logToConsole("Switched to Button mode.");
            }
        });
    });
}

function updateUICoordinates() {
    const vx = document.getElementById("valX");
    const vy = document.getElementById("valY");
    const vz = document.getElementById("valZ");

    if (vx) vx.innerText = currentPosition.x;
    if (vy) vy.innerText = currentPosition.y;
    if (vz) vz.innerText = currentPosition.z;
}

// ==============================================================================
// 4. Reading Macros from teach_pendant.cfg via REST API
// ==============================================================================
async function loadMacrosList() {
    const filename = "teach_pendant.cfg";
    const macroContainer = document.getElementById("macroSelect");

    try {
        const response = await fetch(`${API_BASE}/server/files/config/${filename}?${Date.now()}`);
        if (!response.ok) return;

        const text = await response.text();
        const macroRegex = /\[gcode_macro\s+([a-zA-Z0-9_-]+)\]/gi;
        const macros = [];
        let match;

        while ((match = macroRegex.exec(text)) !== null) {
            macros.push(match[1]);
        }

        if (macroContainer) {
            macroContainer.innerHTML = "";
            if (macros.length === 0) {
                macroContainer.innerHTML = "<option disabled>No macros saved yet</option>";
                return;
            }

            const defaultOpt = document.createElement("option");
            defaultOpt.value = "";
            defaultOpt.textContent = "-- Select Macro --";
            macroContainer.appendChild(defaultOpt);

            macros.forEach(macroName => {
                const opt = document.createElement("option");
                opt.value = macroName;
                opt.textContent = macroName;
                macroContainer.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Error loading macros list:", err);
    }
}

// ==============================================================================
// 5. Saving Points directly to teach_pendant.cfg via Moonraker REST API
// ==============================================================================
async function savePendantPoint(macroName, locationName, x, y, z) {
    const filename = "teach_pendant.cfg";

    try {
        let currentContent = "";
        try {
            const response = await fetch(`${API_BASE}/server/files/config/${filename}?${Date.now()}`);
            if (response.ok) {
                currentContent = await response.text();
            }
        } catch (e) {
            logToConsole("Creating fresh config file content.");
        }

        const cleanMacroName = macroName.replace(/[^a-zA-Z0-9_]/g, "_");
        const cleanLocationName = locationName.replace(/[^a-zA-Z0-9_]/g, "_");
        const macroIdentifier = `${cleanMacroName}_${cleanLocationName}`.toUpperCase();

        const newMacro = `\n[gcode_macro ${macroIdentifier}]\n` +
            `gcode:\n` +
            `    # Position: X=${x}, Y=${y}, Z=${z}\n` +
            `    G90\n` +
            `    G1 X${x} Y${y} Z${z} F3000\n`;

        const updatedContent = currentContent + newMacro;

        const formData = new FormData();
        const blob = new Blob([updatedContent], { type: "text/plain" });
        formData.append("file", blob, filename);
        formData.append("root", "config");
        formData.append("path", filename);

        const uploadResponse = await fetch(`${API_BASE}/server/files/upload`, {
            method: "POST",
            body: formData
        });

        if (uploadResponse.ok) {
            logToConsole(`Successfully saved macro [${macroIdentifier}] to ${filename}`);
            alert(`Saved point: ${macroIdentifier}`);

            await loadMacrosList();
            await fetch(`${API_BASE}/printer/gcode/script?script=RESTART`, { method: "POST" });
        } else {
            const errText = await uploadResponse.text();
            logToConsole(`Upload error: ${errText}`);
            alert(`Failed to save: ${uploadResponse.statusText}`);
        }
    } catch (err) {
        logToConsole(`Save error: ${err.message}`);
        alert(`Error saving point: ${err.message}`);
    }
}