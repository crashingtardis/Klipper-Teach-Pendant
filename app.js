// ==============================================================================
// Klipper Teach Pendant - Main Application Logic (Fully Fixed ID Sync)
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
// 3. UI Event Handlers (Matched to index.html IDs)
// ==============================================================================
function setupEventListeners() {
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

    // Matched to id="saveLocationBtn" in index.html
    const saveButton = document.getElementById("saveLocationBtn");
    if (saveButton) {
        saveButton.addEventListener("click", () => {
            // Matched to id="macroName" and id="locationName" in index.html
            const macroName = document.getElementById("macroName")?.value || "TEST_MACRO";
            const locationName = document.getElementById("locationName")?.value || "PT1";

            savePendantPoint(macroName, locationName, currentPosition.x, currentPosition.y, currentPosition.z);
        });
    } else {
        console.warn("Could not find saveLocationBtn element!");
    }
}

function updateUICoordinates() {
    const xEl = document.getElementById("pos-x");
    const yEl = document.getElementById("pos-y");
    const zEl = document.getElementById("pos-z");

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
    const macroContainer = document.getElementById("macroSelect");

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
            console.log("Creating fresh config file content.");
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
        formData.append("path", filename); // Required for Moonraker file updates

        const uploadResponse = await fetch(`${API_BASE}/server/files/upload`, {
            method: "POST",
            body: formData
        });

        if (uploadResponse.ok) {
            console.log(`Saved macro [${macroIdentifier}] to ${filename}`);
            alert(`Saved point: ${macroIdentifier}`);

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