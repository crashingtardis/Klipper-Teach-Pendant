// ==============================================================================
// Klipper Teach Pendant - Main Application Logic
// ==============================================================================

const API_BASE = ""; // Relative paths proxied by Nginx / Moonraker
let ws = null;
let currentPosition = { x: "0.00", y: "0.00", z: "0.00" };
let motorsEnabled = false;

// Jogging & Motion Configuration
let jogSteps = [0.1, 0.5, 1, 5, 10, 25];
let currentStep = 1;
const feedrate = 3000; // legacy fallback, not used directly
let feedrateMmS = 50;  // User-configurable feed rate in mm/s (converted to mm/min for G-code)
let invertAxes = false;
let swapAxes = false;
let joystickCmdsPerSec = 1.0;
let isLightMode = false;

// Macro & Naming Configuration
let defaultMacroFile = "teach_pendant.cfg";
let defaultNamePattern = "PT*";
let wildcardChar = "*";
let wildcardCounter = 1;
let loadedMacrosData = {}; // Structure: { MACRO_NAME: [ { location, mode, x, y, z, feedrate, gcode } ] }
let currentStepIndex = 0;

// Virtual Joystick State
let isDragging = false;
let jogInterval = null;
const maxRadius = 32;

// ==============================================================================
// 1. Lifecycle Initialization
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
    initUI();
    setupEventListeners();
    initWebSocket();
    fetchPosition();
    loadMacrosList();
});

function initUI() {
    renderStepButtons();
    updateLocationField();
    updateJoystickLabels();
    updateMotorState(false);
    updateResponsiveLayoutState();
    window.addEventListener("resize", updateResponsiveLayoutState);

    // Detect if running inside Mainsail's iframe panel
    try {
        if (window !== window.top) {
            document.body.classList.add("in-iframe");
        }
    } catch (e) {
        document.body.classList.add("in-iframe");
    }
}

// ==============================================================================
// 2. WebSocket & Position Polling
// ==============================================================================
function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "localhost";
    const wsUrl = `${protocol}//${host}/websocket`;

    try {
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
            try {
                const data = JSON.parse(event.data);
                const status = (data.params && data.params[0]) || (data.result && data.result.status);
                if (status) {
                    handleStatusUpdate(status);
                }
            } catch (err) {
                console.error("Error processing WebSocket message:", err);
            }
        };

        ws.onerror = (err) => {
            console.warn("WebSocket connection error:", err);
        };

        ws.onclose = () => {
            logToConsole("WebSocket disconnected. Reconnecting in 4s...");
            setTimeout(initWebSocket, 4000);
        };
    } catch (e) {
        console.warn("WebSocket could not be initialized:", e);
    }
}

function handleStatusUpdate(status) {
    const pos = status.gcode_move?.gcode_position || status.toolhead?.position;
    if (pos && Array.isArray(pos)) {
        currentPosition.x = parseFloat(pos[0]).toFixed(2);
        currentPosition.y = parseFloat(pos[1]).toFixed(2);
        currentPosition.z = parseFloat(pos[2]).toFixed(2);
        updateUICoordinates();
    }

    if (status.toolhead?.homed_axes !== undefined) {
        const homed = status.toolhead.homed_axes;
        const badge = document.getElementById("motorStatusBadge");
        if (badge && motorsEnabled) {
            badge.innerText = homed ? `Homed: ${homed.toUpperCase()}` : "Motors Enabled (Unhomed)";
        }
    }
}

function sendWsCommand(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

async function fetchPosition() {
    try {
        const res = await fetch(`${API_BASE}/printer/objects/query?toolhead&gcode_move`);
        if (res.ok) {
            const data = await res.json();
            const status = data.result?.status;
            if (status) handleStatusUpdate(status);
        }
    } catch (error) {
        // Fallback or offline dev mode
    }
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
// 3. G-Code & Console Helpers
// ==============================================================================
async function sendGcode(script) {
    try {
        const response = await fetch(`${API_BASE}/printer/gcode/script?script=${encodeURIComponent(script)}`, {
            method: "POST"
        });
        if (!response.ok) {
            logToConsole(`G-code error: ${script}`);
        }
    } catch (err) {
        logToConsole(`Error sending G-code: ${err.message}`);
    }
}

function logToConsole(message, lineId = null, isActiveTarget = false) {
    const consoleBody = document.getElementById("consoleBody");
    if (consoleBody) {
        if (isActiveTarget) {
            document.querySelectorAll(".console-line.active-target").forEach(el => el.classList.remove("active-target"));
        }
        const line = document.createElement("div");
        line.className = "console-line" + (isActiveTarget ? " active-target" : "");
        if (lineId) line.id = lineId;
        line.innerText = message;
        consoleBody.appendChild(line);
        consoleBody.scrollTop = consoleBody.scrollHeight;
    }
    console.log(message);
}

function toggleConsoleSide() {
    const consoleCol = document.getElementById("consoleColumn");
    if (!consoleCol) return;

    if (window.innerWidth <= 860) {
        consoleCol.classList.toggle("collapsed");
        const isCollapsed = consoleCol.classList.contains("collapsed");
        const btn = document.getElementById("consoleToggleBtn");
        if (btn) btn.innerText = isCollapsed ? "▲ Show Log" : "▼ Hide Log";
        logToConsole(isCollapsed ? "Execution log minimized." : "Execution log expanded.");
    } else {
        const currentOrder = window.getComputedStyle(consoleCol).order;
        consoleCol.style.order = currentOrder === "1" ? "3" : "1";
        logToConsole("Toggled execution log position.");
    }
}

function updateResponsiveLayoutState() {
    const btn = document.getElementById("consoleToggleBtn");
    const consoleCol = document.getElementById("consoleColumn");
    if (!btn || !consoleCol) return;

    if (window.innerWidth <= 860) {
        const isCollapsed = consoleCol.classList.contains("collapsed");
        btn.innerText = isCollapsed ? "▲ Show Log" : "▼ Hide Log";
        btn.title = isCollapsed ? "Expand Execution Log" : "Collapse Execution Log";
    } else {
        btn.innerText = "⇄ Side";
        btn.title = "Switch Side";
    }
}

// ==============================================================================
// 4. Motor Interlock & E-Stop
// ==============================================================================
function updateMotorState(isEnabled) {
    motorsEnabled = isEnabled;
    const buttons = document.querySelectorAll(".hw-jog-btn");
    const joystickOuter = document.getElementById("xyJoystickOuter");
    const badge = document.getElementById("motorStatusBadge");

    buttons.forEach(btn => btn.disabled = !isEnabled);

    if (isEnabled) {
        if (joystickOuter) joystickOuter.classList.remove("disabled");

        const isFullyHomed = homedAxes.includes("x") && homedAxes.includes("y") && homedAxes.includes("z");
        if (!isFullyHomed) {
            const unhomedMsg = "Please home the printer.";
            logToConsole(`⚠️ ${unhomedMsg}`);
            if (badge) {
                badge.textContent = unhomedMsg;
                badge.classList.remove("active");
            }
            alert(unhomedMsg);
        } else {
            if (badge) {
                badge.textContent = `Homed: ${homedAxes.toUpperCase()}`;
                badge.classList.add("active");
            }
            logToConsole(`Teach Pendant Enabled (Homed: ${homedAxes.toUpperCase()}).`);
        }
    } else {
        if (joystickOuter) joystickOuter.classList.add("disabled");
        if (badge) {
            badge.textContent = "Motors Disabled";
            badge.classList.remove("active");
        }
        //sendGcode("M84"); // Stepper motors unpowered
        logToConsole("Teach Pendant Disabled.");
    }
}

function triggerEStop() {
    sendGcode("M112");
    logToConsole("!! EMERGENCY STOP TRIGGERED (M112) !!");

    const checkbox = document.getElementById("motorToggle");
    if (checkbox) checkbox.checked = false;
    updateMotorState(false);

    alert("EMERGENCY STOP (M112) TRIGGERED");
}

// ==============================================================================
// 5. Step Distance Selection
// ==============================================================================
function renderStepButtons() {
    const container = document.getElementById("stepSelector");
    if (!container) return;
    container.innerHTML = "";

    jogSteps.forEach((dist) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "step-btn" + (dist === currentStep ? " active" : "");
        btn.innerText = `${dist}mm`;

        btn.addEventListener("click", () => {
            document.querySelectorAll(".step-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentStep = dist;
            logToConsole(`Step size set to ${currentStep}mm`);
        });

        container.appendChild(btn);
    });
}

// ==============================================================================
// 6. Manual Jogging (Buttons & Vector)
// ==============================================================================
function jog(axis, direction) {
    if (!motorsEnabled) {
        logToConsole("Jog rejected: Turn ON the Motors switch first.");
        return;
    }

    let targetAxis = axis;
    let dir = direction;

    if (targetAxis === "X" || targetAxis === "Y") {
        if (swapAxes) targetAxis = (targetAxis === "X") ? "Y" : "X";
        if (invertAxes) dir *= -1;
    }

    const distance = (currentStep * dir).toFixed(3).replace(/\.?0+$/, "");
    const fVal = Math.round(feedrateMmS * 60);
    sendGcode("G91");
    sendGcode(`G1 ${targetAxis}${distance} F${fVal}`);
    sendGcode("G90");

    logToConsole(`Jog ${targetAxis}: ${dir > 0 ? "+" : ""}${distance}mm`);
    setTimeout(fetchPosition, 150);
}

function jogVector(xDir, yDir) {
    if (!motorsEnabled) return;

    let finalX = xDir;
    let finalY = yDir;

    if (swapAxes) {
        const temp = finalX;
        finalX = finalY;
        finalY = temp;
    }
    if (invertAxes) {
        finalX *= -1;
        finalY *= -1;
    }

    let moveParts = [];
    if (finalX !== 0) moveParts.push(`X${(currentStep * finalX).toFixed(3).replace(/\.?0+$/, "")}`);
    if (finalY !== 0) moveParts.push(`Y${(currentStep * finalY).toFixed(3).replace(/\.?0+$/, "")}`);
    if (moveParts.length === 0) return;

    const fVal = Math.round(feedrateMmS * 60);
    sendGcode("G91");
    sendGcode(`G1 ${moveParts.join(" ")} F${fVal}`);
    sendGcode("G90");

    logToConsole(`Joystick Move: ${moveParts.join(", ")}`);
    setTimeout(fetchPosition, 150);
}

function switchXYMode(mode) {
    const xyButtons = document.getElementById("xyButtons");
    const joystickOuter = document.getElementById("xyJoystickOuter");

    if (mode === "joystick") {
        if (xyButtons) xyButtons.style.display = "none";
        if (joystickOuter) {
            joystickOuter.style.display = "flex";
            if (motorsEnabled) joystickOuter.classList.remove("disabled");
        }
        logToConsole("Switched to Joystick mode.");
    } else {
        if (xyButtons) xyButtons.style.display = "flex";
        if (joystickOuter) joystickOuter.style.display = "none";
        logToConsole("Switched to Button mode.");
    }
}

// ==============================================================================
// 7. Analog-Style Virtual Joystick Controls
// ==============================================================================
function handleJoystickStart(e) {
    if (!motorsEnabled) return;
    isDragging = true;
    if (e.cancelable && e.type.startsWith("touch")) e.preventDefault();

    const stick = document.getElementById("joystickStick");
    if (stick) stick.style.transition = "none";
    handleJoystickMove(e);
}

function handleJoystickMove(e) {
    if (!isDragging || !motorsEnabled) return;
    if (e.cancelable && e.type.startsWith("touch")) e.preventDefault();

    const base = document.getElementById("xyJoystick");
    const stick = document.getElementById("joystickStick");
    if (!base || !stick) return;

    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);

    let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    // Constrain stick movement to 8 sectors (45 degree increments)
    const sector = Math.round(angle / 45) * 45;
    const snappedRad = (sector * Math.PI) / 180;
    const currentRadius = Math.min(distance, maxRadius);

    const constrainedX = Math.cos(snappedRad) * currentRadius;
    const constrainedY = -Math.sin(snappedRad) * currentRadius;

    stick.style.transform = `translate(${constrainedX}px, ${constrainedY}px)`;

    // Engage movement when moved beyond 35% of max radius
    if (currentRadius > maxRadius * 0.35) {
        let xMult = 0;
        let yMult = 0;

        if (sector === 0 || sector === 360) { xMult = 1; yMult = 0; }
        else if (sector === 45) { xMult = 1; yMult = 1; }
        else if (sector === 90) { xMult = 0; yMult = 1; }
        else if (sector === 135) { xMult = -1; yMult = 1; }
        else if (sector === 180) { xMult = -1; yMult = 0; }
        else if (sector === 225) { xMult = -1; yMult = -1; }
        else if (sector === 270) { xMult = 0; yMult = -1; }
        else if (sector === 315) { xMult = 1; yMult = -1; }

        const intervalMs = Math.max(100, Math.round(1000 / joystickCmdsPerSec));

        if (!jogInterval) {
            jogVector(xMult, yMult);
            jogInterval = setInterval(() => { jogVector(xMult, yMult); }, intervalMs);
        }
    } else {
        if (jogInterval) {
            clearInterval(jogInterval);
            jogInterval = null;
        }
    }
}

function handleJoystickEnd() {
    if (!isDragging) return;
    isDragging = false;

    const stick = document.getElementById("joystickStick");
    if (stick) {
        stick.style.transition = "transform 0.2s cubic-bezier(0.68, -0.55, 0.265, 1.55)";
        stick.style.transform = "translate(0px, 0px)";
    }

    if (jogInterval) {
        clearInterval(jogInterval);
        jogInterval = null;
    }
}

function updateJoystickLabels() {
    let topLabel = "+Y";
    let bottomLabel = "-Y";
    let rightLabel = "+X";
    let leftLabel = "-X";

    if (swapAxes) {
        topLabel = invertAxes ? "-X" : "+X";
        bottomLabel = invertAxes ? "+X" : "-X";
        rightLabel = invertAxes ? "-Y" : "+Y";
        leftLabel = invertAxes ? "+Y" : "-Y";
    } else if (invertAxes) {
        topLabel = "-Y";
        bottomLabel = "+Y";
        rightLabel = "-X";
        leftLabel = "+X";
    }

    const yp = document.getElementById("labelYP");
    const ym = document.getElementById("labelYM");
    const xp = document.getElementById("labelXP");
    const xm = document.getElementById("labelXM");

    if (yp) yp.innerText = topLabel;
    if (ym) ym.innerText = bottomLabel;
    if (xp) xp.innerText = rightLabel;
    if (xm) xm.innerText = leftLabel;
}

// ==============================================================================
// 8. Settings Modal Management
// ==============================================================================
function openSettings() {
    const grid = document.getElementById("settingsGrid");
    if (grid) {
        grid.innerHTML = "";
        for (let i = 0; i < 6; i++) {
            const val = jogSteps[i] !== undefined ? jogSteps[i] : "";
            grid.innerHTML += `<div class="settings-grid-item"><label>${i + 1}:</label><input type="number" id="jogVal${i}" step="0.1" value="${val}"></div>`;
        }
    }

    const rateInput = document.getElementById("joystickRateInput");
    if (rateInput) rateInput.value = joystickCmdsPerSec;
    const feedrateInp = document.getElementById("feedrateInput");
    if (feedrateInp) feedrateInp.value = feedrateMmS;
    const fileInput = document.getElementById("macroFileInput");
    if (fileInput) fileInput.value = defaultMacroFile;
    const patternInput = document.getElementById("namePatternInput");
    if (patternInput) patternInput.value = defaultNamePattern;
    const wildcardInput = document.getElementById("wildcardCharInput");
    if (wildcardInput) wildcardInput.value = wildcardChar;
    const themeSelect = document.getElementById("themeSelect");
    if (themeSelect) themeSelect.value = isLightMode ? "light" : "dark";
    const invertCheck = document.getElementById("invertAxisCheck");
    if (invertCheck) invertCheck.checked = invertAxes;
    const swapCheck = document.getElementById("swapAxesCheck");
    if (swapCheck) swapCheck.checked = swapAxes;

    const overlay = document.getElementById("settingsOverlay");
    if (overlay) overlay.style.display = "flex";
}

function closeSettings() {
    const overlay = document.getElementById("settingsOverlay");
    if (overlay) overlay.style.display = "none";
}

function applySettings() {
    let newSteps = [];
    for (let i = 0; i < 6; i++) {
        const inp = document.getElementById(`jogVal${i}`);
        if (inp && inp.value !== "" && !isNaN(inp.value) && parseFloat(inp.value) > 0) {
            newSteps.push(parseFloat(inp.value));
        }
    }
    if (newSteps.length > 0) {
        jogSteps = newSteps;
        if (!jogSteps.includes(currentStep)) currentStep = jogSteps[0];
        renderStepButtons();
    }

    const rateInp = parseFloat(document.getElementById("joystickRateInput")?.value);
    if (!isNaN(rateInp) && rateInp > 0) {
        joystickCmdsPerSec = rateInp;
    }

    const frInp = parseFloat(document.getElementById("feedrateInput")?.value);
    if (!isNaN(frInp) && frInp > 0) {
        feedrateMmS = frInp;
    }

    const fileInp = document.getElementById("macroFileInput")?.value.trim();
    if (fileInp && fileInp !== defaultMacroFile) {
        defaultMacroFile = fileInp;
        loadMacrosList();
    }

    const patternInp = document.getElementById("namePatternInput")?.value.trim();
    const wildcardInp = document.getElementById("wildcardCharInput")?.value.trim();
    if (patternInp && wildcardInp) {
        defaultNamePattern = patternInp;
        wildcardChar = wildcardInp.charAt(0);
        wildcardCounter = 1;
        updateLocationField();
    }

    const themeVal = document.getElementById("themeSelect")?.value;
    isLightMode = (themeVal === "light");
    if (isLightMode) {
        document.body.classList.add("light-mode");
    } else {
        document.body.classList.remove("light-mode");
    }

    invertAxes = !!document.getElementById("invertAxisCheck")?.checked;
    swapAxes = !!document.getElementById("swapAxesCheck")?.checked;

    updateJoystickLabels();
    closeSettings();
    logToConsole("Pendant settings updated.");
}

function updateLocationField() {
    const locInput = document.getElementById("locationName");
    if (locInput && (!locInput.value || locInput.value.startsWith("PT"))) {
        locInput.value = defaultNamePattern.replace(wildcardChar, wildcardCounter);
    }
}

// ==============================================================================
// 9. Macro Loading & Parsing
// ==============================================================================
function parseConfigMacros(text) {
    const macros = {};
    const lines = text.split(/\r?\n/);
    let currentMacro = null;
    let currentLocation = null;
    let currentMode = "G90";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check for macro header: [gcode_macro NAME]
        const macroMatch = line.match(/^\[gcode_macro\s+([a-zA-Z0-9_-]+)\]/i);
        if (macroMatch) {
            const name = macroMatch[1];
            if (name.toUpperCase() !== "SAVE_PENDANT_LOCATION") {
                currentMacro = name;
                if (!macros[currentMacro]) macros[currentMacro] = [];
            } else {
                currentMacro = null;
            }
            currentLocation = null;
            currentMode = "G90";
            continue;
        }

        // Only parse lines inside an active taught macro section
        if (!currentMacro) continue;

        const locMatch = line.match(/^#\s*(?:Location|Point|Position):\s*(.*)/i);
        if (locMatch) {
            currentLocation = locMatch[1].trim();
            continue;
        }

        if (line === "G90" || line === "G91") {
            currentMode = line;
            continue;
        }

        if (line.startsWith("G1 ") || line.startsWith("G0 ")) {
            const xMatch = line.match(/X([-\d.]+)/i);
            const yMatch = line.match(/Y([-\d.]+)/i);
            const zMatch = line.match(/Z([-\d.]+)/i);
            const fMatch = line.match(/F([-\d.]+)/i);

            const ptLoc = currentLocation || `PT${macros[currentMacro].length + 1}`;
            macros[currentMacro].push({
                location: ptLoc,
                mode: currentMode,
                x: xMatch ? xMatch[1] : currentPosition.x,
                y: yMatch ? yMatch[1] : currentPosition.y,
                z: zMatch ? zMatch[1] : currentPosition.z,
                feedrate: fMatch ? fMatch[1] : "3000",
                gcode: line
            });
            currentLocation = null;
        }
    }
    return macros;
}

async function loadMacrosList() {
    const macroSelect = document.getElementById("macroSelect");

    try {
        const response = await fetch(`${API_BASE}/server/files/config/${defaultMacroFile}?${Date.now()}`);
        if (!response.ok) {
            logToConsole(`Notice: Config file ${defaultMacroFile} not yet initialized.`);
            return;
        }

        const text = await response.text();
        loadedMacrosData = parseConfigMacros(text);

        if (macroSelect) {
            const previousVal = macroSelect.value;
            macroSelect.innerHTML = '<option value="">-- Select Macro --</option>';

            const macroNames = Object.keys(loadedMacrosData);
            if (macroNames.length === 0) {
                macroSelect.innerHTML = '<option value="">(No macros saved yet)</option>';
                return;
            }

            macroNames.forEach(name => {
                const opt = document.createElement("option");
                opt.value = name;
                opt.textContent = `${name} (${loadedMacrosData[name].length} pts)`;
                macroSelect.appendChild(opt);
            });

            if (previousVal && loadedMacrosData[previousVal]) {
                macroSelect.value = previousVal;
            }
        }
    } catch (err) {
        console.error("Error loading macro list:", err);
    }
}

function updateStepSelection() {
    currentStepIndex = 0;
    const macroSelect = document.getElementById("macroSelect");
    const macroName = macroSelect ? macroSelect.value : "";
    const consoleBody = document.getElementById("consoleBody");
    if (!consoleBody) return;

    consoleBody.innerHTML = "";
    if (macroName && loadedMacrosData[macroName]) {
        const points = loadedMacrosData[macroName];
        logToConsole(`--- Loaded Macro: ${macroName} (${points.length} points) ---`);
        points.forEach((pt, idx) => {
            const lineId = `macro-line-${macroName}-${idx}`;
            logToConsole(`[${idx + 1}] ${pt.location}: ${pt.gcode}`, lineId);
        });
        if (points.length > 0) {
            logToConsole("Ready to step. Click 'Next' to execute the first move.");
        }
    } else {
        logToConsole("// Pendant Ready...");
    }
}

// ==============================================================================
// 10. Macro Execution & Step-Through
// ==============================================================================
function runContinuous() {
    const macroSelect = document.getElementById("macroSelect");
    const macroName = macroSelect ? macroSelect.value : "";
    if (!macroName) {
        alert("Please select a macro from the dropdown first.");
        return;
    }
    const points = loadedMacrosData[macroName];
    if (!points || points.length === 0) {
        alert("No points recorded in this macro.");
        return;
    }

    logToConsole(`Executing Full Macro Sequence: ${macroName}...`);
    sendGcode(macroName);
}

function stepNext() {
    const macroSelect = document.getElementById("macroSelect");
    const macroName = macroSelect ? macroSelect.value : "";
    if (!macroName) {
        alert("Please select a macro from the dropdown first.");
        return;
    }
    const points = loadedMacrosData[macroName];
    if (!points || points.length === 0) {
        alert("No points found in this macro.");
        return;
    }

    if (currentStepIndex >= points.length) {
        alert("Reached the end of macro point sequence. Stepping will reset to start.");
        currentStepIndex = 0;
    }

    const step = points[currentStepIndex];
    highlightConsoleLine(macroName, currentStepIndex);

    logToConsole(`Stepping to [${step.location}] (${currentStepIndex + 1}/${points.length})`);
    if (step.mode) sendGcode(step.mode);
    sendGcode(step.gcode);

    currentStepIndex++;
}

function stepPrevious() {
    const macroSelect = document.getElementById("macroSelect");
    const macroName = macroSelect ? macroSelect.value : "";
    if (!macroName) {
        alert("Please select a macro from the dropdown first.");
        return;
    }
    const points = loadedMacrosData[macroName];
    if (!points || points.length === 0) {
        alert("No points found in this macro.");
        return;
    }

    if (currentStepIndex <= 1) {
        currentStepIndex = 1;
    } else {
        currentStepIndex--;
    }

    const targetIdx = currentStepIndex - 1;
    const step = points[targetIdx];
    highlightConsoleLine(macroName, targetIdx);

    logToConsole(`Stepping back to [${step.location}] (${targetIdx + 1}/${points.length})`);
    if (step.mode) sendGcode(step.mode);
    sendGcode(step.gcode);
}

function highlightConsoleLine(macroName, index) {
    document.querySelectorAll(".console-line.active-target").forEach(el => el.classList.remove("active-target"));
    const lineEl = document.getElementById(`macro-line-${macroName}-${index}`);
    if (lineEl) {
        lineEl.classList.add("active-target");
        lineEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

// ==============================================================================
// 11. Point Recording & Touch-Up
// ==============================================================================
async function savePendantPoint() {
    const macroNameField = document.getElementById("macroName");
    const locationNameField = document.getElementById("locationName");

    const macroName = (macroNameField?.value || "TOOL_PATH").trim();
    const locationName = (locationNameField?.value || "PT1").trim();
    // Always use absolute coordinates (G90)
    const modeCmd = "G90";

    if (!macroName || !locationName) {
        alert("Please provide both an overall Macro Name and a Location Name.");
        return;
    }

    const cleanMacro = macroName.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
    const cleanLocation = locationName.replace(/[^a-zA-Z0-9_]/g, "_");

    try {
        let currentContent = "";
        try {
            const response = await fetch(`${API_BASE}/server/files/config/${defaultMacroFile}?${Date.now()}`);
            if (response.ok) currentContent = await response.text();
        } catch (e) {
            logToConsole("Initializing new configuration file content.");
        }

        const fVal = Math.round(feedrateMmS * 60);
        const pointCode = `    # Location: ${cleanLocation}\n    ${modeCmd}\n    G1 X${currentPosition.x} Y${currentPosition.y} Z${currentPosition.z} F${fVal}\n`;
        let updatedContent = "";

        const macroHeader = `[gcode_macro ${cleanMacro}]`;
        const macroIndex = currentContent.indexOf(macroHeader);

        if (macroIndex !== -1) {
            // Macro section exists; insert new point before the next section header or at end
            const nextSectionMatch = currentContent.slice(macroIndex + macroHeader.length).search(/\n\[/);
            if (nextSectionMatch !== -1) {
                const insertPoint = macroIndex + macroHeader.length + nextSectionMatch;
                updatedContent = currentContent.slice(0, insertPoint) + "\n" + pointCode + currentContent.slice(insertPoint);
            } else {
                updatedContent = currentContent + "\n" + pointCode;
            }
        } else {
            // Create a brand new macro block
            const newBlock = `\n${macroHeader}\ndescription: Taught point sequence\ngcode:\n${pointCode}`;
            updatedContent = currentContent + newBlock;
        }

        // Upload updated file back to Moonraker config root
        const formData = new FormData();
        const blob = new Blob([updatedContent], { type: "text/plain" });
        const fileParts = defaultMacroFile.split("/");
        const uploadFileName = fileParts.pop();
        const uploadSubPath = fileParts.join("/");

        formData.append("file", blob, uploadFileName);
        formData.append("root", "config");
        if (uploadSubPath) {
            formData.append("path", uploadSubPath);
        }

        const uploadResponse = await fetch(`${API_BASE}/server/files/upload`, {
            method: "POST",
            body: formData
        });

        if (uploadResponse.ok) {
            logToConsole(`✔ Saved Point [${cleanLocation}] to Macro [${cleanMacro}] (X:${currentPosition.x} Y:${currentPosition.y} Z:${currentPosition.z})`);

            // Increment wildcard counter for next point name
            wildcardCounter++;
            if (locationNameField) {
                locationNameField.value = defaultNamePattern.replace(wildcardChar, wildcardCounter);
            }

            const saveBtn = document.getElementById("saveLocationBtn");
            if (saveBtn) {
                const origText = saveBtn.innerText;
                saveBtn.innerText = "Point Saved!";
                saveBtn.style.backgroundColor = "#00ff88";
                setTimeout(() => {
                    saveBtn.innerText = origText;
                    saveBtn.style.backgroundColor = "";
                }, 1500);
            }

            await loadMacrosList();
            const macroSelect = document.getElementById("macroSelect");
            if (macroSelect) {
                macroSelect.value = cleanMacro;
                updateStepSelection();
            }
        } else {
            const errText = await uploadResponse.text();
            logToConsole(`Failed to save point: ${errText}`);
            alert(`Error saving point: ${uploadResponse.statusText}`);
        }
    } catch (err) {
        logToConsole(`Save error: ${err.message}`);
        alert(`Error saving point: ${err.message}`);
    }
}

async function touchUpLocation() {
    const macroSelect = document.getElementById("macroSelect");
    const macroName = macroSelect ? macroSelect.value : "";
    if (!macroName) {
        alert("Please select a macro from the dropdown to touch up.");
        return;
    }
    const points = loadedMacrosData[macroName];
    if (!points || points.length === 0) {
        alert("No points found in this macro.");
        return;
    }

    // Target active step, clamped between 0 and points.length - 1
    const targetIndex = currentStepIndex > 0 ? Math.min(currentStepIndex - 1, points.length - 1) : 0;
    const activePt = points[targetIndex];
    if (!activePt) {
        alert("No active point selected to touch up.");
        return;
    }

    const locationName = activePt.location;
    // Always use absolute coordinates (G90)
    const modeCmd = "G90";
    const fVal = Math.round(feedrateMmS * 60);
    const newGcode = `G1 X${currentPosition.x} Y${currentPosition.y} Z${currentPosition.z} F${fVal}`;
    try {
        const response = await fetch(`${API_BASE}/server/files/config/${defaultMacroFile}?${Date.now()}`);
        if (!response.ok) throw new Error("Could not fetch configuration file");

        const content = await response.text();
        const macroHeader = `[gcode_macro ${macroName}]`;
        const macroStart = content.indexOf(macroHeader);
        if (macroStart === -1) throw new Error(`Macro [${macroName}] not found in config`);

        const nextSectionOffset = content.slice(macroStart + macroHeader.length).search(/\n\[/);
        const macroEnd = nextSectionOffset !== -1 ? macroStart + macroHeader.length + nextSectionOffset : content.length;

        const macroBlock = content.slice(macroStart, macroEnd);

        // Find the specific location entry within this macro
        const locRegex = new RegExp(`(#\\s*Location:\\s*${locationName}[\\r\\n]+)([\\s\\S]*?)(G1[\\s\\S]*?F\\d+)`, "i");
        const match = macroBlock.match(locRegex);

        let updatedMacroBlock = "";
        if (match) {
            updatedMacroBlock = macroBlock.replace(locRegex, `$1    ${modeCmd}\n    ${newGcode}`);
        } else {
            // Fallback: replace the N-th G1 command in this macro
            let g1Count = 0;
            updatedMacroBlock = macroBlock.replace(/(G1\s+X[-\d.]+\s+Y[-\d.]+\s+Z[-\d.]+\s+F\d+)/gi, (m) => {
                if (g1Count === targetIndex) {
                    g1Count++;
                    return newGcode;
                }
                g1Count++;
                return m;
            });
        }

        const updatedContent = content.slice(0, macroStart) + updatedMacroBlock + content.slice(macroEnd);

        const formData = new FormData();
        const blob = new Blob([updatedContent], { type: "text/plain" });
        const fileParts = defaultMacroFile.split("/");
        const uploadFileName = fileParts.pop();
        const uploadSubPath = fileParts.join("/");

        formData.append("file", blob, uploadFileName);
        formData.append("root", "config");
        if (uploadSubPath) {
            formData.append("path", uploadSubPath);
        }

        const uploadResponse = await fetch(`${API_BASE}/server/files/upload`, {
            method: "POST",
            body: formData
        });

        if (uploadResponse.ok) {
            activePt.mode = modeCmd;
            activePt.x = currentPosition.x;
            activePt.y = currentPosition.y;
            activePt.z = currentPosition.z;
            activePt.gcode = newGcode;

            const lineEl = document.getElementById(`macro-line-${macroName}-${targetIndex}`);
            if (lineEl) {
                lineEl.innerText = `[${targetIndex + 1}] ${locationName}: ${newGcode}`;
                lineEl.classList.add("active-target");
            }

            logToConsole(`✔ Touched Up [${locationName}] -> X:${currentPosition.x} Y:${currentPosition.y} Z:${currentPosition.z}`);

            const btn = document.getElementById("touchUpBtn");
            if (btn) {
                const orig = btn.innerText;
                btn.innerText = `Updated [${locationName}]!`;
                btn.style.backgroundColor = "#00ff88";
                btn.style.color = "#000";
                setTimeout(() => {
                    btn.innerText = orig;
                    btn.style.backgroundColor = "";
                    btn.style.color = "";
                }, 1500);
            }
        } else {
            const errText = await uploadResponse.text();
            alert(`Touch-up failed: ${errText}`);
        }
    } catch (e) {
        logToConsole(`Touch-up error: ${e.message}`);
        alert(`Touch-up error: ${e.message}`);
    }
}

// ==============================================================================
// 12. UI Event Listeners Registration
// ==============================================================================
function setupEventListeners() {
    // Execution Log side toggle
    const consoleToggleBtn = document.getElementById("consoleToggleBtn");
    if (consoleToggleBtn) {
        consoleToggleBtn.addEventListener("click", toggleConsoleSide);
    }

    // Mainsail Home Button
    const mainsailHomeBtn = document.getElementById("mainsailHomeBtn");
    if (mainsailHomeBtn) {
        mainsailHomeBtn.addEventListener("click", () => {
            try {
                if (window !== window.top) {
                    // We're inside Mainsail's iframe panel — navigate parent to dashboard
                    window.top.location.href = "/";
                } else {
                    // Standalone mode — go back in history
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        window.location.href = "/";
                    }
                }
            } catch (e) {
                // Cross-origin fallback
                window.location.href = "/";
            }
        });
    }

    // Motors Key Switch
    const motorToggle = document.getElementById("motorToggle");
    if (motorToggle) {
        motorToggle.addEventListener("change", (e) => {
            updateMotorState(e.target.checked);
        });
    }

    // Emergency Stop
    const estopBtn = document.getElementById("estopBtn");
    if (estopBtn) {
        estopBtn.addEventListener("click", triggerEStop);
    }

    // Settings Modal
    const openSettingsBtn = document.getElementById("openSettingsBtn");
    if (openSettingsBtn) openSettingsBtn.addEventListener("click", openSettings);

    const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener("click", closeSettings);

    const applySettingsBtn = document.getElementById("applySettingsBtn");
    if (applySettingsBtn) applySettingsBtn.addEventListener("click", applySettings);

    // Homing Buttons
    document.querySelectorAll(".homing-bar .home-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const gcode = btn.dataset.gcode || "G28";
            const label = btn.dataset.label || "ALL";
            sendGcode(gcode);
            logToConsole(`Homing Axis: ${label} (${gcode})`);
            setTimeout(fetchPosition, 300);
        });
    });

    // Hardware Jog Buttons (X+, X-, Y+, Y-, Z+, Z-)
    document.querySelectorAll(".hw-jog-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const axis = btn.dataset.axis;
            const dir = parseInt(btn.dataset.dir || "1", 10);
            if (axis) jog(axis, dir);
        });
    });

    // Mode Toggle (Buttons vs Joystick)
    document.querySelectorAll('input[name="xyMode"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            switchXYMode(e.target.value);
        });
    });

    // Virtual Joystick Mouse & Touch Handlers
    const stick = document.getElementById("joystickStick");
    const base = document.getElementById("xyJoystick");
    if (stick && base) {
        stick.addEventListener("mousedown", handleJoystickStart);
        window.addEventListener("mousemove", handleJoystickMove);
        window.addEventListener("mouseup", handleJoystickEnd);

        stick.addEventListener("touchstart", handleJoystickStart, { passive: false });
        window.addEventListener("touchmove", handleJoystickMove, { passive: false });
        window.addEventListener("touchend", handleJoystickEnd);
        window.addEventListener("touchcancel", handleJoystickEnd);
    }

    // Macro Recording & Management
    const saveLocationBtn = document.getElementById("saveLocationBtn");
    if (saveLocationBtn) {
        saveLocationBtn.addEventListener("click", savePendantPoint);
    }

    const refreshMacrosBtn = document.getElementById("refreshMacrosBtn");
    if (refreshMacrosBtn) {
        refreshMacrosBtn.addEventListener("click", () => {
            logToConsole("Refreshing macros list from configuration...");
            loadMacrosList();
        });
    }

    const macroSelect = document.getElementById("macroSelect");
    if (macroSelect) {
        macroSelect.addEventListener("change", updateStepSelection);
    }

    // Macro Playback & Step-Through
    const runContinuousBtn = document.getElementById("runContinuousBtn");
    if (runContinuousBtn) {
        runContinuousBtn.addEventListener("click", runContinuous);
    }

    const stepNextBtn = document.getElementById("stepNextBtn");
    if (stepNextBtn) {
        stepNextBtn.addEventListener("click", stepNext);
    }

    const stepPrevBtn = document.getElementById("stepPrevBtn");
    if (stepPrevBtn) {
        stepPrevBtn.addEventListener("click", stepPrevious);
    }

    const touchUpBtn = document.getElementById("touchUpBtn");
    if (touchUpBtn) {
        touchUpBtn.addEventListener("click", touchUpLocation);
    }
}