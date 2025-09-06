import "./style.css";

/**
 * ASCII CUBE (centered, depth-faded, proper aspect, Z-bounce)
 * - Pixel-perfect centering via runtime char-cell measurement
 * - Correct horizontal aspect (no squish) using viewport aspect ratio
 * - Subtle bounce toward camera along Z
 * - Depth fade starts at ~2/3 depth per current Z position
 */

// =================== THEME SWITCHER ===================
const THEME_KEY = "theme";

function getSystemTheme() {
    return matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}
function getCurrentTheme() {
    return (
        document.documentElement.getAttribute("data-theme") || getSystemTheme()
    );
}
function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
}
function updateToggleUI(btn, theme) {
    if (!btn) return;
    const to = theme === "dark" ? "light" : "dark";
    btn.textContent = to === "light" ? "☀ Light" : "☾ Dark";
    btn.setAttribute("aria-label", `Switch to ${to} mode`);
    btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}
function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    // Initial UI based on current theme (set early in index.html)
    updateToggleUI(btn, getCurrentTheme());

    btn.addEventListener("click", () => {
        const current = getCurrentTheme();
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
        updateToggleUI(btn, next);
    });

    // If user hasn’t chosen manually, follow OS changes
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", (e) => {
        if (localStorage.getItem(THEME_KEY)) return; // manual override present
        const next = e.matches ? "dark" : "light";
        applyTheme(next);
        updateToggleUI(btn, next);
    });
}
initThemeToggle();

// =================== ASCII ENGINE ===================
const asciiEl = document.getElementById("ascii");

// ========== RAMP ==========
const RAMP = " .-=+*#%@";
const RAMP_LEN = RAMP.length;

// ========== GRID/RENDER STATE ==========
let cols = 0,
    rows = 0;
let dirCache = null; // per-cell view rays (x,y,z)
let grid = null; // brightness buffer
let buffer = "";
let last = performance.now();
let time = 0; // separate from angle for easy motion control
let angle = 0;

// ========== CAMERA / SCENE ==========
const CAM_POS = [0, 0, 3.0]; // camera on +Z, looking to origin
let FOV = 1.0; // recomputed on resize to set base size
const MAX_STEPS = 48;
const MAX_DIST = 10.0;
const EPS = 0.002;

// Cube half-size (keep constant; FOV controls on-screen base size)
const BOX_SIZE = [0.75, 0.75, 0.75];

// Z-bounce parameters (world units)
const BOUNCE_AMP = 0.85; // amplitude
const BOUNCE_HZ = 0.4; // cycles per second (0.33 ≈ one bounce every 3s)
const ROT_SPEED = 0.9; // base rotation speed multiplier

// ---------- vector helpers ----------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};
const length3 = ([x, y, z]) => Math.hypot(x, y, z);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v) => {
    const L = length3(v) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
};

// rotations
function rotY([x, y, z], a) {
    const s = Math.sin(a),
        c = Math.cos(a);
    return [c * x + s * z, y, -s * x + c * z];
}
function rotX([x, y, z], a) {
    const s = Math.sin(a),
        c = Math.cos(a);
    return [x, c * y - s * z, s * y + c * z];
}

// --------- SDF + shading ----------
function sdBox(p, b) {
    const q = [
        Math.abs(p[0]) - b[0],
        Math.abs(p[1]) - b[1],
        Math.abs(p[2]) - b[2],
    ];
    const qpos = [Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)];
    const outside = length3([qpos[0], qpos[1], qpos[2]]);
    const inside = Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0.0);
    return outside + inside;
}

function estimateNormalObj(pObj) {
    const e = 0.003;
    const dx =
        sdBox([pObj[0] + e, pObj[1], pObj[2]], BOX_SIZE) -
        sdBox([pObj[0] - e, pObj[1], pObj[2]], BOX_SIZE);
    const dy =
        sdBox([pObj[0], pObj[1] + e, pObj[2]], BOX_SIZE) -
        sdBox([pObj[0], pObj[1] - e, pObj[2]], BOX_SIZE);
    const dz =
        sdBox([pObj[0], pObj[1], pObj[2] + e], BOX_SIZE) -
        sdBox([pObj[0], pObj[1], pObj[2] - e], BOX_SIZE);
    return normalize([dx, dy, dz]);
}

/**
 * Ray march against a translated + rotated cube.
 * - ro, rd: camera origin and normalized ray dir in WORLD space
 * - tRot: {x,y} rotation angles
 * - trans: world translation of the cube (for Z-bounce)
 * - fadeNear/fadeFar: dynamic near/far distances for depth fade
 */
function marchRay(ro, rd, tRot, trans, fadeNear, fadeFar) {
    // @ts-ignore
    const invRot = (v) => rotY(rotX(v, -tRot.x), -tRot.y); // inverse of object rotation
    // @ts-ignore
    const fwdRot = (v) => rotX(rotY(v, tRot.y), tRot.x); // rotate normals back to world

    let t = 0.0;
    for (let i = 0; i < MAX_STEPS; i++) {
        const pWorld = add(ro, mul(rd, t)); // point along ray in world
        const pObj = invRot(sub(pWorld, trans)); // move into object space

        const d = sdBox(pObj, BOX_SIZE);
        if (d < EPS) {
            // Base shading (Lambert + ambient)
            const nObj = estimateNormalObj(pObj);
            const nWorld = normalize(fwdRot(nObj));
            const lightDir = normalize([0.6, 0.7, 0.3]);
            const diff = Math.max(0, dot(nWorld, lightDir));
            const ambient = 0.18;
            let br = clamp01(ambient + diff * 0.9);

            // Depth fade (per-frame bounds)
            // @ts-ignore
            const camDist = length3(sub(pWorld, CAM_POS));
            const depth01 = clamp01(
                (camDist - fadeNear) / (fadeFar - fadeNear)
            );
            const FADE_START = 1; // begin fading at ~2/3 depth
            const fade = smoothstep(FADE_START, 1.0, depth01);
            br *= 1.0 - fade;

            return br;
        }

        t += d;
        if (t > MAX_DIST) break;
    }
    return 0.0;
}

// ---------- precise char-cell measurement ----------
function measureCharCell() {
    const probe = document.createElement("pre");
    // @ts-ignore
    const cs = getComputedStyle(asciiEl);
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    probe.style.font = cs.font;
    probe.style.letterSpacing = cs.letterSpacing;

    probe.textContent = "X\nX";
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height / 2;

    probe.textContent = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"; // 32 chars
    const w = probe.getBoundingClientRect().width / 32;

    document.body.removeChild(probe);
    return { w: Math.max(1, w), h: Math.max(1, h) };
}

// ---------- sizing, centering, and ray setup ----------
function computeFOVForTargetFill() {
    // Base size target (no bounce). Vertical FOV scaling.
    const camDist = Math.hypot(CAM_POS[0], CAM_POS[1], CAM_POS[2]); // = 3
    const s = BOX_SIZE[1];
    const f = 0.42; // fraction of screen height
    const raw = (2 * s) / camDist / f;
    return Math.max(0.55, Math.min(raw, 1.6));
}

function resize() {
    const { w: cellW, h: cellH } = measureCharCell();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    cols = Math.max(60, Math.floor(vw / cellW));
    rows = Math.max(32, Math.floor(vh / cellH));

    dirCache = new Float32Array(cols * rows * 3);
    grid = new Float32Array(cols * rows);

    // Correct horizontal aspect using the real viewport aspect (no more squish)
    const viewAspect = vw / vh; // width / height
    FOV = computeFOVForTargetFill(); // vertical FOV scaler

    // Precompute normalized rays through the virtual image plane
    const invCols = 1 / cols,
        invRows = 1 / rows;
    let k = 0;
    for (let y = 0; y < rows; y++) {
        const v = (y + 0.5) * invRows * 2 - 1; // [-1,1], 0 at vertical center
        for (let x = 0; x < cols; x++) {
            const u = (x + 0.5) * invCols * 2 - 1; // [-1,1], 0 at horizontal center
            // Horizontal scaled by viewport aspect; vertical by FOV.
            const rd = normalize([u * viewAspect * FOV, -v * FOV, -1]);
            dirCache[k++] = rd[0];
            dirCache[k++] = rd[1];
            dirCache[k++] = rd[2];
        }
    }
}
window.addEventListener("resize", resize);
resize();

// ---------- animation loop ----------
function step(t) {
    const dt = Math.min((t - last) / 1000, 0.033);
    last = t;
    time += dt;
    angle += dt * ROT_SPEED;

    // Rotation and Z-bounce (toward camera at z>0)
    const tRot = { x: angle * 0.9, y: angle * 1.1 };
    const zOff = Math.sin(2 * Math.PI * BOUNCE_HZ * time) * BOUNCE_AMP;
    const trans = [0, 0, zOff];

    // Dynamic near/far for depth fade (bounding sphere around translated cube)
    const BOUND_R = Math.hypot(BOX_SIZE[0], BOX_SIZE[1], BOX_SIZE[2]);
    const centerToCam = Math.abs(CAM_POS[2] - zOff); // camera and cube share X=Y=0
    const fadeNear = Math.max(0.0, centerToCam - BOUND_R);
    const fadeFar = centerToCam + BOUND_R;

    // Shade
    let i3 = 0;
    for (let i = 0; i < cols * rows; i++) {
        const rd = [dirCache[i3++], dirCache[i3++], dirCache[i3++]];
        grid[i] = marchRay(CAM_POS, rd, tRot, trans, fadeNear, fadeFar);
    }

    // Map to ASCII
    let out = "";
    for (let y = 0; y < rows; y++) {
        const start = y * cols;
        for (let x = 0; x < cols; x++) {
            const v = grid[start + x];
            const ch =
                v <= 0
                    ? " "
                    : RAMP[Math.min((v * (RAMP_LEN - 1)) | 0, RAMP_LEN - 1)];
            out += ch;
        }
        out += "\n";
    }

    if (out !== buffer) {
        buffer = out;
        // @ts-ignore
        asciiEl.textContent = buffer;
    }

    requestAnimationFrame(step);
}
requestAnimationFrame(step);
