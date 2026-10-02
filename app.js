// ==============================================================================
// Klipper Teach Pendant - Main Application Logic
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
// 1. WebSocket Connection for Live Coordinates
// ==============================================================================
function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/websocket`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("Connected to Moonraker WebSocket");
        // Subscribe to toolhead position updates
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

        // Handle live coordinate updates
        if (data.params && data.params[0]) {
            const status = data.params[0];
            if (status.gcode_move && status.gcode_move.gcode_position) {
                const pos = status.gcode_move.gcode_position;
                currentPosition.x = parseFloat(pos[0]).toFixed(2);
                currentPosition.y = parseFloat(pos[1]).toFixed(2);
                currentPosition.z = parseFloat(pos[2]).toFixed(2);
                updateUICoordinates();
            }
        }
    };

    ws.onerror = (err) => console.error("WebSocket Error:", err);
    ws.onclose = () => {
        console.warn("WebSocket disconnected. Reconnecting in 3s...");
        setTimeout(initWebSocket, 3000);
    };
}

function sendWsCommand(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

// ==============================================================================
// 2. G-Code Helper
// ==============================================================================
async function sendGcode(script) {
    try {
        const response = await fetch(`${API_BASE}/printer/gcode/script?script=${encodeURIComponent(script)}`, {
            method: "POST"
        });
        if (!response.ok) {
            console.error("Failed to execute G-code:", script);
        }
    } catch (err) {
        console.error("Error sending G-code command:", err);
    }
}

// ==============================================================================
// 3. UI Event Handlers (Fixed to match index.html IDs)
// ==============================================================================
function setupEventListeners() {
    // Jog button handlers (.jog-btn elements with data-axis and data-dist attributes)
    document.querySelectorAll(".jog-btn").forEach(button => {
        button.addEventListener("click", () => {
            const axis = button.dataset.axis;
            const dist = button.dataset.dist;
            const feedrate = button.dataset.feedrate || "3000";

            sendGcode("G91");
            sendGcode(`G1 ${axis}${dist} F${feedrate}`);
            sendGcode("G90");
        });
    });

    // Save Point Button Listener - Using your EXACT HTML ID
    const saveBtn = document.getElementById("saveLocationBtn");
    if (saveBtn) {
        saveBtn.addEventListener("click", () => triggerSaveFromUI());
    } else {
        console.warn("[TeachPendant] Could not find saveLocationBtn");
    }

    // Refresh Macros Button
    const refreshBtn = document.getElementById("refreshMacrosBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => loadMacrosList());
    }
}

function triggerSaveFromUI() {
    // Using your EXACT HTML IDs
    const macroName = document.getElementById("macroName")?.value || "PICK";
    const locationName = document.getElementById("locationName")?.value || "PT1";
    savePendantPoint(macroName, locationName, currentPosition.x, currentPosition.y, currentPosition.z);
}

// Legacy alias in case anything else tries to call saveLocation directly
window.saveLocation = function (macroName, locationName, x, y, z) {
    const mName = macroName || document.getElementById("macroName")?.value || "PICK";
    const lName = locationName || document.getElementById("locationName")?.value || "PT1";
    const posX = x !== undefined ? x : currentPosition.x;
    const posY = y !== undefined ? y : currentPosition.y;
    const posZ = z !== undefined ? z : currentPosition.z;

    savePendantPoint(mName, lName, posX, posY, posZ);
};

function updateUICoordinates() {
    const xEl = document.getElementById("pos-x");
    const yEl = document.getElementById("pos-y");
    const zEl = document.getElementById("pos-z");

    // Note: If your HTML uses valX, valY, valZ instead, updating those too
    const vx = document.getElementById("valX");
    const vy = document.getElementById("valY");
    const vz = document.getElementById("valZ");

    if (xEl) xEl.innerText = currentPosition.x;
    if (yEl) yEl.innerText = currentPosition.y;
    if (zEl) zEl.innerText = currentPosition.z;

    if (vx) vx.innerText = currentPosition.x;
    if (vy) vy.innerText = currentPosition.y;
    if (vz) vz.innerText = currentPosition.z;
}

// ==============================================================================
// 4. Reading Macros from teach_pendant.cfg via REST API
// ==============================================================================
async function loadMacrosList() {
    const filename = "teach_pendant.cfg";
    const macroContainer = document.getElementById("macroSelect"); // Using your EXACT HTML ID

    try {
        const response = await fetch(`${API_BASE}/server/files/config/${filename}?${Date.now()}`);
        if (!response.ok) {
            console.warn(`Could not read ${filename}: ${response.statusText}`);
            return;
        }

        const text = await response.text();
        const macroRegex = /\[gcode_macro\s+([a-zA-Z0-9_-]+)\]/gi;
        const macros = [];
        let match;

        while ((match = macroRegex.exec(text)) !== null) {
            macros.push(match[1]);
        }

        console.log("Loaded pendant macros from cfg:", macros);

        if (macroContainer) {
            macroContainer.innerHTML = "";
            if (macros.length === 0) {
                macroContainer.innerHTML = "<option disabled>No macros saved yet</option>";
                return;
            }

            // Keep the default "Select Macro" option
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
        // Step 1: Read existing content
        let currentContent = "";
        try {
            const response = await fetch(`${API_BASE}/server/files/config/${filename}?${Date.now()}`);
            if (response.ok) {
                currentContent = await response.text();
            }
        } catch (e) {
            console.log("Creating fresh config file content.");
        }

        // Step 2: Format G-Code Macro
        const cleanMacro = macroName.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
        const cleanLocation = locationName.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
        const macroIdentifier = `${cleanMacro}_${cleanLocation}`;

        const newMacro = `\n[gcode_macro ${macroIdentifier}]\n` +
            `gcode:\n` +
            `    # Position: X=${x}, Y=${y}, Z=${z}\n` +
            `    G90\n` +
            `    G1 X${x} Y${y} Z${z} F3000\n`;

        const updatedContent = currentContent + newMacro;

        // Step 3: Upload via Moonraker API
        const formData = new FormData();
        const blob = new Blob([updatedContent], { type: "text/plain" });
        formData.append("file", blob, filename);
        formData.append("root", "config");

        const uploadResponse = await fetch(`${API_BASE}/server/files/upload`, {
            method: "POST",
            body: formData
        });

        if (uploadResponse.ok) {
            console.log(`[TeachPendant] Successfully saved [${macroIdentifier}] to ${filename}`);

            // Log to the on-screen console if it exists
            const consoleLine = document.createElement("div");
            consoleLine.className = "console-line";
            consoleLine.innerText = `Saved point: ${macroIdentifier}`;
            document.getElementById("consoleBody")?.appendChild(consoleLine);

            // Refresh macro list and reload Klipper config
            await loadMacrosList();
            await fetch(`${API_BASE}/printer/gcode/script?script=RESTART`, { method: "POST" });
        } else {
            const errText = await uploadResponse.text();
            console.error("Upload error:", errText);
            alert(`Failed to save: ${uploadResponse.statusText}`);
        }
    } catch (err) {
        console.error("Save error:", err);
        alert(`Error saving point: ${err.message}`);
    }
}