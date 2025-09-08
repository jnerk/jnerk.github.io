import "./style.css";
import { initThemeToggle } from "./theme";
import { Renderer } from "./renderer";
import { BOUNCE_AMP, BOUNCE_HZ, ROT_SPEED } from "./config";

/**
 * ASCII CUBE (centered, depth-faded, proper aspect, Z-bounce)
 * - Pixel-perfect centering via runtime char-cell measurement
 * - Correct horizontal aspect (no squish) using viewport aspect ratio
 * - Subtle bounce toward camera along Z
 * - Depth fade
 * - Dark/Light mode based on browser setting
 */

// Initialize theme
initThemeToggle();

// Initialize renderer
const renderer = new Renderer("ascii");

// Animation state
let last = performance.now();
let time = 0;
let angle = 0;

// Animation loop
function step(t: number) {
    const dt = Math.min((t - last) / 1000, 0.033);
    last = t;
    time += dt;
    angle += dt * ROT_SPEED;

    // Update rotation and compute bounce
    const rotation = { x: angle * 0.9, y: angle * 1.1 };
    const zOffset = Math.sin(2 * Math.PI * BOUNCE_HZ * time) * BOUNCE_AMP;

    // Render frame
    renderer.render(rotation, zOffset);

    requestAnimationFrame(step);
}

requestAnimationFrame(step);
