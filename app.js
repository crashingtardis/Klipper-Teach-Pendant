// ==============================================================================
// Klipper Teach Pendant - Hardened Application Logic
// ==============================================================================

const API_BASE = ""; // Relative proxy path
let ws = null;
let currentPosition = { x: "0.00", y: "0.00", z: "0.00" };

document.addEventListener("DOMContentLoaded", () => {
    console.log("[TeachPendant] DOM loaded, initializing...");
    initWebSocket();
    setupEventListeners();
    loadMacrosList();
});

// ==============================================================================
// 1. WebSocket Connection to Moonraker
// ==============================================================================
function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/websocket`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("[TeachPendant] Connected to Moonraker WebSocket");
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
                currentPosition.x = pos[0].toFixed(2);
                currentPosition.y = pos[1].toFixed(2);
                currentPosition.z = pos[2].toFixed(2);
                updateUICoordinates();
            }
        }
    };

    ws.onerror = (err) => console.error("[TeachPendant] WebSocket Error:", err);
    ws.onclose = () => {
        console.warn("[TeachPendant] WebSocket disconnected. Reconnecting in 3s...");
        setTimeout(initWebSocket, 3000);
    };
}

function sendWsCommand(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

// ==============================================================================
// 2. G-Code Execution Helper
// ==============================================================================
async function sendGcode(script) {
    try {
        const response = await fetch(`${API_BASE}/printer/gcode/script?script=${encodeURIComponent(script)}`, {
            method: "POST"
        });
        if (!response.ok) {
            console.error("[TeachPendant] Failed to execute G-code:", script);
        }
    } catch (err) {
        console.error("[TeachPendant] Error sending G-code command:", err);
    }
}

// ==============================================================================
// 3. UI Event Listeners & Jogging Controls
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

    const saveButton = document.getElementById("save-point-btn");
    if (saveButton) {
        console.log("[TeachPendant] Attached event listener to #save-point-btn");
        saveButton.addEventListener("click", () => {
            console.log("[TeachPendant] Save button clicked!");
            const macroName = document.getElementById("macro-name-input")?.value || "TEST_MACRO";
            const locationName = document.getElementById("location-name-input")?.value || "PT1";

            savePendantPoint(macroName, locationName, currentPosition.x, currentPosition.y, currentPosition.z);
        });
    } else {
        console.warn("[TeachPendant] Warning: Could not find #save-point-btn element in HTML!");
    }
}

function updateUICoordinates() {
    const xEl = document.getElementById("pos-x");
    const yEl = document.getElementById("pos-y");
    const zEl = document.getElementById("pos-z");

    if (xEl) xEl.innerText = currentPosition.x;
    if (yEl) yEl.innerText = currentPosition.y;
    if (zEl) zEl.innerText = currentPosition.z;
}

// ==============================================================================
// 4. Reading Macros from teach_pendant.cfg
// ==============================================================================
async function loadMacrosList() {
    const filename = "teach_pendant.cfg";
    const macroContainer = document.getElementById("macro-list");

    try {
        const response = await fetch(`${API_BASE}/server/files/config/${filename}?cachebust=${Date.now()}`);
        if (!response.ok) {
            console.warn(`[TeachPendant] Could not read ${filename}: ${response.statusText}`);
            return;
        }

        const text = await response.text();
        const macroRegex = /\[gcode_macro\s+([a-zA-Z0-9_-]+)\]/gi;
        const macros = [];
        let match;

        while ((match = macroRegex.exec(text)) !== null) {
            macros.push(match[1]);
        }

        console.log("[TeachPendant] Loaded macros from cfg:", macros);

        if (macroContainer) {
            macroContainer.innerHTML = "";
            if (macros.length === 0) {
                macroContainer.innerHTML = "<option disabled>No macros saved yet</option>";
                return;
            }

            macros.forEach(macroName => {
                const opt = document.createElement("option");
                opt.value = macroName;
                opt.textContent = macroName;
                macroContainer.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("[TeachPendant] Error loading macros list:", err);
    }
}

// ==============================================================================
// 5. Writing Points and Macros to teach_pendant.cfg
// ==============================================================================
async function savePendantPoint(macroName, locationName, x, y, z) {
    const filename = "teach_pendant.cfg";
    console.log(`[TeachPendant] Attempting to save point: Macro=${macroName}, Location=${locationName}, Pos=(${x}, ${y}, ${z})`);

    try {
        // Step 1: Read existing contents
        let currentContent = "";
        try {
            const response = await fetch(`${API_BASE}/server/files/config/${filename}?cachebust=${Date.now()}`);
            if (response.ok) {
                currentContent = await response.text();
                console.log("[TeachPendant] Successfully fetched existing config content.");
            }
        } catch (e) {
            console.log("[TeachPendant] File read failed, starting fresh file content.");
        }

        // Step 2: Format new macro block
        const cleanMacroName = macroName.replace(/[^a-zA-Z0-9_]/g, "_");
        const cleanLocationName = locationName.replace(/[^a-zA-Z0-9_]/g, "_");
        const macroIdentifier = `${cleanMacroName}_${cleanLocationName}`.toUpperCase();

        const newMacro = `\n[gcode_macro ${macroIdentifier}]\n` +
                         `gcode:\n` +
                         `    # Position: X=${x}, Y=${y}, Z=${z}\n` +
                         `    G90\n` +
                         `    G1 X${x} Y${y} Z${z} F3000\n`;

        const updatedContent = currentContent + newMacro;

        // Step 3: Post via FormData to Moonraker API
        const formData = new FormData();
        const blob = new Blob([updatedContent], { type: "text/plain" });
        formData.append("file", blob, filename);
        formData.append("root", "config");

        console.log("[TeachPendant] Sending upload request to /server/files/upload...");

        const uploadResponse = await fetch(`${API_BASE}/server/files/upload`, {
            method: "POST",
            body: formData
        });

        if (uploadResponse.ok) {
            console.log(`[TeachPendant] Upload successful! Wrote ${macroIdentifier}`);
            alert(`Saved point: ${macroIdentifier}`);

            // Refresh macro list and trigger Klipper restart
            await loadMacrosList();
            await fetch(`${API_BASE}/printer/gcode/script?script=RESTART`, { method: "POST" });
        } else {
            const errText = await uploadResponse.text();
            console.error("[TeachPendant] Upload API Error:", uploadResponse.status, errText);
            alert(`Upload failed (${uploadResponse.status}): ${errText}`);
        }
    } catch (err) {
        console.error("[TeachPendant] Save error:", err);
        alert(`Error saving point: ${err.message}`);
    }
}
