import { Vector3, Rotation, vectorOps } from "./types/vector";
import {
    BOX_SIZE,
    CAM_POS,
    EPS,
    MAX_DIST,
    MAX_STEPS,
    LIGHT_DIR,
    AMBIENT_LIGHT,
    DIFFUSE_STRENGTH,
    FADE_START,
    RAMP,
    RAMP_LEN,
} from "./config";

export class Renderer {
    private cols: number = 0;
    private rows: number = 0;
    private dirCache: Float32Array | null = null;
    private grid: Float32Array | null = null;
    private buffer: string = "";
    private asciiEl: HTMLElement | null;
    private FOV: number = 1.0;

    constructor(asciiElementId: string) {
        this.asciiEl = document.getElementById(asciiElementId);
        if (!this.asciiEl) {
            throw new Error(
                `ASCII element with id '${asciiElementId}' not found`
            );
        }
        this.resize = this.resize.bind(this);
        window.addEventListener("resize", this.resize);
        this.resize();
    }

    private sdBox(p: Vector3, b: Vector3): number {
        const q: Vector3 = [
            Math.abs(p[0]) - b[0],
            Math.abs(p[1]) - b[1],
            Math.abs(p[2]) - b[2],
        ];
        const qpos: Vector3 = [
            Math.max(q[0], 0),
            Math.max(q[1], 0),
            Math.max(q[2], 0),
        ];
        const outside = vectorOps.length(qpos);
        const inside = Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0.0);
        return outside + inside;
    }

    private estimateNormalObj(pObj: Vector3): Vector3 {
        const e = 0.003;
        const dx =
            this.sdBox([pObj[0] + e, pObj[1], pObj[2]], BOX_SIZE) -
            this.sdBox([pObj[0] - e, pObj[1], pObj[2]], BOX_SIZE);
        const dy =
            this.sdBox([pObj[0], pObj[1] + e, pObj[2]], BOX_SIZE) -
            this.sdBox([pObj[0], pObj[1] - e, pObj[2]], BOX_SIZE);
        const dz =
            this.sdBox([pObj[0], pObj[1], pObj[2] + e], BOX_SIZE) -
            this.sdBox([pObj[0], pObj[1], pObj[2] - e], BOX_SIZE);
        return vectorOps.normalize([dx, dy, dz]);
    }

    private marchRay(
        ro: Vector3,
        rd: Vector3,
        tRot: Rotation,
        trans: Vector3,
        fadeNear: number,
        fadeFar: number
    ): number {
        const invRot = (v: Vector3): Vector3 =>
            vectorOps.rotY(vectorOps.rotX(v, -tRot.x), -tRot.y);

        const fwdRot = (v: Vector3): Vector3 =>
            vectorOps.rotX(vectorOps.rotY(v, tRot.y), tRot.x);

        let t = 0.0;
        for (let i = 0; i < MAX_STEPS; i++) {
            const pWorld = vectorOps.add(ro, vectorOps.mul(rd, t));
            const pObj = invRot(vectorOps.sub(pWorld, trans));

            const d = this.sdBox(pObj, BOX_SIZE);
            if (d < EPS) {
                const nObj = this.estimateNormalObj(pObj);
                const nWorld = vectorOps.normalize(fwdRot(nObj));
                const diff = Math.max(0, vectorOps.dot(nWorld, LIGHT_DIR));
                let br = Math.min(
                    Math.max(AMBIENT_LIGHT + diff * DIFFUSE_STRENGTH, 0),
                    1
                );

                const camDist = vectorOps.length(
                    vectorOps.sub(pWorld, CAM_POS)
                );
                const depth01 = Math.min(
                    Math.max((camDist - fadeNear) / (fadeFar - fadeNear), 0),
                    1
                );
                const fade = this.smoothstep(FADE_START, 1.0, depth01);
                br *= 1.0 - fade;

                return br;
            }

            t += d;
            if (t > MAX_DIST) break;
        }
        return 0.0;
    }

    private smoothstep(a: number, b: number, x: number): number {
        const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
        return t * t * (3 - 2 * t);
    }

    private measureCharCell() {
        const probe = document.createElement("pre");
        if (!this.asciiEl) return { w: 10, h: 20 };

        const cs = getComputedStyle(this.asciiEl);
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.whiteSpace = "pre";
        probe.style.font = cs.font;
        probe.style.letterSpacing = cs.letterSpacing;

        probe.textContent = "X\nX";
        document.body.appendChild(probe);
        const h = probe.getBoundingClientRect().height / 2;

        probe.textContent = "X".repeat(32);
        const w = probe.getBoundingClientRect().width / 32;

        document.body.removeChild(probe);
        return { w: Math.max(1, w), h: Math.max(1, h) };
    }

    private computeFOVForTargetFill(): number {
        const camDist = vectorOps.length(CAM_POS);
        const s = BOX_SIZE[1];
        const f = 0.42;
        const raw = (2 * s) / camDist / f;
        return Math.max(0.55, Math.min(raw, 1.6));
    }

    public resize(): void {
        const { w: cellW, h: cellH } = this.measureCharCell();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        this.cols = Math.max(60, Math.floor(vw / cellW));
        this.rows = Math.max(32, Math.floor(vh / cellH));

        this.dirCache = new Float32Array(this.cols * this.rows * 3);
        this.grid = new Float32Array(this.cols * this.rows);

        const viewAspect = vw / vh;
        this.FOV = this.computeFOVForTargetFill();

        let k = 0;
        for (let y = 0; y < this.rows; y++) {
            const v = ((y + 0.5) / this.rows) * 2 - 1;
            for (let x = 0; x < this.cols; x++) {
                const u = ((x + 0.5) / this.cols) * 2 - 1;
                const rd = vectorOps.normalize([
                    u * viewAspect * this.FOV,
                    -v * this.FOV,
                    -1,
                ]);
                this.dirCache[k++] = rd[0];
                this.dirCache[k++] = rd[1];
                this.dirCache[k++] = rd[2];
            }
        }
    }

    public render(rotation: Rotation, zOffset: number): void {
        const trans: Vector3 = [0, 0, zOffset];

        const BOUND_R = vectorOps.length(BOX_SIZE);
        const centerToCam = Math.abs(CAM_POS[2] - zOffset);
        const fadeNear = Math.max(0.0, centerToCam - BOUND_R);
        const fadeFar = centerToCam + BOUND_R;

        if (!this.dirCache || !this.grid) return;

        let i3 = 0;
        for (let i = 0; i < this.cols * this.rows; i++) {
            const rd: Vector3 = [
                this.dirCache[i3++],
                this.dirCache[i3++],
                this.dirCache[i3++],
            ];
            this.grid[i] = this.marchRay(
                CAM_POS,
                rd,
                rotation,
                trans,
                fadeNear,
                fadeFar
            );
        }

        let out = "";
        for (let y = 0; y < this.rows; y++) {
            const start = y * this.cols;
            for (let x = 0; x < this.cols; x++) {
                const v = this.grid[start + x];
                const ch =
                    v <= 0
                        ? " "
                        : RAMP[
                              Math.min((v * (RAMP_LEN - 1)) | 0, RAMP_LEN - 1)
                          ];
                out += ch;
            }
            out += "\n";
        }

        if (out !== this.buffer) {
            this.buffer = out;
            if (this.asciiEl) {
                this.asciiEl.textContent = this.buffer;
            }
        }
    }
}
