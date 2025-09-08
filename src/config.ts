import { Vector3 } from "./vector";

export const THEME_KEY = "theme";

// ASCII ramp for rendering
export const RAMP = " .-=+*#%@";
export const RAMP_LEN = RAMP.length;

// Camera and scene configuration
export const CAM_POS: Vector3 = [0, 0, 3.0];
export const FOV_BASE = 1.0;
export const MAX_STEPS = 48;
export const MAX_DIST = 10.0;
export const EPS = 0.002;

// Cube configuration
export const BOX_SIZE: Vector3 = [0.85, 0.85, 0.85];

// Animation configuration
export const BOUNCE_AMP = 0.85;
export const BOUNCE_HZ = 0.4;
export const ROT_SPEED = 0.9;

// Shading configuration
export const LIGHT_DIR: Vector3 = [0.0, 0.5, 0.5];
export const AMBIENT_LIGHT = 0.18;
export const DIFFUSE_STRENGTH = 0.9;
export const FADE_START = 0.1;
