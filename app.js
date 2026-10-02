// ==============================================================================
// Klipper Teach Pendant - Main Application Logic
// ==============================================================================

const API_BASE = ""; // Uses relative paths proxied by Nginx/Moonraker
let ws = null;
let currentPosition = { x: 0, y: 0, z: 0 };

document.addEventListener("DOMContentLoaded", () => {
    initWebSocket();
    setupEventListeners();
});

// ==============================================================================
// 1. WebSocket Connection to Moonraker
// ==============================================================================
function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/websocket`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("Connected to Moonraker WebSocket");
        // Subscribe to printer state objects to get live coordinates
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
        
        // Handle incoming status updates for live position display
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
// 2. G-Code Execution Helper
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
// 3. UI Event Listeners & Jogging Controls
// ==============================================================================
function setupEventListeners() {
    // Example binding for jog buttons (assumes buttons have class .jog-btn with data-axis and data-dist)
    document.querySelectorAll(".jog-btn").forEach(button => {
        button.addEventListener("click", () => {
            const axis = button.dataset.axis; // e.g., 'X', 'Y', 'Z'
            const dist = button.dataset.dist; // e.g., '10', '1', '-10'
            const feedrate = button.dataset.feedrate || "3000";

            sendGcode("G91");
            sendGcode(`G1 ${axis}${dist} F${feedrate}`);
            sendGcode("G90");
        });
    });

    // Save Point Form / Button Listener
    const saveButton = document.getElementById("save-point-btn");
    if (saveButton) {
        saveButton.addEventListener("click", () => {
            const macroName = document.getElementById("macro-name-input")?.value || "TEST_MACRO";
            const locationName = document.getElementById("location-name-input")?.value || "pt1";
            
            savePendantPoint(macroName, locationName, currentPosition.x, currentPosition.y, currentPosition.z);
        });
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
// 4. Writing Points and Macros to teach_pendant.cfg
// ==============================================================================
async function savePendantPoint(macroName, locationName, x, y, z) {
    const filename = "teach_pendant.cfg";

    try {
        // Step 1: Fetch the existing contents of teach_pendant.cfg from the config folder
        let currentContent = "";
        try {
            const response = await fetch(`${API_BASE}/server/files/config/${filename}`);
            if (response.ok) {
                currentContent = await response.text();
            }
        } catch (e) {
            console.log("teach_pendant.cfg is empty or couldn't be read, creating fresh.");
        }

        // Step 2: Format the new G-code macro block
        const macroIdentifier = `${macroName}_${locationName}`.toUpperCase();
        const newMacro = `\n[gcode_macro ${macroIdentifier}]\n` +
                         `gcode:\n` +
                         `    # Auto-saved position: X=${x}, Y=${y}, Z=${z}\n` +
                         `    G90\n` +
                         `    G1 X${x} Y${y} Z${z} F3000\n`;

        // Append the new macro to the existing text
        const updatedContent = currentContent + newMacro;

        // Step 3: Package and upload the updated file back to Moonraker's config root
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
            console.log(`Successfully wrote macro [${macroIdentifier}] to /home/crashingtardis/printer_data/config/${filename}`);
            
            // Step 4: Trigger a firmware restart / config reload so Klipper registers the new macro instantly
            await fetch(`${API_BASE}/printer/print/restart`, { method: "POST" });
            alert(`Successfully saved and registered point: ${locationName}!`);
        } else {
            console.error("Failed to write to teach_pendant.cfg via Moonraker API.");
            alert("Error writing point to configuration file.");
        }
    } catch (err) {
        console.error("Communication error with Moonraker API:", err);
        alert("Network error communicating with printer API.");
    }
}
