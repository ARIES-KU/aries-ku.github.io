// The ARIES Next scene: one procedural bridge that a scan resolves, then four states as the visitor scrolls through
// the chain (sensing, intelligence, structural knowledge, decisions). Every visual here is an illustration.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, LineBasicMaterial, LineSegments, Mesh,
  PerspectiveCamera, PlaneGeometry, Points, Scene, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderer,
} from 'three';
import { DETECTIONS, FRONT_WEB_Z, GIRDER, PART, buildCloud, buildLines, uavAt, uavPath } from './bridge';
import { FIELD_GLSL, MODES, fieldAt, fieldModes } from './field';
import { buildThailand, type ThailandData, type ThailandMap } from './thailand';

type V3 = [number, number, number];
interface Key { pos: V3; target: V3; cx: number; cy: number; fov: number }

// camera for t = 0 (hero) to t = 4 (decisions); cx, cy = where the middle of the scene sits on screen
const DESKTOP: Key[] = [
  { pos: [84, 22, 46], target: [-4, 7, 0], cx: 0.62, cy: 0.5, fov: 34 },
  { pos: [-6, 26, 70], target: [-18, 16, 4], cx: 0.36, cy: 0.5, fov: 36 },
  { pos: [-15, 9.5, 31], target: [-25, 9, 2], cx: 0.36, cy: 0.5, fov: 36 },
  { pos: [-58, 6.5, 26], target: [-20, 9, 4], cx: 0.36, cy: 0.5, fov: 36 },
  { pos: [65, 1440, 510], target: [0, 0, 0], cx: 0.36, cy: 0.5, fov: 36 },
];
const PHONE: Key[] = [
  { pos: [92, 30, 34], target: [0, 6, 0], cx: 0.5, cy: 0.2, fov: 40 },
  { pos: [-4, 30, 112], target: [-18, 16, 4], cx: 0.5, cy: 0.3, fov: 40 },
  { pos: [-17, 10, 52], target: [-25, 9, 2], cx: 0.5, cy: 0.3, fov: 40 },
  { pos: [-72, 7, 46], target: [-22, 9, 4], cx: 0.5, cy: 0.3, fov: 40 },
  { pos: [0, 2440, 885], target: [0, 0, 0], cx: 0.5, cy: 0.29, fov: 40 },
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bump = (t: number, c: number, w: number) => smooth(0, 1, 1 - Math.abs(t - c) / w);

function cameraAt(keys: Key[], t: number) {
  const i = Math.min(keys.length - 2, Math.max(0, Math.floor(t)));
  const f = clamp(t - i), A = keys[i], B = keys[i + 1];
  const target = [0, 1, 2].map((k) => lerp(A.target[k], B.target[k], f)) as V3;
  const oa = A.pos.map((v, k) => v - A.target[k]), ob = B.pos.map((v, k) => v - B.target[k]);
  const la = Math.hypot(oa[0], oa[1], oa[2]), lb = Math.hypot(ob[0], ob[1], ob[2]);
  const d = [0, 1, 2].map((k) => lerp(oa[k] / la, ob[k] / lb, f));
  const dl = Math.hypot(d[0], d[1], d[2]);
  const l = Math.exp(lerp(Math.log(la), Math.log(lb), f));      // distance changes evenly in log space
  const pos = [0, 1, 2].map((k) => target[k] + (d[k] / dl) * l) as V3;
  return { pos, target, dist: l, cx: lerp(A.cx, B.cx, f), cy: lerp(A.cy, B.cy, f), fov: lerp(A.fov, B.fov, f) };
}

const POINT_VS = /* glsl */ `
attribute vec3 aScatter;
attribute float aRand;
attribute float aPart;
uniform float uTime, uScan, uReveal, uDensity, uField, uDim, uSize, uProj;
varying vec3 vColor;
varying float vAlpha;
${FIELD_GLSL}
void main() {
  float sx = (position.x + 64.0) / 128.0;
  float r = max(1.0 - smoothstep(uScan - 0.07, uScan, sx), uReveal);
  float e = r * r * (3.0 - 2.0 * r);
  vec3 drift = aScatter + 0.9 * vec3(sin(uTime * 0.31 + aRand * 40.0), cos(uTime * 0.23 + aRand * 25.0), sin(uTime * 0.19 + aRand * 13.0));
  vec4 mv = modelViewMatrix * vec4(mix(drift, position, e), 1.0);
  gl_Position = projectionMatrix * mv;
  float ground = step(5.5, aPart), water = step(6.5, aPart);
  vec3 base = mix(mix(vec3(0.36, 0.78, 1.0), vec3(0.2, 0.42, 0.58), ground), vec3(0.11, 0.25, 0.4), water);
  float front = exp(-pow((sx - uScan) / 0.012, 2.0)) * (1.0 - uReveal);
  vec3 col = mix(base, vec3(0.92, 0.98, 1.0), front);
  float f = field(position);
  float level = abs(fract(f * 8.0 + 0.5) - 0.5);
  vec3 fc = mix(ramp(f), vec3(1.0), (1.0 - smoothstep(0.025, 0.07, level)) * 0.55);
  float onField = aPart > 1.5 && aPart < 2.5 ? 1.0 : (aPart > 2.5 && aPart < 4.5 ? 0.6 : 0.0);
  vColor = mix(col, fc, uField * onField);
  vAlpha = step(aRand, uDensity) * uDim * mix(0.22, 0.95, e) * (1.0 - 0.55 * water) * (1.0 + front);
  gl_PointSize = clamp(uSize * uProj / max(-mv.z, 1.0) * (1.0 + 2.5 * front), 1.0, 5.0);
}`;

const ROUND_FS = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  gl_FragColor = vec4(vColor, vAlpha * (1.0 - d * 4.0));
}`;

// constant-size points (flight path, drone, network nodes)
const DOT_VS = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uPixel, uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = uOpacity;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixel;
}`;

const FIELD_VS = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FIELD_FS = /* glsl */ `
uniform float uOpacity;
varying vec3 vWorld;
${FIELD_GLSL}
void main() {
  float f = field(vWorld);
  float k = f * 8.0;
  float d = abs(fract(k + 0.5) - 0.5);
  float w = fwidth(k);
  float line = 1.0 - smoothstep(w * 0.6, w * 1.8, d);
  gl_FragColor = vec4(mix(ramp(f), vec3(1.0), line * 0.7), uOpacity * (0.7 + 0.3 * line));
}`;

const SCAN_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SCAN_FS = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float v = 1.0 - abs(vUv.y - 0.5) * 2.0, h = 1.0 - abs(vUv.x - 0.5) * 2.0;
  gl_FragColor = vec4(0.36, 0.78, 1.0, uOpacity * pow(v, 0.6) * pow(h, 0.7) * 0.32);
}`;

export function startScene(): void {
  const root = document.documentElement;
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]');
  if (!stage || !canvas) throw new Error('ARIES Next: stage not found');
  const params = new URLSearchParams(location.search);
  const capture = import.meta.env.DEV && params.has('capture');
  const watchdog = !(import.meta.env.DEV && (params.has('nofallback') || capture));
  const freeze = import.meta.env.DEV && params.has('t') ? Number(params.get('t')) : null;
  const isPhone = () => window.matchMedia('(max-width: 760px)').matches;
  const small = isPhone() || (window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);

  const renderer = new WebGLRenderer({ canvas, antialias: !small, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new Scene();
  const camera = new PerspectiveCamera(36, 1, 0.5, 6000);
  const modes = fieldModes();
  const modeVecs = Array.from({ length: MODES }, (_, i) => new Vector4(modes[4 * i], modes[4 * i + 1], modes[4 * i + 2], modes[4 * i + 3]));
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // the scanned bridge
  const cloud = buildCloud(small ? 6000 : 20000);
  const cg = keep(new BufferGeometry());
  cg.setAttribute('position', new BufferAttribute(cloud.position, 3));
  cg.setAttribute('aScatter', new BufferAttribute(cloud.scatter, 3));
  cg.setAttribute('aRand', new BufferAttribute(cloud.rand, 1));
  cg.setAttribute('aPart', new BufferAttribute(cloud.part, 1));
  const pu = {
    uTime: { value: 0 }, uScan: { value: -0.1 }, uReveal: { value: 0 }, uDensity: { value: 0.62 }, uField: { value: 0 },
    uDim: { value: 1 }, uSize: { value: small ? 0.17 : 0.13 }, uProj: { value: 1000 }, uModes: { value: modeVecs },
  };
  const points = new Points(cg, keep(new ShaderMaterial({ uniforms: pu, vertexShader: POINT_VS, fragmentShader: ROUND_FS, transparent: true, depthWrite: false, blending: AdditiveBlending })));
  points.frustumCulled = false;
  scene.add(points);

  // the scan plane sweeping along the bridge
  const scanMat = keep(new ShaderMaterial({ uniforms: { uOpacity: { value: 0 } }, vertexShader: SCAN_VS, fragmentShader: SCAN_FS, transparent: true, depthWrite: false, blending: AdditiveBlending }));
  const scanPlane = new Mesh(keep(new PlaneGeometry(1, 1)), scanMat);
  scanPlane.rotation.y = Math.PI / 2;
  scanPlane.scale.set(24, 18, 1);
  scanPlane.position.set(-64, 6, 0);
  scene.add(scanPlane);

  // a faint survey grid on the water
  const grid: number[] = [];
  for (let x = -128; x <= 128; x += 8) grid.push(x, -0.05, -64, x, -0.05, 64);
  for (let z = -64; z <= 64; z += 8) grid.push(-128, -0.05, z, 128, -0.05, z);
  const gridG = keep(new BufferGeometry());
  gridG.setAttribute('position', new BufferAttribute(new Float32Array(grid), 3));
  const gridMat = keep(new LineBasicMaterial({ color: 0x1e9be9, transparent: true, opacity: 0.07, depthWrite: false }));
  scene.add(new LineSegments(gridG, gridMat));

  // wireframe (intelligence)
  const lg = keep(new BufferGeometry());
  lg.setAttribute('position', new BufferAttribute(buildLines(), 3));
  const wireMat = keep(new LineBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  scene.add(new LineSegments(lg, wireMat));

  // random field painted on the front girder web (structural knowledge)
  const fieldMat = keep(new ShaderMaterial({ uniforms: { uOpacity: { value: 0 }, uModes: { value: modeVecs } }, vertexShader: FIELD_VS, fragmentShader: FIELD_FS, transparent: true, depthWrite: false }));
  const webH = GIRDER.top - GIRDER.bot - 0.2;
  const fieldPlane = new Mesh(keep(new PlaneGeometry(128, webH)), fieldMat);
  fieldPlane.position.set(0, GIRDER.bot + 0.2 + webH / 2, FRONT_WEB_Z + 0.01);
  scene.add(fieldPlane);
  // the highest value of that field on the part of the web the third step shows: the spot that governs
  let hot: V3 = [0, 9, FRONT_WEB_Z];

  // flight path, drone and laser rays (sensing)
  const dots: ShaderMaterial[] = [];
  const dotMaterial = () => { const m = keep(new ShaderMaterial({ uniforms: { uPixel: { value: 1 }, uOpacity: { value: 0 } }, vertexShader: DOT_VS, fragmentShader: ROUND_FS, transparent: true, depthWrite: false, blending: AdditiveBlending })); dots.push(m); return m; };
  const path = uavPath();
  const pathG = keep(new BufferGeometry());
  pathG.setAttribute('position', new BufferAttribute(path, 3));
  pathG.setAttribute('aColor', new BufferAttribute(new Float32Array(path.length).map((_, i) => [0.36, 0.78, 1.0][i % 3]), 3));
  pathG.setAttribute('aSize', new BufferAttribute(new Float32Array(path.length / 3).fill(2.2), 1));
  const pathMat = dotMaterial();
  scene.add(new Points(pathG, pathMat));
  const droneG = keep(new BufferGeometry());
  droneG.setAttribute('position', new BufferAttribute(new Float32Array(3), 3).setUsage(DynamicDrawUsage));
  droneG.setAttribute('aColor', new BufferAttribute(new Float32Array([0.92, 0.98, 1.0]), 3));
  droneG.setAttribute('aSize', new BufferAttribute(new Float32Array([7]), 1));
  const droneMat = dotMaterial();
  const drone = new Points(droneG, droneMat);
  drone.frustumCulled = false;
  scene.add(drone);
  const RAYS = 8;
  const rayG = keep(new BufferGeometry());
  rayG.setAttribute('position', new BufferAttribute(new Float32Array(RAYS * 6), 3).setUsage(DynamicDrawUsage));
  const rayMat = keep(new LineBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  const rays = new LineSegments(rayG, rayMat);
  rays.frustumCulled = false;
  scene.add(rays);
  const targets: number[] = [];
  for (let i = 0; i < cloud.count; i++) {
    const p = cloud.part[i];
    if ((p === PART.deck || p === PART.girder || p === PART.parapet) && cloud.position[3 * i + 2] > 0) targets.push(i);
  }
  const rayIdx = new Int32Array(RAYS);
  let rayClock = -1;

  // Thailand's real main roads for the decisions step (thailand.ts), a separate chunk loaded once the scene runs.
  // The bridge above fades out as the map comes in and is never placed on it: the pilot bridge is not identified.
  const MAP_SCALE = 0.5;                                  // scene units per km
  let map: ThailandMap | null = null;
  import('../../assets/next/thailand.json')
    .then((m) => {
      if (!running) return;
      map = buildThailand((m.default ?? m) as unknown as ThailandData, MAP_SCALE);
      scene.add(map.group);
      if (capture) (window as unknown as { __nxMapReady: boolean }).__nxMapReady = true;
    })
    .catch(() => { /* without the map the decisions step shows the card alone */ });
  // the event on the map plays once the decisions step is reached; ?s= freezes it in dev
  const PLAY = 6;                                         // seconds
  const sFreeze = import.meta.env.DEV && params.has('s') ? Number(params.get('s')) : null;
  let sv = 0;
  const resV = new Vector2();

  // overlays in the DOM: detection boxes and the hot spot
  const boxEls = Array.from(stage.querySelectorAll<HTMLElement>('[data-box]'));
  const hotEl = stage.querySelector<HTMLElement>('[data-hot]');
  const rankEls = Array.from(stage.querySelectorAll<HTMLElement>('[data-rank]'));
  const hud = stage.querySelector<HTMLElement>('[data-hud]');
  const v = new Vector3();
  const toScreen = (p: V3, W: number, H: number) => { v.set(p[0], p[1], p[2]).project(camera); return { x: (v.x + 1) * 0.5 * W, y: (1 - v.y) * 0.5 * H, ok: v.z < 1 }; };
  const boxRect = (b: { min: V3; max: V3 }, W: number, H: number) => {
    const c = [[b.min[0], b.min[1]], [b.max[0], b.min[1]], [b.min[0], b.max[1]], [b.max[0], b.max[1]]].map(([x, y]) => toScreen([x, y, b.min[2]], W, H));
    const xs = c.map((q) => q.x), ys = c.map((q) => q.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), ok: c.every((q) => q.ok) };
  };

  // scroll position -> timeline t in [0, 4], holding steady while a card is centred
  const anchorEls = Array.from(stage.querySelectorAll<HTMLElement>('[data-anchor]'));
  let anchors: number[] = [];
  const measure = () => { anchors = anchorEls.map((el) => { const r = el.getBoundingClientRect(); return r.top + window.scrollY + r.height / 2; }); };
  const scrollT = () => {
    if (anchors.length < 2) return 0;
    const y = window.scrollY + window.innerHeight / 2;
    if (y <= anchors[0]) return 0;
    for (let i = 0; i < anchors.length - 1; i++) if (y < anchors[i + 1]) return i + smooth(0.16, 0.84, (y - anchors[i]) / (anchors[i + 1] - anchors[i]));
    return anchors.length - 1;
  };

  let W = 1, H = 1;
  const probe = new PerspectiveCamera();
  const findHot = (keys: Key[], centre: boolean) => {
    const c = cameraAt(keys, 3);
    probe.fov = c.fov; probe.aspect = W / H;
    probe.position.set(c.pos[0], c.pos[1], c.pos[2]);
    probe.lookAt(c.target[0], c.target[1], c.target[2]);
    const cx = centre ? 0.5 : c.cx, cy = centre ? 0.5 : c.cy;
    probe.setViewOffset(W, H, (0.5 - cx) * W, (0.5 - cy) * H, W, H);
    probe.updateMatrixWorld();
    const [x0, x1, y0, y1] = centre ? [0.1, 0.9, 0.15, 0.85] : keys === PHONE ? [0.1, 0.9, 0.12, 0.42] : [0.06, 0.55, 0.15, 0.85];
    let best = -1;
    for (let x = -64; x <= 64; x += 0.5) for (let y = GIRDER.bot + 0.3; y <= GIRDER.top - 0.1; y += 0.2) {
      v.set(x, y, FRONT_WEB_Z).project(probe);
      const sx = (v.x + 1) / 2, sy = (1 - v.y) / 2;
      if (v.z >= 1 || sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
      const f = fieldAt(modes, x, y, FRONT_WEB_Z);
      if (f > best) { best = f; hot = [x, y, FRONT_WEB_Z]; }
    }
  };
  const resize = () => {
    W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    measure();
    findHot(isPhone() ? PHONE : DESKTOP, false);
  };
  resize();
  window.addEventListener('resize', resize);
  const ro = new ResizeObserver(measure);
  ro.observe(stage);

  const fine = window.matchMedia('(pointer: fine)').matches && !small;
  let mx = 0, my = 0, px = 0, py = 0;
  const onPointer = (e: PointerEvent) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
  if (fine) window.addEventListener('pointermove', onPointer, { passive: true });

  const start = performance.now();
  let tc = 0, reveal = 0;

  // set every uniform and the camera for timeline t; returns what the overlays need
  const apply = (t: number, now: number, opts: { keys: Key[]; scan: number; reveal: number; s: number; centre?: boolean; parallax?: boolean }) => {
    const time = (now - start) / 1000;
    pu.uTime.value = time;
    pu.uScan.value = -0.1 + 1.25 * opts.scan;
    pu.uReveal.value = opts.reveal;
    scanMat.uniforms.uOpacity.value = smooth(0, 0.05, opts.scan) * (1 - smooth(0.88, 1, opts.scan));
    scanPlane.position.x = -64 + 128 * clamp(pu.uScan.value);
    dots.forEach((m) => { m.uniforms.uPixel.value = renderer.getPixelRatio(); });

    const uav = bump(t, 1, 0.62), wire = bump(t, 2, 0.72), boxes = bump(t, 2, 0.5);
    const field = smooth(2.3, 2.85, t) * (1 - smooth(3.25, 3.6, t)), hotA = bump(t, 3, 0.42), netA = smooth(3.25, 3.85, t);
    pu.uDensity.value = 0.8 + 0.2 * smooth(0.15, 1, t);
    gridMat.opacity = 0.07 * (1 - netA);
    pu.uField.value = field;
    pu.uDim.value = (1 - 0.3 * wire) * (1 - smooth(3.2, 3.65, t));    // the bridge dissolves before the map arrives
    wireMat.opacity = wire * 0.5;
    fieldMat.uniforms.uOpacity.value = field * 0.88;
    pathMat.uniforms.uOpacity.value = uav * 0.9;
    droneMat.uniforms.uOpacity.value = uav;
    rayMat.opacity = uav * 0.55;
    map?.update({ net: netA, s: opts.s, time, pixelRatio: renderer.getPixelRatio(), res: renderer.getDrawingBufferSize(resV) });

    // drone along its path, rays to points on the bridge below it
    const u = (time * 0.06) % 1;
    const dp = uavAt(u);
    (droneG.attributes.position as BufferAttribute).set(dp, 0);
    droneG.attributes.position.needsUpdate = true;
    if (uav > 0.01) {
      if (Math.floor(time / 0.16) !== rayClock) {
        rayClock = Math.floor(time / 0.16);
        for (let k = 0; k < RAYS; k++) {
          let pick = targets[(Math.random() * targets.length) | 0];
          for (let tries = 0; tries < 40; tries++) {
            const c = targets[(Math.random() * targets.length) | 0];
            if (Math.abs(cloud.position[3 * c] - dp[0]) < 9) { pick = c; break; }
          }
          rayIdx[k] = pick;
        }
      }
      const ra = rayG.attributes.position as BufferAttribute;
      for (let k = 0; k < RAYS; k++) {
        const c = rayIdx[k];
        ra.setXYZ(2 * k, dp[0], dp[1], dp[2]);
        ra.setXYZ(2 * k + 1, cloud.position[3 * c], cloud.position[3 * c + 1], cloud.position[3 * c + 2]);
      }
      ra.needsUpdate = true;
    }

    // camera
    const cam = cameraAt(opts.keys, t);
    const breathe = Math.sin(time * 0.13) * cam.dist * 0.004;
    if (opts.parallax) { px += (mx - px) * 0.05; py += (my - py) * 0.05; }
    const pxo = opts.parallax ? px * cam.dist * 0.03 : 0, pyo = opts.parallax ? -py * cam.dist * 0.02 : 0;
    camera.position.set(cam.pos[0] + breathe + pxo, cam.pos[1] + pyo, cam.pos[2]);
    camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
    camera.fov = cam.fov;
    const cx = opts.centre ? 0.5 : cam.cx, cy = opts.centre ? 0.5 : cam.cy;
    camera.setViewOffset(W, H, (0.5 - cx) * W, (0.5 - cy) * H, W, H);
    pu.uProj.value = (H * renderer.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    camera.updateMatrixWorld();
    return { boxes, hotA, netA };
  };

  // render loop: paused while the stage is off screen or the tab is hidden
  let visible = true, running = true, last = performance.now(), frames = 0;
  const samples: number[] = [];
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(stage);

  const fail = () => {
    running = false;
    root.classList.remove('nx-live');
    io.disconnect(); ro.disconnect();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointer);
    disposables.forEach((d) => d.dispose());
    map?.dispose();
    renderer.dispose();
  };

  const frame = (now: number) => {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tc = freeze ?? tc + (scrollT() - tc) * (1 - Math.exp(-dt * 5));
    const scan = freeze === null ? smooth(0, 1, (now - start) / 2600) : 1;
    if (scan >= 1 || tc > 0.2) reveal = Math.min(1, reveal + dt * 2);
    hud?.style.setProperty('--scan', String(scan));
    if (scan >= 1) hud?.classList.add('is-done');

    // the decisions step plays once it is reached and starts again when the visitor comes back to it
    if (tc < 3.5) sv = 0;
    else if (tc > 3.85) sv = Math.min(1, sv + dt / PLAY);
    const sNow = sFreeze ?? sv;
    const o = apply(tc, now, { keys: isPhone() ? PHONE : DESKTOP, scan, reveal, s: sNow, parallax: fine });
    renderer.render(scene, camera);

    DETECTIONS.forEach((b, i) => {
      const el = boxEls[i]; if (!el) return;
      const r = boxRect(b, W, H);
      el.style.opacity = r.ok ? String(o.boxes) : '0';
      el.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)`;
      el.style.width = `${r.w.toFixed(1)}px`;
      el.style.height = `${r.h.toFixed(1)}px`;
    });
    if (hotEl) {
      const s = toScreen(hot, W, H);
      hotEl.style.opacity = s.ok ? String(o.hotA) : '0';
      hotEl.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    }
    const marks = map ? map.markers({ s: sNow, net: o.netA }) : [];
    rankEls.forEach((el, k) => {
      const m = marks[k];
      const sp = m ? toScreen(m.pos, W, H) : null;
      el.style.opacity = m && sp?.ok ? String(m.alpha) : '0';
      if (sp) el.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px)`;
    });

    // a device that cannot hold 30 fps gets the static frames instead
    frames++;
    if (watchdog && frames > 45 && frames <= 165) {
      samples.push(dt);
      if (frames === 165) { samples.sort((a, b) => a - b); if (samples[samples.length >> 1] > 1 / 30) fail(); }
    }
  };
  requestAnimationFrame(frame);
  root.classList.add('nx-ready');

  // dev only: render a state into a still frame (used to make the static frames in src/assets/next/)
  if (capture) {
    (window as unknown as { __nxCapture: (t: number, w?: number, h?: number, s?: number) => string }).__nxCapture = (t, w = 1600, h = 1000, s = 1) => {
      running = false;
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      W = w; H = h; camera.aspect = w / h;
      findHot(DESKTOP, true);
      const o = apply(t, start + 40000, { keys: DESKTOP, scan: 1, reveal: 1, s, centre: true });
      renderer.render(scene, camera);
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const g = c2.getContext('2d')!;
      g.fillStyle = '#05070C'; g.fillRect(0, 0, w, h);
      const glow = g.createRadialGradient(w * 0.5, h * 0.47, 0, w * 0.5, h * 0.47, w * 0.55);
      glow.addColorStop(0, 'rgba(30,155,233,0.11)'); glow.addColorStop(1, 'rgba(30,155,233,0)');
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 1;
      for (let x = 0.5; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0.5; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.drawImage(renderer.domElement, 0, 0);
      g.font = '500 13px "IBM Plex Mono", monospace';
      g.textBaseline = 'top';
      const label = (text: string, x: number, y: number) => {
        const tw = g.measureText(text).width + 12;
        g.fillStyle = '#FFB020'; g.fillRect(x - 1, y - 20, tw, 18);
        g.fillStyle = '#1A1206'; g.fillText(text, x + 5, y - 18);
      };
      if (o.boxes > 0.5) DETECTIONS.forEach((b, i) => {
        const r = boxRect(b, w, h); if (!r.ok) return;
        g.strokeStyle = '#FFB020'; g.lineWidth = 1.5; g.strokeRect(r.x, r.y, r.w, r.h);
        label((boxEls[i]?.textContent ?? '').trim().toUpperCase(), r.x, r.y);
      });
      if (o.hotA > 0.5) {
        const s = toScreen(hot, w, h);
        g.strokeStyle = '#FFB020'; g.lineWidth = 2; g.beginPath(); g.arc(s.x, s.y, 8, 0, Math.PI * 2); g.stroke();
        label((hotEl?.textContent ?? '').trim().toUpperCase(), s.x + 16, s.y + 10);
      }
      if (map) map.markers({ s, net: o.netA }).forEach((m, k) => {
        if (m.alpha < 0.5) return;
        const q = toScreen(m.pos, w, h);
        label(String(k + 1), q.x + 14, q.y - 6);
      });
      return c2.toDataURL('image/png');
    };
  }
}
