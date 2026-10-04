// A stationary Gaussian random field by the spectral representation method: a sum of cosines with random wave
// vectors and phases, the textbook way to simulate corrosion that varies along a member. The shader and the CPU
// search for the highest value use the same modes, so both draw the same field. Illustration only, not data.

export const MODES = 12;

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r: () => number): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// [kx, ky, kz, phase] for each mode; the wave numbers set a correlation length of a few metres along the girders
export function fieldModes(seed = 7): number[] {
  const r = mulberry32(seed);
  const m: number[] = [];
  for (let i = 0; i < MODES; i++) m.push(gauss(r) * 0.42, gauss(r) * 0.55, gauss(r) * 0.3, r() * Math.PI * 2);
  return m;
}

// mapped to [0, 1] around 0.5, as in the shader
export function fieldAt(m: number[], x: number, y: number, z: number): number {
  let s = 0;
  for (let i = 0; i < MODES; i++) s += Math.cos(m[4 * i] * x + m[4 * i + 1] * y + m[4 * i + 2] * z + m[4 * i + 3]);
  return 0.5 + (0.18 * s) / Math.sqrt(MODES / 2);
}

export const FIELD_GLSL = /* glsl */ `
uniform vec4 uModes[${MODES}];
float field(vec3 p) {
  float s = 0.0;
  for (int i = 0; i < ${MODES}; i++) s += cos(dot(uModes[i].xyz, p) + uModes[i].w);
  return 0.5 + 0.18 * s / ${Math.sqrt(MODES / 2).toFixed(5)};
}
vec3 ramp(float f) {
  vec3 cool = vec3(0.118, 0.608, 0.914), mid = vec3(0.91, 0.933, 0.965), warm = vec3(1.0, 0.69, 0.125);
  return f < 0.5 ? mix(cool, mid, smoothstep(0.08, 0.5, f)) : mix(mid, warm, smoothstep(0.5, 0.86, f));
}
`;
