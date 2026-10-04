// A procedurally generated four-span concrete girder bridge, sampled the way a laser scan samples surfaces.
// Nothing here comes from a survey, and it is not modelled on any real structure.
import { gauss, mulberry32 } from './field';

type V = [number, number, number];

export const HALF = 64;                     // abutments at x = ±64 m
export const PIERS = [-32, 0, 32];
export const DECK = { top: 10.6, bot: 10.0, halfW: 6.5 };
export const GIRDERS = [-4.5, -1.5, 1.5, 4.5];
export const GIRDER = { top: 10.0, bot: 8.0, flangeHalf: 0.45, webHalf: 0.12 };
export const CAP = { halfX: 1.1, y0: 6.9, y1: 8.0, halfZ: 6.2 };
export const COLUMN = { z: [-3, 3], r: 0.85, y0: -0.4, y1: 6.9 };
export const PART = { deck: 0, parapet: 1, girder: 2, cap: 3, column: 4, abutment: 5, ground: 6, water: 7 };

// the outer face of the front girder, where the random field is painted
export const FRONT_WEB_Z = GIRDERS[3] + GIRDER.webHalf;

// flat boxes on surfaces the camera sees in the second step; labels come from home.json
export const DETECTIONS: { min: V; max: V }[] = [
  { min: [-21.0, 8.35, FRONT_WEB_Z], max: [-17.2, 9.75, FRONT_WEB_Z] },   // crack on the girder web
  { min: [-33.1, 6.95, CAP.halfZ], max: [-30.9, 7.95, CAP.halfZ] },       // spalling on the pier cap
  { min: [-27.0, 10.0, DECK.halfW], max: [-23.0, 10.6, DECK.halfW] },    // crack along the deck edge
];

interface Patch { area: number; weight: number; part: number; sample: (r: () => number) => { p: V; n: V } }

const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V): V => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function rect(o: V, u: V, v: V, part: number, weight: number): Patch {
  const n = unit(cross(u, v));
  return {
    area: len(u) * len(v), weight, part,
    sample: (r) => { const a = r(), b = r(); return { p: [o[0] + a * u[0] + b * v[0], o[1] + a * u[1] + b * v[1], o[2] + a * u[2] + b * v[2]], n }; },
  };
}

function cylinder(cx: number, cz: number, rad: number, y0: number, y1: number, part: number, weight: number): Patch {
  return {
    area: 2 * Math.PI * rad * (y1 - y0), weight, part,
    sample: (r) => { const t = r() * Math.PI * 2; const n: V = [Math.cos(t), 0, Math.sin(t)]; return { p: [cx + rad * n[0], y0 + r() * (y1 - y0), cz + rad * n[2]], n }; },
  };
}

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, part: number, weight: number): Patch[] {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  return [
    rect([x0, y0, z1], [dx, 0, 0], [0, dy, 0], part, weight),
    rect([x0, y0, z0], [dx, 0, 0], [0, dy, 0], part, weight),
    rect([x0, y0, z0], [0, 0, dz], [0, dy, 0], part, weight),
    rect([x1, y0, z0], [0, 0, dz], [0, dy, 0], part, weight),
    rect([x0, y0, z0], [dx, 0, 0], [0, 0, dz], part, weight),
    rect([x0, y1, z0], [dx, 0, 0], [0, 0, dz], part, weight),
  ];
}

function patches(): Patch[] {
  const L = HALF * 2, P: Patch[] = [];
  const { top, bot, halfW } = DECK;
  P.push(rect([-HALF, top, -halfW], [L, 0, 0], [0, 0, 2 * halfW], PART.deck, 1.0));
  P.push(rect([-HALF, bot, -halfW], [L, 0, 0], [0, 0, 2 * halfW], PART.deck, 0.3));
  for (const s of [-1, 1]) {
    P.push(rect([-HALF, bot, s * halfW], [L, 0, 0], [0, top - bot, 0], PART.deck, 1.3));
    P.push(rect([-HALF, top, s * halfW], [L, 0, 0], [0, 1.0, 0], PART.parapet, 1.1));
    P.push(rect([-HALF, top + 1.0, s * (halfW - 0.3)], [L, 0, 0], [0, 0, s * 0.3], PART.parapet, 1.1));
  }
  for (const z of GIRDERS) {
    const { top: gt, bot: gb, flangeHalf: fh, webHalf: wh } = GIRDER;
    const w = Math.abs(z) > 3 ? 1.0 : 0.4;          // outer girders are the ones a scanner sees
    for (const s of [-1, 1]) P.push(rect([-HALF, gb + 0.2, z + s * wh], [L, 0, 0], [0, gt - gb - 0.2, 0], PART.girder, w));
    P.push(rect([-HALF, gb, z - fh], [L, 0, 0], [0, 0, 2 * fh], PART.girder, w));
    for (const s of [-1, 1]) P.push(rect([-HALF, gb, z + s * fh], [L, 0, 0], [0, 0.2, 0], PART.girder, w));
  }
  for (const x of PIERS) {
    P.push(...box(x - CAP.halfX, x + CAP.halfX, CAP.y0, CAP.y1, -CAP.halfZ, CAP.halfZ, PART.cap, 1.3));
    for (const z of COLUMN.z) P.push(cylinder(x, z, COLUMN.r, COLUMN.y0, COLUMN.y1, PART.column, 1.3));
  }
  for (const s of [-1, 1]) {
    const a = s > 0 ? HALF : -HALF - 4;
    P.push(...box(a, a + 4, 0, top, -7, 7, PART.abutment, 0.6));
    const x0 = s > 0 ? HALF + 4 : -HALF - 4;                 // embankment falling away from each abutment
    P.push(rect([x0, top, -16], [s * 30, -(top - 1.2), 0], [0, 0, 32], PART.ground, 0.16));
  }
  P.push(rect([-110, 0, -48], [220, 0, 0], [0, 0, 96], PART.water, 0.018));
  return P;
}

export interface Cloud { count: number; position: Float32Array; scatter: Float32Array; rand: Float32Array; part: Float32Array }

export function buildCloud(count: number, seed = 11): Cloud {
  const r = mulberry32(seed), P = patches();
  const total = P.reduce((s, p) => s + p.area * p.weight, 0);
  const position = new Float32Array(count * 3), scatter = new Float32Array(count * 3);
  const rand = new Float32Array(count), part = new Float32Array(count);
  let i = 0;
  P.forEach((p, k) => {
    const n = k === P.length - 1 ? count - i : Math.round((count * p.area * p.weight) / total);
    for (let j = 0; j < n && i < count; j++, i++) {
      const { p: q, n: nn } = p.sample(r);
      const e = gauss(r) * 0.025;                              // scanner noise along the surface normal
      const x = q[0] + nn[0] * e, y = q[1] + nn[1] * e, z = q[2] + nn[2] * e;
      position[3 * i] = x; position[3 * i + 1] = y; position[3 * i + 2] = z;
      scatter[3 * i] = x + gauss(r) * 5; scatter[3 * i + 1] = y + 4 + r() * 22; scatter[3 * i + 2] = z * 1.4 + gauss(r) * 12;
      rand[i] = r(); part[i] = p.part;
    }
  });
  return { count: i, position, scatter, rand, part };
}

// edges for the wireframe step: deck, parapets, girders with a finite-element style mesh, pier caps, columns, abutments
export function buildLines(): Float32Array {
  const s: number[] = [];
  const seg = (a: V, b: V) => { s.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
  const boxEdges = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    for (const y of [y0, y1]) { seg([x0, y, z0], [x1, y, z0]); seg([x0, y, z1], [x1, y, z1]); seg([x0, y, z0], [x0, y, z1]); seg([x1, y, z0], [x1, y, z1]); }
    for (const x of [x0, x1]) for (const z of [z0, z1]) seg([x, y0, z], [x, y1, z]);
  };
  const { top, bot, halfW } = DECK;
  for (const z of [-halfW, halfW]) {
    seg([-HALF, top, z], [HALF, top, z]); seg([-HALF, bot, z], [HALF, bot, z]); seg([-HALF, top + 1, z], [HALF, top + 1, z]);
  }
  for (let x = -HALF; x <= HALF + 0.01; x += 4) seg([x, top, -halfW], [x, top, halfW]);
  for (const z of GIRDERS) seg([-HALF, GIRDER.bot, z], [HALF, GIRDER.bot, z]);
  for (const z of [GIRDERS[0], GIRDERS[3]]) {
    const face = z + Math.sign(z) * GIRDER.webHalf, mid = (GIRDER.bot + GIRDER.top) / 2;
    for (let x = -HALF; x <= HALF + 0.01; x += 2) seg([x, GIRDER.bot, face], [x, GIRDER.top, face]);
    seg([-HALF, mid, face], [HALF, mid, face]);
  }
  for (const x of PIERS) {
    boxEdges(x - CAP.halfX, x + CAP.halfX, CAP.y0, CAP.y1, -CAP.halfZ, CAP.halfZ);
    for (const z of COLUMN.z) {
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        seg([x + Math.cos(t) * COLUMN.r, COLUMN.y0, z + Math.sin(t) * COLUMN.r], [x + Math.cos(t) * COLUMN.r, COLUMN.y1, z + Math.sin(t) * COLUMN.r]);
      }
      for (const y of [COLUMN.y0, (COLUMN.y0 + COLUMN.y1) / 2, COLUMN.y1]) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2, b = ((k + 1) / 16) * Math.PI * 2;
          seg([x + Math.cos(a) * COLUMN.r, y, z + Math.sin(a) * COLUMN.r], [x + Math.cos(b) * COLUMN.r, y, z + Math.sin(b) * COLUMN.r]);
        }
      }
    }
  }
  for (const a of [HALF, -HALF - 4]) boxEdges(a, a + 4, 0, top, -7, 7);
  return new Float32Array(s);
}

// a quadratic flight path over the second span, sampled as dots (uavAt uses the same three points)
export function uavPath(n = 64): Float32Array {
  const A: V = [-44, 22, 15], C: V = [-20, 30, 19], B: V = [4, 22, 15];
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 1 - t;
    for (let k = 0; k < 3; k++) out[3 * i + k] = u * u * A[k] + 2 * u * t * C[k] + t * t * B[k];
  }
  return out;
}

export function uavAt(t: number): V {
  const A: V = [-44, 22, 15], C: V = [-20, 30, 19], B: V = [4, 22, 15], u = 1 - t;
  return [0, 1, 2].map((k) => u * u * A[k] + 2 * u * t * C[k] + t * t * B[k]) as V;
}
