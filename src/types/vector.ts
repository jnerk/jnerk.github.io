export type Vector3 = [number, number, number];

export interface Rotation {
    x: number;
    y: number;
}

export interface CharCell {
    w: number;
    h: number;
}

// Vector operations
export const vectorOps = {
    length: ([x, y, z]: Vector3): number => Math.hypot(x, y, z),
    add: (a: Vector3, b: Vector3): Vector3 => [
        a[0] + b[0],
        a[1] + b[1],
        a[2] + b[2],
    ],
    sub: (a: Vector3, b: Vector3): Vector3 => [
        a[0] - b[0],
        a[1] - b[1],
        a[2] - b[2],
    ],
    mul: (a: Vector3, s: number): Vector3 => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a: Vector3, b: Vector3): number =>
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    normalize: (v: Vector3): Vector3 => {
        const L = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / L, v[1] / L, v[2] / L];
    },
    rotY: ([x, y, z]: Vector3, a: number): Vector3 => {
        const s = Math.sin(a),
            c = Math.cos(a);
        return [c * x + s * z, y, -s * x + c * z];
    },
    rotX: ([x, y, z]: Vector3, a: number): Vector3 => {
        const s = Math.sin(a),
            c = Math.cos(a);
        return [x, c * y - s * z, s * y + c * z];
    },
};
