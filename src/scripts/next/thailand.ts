// The Decisions step: Thailand's real main roads (OpenStreetMap contributors, ODbL) inside the national boundary
// (RTSD via OCHA, CC BY-IGO). An invented event, a rain band, crosses the network; the bridges it passes are ranked for
// inspection: act first, next, monitor. The event and every score are invented for an illustration; thailand.json says
// so in its _source and the page caption says so too. Two other versions of this step (a screening map and a
// connectivity view) are archived at git tag next-decisions-variants-2026-10-04.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CustomBlending, DataTexture, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, LinearFilter, MaxEquation, Mesh, NormalBlending, Points, RGBAFormat, ShaderMaterial, Shape,
  ShapeGeometry, UnsignedByteType, Vector2, Vector3, Vector4,
} from 'three';

export interface ThailandData {
  bbox: [number, number, number, number];
  cell: number;
  boundary: number[][];
  roads: number[][];                    // [class, x, y, x, y, ...]; class 0 motorway, 1 trunk, 2 primary
  bridges: number[];                    // x, y, class, ...
  event: { track: number[]; sig: number[]; hot: number; tex: number[]; amp: number; cls: number[]; first: number[] };
}

export interface MapState { net: number; s: number; time: number; pixelRatio: number; res: Vector2 }

const COMMON = /* glsl */ `
uniform float uS, uNet, uTime;          // uS: how far the event has travelled along its track, 0 to 1
uniform sampler2D uMap;                 // texture of the band, one texel per 10 km cell (red channel)
uniform vec4 uBox;                      // grid origin x, y (km) and cells in x, y
uniform vec4 uTrack;                    // track start x, y and end x, y (km)
uniform vec2 uSig;                      // band size along and across the track (km)
uniform float uHot;
const float CELL = 10.0;
const vec3 AMBER = vec3(1.0, 0.69, 0.125), CYAN = vec3(0.118, 0.608, 0.914), CYAN2 = vec3(0.36, 0.78, 1.0), WHITE = vec3(0.91, 0.933, 0.965);
vec2 cellOf(vec2 p) { return floor((p - uBox.xy) / CELL); }
vec2 cellCentre(vec2 p) { return uBox.xy + (cellOf(p) + 0.5) * CELL; }
float cellTex(vec2 p) { return texture2D(uMap, (cellOf(p) + 0.5) / uBox.zw).r; }
float smoothTex(vec2 p) { return texture2D(uMap, (p - uBox.xy) / (CELL * uBox.zw)).r; }
float trackLen() { return length(uTrack.zw - uTrack.xy); }
vec2 alongAcross(vec2 p) { vec2 d = normalize(uTrack.zw - uTrack.xy); vec2 q = p - uTrack.xy; return vec2(dot(q, d), dot(q, vec2(-d.y, d.x))); }
float band(float du, float v) { return exp(-0.5 * (du * du / (uSig.x * uSig.x) + v * v / (uSig.y * uSig.y))); }
// intensity now, and the highest a point has seen so far
float eventNow(vec2 p, float tx) { vec2 a = alongAcross(p); return band(a.x - uS * trackLen(), a.y) * (0.55 + 0.9 * tx); }
float eventPeak(vec2 p, float tx) { vec2 a = alongAcross(p); return band(a.x - clamp(a.x, 0.0, uS * trackLen()), a.y) * (0.55 + 0.9 * tx); }
// the band fades in as it starts and out as it leaves, so neither end state shows a stray glow
float live() { return smoothstep(0.0, 0.06, uS) * (1.0 - smoothstep(0.86, 1.0, uS)); }
`;

const FILL_VS = /* glsl */ `
varying vec2 vKm;
void main() { vKm = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FILL_FS = /* glsl */ `
${COMMON}
varying vec2 vKm;
void main() {
  vec3 col = vec3(0.043, 0.102, 0.227);
  float a = 0.5;
  float g = clamp((eventNow(cellCentre(vKm), cellTex(vKm)) - 0.45) / 0.7, 0.0, 0.6) * live();
  col = mix(col, AMBER, g); a = max(a, 0.5 + 0.5 * g);
  // a thin iso-line around where the band has been
  float pk = eventPeak(vKm, smoothTex(vKm)), w = fwidth(pk);
  float f = 1.0 - smoothstep(w * 0.4, w * 1.4, abs(pk - uHot));
  col = mix(col, AMBER, f * 0.6); a = max(a, f * 0.65);
  gl_FragColor = vec4(col, a * uNet);
}`;

// screen-space wide lines: each instance is one segment, expanded to a quad of aW CSS pixels
const LINE_VS = /* glsl */ `
attribute vec2 aA, aB;
attribute float aW, aK;
uniform vec2 uRes;
uniform float uPx;
varying vec2 vKm;
varying float vK, vEdge, vHalf;
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
  vK = aK; vEdge = position.y * hw; vHalf = hw;
}`;

const LINE_FS = /* glsl */ `
${COMMON}
varying vec2 vKm;
varying float vK, vEdge, vHalf;
void main() {
  float aa = 1.0 - smoothstep(vHalf - 1.2, vHalf, abs(vEdge));
  vec3 col = CYAN2;
  float a;
  if (vK > 2.5) {                       // national boundary
    col = CYAN; a = 0.55;
  } else {
    a = vK < 0.5 ? 0.95 : vK < 1.5 ? 0.7 : 0.42;
    if (eventNow(cellCentre(vKm), cellTex(vKm)) * live() > uHot) { col = AMBER; a = 1.0; }
  }
  a *= aa * uNet;
  gl_FragColor = vec4(col * a, a);      // premultiplied, for max blending
}`;

const DOT_VS = /* glsl */ `
${COMMON}
attribute float aCls;                   // 0 not passed, 1 monitor, 2 next, 3 act first
uniform float uPx;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  vec3 col = WHITE;
  float a = 0.24, size = 2.0;
  if (aCls > 0.5) {
    float front = uS * trackLen() - alongAcross(p).x;      // > 0 once the band centre has gone past
    float under = (1.0 - smoothstep(0.35 * uSig.x, 1.1 * uSig.x, abs(front))) * live();
    float passed = smoothstep(0.5 * uSig.x, 1.2 * uSig.x, front);
    vec3 cls = aCls > 2.5 ? AMBER : aCls > 1.5 ? WHITE : CYAN;
    float cs = aCls > 2.5 ? 7.5 : aCls > 1.5 ? 4.8 : 2.8;
    col = mix(col, AMBER, under); a = mix(a, 1.0, under); size = mix(size, 3.6, under);
    col = mix(col, cls, passed); a = mix(a, aCls > 1.5 ? 1.0 : 0.9, passed); size = mix(size, cs, passed);
  }
  gl_PointSize = size * uPx;
  vColor = col; vAlpha = a * uNet;
}`;

const DOT_FS = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, vAlpha * (1.0 - smoothstep(0.28, 0.5, d)));
}`;

// rings around the three bridges ranked first, once the band has gone past them
const RING_VS = /* glsl */ `
${COMMON}
attribute float aOrder;
uniform float uPx;
varying float vAlpha, vPing;
void main() {
  vec2 p = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  vAlpha = smoothstep(1.0 * uSig.x, 1.5 * uSig.x, uS * trackLen() - alongAcross(p).x) * uNet;
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
  const ev = d.event;

  // the band's texture, one texel per 10 km cell (RGBA keeps every row 4-byte aligned)
  const C = d.cell, gx0 = Math.floor(bx0 / C) * C, gy0 = Math.floor(by0 / C) * C;
  const nx = Math.ceil((bx1 - gx0) / C) + 1, ny = Math.ceil((by1 - gy0) / C) + 1;
  const px = new Uint8Array(nx * ny * 4);
  const K = ev.tex.length / 3;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = gx0 + (i + 0.5) * C, y = gy0 + (j + 0.5) * C;
    let s = 0;
    for (let k = 0; k < K; k++) s += Math.cos(ev.tex[3 * k] * x + ev.tex[3 * k + 1] * y + ev.tex[3 * k + 2]);
    const o = 4 * (j * nx + i);
    px[o] = Math.round(Math.min(1, Math.max(0, 0.5 + (ev.amp * s) / Math.sqrt(K / 2))) * 255);
    px[o + 3] = 255;
  }
  const tex = keep(new DataTexture(px, nx, ny, RGBAFormat, UnsignedByteType));
  tex.magFilter = LinearFilter; tex.minFilter = LinearFilter; tex.needsUpdate = true;

  const [tx0, ty0, tx1, ty1] = ev.track;
  const uniforms = {
    uS: { value: 0 }, uNet: { value: 0 }, uTime: { value: 0 }, uMap: { value: tex },
    uBox: { value: new Vector4(gx0, gy0, nx, ny) }, uTrack: { value: new Vector4(tx0, ty0, tx1, ty1) },
    uSig: { value: new Vector2(ev.sig[0], ev.sig[1]) }, uHot: { value: ev.hot },
    uRes: { value: new Vector2(1, 1) }, uPx: { value: 1 },
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

  // roads and the boundary as one set of wide-line instances; max blending, because divided highways are two
  // OpenStreetMap ways on top of each other and adding them would turn them white
  const segA: number[] = [], segB: number[] = [], segW: number[] = [], segK: number[] = [];
  const addLine = (f: number[], kind: number, width: number) => {
    for (let k = 2; k < f.length; k += 2) {
      segA.push(f[k - 2], f[k - 1]); segB.push(f[k], f[k + 1]);
      segW.push(width); segK.push(kind);
    }
  };
  const WIDTH = [1.7, 1.2, 0.8];
  d.roads.forEach((r) => addLine(r.slice(1), r[0], WIDTH[r[0]]));
  d.boundary.forEach((r) => addLine(r, 3, 0.9));
  const lineG = keep(new InstancedBufferGeometry());
  lineG.setIndex([0, 2, 1, 2, 3, 1]);
  lineG.setAttribute('position', new BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3));
  lineG.setAttribute('aA', new InstancedBufferAttribute(new Float32Array(segA), 2));
  lineG.setAttribute('aB', new InstancedBufferAttribute(new Float32Array(segB), 2));
  lineG.setAttribute('aW', new InstancedBufferAttribute(new Float32Array(segW), 1));
  lineG.setAttribute('aK', new InstancedBufferAttribute(new Float32Array(segK), 1));
  lineG.instanceCount = segW.length;
  const lines = new Mesh(lineG, material(LINE_VS, LINE_FS, 'max'));
  lines.frustumCulled = false;
  lines.renderOrder = 1;
  group.add(lines);

  // bridges (OpenStreetMap bridge segments on main roads, one per 3 km)
  const nb = d.bridges.length / 3;
  const bPos = new Float32Array(nb * 3), aCls = new Float32Array(nb);
  for (let i = 0; i < nb; i++) {
    bPos[3 * i] = d.bridges[3 * i]; bPos[3 * i + 1] = d.bridges[3 * i + 1];
    aCls[i] = ev.cls[i];
  }
  const dotG = keep(new BufferGeometry());
  dotG.setAttribute('position', new BufferAttribute(bPos, 3));
  dotG.setAttribute('aCls', new BufferAttribute(aCls, 1));
  const dots = new Points(dotG, material(DOT_VS, DOT_FS, 'normal'));
  dots.frustumCulled = false;
  dots.renderOrder = 2;
  group.add(dots);

  const ringG = keep(new BufferGeometry());
  ringG.setAttribute('position', new BufferAttribute(new Float32Array(ev.first.flatMap((i) => [d.bridges[3 * i], d.bridges[3 * i + 1], 0])), 3));
  ringG.setAttribute('aOrder', new BufferAttribute(new Float32Array(ev.first.map((_, k) => k)), 1));
  const rings = new Points(ringG, material(RING_VS, RING_FS, 'add'));
  rings.frustumCulled = false;
  rings.renderOrder = 3;
  group.add(rings);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const tmp = new Vector3();
  const L = Math.hypot(tx1 - tx0, ty1 - ty0), ux = (tx1 - tx0) / L, uy = (ty1 - ty0) / L;
  const sig = ev.sig[0];

  return {
    group,
    update(st: MapState) {
      uniforms.uS.value = st.s;
      uniforms.uNet.value = st.net;
      uniforms.uTime.value = st.time;
      uniforms.uPx.value = st.pixelRatio;
      uniforms.uRes.value.copy(st.res);
      group.visible = st.net > 0.002;
    },
    // where the numbers 1 to 3 go, in world space, and how visible each is: shown once the band has passed
    markers(st: { s: number; net: number }) {
      return ev.first.map((i) => {
        const x = d.bridges[3 * i], y = d.bridges[3 * i + 1];
        const on = clamp((st.s * L - ((x - tx0) * ux + (y - ty0) * uy) - 1.2 * sig) / (0.4 * sig));
        tmp.set(x, y, 0).applyMatrix4(group.matrixWorld);
        return { pos: [tmp.x, tmp.y, tmp.z] as [number, number, number], alpha: on * st.net };
      });
    },
    dispose() { disposables.forEach((x) => x.dispose()); },
  };
}

export type ThailandMap = ReturnType<typeof buildThailand>;
