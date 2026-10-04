// The Decisions step: Thailand's real main roads (OpenStreetMap contributors, ODbL) inside the national boundary
// (RTSD via OCHA, CC BY-IGO), with three review variants. Every event, hazard layer, closure and score drawn here is
// invented for an illustration; thailand.json says so in its _source, and the page caption says so too.
//   1  an event crosses the network; the bridges it passes are ranked for inspection
//   2  a screening map: an invented hazard layer on 10 km cells, its top decile, the roads and bridges on them
//   3  connectivity: the same event closes bridges, routes detour, closed bridges are ranked by what reopening gives back
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CustomBlending, DataTexture, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, LinearFilter, MaxEquation, Mesh, NormalBlending, Points, RGBAFormat, ShaderMaterial, Shape, ShapeGeometry, UnsignedByteType, Vector2, Vector3, Vector4,
} from 'three';

export interface ThailandData {
  bbox: [number, number, number, number];
  cell: number;
  boundary: number[][];
  roads: number[][];                    // [class, x, y, x, y, ...]; class 0 motorway, 1 trunk, 2 primary
  bridges: number[];                    // x, y, class, ...
  v1: { track: number[]; sig: number[]; hot: number; tex: number[]; amp: number; cls: number[]; first: number[] };
  v2: { modes: number[]; amp: number; p90: number };
  v3: { closed: number[]; rank: number[]; routes: { before: number[]; after: number[] }[] };
}

export interface MapState { net: number; s: number; variant: number; time: number; pixelRatio: number; res: Vector2 }

const COMMON = /* glsl */ `
uniform int uVar;
uniform float uS, uNet, uTime;
uniform sampler2D uMap;                 // r: event texture, g: screening layer, b: top-decile flag; one texel per cell
uniform vec4 uBox;                      // grid origin x, y (km) and cells in x, y
uniform vec4 uTrack;                    // event track start x, y and end x, y (km)
uniform vec2 uSig;                      // band size along and across the track (km)
uniform float uHot;
uniform vec2 uScan;                     // y of the north and south ends (km) for the screening sweep
const float CELL = 10.0;
const vec3 AMBER = vec3(1.0, 0.69, 0.125), CYAN = vec3(0.118, 0.608, 0.914), CYAN2 = vec3(0.36, 0.78, 1.0), WHITE = vec3(0.91, 0.933, 0.965);
vec2 cellOf(vec2 p) { return floor((p - uBox.xy) / CELL); }
vec4 cellTexel(vec2 p) { return texture2D(uMap, (cellOf(p) + 0.5) / uBox.zw); }
vec2 cellCentre(vec2 p) { return uBox.xy + (cellOf(p) + 0.5) * CELL; }
vec4 smoothTexel(vec2 p) { return texture2D(uMap, (p - uBox.xy) / (CELL * uBox.zw)); }
float trackLen() { return length(uTrack.zw - uTrack.xy); }
vec2 alongAcross(vec2 p) { vec2 d = normalize(uTrack.zw - uTrack.xy); vec2 q = p - uTrack.xy; return vec2(dot(q, d), dot(q, vec2(-d.y, d.x))); }
float band(float du, float v) { return exp(-0.5 * (du * du / (uSig.x * uSig.x) + v * v / (uSig.y * uSig.y))); }
float eventNow(vec2 p, float tx, float s) { vec2 a = alongAcross(p); return band(a.x - s * trackLen(), a.y) * (0.55 + 0.9 * tx); }
float eventPeak(vec2 p, float tx, float s) { vec2 a = alongAcross(p); return band(a.x - clamp(a.x, 0.0, s * trackLen()), a.y) * (0.55 + 0.9 * tx); }
float scanY() { return mix(uScan.x, uScan.y, uS); }
float scanning() { return step(0.001, uS) * step(uS, 0.999); }
float live() { return smoothstep(0.0, 0.06, uS) * (1.0 - smoothstep(0.86, 1.0, uS)); }
`;

// fragment shaders only (fwidth): a thin iso-line around the event's footprint at threshold uHot
const FOOTPRINT = /* glsl */ `
float footprint(vec2 p, float s) {
  float pk = eventPeak(p, smoothTexel(p).r, s);
  float w = fwidth(pk);
  return 1.0 - smoothstep(w * 0.4, w * 1.4, abs(pk - uHot));
}
`;

const FILL_VS = /* glsl */ `
varying vec2 vKm;
void main() { vKm = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FILL_FS = /* glsl */ `
${COMMON}
${FOOTPRINT}
varying vec2 vKm;
void main() {
  vec3 col = vec3(0.043, 0.102, 0.227);
  float a = 0.5;
  if (uVar == 1) {
    float now = eventNow(cellCentre(vKm), cellTexel(vKm).r, uS);
    float g = clamp((now - 0.45) / 0.7, 0.0, 0.6) * live();
    col = mix(col, AMBER, g); a = max(a, 0.5 + 0.5 * g);
    float f = footprint(vKm, uS);
    col = mix(col, AMBER, f * 0.6); a = max(a, f * 0.65);
  } else if (uVar == 2) {
    float y = scanY(), shown = step(y, vKm.y);
    vec4 t = cellTexel(vKm);
    col = mix(col, CYAN, shown * 0.16 * t.g);
    col = mix(col, AMBER, shown * t.b * 0.6); a = max(a, 0.5 + shown * t.b * 0.3);
    vec2 g = abs(fract((vKm - uBox.xy) / CELL + 0.5) - 0.5), fw = fwidth(vKm / CELL);
    float grid = max(1.0 - smoothstep(0.0, fw.x * 1.2, g.x), 1.0 - smoothstep(0.0, fw.y * 1.2, g.y));
    col = mix(col, CYAN2, grid * 0.45 * exp(-pow((vKm.y - y) / 70.0, 2.0)) * scanning());
    float sl = (1.0 - smoothstep(0.0, fwidth(vKm.y) * 1.6, abs(vKm.y - y))) * scanning();
    col = mix(col, vec3(0.92, 0.98, 1.0), sl); a = max(a, sl);
  } else {
    float f = footprint(vKm, 1.0);
    col = mix(col, AMBER, f * 0.42); a = max(a, f * 0.5);
  }
  gl_FragColor = vec4(col, a * uNet);
}`;

// screen-space wide lines: each instance is one segment, expanded to a quad of aW CSS pixels
const LINE_VS = /* glsl */ `
attribute vec2 aA, aB, aT, aD;
attribute float aW, aK;
uniform vec2 uRes;
uniform float uPx;
varying vec2 vKm;
varying float vK, vT, vD, vEdge, vHalf;
void main() {
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(aA, 0.0, 1.0);
  vec4 cb = projectionMatrix * modelViewMatrix * vec4(aB, 0.0, 1.0);
  vec2 sa = ca.xy / ca.w * uRes * 0.5, sb = cb.xy / cb.w * uRes * 0.5;
  vec2 dir = sb - sa;
  float l = length(dir);
  dir = l > 1e-4 ? dir / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = mix(ca, cb, position.x);
  float hw = aW * uPx * 0.5 + 0.75;
  c.xy += nrm * position.y * hw / (uRes * 0.5) * c.w;
  gl_Position = c;
  vKm = mix(aA, aB, position.x);
  vK = aK; vT = mix(aT.x, aT.y, position.x); vD = mix(aD.x, aD.y, position.x);
  vEdge = position.y * hw; vHalf = hw;
}`;

const LINE_FS = /* glsl */ `
${COMMON}
uniform float uBefore, uDraw;
varying vec2 vKm;
varying float vK, vT, vD, vEdge, vHalf;
void main() {
  float aa = 1.0 - smoothstep(vHalf - 1.2, vHalf, abs(vEdge));
  vec3 col = CYAN2;
  float a;
  float v3 = uVar == 3 ? 1.0 : 0.0;
  if (vK > 4.5) {                       // detour after the closures (variant 3): drawn on along its length
    col = WHITE; a = v3 * step(vT, uDraw) * 0.95;
  } else if (vK > 3.5) {                // the usual route before the event (variant 3): dashed
    col = WHITE; a = v3 * uBefore * 0.5 * step(0.5, fract(vD / 10.0));
  } else if (vK > 2.5) {                // national boundary
    col = CYAN; a = 0.55;
  } else {
    a = vK < 0.5 ? 0.95 : vK < 1.5 ? 0.7 : 0.42;
    if (uVar == 1) {
      if (eventNow(cellCentre(vKm), cellTexel(vKm).r, uS) * live() > uHot) { col = AMBER; a = 1.0; }
    } else if (uVar == 2) {
      float y = scanY();
      if (vKm.y > y && cellTexel(vKm).b > 0.5) { col = AMBER; a = 1.0; }
      a += 0.7 * exp(-pow((vKm.y - y) / 18.0, 2.0)) * scanning();
    } else {
      a *= 0.5;
    }
  }
  a *= aa * uNet;
  gl_FragColor = vec4(col * a, a);      // premultiplied, for max blending
}`;

const DOT_VS = /* glsl */ `
${COMMON}
attribute float aV1, aV3, aRand;
uniform float uPx;
varying vec3 vColor;
varying float vAlpha, vShape;
void main() {
  vec2 p = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  vec3 col = WHITE;
  float a = 0.24, size = 2.0, shape = 0.0;
  if (uVar == 1 && aV1 > 0.5) {
    float front = uS * trackLen() - alongAcross(p).x;      // > 0 once the band centre has gone past
    float under = (1.0 - smoothstep(0.35 * uSig.x, 1.1 * uSig.x, abs(front))) * live();
    float passed = smoothstep(0.5 * uSig.x, 1.2 * uSig.x, front);
    vec3 cls = aV1 > 2.5 ? AMBER : aV1 > 1.5 ? WHITE : CYAN;
    float cs = aV1 > 2.5 ? 7.5 : aV1 > 1.5 ? 4.8 : 2.8;
    col = mix(col, AMBER, under); a = mix(a, 1.0, under); size = mix(size, 3.6, under);
    col = mix(col, cls, passed); a = mix(a, aV1 > 1.5 ? 1.0 : 0.9, passed); size = mix(size, cs, passed);
  } else if (uVar == 2) {
    if (p.y > scanY() && cellTexel(p).b > 0.5) { col = AMBER; a = 1.0; size = 3.4; }
  } else if (uVar == 3 && aV3 > 0.5) {
    float on = smoothstep(0.02 + 0.2 * aRand, 0.08 + 0.2 * aRand, uS);
    col = mix(col, AMBER, on); a = mix(a, 1.0, on); size = mix(size, 10.0, on); shape = step(0.5, on);
  }
  gl_PointSize = size * uPx;
  vColor = col; vAlpha = a * uNet; vShape = shape;
}`;

const DOT_FS = /* glsl */ `
varying vec3 vColor;
varying float vAlpha, vShape;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c), m;
  if (vShape < 0.5) {
    if (d > 0.5) discard;
    m = 1.0 - smoothstep(0.28, 0.5, d);
  } else {                               // a cross: closed
    float b = min(abs(c.x - c.y), abs(c.x + c.y)) * 0.7071;
    m = (1.0 - smoothstep(0.07, 0.12, b)) * (1.0 - smoothstep(0.4, 0.48, d));
  }
  gl_FragColor = vec4(vColor, vAlpha * m);
}`;

// rings around the three bridges a variant puts first
const RING_VS = /* glsl */ `
${COMMON}
attribute float aVar, aOrder;
uniform float uPx;
varying float vAlpha, vPing;
void main() {
  vec2 p = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  float on = 0.0;
  if (uVar == 1 && aVar < 1.5) on = smoothstep(1.0 * uSig.x, 1.5 * uSig.x, uS * trackLen() - alongAcross(p).x);
  if (uVar == 3 && aVar > 2.5) on = smoothstep(0.78 + 0.05 * aOrder, 0.86 + 0.05 * aOrder, uS);
  vAlpha = on * uNet;
  vPing = fract(uTime * 0.55 + aOrder * 0.33);
  gl_PointSize = 34.0 * uPx;
}`;

const RING_FS = /* glsl */ `
varying float vAlpha, vPing;
const vec3 AMBER = vec3(1.0, 0.69, 0.125);
void main() {
  float d = length(gl_PointCoord - 0.5);
  float w = fwidth(d);
  float ring = 1.0 - smoothstep(0.012, 0.012 + w * 1.5, abs(d - 0.24));
  float r = 0.24 + 0.24 * vPing;
  float ping = (1.0 - smoothstep(0.008, 0.008 + w * 1.5, abs(d - r))) * (1.0 - vPing) * 0.6;
  float m = max(ring, ping);
  if (m < 0.01) discard;
  gl_FragColor = vec4(AMBER, vAlpha * m);
}`;

export function buildThailand(d: ThailandData, scale: number) {
  const group = new Group();
  const [bx0, by0, bx1, by1] = d.bbox;
  const cxm = (bx0 + bx1) / 2, cym = (by0 + by1) / 2;
  group.rotation.x = -Math.PI / 2;                       // local x east, y north -> world x, -z
  group.scale.setScalar(scale);
  group.position.set(-cxm * scale, -1, cym * scale);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // one texel per 10 km cell: event texture, screening layer, its top-decile flag
  const C = d.cell, gx0 = Math.floor(bx0 / C) * C, gy0 = Math.floor(by0 / C) * C;
  const nx = Math.ceil((bx1 - gx0) / C) + 1, ny = Math.ceil((by1 - gy0) / C) + 1;
  const px = new Uint8Array(nx * ny * 4);
  const t1 = d.v1.tex, m2 = d.v2.modes, K1 = t1.length / 3, K2 = m2.length / 3;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = gx0 + (i + 0.5) * C, y = gy0 + (j + 0.5) * C;
    let s1 = 0, s2 = 0;
    for (let k = 0; k < K1; k++) s1 += Math.cos(t1[3 * k] * x + t1[3 * k + 1] * y + t1[3 * k + 2]);
    for (let k = 0; k < K2; k++) s2 += Math.cos(m2[3 * k] * x + m2[3 * k + 1] * y + m2[3 * k + 2]);
    const v1 = Math.min(1, Math.max(0, 0.5 + (d.v1.amp * s1) / Math.sqrt(K1 / 2)));
    const v2 = 0.5 + (d.v2.amp * s2) / Math.sqrt(K2 / 2);
    const o = 4 * (j * nx + i);
    px[o] = Math.round(v1 * 255); px[o + 1] = Math.round(Math.min(1, Math.max(0, v2)) * 255);
    px[o + 2] = v2 >= d.v2.p90 ? 255 : 0; px[o + 3] = 255;
  }
  const tex = keep(new DataTexture(px, nx, ny, RGBAFormat, UnsignedByteType));
  tex.magFilter = LinearFilter; tex.minFilter = LinearFilter; tex.needsUpdate = true;

  const [tx0, ty0, tx1, ty1] = d.v1.track;
  const uniforms = {
    uVar: { value: 1 }, uS: { value: 0 }, uNet: { value: 0 }, uTime: { value: 0 }, uMap: { value: tex },
    uBox: { value: new Vector4(gx0, gy0, nx, ny) }, uTrack: { value: new Vector4(tx0, ty0, tx1, ty1) },
    uSig: { value: new Vector2(d.v1.sig[0], d.v1.sig[1]) }, uHot: { value: d.v1.hot }, uScan: { value: new Vector2(by1, by0) },
    uRes: { value: new Vector2(1, 1) }, uPx: { value: 1 }, uBefore: { value: 0 }, uDraw: { value: 0 },
  };
  const material = (vs: string, fs: string, blend: 'normal' | 'add' | 'max') => keep(new ShaderMaterial({
    uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: false,
    blending: blend === 'add' ? AdditiveBlending : blend === 'max' ? CustomBlending : NormalBlending,
    blendEquation: MaxEquation,                             // used only with CustomBlending
  }));

  // country fill
  const shapes = d.boundary.map((r) => {
    const sh = new Shape();
    for (let k = 0; k < r.length; k += 2) (k ? sh.lineTo(r[k], r[k + 1]) : sh.moveTo(r[k], r[k + 1]));
    return sh;
  });
  const fill = new Mesh(keep(new ShapeGeometry(shapes)), material(FILL_VS, FILL_FS, 'normal'));
  fill.renderOrder = -1;
  group.add(fill);

  // roads, boundary and the two kinds of route as one set of wide-line instances
  const segA: number[] = [], segB: number[] = [], segT: number[] = [], segD: number[] = [], segW: number[] = [], segK: number[] = [];
  const addLine = (f: number[], kind: number, width: number, start = 0) => {
    let total = 0;
    for (let k = 2; k < f.length; k += 2) total += Math.hypot(f[k] - f[k - 2], f[k + 1] - f[k - 1]);
    let run = 0;
    for (let k = start + 2; k < f.length; k += 2) {
      const l = Math.hypot(f[k] - f[k - 2], f[k + 1] - f[k - 1]);
      segA.push(f[k - 2], f[k - 1]); segB.push(f[k], f[k + 1]);
      segT.push(run / total, (run + l) / total); segD.push(run, run + l);
      run += l;
      segW.push(width); segK.push(kind);
    }
  };
  const WIDTH = [1.7, 1.2, 0.8];
  d.roads.forEach((r) => addLine(r.slice(1), r[0], WIDTH[r[0]]));
  d.boundary.forEach((r) => addLine(r, 3, 0.9));
  d.v3.routes.forEach((r) => { addLine(r.before, 4, 1.4); addLine(r.after, 5, 2.2); });
  const lineG = keep(new InstancedBufferGeometry());
  lineG.setIndex([0, 2, 1, 2, 3, 1]);
  lineG.setAttribute('position', new BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3));
  lineG.setAttribute('aA', new InstancedBufferAttribute(new Float32Array(segA), 2));
  lineG.setAttribute('aB', new InstancedBufferAttribute(new Float32Array(segB), 2));
  lineG.setAttribute('aT', new InstancedBufferAttribute(new Float32Array(segT), 2));
  lineG.setAttribute('aD', new InstancedBufferAttribute(new Float32Array(segD), 2));
  lineG.setAttribute('aW', new InstancedBufferAttribute(new Float32Array(segW), 1));
  lineG.setAttribute('aK', new InstancedBufferAttribute(new Float32Array(segK), 1));
  lineG.instanceCount = segW.length;
  const lines = new Mesh(lineG, material(LINE_VS, LINE_FS, 'max'));
  lines.frustumCulled = false;
  lines.renderOrder = 1;
  group.add(lines);

  // bridges (OpenStreetMap bridge segments on main roads, one per 3 km)
  const nb = d.bridges.length / 3;
  const bPos = new Float32Array(nb * 3), aV1 = new Float32Array(nb), aV3 = new Float32Array(nb), aRand = new Float32Array(nb);
  const closed = new Set(d.v3.closed);
  for (let i = 0; i < nb; i++) {
    bPos[3 * i] = d.bridges[3 * i]; bPos[3 * i + 1] = d.bridges[3 * i + 1];
    aV1[i] = d.v1.cls[i]; aV3[i] = closed.has(i) ? 1 : 0;
    const h = Math.sin(i * 12.9898) * 43758.5453;
    aRand[i] = h - Math.floor(h);
  }
  const dotG = keep(new BufferGeometry());
  dotG.setAttribute('position', new BufferAttribute(bPos, 3));
  dotG.setAttribute('aV1', new BufferAttribute(aV1, 1));
  dotG.setAttribute('aV3', new BufferAttribute(aV3, 1));
  dotG.setAttribute('aRand', new BufferAttribute(aRand, 1));
  const dots = new Points(dotG, material(DOT_VS, DOT_FS, 'normal'));
  dots.frustumCulled = false;
  dots.renderOrder = 2;
  group.add(dots);

  // rings: the first three of variant 1 (act first) and of variant 3 (reopen first)
  const marked = [...d.v1.first.map((i, k) => [i, 1, k]), ...d.v3.rank.map((i, k) => [i, 3, k])];
  const ringG = keep(new BufferGeometry());
  ringG.setAttribute('position', new BufferAttribute(new Float32Array(marked.flatMap(([i]) => [d.bridges[3 * i], d.bridges[3 * i + 1], 0])), 3));
  ringG.setAttribute('aVar', new BufferAttribute(new Float32Array(marked.map((m) => m[1])), 1));
  ringG.setAttribute('aOrder', new BufferAttribute(new Float32Array(marked.map((m) => m[2])), 1));
  const rings = new Points(ringG, material(RING_VS, RING_FS, 'add'));
  rings.frustumCulled = false;
  rings.renderOrder = 3;
  group.add(rings);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const tmp = new Vector3();
  const L = Math.hypot(tx1 - tx0, ty1 - ty0), ux = (tx1 - tx0) / L, uy = (ty1 - ty0) / L;
  const sig = d.v1.sig[0];

  return {
    group,
    update(st: MapState) {
      uniforms.uVar.value = st.variant;
      uniforms.uS.value = st.s;
      uniforms.uNet.value = st.net;
      uniforms.uTime.value = st.time;
      uniforms.uPx.value = st.pixelRatio;
      uniforms.uRes.value.copy(st.res);
      uniforms.uBefore.value = clamp((st.s - 0.18) / 0.12);
      uniforms.uDraw.value = clamp((st.s - 0.32) / 0.4);
      group.visible = st.net > 0.002;
    },
    // where the numbers 1 to 3 go, in world space, and how visible each is
    markers(st: { variant: number; s: number; net: number }) {
      const list = st.variant === 1 ? d.v1.first : st.variant === 3 ? d.v3.rank : [];
      return list.map((i, k) => {
        const x = d.bridges[3 * i], y = d.bridges[3 * i + 1];
        let on = 0;
        if (st.variant === 1) on = clamp((st.s * L - ((x - tx0) * ux + (y - ty0) * uy) - 1.2 * sig) / (0.4 * sig));
        else on = clamp((st.s - 0.82 - 0.04 * k) / 0.05);
        tmp.set(x, y, 0).applyMatrix4(group.matrixWorld);
        return { pos: [tmp.x, tmp.y, tmp.z] as [number, number, number], alpha: on * st.net };
      });
    },
    dispose() { disposables.forEach((x) => x.dispose()); },
  };
}

export type ThailandMap = ReturnType<typeof buildThailand>;
