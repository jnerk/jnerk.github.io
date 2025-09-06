import "./style.css";

/**
 * FILLED + SHADED ASCII CUBE
 * - Pixel-perfect centering (runtime char-cell measurement)
 * - Auto scales with viewport size
 * - Depth fade: starts at 2/3 depth, fully faded at far side
 * - Dark/Light theme with footer switch (persists and respects OS preference)
 */

const asciiEl = document.getElementById("ascii");

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

// Light → dark ramp
const RAMP = " .-=+#%@";
const RAMP_LEN = RAMP.length;

// Grid / render state
let cols = 0,
    rows = 0;
let dirCache = null; // per-cell view rays
let grid = null; // brightness buffer
let buffer = "";
let last = performance.now();
let angle = 0;
let frameCount = 0;
const TARGET_FPS = 60; // Reduced from 60fps for better performance
const FRAME_SKIP = Math.max(1, Math.floor(60 / TARGET_FPS));

// Check for reduced motion preference
let prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
).matches;

// Listen for changes to reduced motion preference
window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener("change", (e) => {
        prefersReducedMotion = e.matches;
    });

// Camera & scene
const CAM_POS = [0, 0, 3.0]; // camera on +Z looking toward origin
let FOV = 1.0; // recomputed on resize for auto-scaling
const MAX_STEPS = 48; // Reduced from 64 for better performance
const MAX_DIST = 10.0;
const EPS = 0.002;

// Cube half-size in world units (keep constant; we adjust FOV)
const BOX_SIZE = [0.75, 0.75, 0.75];

// ---- Depth fade setup ----
const CAM_DIST = Math.hypot(CAM_POS[0], CAM_POS[1], CAM_POS[2]);
const BOUND_R = Math.hypot(BOX_SIZE[0], BOX_SIZE[1], BOX_SIZE[2]); // bounding sphere radius
const DEPTH_NEAR = CAM_DIST - BOUND_R; // distance from camera to front of bounding sphere
const DEPTH_FAR = CAM_DIST + BOUND_R; // ...to back of bounding sphere
const FADE_START = 0.05; // fading depth

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
    const outside = length3(qpos);
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
 * Ray march with the camera fixed in world space.
 * We rotate the sample point into object space for the SDF (true object rotation),
 * then rotate the normal back into world space for lighting.
 * Adds depth-based fade so farther hits blend into the background.
 */
function marchRay(ro, rd, tRot) {
    const invRot = (v) => rotY(rotX(v, -tRot.x), -tRot.y); // inverse of R
    const fwdRot = (v) => rotX(rotY(v, tRot.y), tRot.x); // rotate normals back

    let t = 0.0;
    for (let i = 0; i < MAX_STEPS; i++) {
        const pWorld = add(ro, mul(rd, t));
        const pObj = invRot(pWorld);

        const d = sdBox(pObj, BOX_SIZE);
        if (d < EPS) {
            // Base shading (Lambert + ambient)
            const nObj = estimateNormalObj(pObj);
            const nWorld = normalize(fwdRot(nObj));
            const lightDir = normalize([0.6, 0.7, 0.3]);
            const diff = Math.max(0, dot(nWorld, lightDir));
            const ambient = 0.18;
            let br = clamp01(ambient + diff * 0.9);

            // Depth fade
            const camDist = length3(sub(pWorld, CAM_POS));
            const depth01 = clamp01(
                (camDist - DEPTH_NEAR) / (DEPTH_FAR - DEPTH_NEAR)
            );
            const fade = smoothstep(FADE_START, 1.0, depth01); // 0 -> 1 near->far
            br *= 1.0 - fade;

            return br;
        }
        t += d;
        if (t > MAX_DIST) break;
    }
    return 0.0; // miss
}

// ---------- precise char-cell measurement ----------
function measureCharCell() {
    const probe = document.createElement("pre");
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
    const camDist = CAM_DIST;
    const s = BOX_SIZE[1];
    const f = 0.8; // tweak 0.35..0.5 to taste
    const raw = (2 * s) / camDist / f;
    return Math.max(0.55, Math.min(raw, 1.6));
}

function resize() {
    const { w: cellW, h: cellH } = measureCharCell();

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const newCols = Math.max(60, Math.floor(vw / cellW));
    const newRows = Math.max(32, Math.floor(vh / cellH));

    // Only recreate buffers if size changed
    if (newCols !== cols || newRows !== rows) {
        cols = newCols;
        rows = newRows;
        dirCache = new Float32Array(cols * rows * 3);
        grid = new Float32Array(cols * rows);
    }

    const aspectFix = cellH / cellW; // correct non-square cells
    FOV = computeFOVForTargetFill();

    const invCols = 1 / cols,
        invRows = 1 / rows;
    let k = 0;
    for (let y = 0; y < rows; y++) {
        const v = (y + 0.5) * invRows * 2 - 1; // [-1,1], 0 at vertical center
        for (let x = 0; x < cols; x++) {
            const u = (x + 0.5) * invCols * 2 - 1; // [-1,1], 0 at horizontal center
            const rd = normalize([u * aspectFix * FOV, -v * FOV, -1]);
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
    frameCount++;

    // Frame rate limiting
    if (frameCount % FRAME_SKIP !== 0) {
        requestAnimationFrame(step);
        return;
    }

    const dt = Math.min((t - last) / 1000, 0.033);
    last = t;

    // Respect reduced motion preference
    if (!prefersReducedMotion) {
        angle += dt * 0.9; // This controls the speed of the animation.
    }

    const tRot = { x: angle * 0.9, y: angle * 1.1 }; // rotate cube about its center

    let i3 = 0;
    for (let i = 0; i < cols * rows; i++) {
        const rd = [dirCache[i3++], dirCache[i3++], dirCache[i3++]];
        grid[i] = marchRay(CAM_POS, rd, tRot);
    }

    // Optimized string building using Array.join()
    const lines = [];
    for (let y = 0; y < rows; y++) {
        const start = y * cols;
        const line = [];
        for (let x = 0; x < cols; x++) {
            const v = grid[start + x];
            const ch =
                v <= 0
                    ? " "
                    : RAMP[Math.min((v * (RAMP_LEN - 1)) | 0, RAMP_LEN - 1)];
            line.push(ch);
        }
        lines.push(line.join(""));
    }
    const out = lines.join("\n");

    // Only update DOM when content actually changes
    if (out !== buffer) {
        buffer = out;
        asciiEl.textContent = buffer;
    }

    requestAnimationFrame(step);
}
requestAnimationFrame(step);
