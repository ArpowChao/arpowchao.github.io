// 3D 水面：把目前的水波（自己排的或自動模擬的）畫成立體波紋，小鴨浮在水面上，波峰經過時發光。
import * as THREE from './lib3d/three.module.min.js';
import { OrbitControls } from './lib3d/OrbitControls.js';

const SEG = 160;                       // 水面網格細分
const DUCK_COLORS = { source: 0xe9b93a, A: 0x32a0ac, B: 0x88bdc3, C: 0xd1709a, D: 0x7a8fd6, E: 0x6db36d, F: 0xd48a3c };

function radialTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function labelSprite(text, color = '#153f4d') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.font = 'bold 56px "Microsoft JhengHei","Noto Sans TC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,.95)'; g.strokeText(text, 128, 50);
  g.fillStyle = color; g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.1, 0.41, 1); s.renderOrder = 10; return s;
}
function makeDuck(color, label) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: .55, emissive: 0xffc928, emissiveIntensity: 0 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(.24, 24, 16), bodyMat); body.scale.set(1.35, .72, .95); body.position.y = .1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.13, 20, 14), bodyMat); head.position.set(.27, .3, 0);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.06, .16, 12), new THREE.MeshStandardMaterial({ color: 0xe5a234, roughness: .5 }));
  beak.rotation.z = -Math.PI / 2; beak.position.set(.45, .28, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.08, .18, 10), bodyMat); tail.rotation.z = Math.PI / 2.6; tail.position.set(-.33, .2, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x153f4d });
  for (const z of [-.08, .08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 8), eyeMat); e.position.set(.35, .34, z); group.add(e); }
  group.add(body, head, beak, tail);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,226,90,1)', 'rgba(255,226,90,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  halo.scale.set(2.2, 2.2, 1); halo.position.y = .25; group.add(halo);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.42, .52, 40), new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03; group.add(ring);
  const tag = labelSprite(label); tag.position.y = .85; group.add(tag);
  group.userData = { bodyMat, halo, ring };
  group.scale.setScalar(1.45);
  return group;
}

export function create(container, lab) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'view3d-canvas';
  renderer.domElement.setAttribute('aria-label', '3D 水面：拖曳旋轉，雙指或滾輪縮放');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe4f2f4);
  scene.fog = new THREE.Fog(0xe4f2f4, 30, 60);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5c8f9a, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-6, 12, 8); scene.add(sun);

  const camera = new THREE.PerspectiveCamera(42, 1, .1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI / 2 - .04; controls.minDistance = 3; controls.maxDistance = 45;

  let lastView = 'oblique', size = 0, water = null, grid = null, rim = null, rings = [], cell = 1;
  const ducks = new Map();
  let source = null, lastSig = '', currentExtent = 0, running = false, raf = 0;

  function gridTexture(extent, c) {
    const px = 1024, cv = document.createElement('canvas'); cv.width = cv.height = px;
    const g = cv.getContext('2d'); g.fillStyle = '#5fb2c2'; g.fillRect(0, 0, px, px);
    const per = px / (2 * extent);
    const line = (step, color, w) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath();
      for (let v = 0; v <= extent + 1e-6; v += step) for (const s of v ? [v, -v] : [0]) { const p = px / 2 + s * per; g.moveTo(p, 0); g.lineTo(p, px); g.moveTo(0, p); g.lineTo(px, p); } g.stroke(); };
    line(c / 4, 'rgba(255,255,255,.16)', 1); line(c, 'rgba(255,255,255,.42)', 2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function build(extent, c) {
    if (water) { scene.remove(water, rim); water.geometry.dispose(); water.material.map?.dispose(); water.material.dispose(); }
    size = extent * 2; cell = c; currentExtent = extent;
    const geo = new THREE.PlaneGeometry(size, size, SEG, SEG); geo.rotateX(-Math.PI / 2);
    water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: gridTexture(extent, c), roughness: .45, metalness: .02 }));
    scene.add(water);
    rim = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9cdb4, roughness: .9 });
    for (const [w, d, x, z] of [[size + .8, .4, 0, extent + .2], [size + .8, .4, 0, -extent - .2], [.4, size, extent + .2, 0], [.4, size, -extent - .2, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, .35, d), mat); b.position.set(x, -.05, z); rim.add(b);
    }
    scene.add(rim);
  }
  function heightAt(x, y, list) {
    const w = .13 * cell; let h = 0;
    for (const r of list) {
      const u = Math.hypot(x - r.x, y - r.y) - r.r;
      if (u > 5 * w || u < -5 * w) continue;
      const a = .2 * cell / Math.sqrt(1 + .22 * r.r);
      const q0 = u / w, q1 = (u + 1.7 * w) / (1.2 * w), q2 = (u - 1.7 * w) / (1.2 * w);
      h += a * (Math.exp(-q0 * q0) - .32 * Math.exp(-q1 * q1) - .32 * Math.exp(-q2 * q2));
    }
    return h;
  }
  function updateSurface(list) {
    const pos = water.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), -pos.getZ(i), list));
    pos.needsUpdate = true; water.geometry.computeVertexNormals();
    // 波前線：沿著波峰畫一圈深色細線，對照 2D 圖
    rings.forEach(l => { scene.remove(l); l.geometry.dispose(); });
    rings = list.map((r, k) => {
      const pts = [], segs = [];
      for (let a = 0; a <= 128; a++) { const t = a / 128 * Math.PI * 2, x = r.x + r.r * Math.cos(t), y = r.y + r.r * Math.sin(t);
        pts.push(Math.abs(x) > currentExtent || Math.abs(y) > currentExtent ? null : new THREE.Vector3(x, heightAt(x, y, list) + .03, -y)); }
      for (let a = 0; a < 128; a++) if (pts[a] && pts[a + 1]) segs.push(pts[a], pts[a + 1]);
      const geo = new THREE.BufferGeometry().setFromPoints(segs);
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: k % 2 ? 0x0e5f73 : 0x0a4d5e, transparent: true, opacity: .8 }));
      scene.add(line); return line;
    });
  }
  function placeDuck(obj, x, y, list, facing, glow) {
    obj.position.set(x, heightAt(x, y, list), -y);
    obj.rotation.y = facing < 0 ? Math.PI : 0;
    const { bodyMat, halo, ring } = obj.userData;
    bodyMat.emissiveIntensity = glow * 1.4; halo.material.opacity = glow * .95; ring.material.opacity = glow * .9;
    const s = 1 + glow * .35; ring.scale.set(s, s, s);
  }
  function setView(name) {
    const aspect = camera.aspect || 1, k = aspect >= 1.25 ? .82 : aspect < .85 ? 1.25 : 1;   // 寬螢幕拉近、直式拉遠
    const e = (currentExtent || 6) * k;
    const at = { oblique: [0, e * 1.45, e * 2.05], top: [0, e * 2.75, .01], low: [0, e * .42, e * 2.35] }[name] || [0, e * 1.45, e * 2.05];
    lastView = name;
    camera.position.set(...at); controls.target.set(0, 0, 0); controls.update();
  }
  function resize() {
    const r = container.getBoundingClientRect(); if (!r.width || !r.height) return;
    const before = camera.aspect; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    if (currentExtent && Math.abs(before - camera.aspect) > .2) setView(lastView);
  }
  const ro = new ResizeObserver(resize); ro.observe(container);

  function frame() {
    if (!running) return;
    const s = lab.scene();
    if (Math.abs(s.extent - currentExtent) > 1e-6 || s.cell !== cell) { build(s.extent, s.cell); lastSig = ''; }
    const list = s.rings.filter(r => r.r > 1e-6);
    const sig = JSON.stringify(list.map(r => [r.x.toFixed(3), r.y.toFixed(3), r.r.toFixed(3)]));
    if (sig !== lastSig) { updateSurface(list); lastSig = sig; }
    // 波源小鴨
    if (s.source) {
      if (!source) { source = makeDuck(DUCK_COLORS.source, '波源'); scene.add(source); }
      source.visible = true; placeDuck(source, s.source.x, s.source.y, list, s.mach < 0 ? -1 : 1, 0);
    } else if (source) source.visible = false;
    // 觀察者小鴨（含新增的小鴨）
    const seen = new Set();
    for (const o of s.observers) {
      seen.add(o.label);
      let d = ducks.get(o.label);
      if (!d) { d = makeDuck(DUCK_COLORS[o.label] || 0x32a0ac, o.label); ducks.set(o.label, d); scene.add(d); }
      d.visible = s.showObservers; placeDuck(d, o.x, o.y, list, o.x >= (s.source?.x ?? 0) ? -1 : 1, o.glow);
    }
    for (const [k, d] of ducks) if (!seen.has(k)) d.visible = false;
    controls.update(); renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  return {
    show() { container.classList.add('is-3d'); renderer.domElement.style.display = 'block'; running = true; resize(); if (!currentExtent) { const s = lab.scene(); build(s.extent, s.cell); setView('oblique'); } cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
    hide() { container.classList.remove('is-3d'); renderer.domElement.style.display = 'none'; running = false; cancelAnimationFrame(raf); },
    setView,
    get visible() { return running; }
  };
}
