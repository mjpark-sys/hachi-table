/* 3D 장면: 솥곁살이 마을 언덕(영상 속 배경) + 몽글몽글 털 캐릭터.
 * 게임 로직(좌표 px, 서버 프로토콜)은 그대로이고, 여기서는 px * 0.01 = 3D 단위로만 그린다.
 * 하치 PNG 대체, 모델 교체 등은 makeFluffy() 한 곳을 고치면 된다.
 */
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const K = 0.01;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 1 }, o));
const DISH_COLOR = { egg: 0xffd54a, gim: 0x2d2a30, miyeok: 0x6b5a2a, kimchi: 0xd9442b, eggroll: 0xf2c14a, doenjang: 0x9a6b36, jjigae: 0xc8381f, fish: 0x9fb4c7, namul: 0x5f9a45, nurungji: 0xd8b46a };

/* ---------- 지형 높이 (놀이터는 평평, 바깥은 언덕, 서쪽에 강) ---------- */
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const riverX = z => -7 + Math.sin(z * 0.35) * 1.5;
function hf(x, z) {
  const dr = (a, b, c, d) => Math.hypot(Math.max(a - x, 0, x - b), Math.max(c - z, 0, z - d));
  const d = Math.min(dr(-0.5, 26.5, -1, 16.5), dr(5, 21, -14, 16.5));
  const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.5 * Math.sin(x * 0.47 + z * 0.31);
  let h = sm(d / 7) * (4.5 + 2 * n) + Math.max(0, d - 12) * 0.25;
  const c = sm(1 - Math.abs(x - riverX(z)) / 2.6);
  return h * (1 - c) - 0.9 * c;
}

export function createScene(cv, L, api) {
  const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap;
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xf3d3dc, 0.013);   // 멀리 갈수록 분홍빛으로 번진다
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 500);

  /* ---------- 하늘 · 빛 ---------- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {},
    vertexShader: 'varying vec3 p; void main(){ p=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; void main(){ float h=clamp(p.y,0.,1.); vec3 hor=vec3(1.,.85,.78), mid=vec3(.96,.78,.9), top=vec3(.72,.65,.9);'
      + ' vec3 c=mix(hor,mid,smoothstep(0.,.25,h)); c=mix(c,top,smoothstep(.25,.9,h)); gl_FragColor=vec4(c,1.); }'
  }));
  scene.add(sky);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const sunDir = new THREE.Vector3(-0.35, 0.5, -0.8).normalize();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c8, fog: false, depthWrite: false, transparent: true }));
  sun.position.copy(sunDir).multiplyScalar(280); sun.scale.setScalar(110); scene.add(sun);
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0f6, fog: false, depthWrite: false, transparent: true, opacity: 0.55 }));
    c.position.set(rnd(-250, 250), rnd(60, 110), -rnd(150, 260)); c.scale.set(rnd(90, 150), rnd(18, 30), 1); scene.add(c);
  }
  const mist = [];   // 땅 가까이 떠 있는 아주 옅은 안개 덩이. 놀이터 한가운데는 더 옅게
  for (let i = 0; i < 48; i++) {
    const x = rnd(-12, 38), z = rnd(-10, 26), d = clamp(Math.hypot((x - 13) / 11, (z - 9) / 7), 0, 1);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0f5, transparent: true, depthWrite: false, opacity: 0.09 + 0.2 * d }));
    sp.scale.set(rnd(12, 22), rnd(4, 7), 1); scene.add(sp); mist.push({ sp, x, z, y: 0.5 + rnd(0, 1.6) + d * 2, ph: rnd(0, 6.28), bo: sp.material.opacity });
  }
  scene.add(new THREE.HemisphereLight(0xd8c8ff, 0x86a860, 1.25));
  const sunL = new THREE.DirectionalLight(0xffdcc0, 2.0);
  sunL.castShadow = true; sunL.shadow.mapSize.set(1024, 1024); sunL.shadow.bias = -0.0006;
  Object.assign(sunL.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 140 });
  scene.add(sunL, sunL.target);

  /* ---------- 지형 (풀색 + 흙길 + 강둑) ---------- */
  const paths = [
    new THREE.CatmullRomCurve3([[13, 14.9], [7, 14.7], [2.6, 12.5], [2.0, 7], [3.4, 3.6], [8.5, 2.6], [11.6, 2.9]].map(([x, z]) => new THREE.Vector3(x, 0, z))),
    new THREE.CatmullRomCurve3([[13, 14.9], [19, 14.7], [23.4, 12.5], [24.0, 7], [22.6, 3.6], [17.5, 2.6], [14.4, 2.9]].map(([x, z]) => new THREE.Vector3(x, 0, z)))
  ].flatMap(c => c.getPoints(70));
  {
    const geo = new THREE.PlaneGeometry(110, 100, 220, 200); geo.rotateX(-Math.PI / 2); geo.translate(13, 0, 6);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = hf(x, z); pos.setY(i, h);
      const n = Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.5 + Math.sin(x * 0.37 + z * 0.51) * 0.5;
      c.setHSL((84 + n * 6) / 360, 0.55, 0.17 + n * 0.02 + 0.13 * sm(h / 3));
      if (h < 0.05 && x > -1 && x < 27 && z > 1 && z < 17) {                       // 길
        let md = 9; for (const p of paths) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < md) md = d; }
        const w = sm(1 - (Math.sqrt(md) - 0.45) / 0.5);
        if (w > 0) c.lerp(new THREE.Color().setHSL(0.095, 0.45, 0.36 + n * 0.02), w);
      }
      if (h < -0.15) c.lerp(new THREE.Color().setHSL(0.14, 0.3, 0.45), 0.7);          // 강바닥
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true })); ground.receiveShadow = true; scene.add(ground);
    // 물
    const wg = new THREE.PlaneGeometry(5.2, 130, 4, 130); wg.rotateX(-Math.PI / 2);
    const wp = wg.attributes.position; for (let i = 0; i < wp.count; i++) { const z = wp.getZ(i) + 10; wp.setZ(i, z); wp.setX(i, wp.getX(i) + riverX(z)); wp.setY(i, -0.25); }
    wg.computeVertexNormals();
    scene.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x7fd8c8, roughness: 0.12, transparent: true, opacity: 0.82 })));
  }
  // 잔디: 트레일러 엔딩의 이끼 팔레트(진한 뿌리 -> 연두 -> 노란 끝)로 촘촘하게, 바람에 살랑이게 + 데이지
  const windU = { value: 0 };
  const MB = new THREE.Color('#2f3d08'), MM = new THREE.Color('#7a9a12'), MT = new THREE.Color('#c9e04a');
  const bladeCol = (t, c) => (t < 0.5 ? c.copy(MB).lerp(MM, t * 2) : c.copy(MM).lerp(MT, (t - 0.5) * 2));
  function geoFrom(P, C) {
    const g = new THREE.BufferGeometry(), N = new Float32Array(P.length);
    for (let i = 1; i < N.length; i += 3) N[i] = 1;            // 법선은 위쪽: 잔디 결이 부드럽게 보인다
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  }
  function windMat(unlit) {
    const m = new (unlit ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial)({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = windU;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n float sw = position.y * position.y;\n transformed.x += sin(uTime * 1.7 + (instanceMatrix[3].x + instanceMatrix[3].z) * 0.8) * 0.3 * sw;\n transformed.z += cos(uTime * 1.3 + instanceMatrix[3].x * 0.6) * 0.2 * sw;');
    };
    return m;
  }
  function tuftGeo() {
    const P = [], C = [], c = new THREE.Color(), SEG = 3;
    for (let b = 0; b < 4; b++) {
      const ang = rnd(0, 6.28), ox = rnd(-0.07, 0.07), oz = rnd(-0.07, 0.07), h = rnd(0.65, 1), lean = rnd(0.1, 0.5), w = rnd(0.05, 0.075);
      const dx = Math.cos(ang), dz = Math.sin(ang), ring = [];
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG, cx = ox + dx * lean * t * t * h, cz = oz + dz * lean * t * t * h, hw = w * (1 - t * 0.92);
        ring.push([[cx + dz * hw, h * t, cz - dx * hw], [cx - dz * hw, h * t, cz + dx * hw], t]);
      }
      for (let i = 0; i < SEG; i++) {
        const [a0, a1, t0] = ring[i], [b0, b1, t1] = ring[i + 1];
        [[a0, t0], [a1, t0], [b0, t1], [a1, t0], [b1, t1], [b0, t1]].forEach(([p, t]) => { P.push(...p); bladeCol(t, c); C.push(c.r, c.g, c.b); });
      }
    }
    return geoFrom(P, C);
  }
  function daisyGeo() {
    const P = [], C = [], stem = new THREE.Color('#d0623e'), inner = new THREE.Color('#e9a6c9'), edge = new THREE.Color('#fbeaf3'), mid = new THREE.Color('#e8a23a');
    const tri = (a, b, c, ca, cb, cc) => { [[a, ca], [b, cb], [c, cc]].forEach(([p, col]) => { P.push(...p); C.push(col.r, col.g, col.b); }); };
    tri([-0.012, 0, 0], [0.012, 0, 0], [0, 1, 0], stem, stem, stem); tri([0, 0, -0.012], [0, 0, 0.012], [0, 1, 0], stem, stem, stem);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * 6.283, a0 = a - 0.3, a1 = a + 0.3, L1 = 0.26, y = 1.02;
      tri([0, y, 0], [Math.cos(a0) * L1 * 0.55, y + 0.05, Math.sin(a0) * L1 * 0.55], [Math.cos(a) * L1, y + 0.09, Math.sin(a) * L1], inner, inner, edge);
      tri([0, y, 0], [Math.cos(a) * L1, y + 0.09, Math.sin(a) * L1], [Math.cos(a1) * L1 * 0.55, y + 0.05, Math.sin(a1) * L1 * 0.55], inner, edge, inner);
    }
    for (let k = 0; k < 6; k++) { const a0 = k / 6 * 6.283, a1 = (k + 1) / 6 * 6.283; tri([0, 1.05, 0], [Math.cos(a0) * 0.05, 1.04, Math.sin(a0) * 0.05], [Math.cos(a1) * 0.05, 1.04, Math.sin(a1) * 0.05], mid, mid, mid); }
    return geoFrom(P, C);
  }
  {
    const NG = 24000, NF = 520;
    const gm = new THREE.InstancedMesh(tuftGeo(), windMat(), NG), fm = new THREE.InstancedMesh(daisyGeo(), windMat(true), NF);
    const o = new THREE.Object3D(), c = new THREE.Color();
    let gi = 0, fi = 0;
    while (gi < NG || fi < NF) {
      const x = rnd(-6, 32), z = rnd(-1, 22), h = hf(x, z);
      if (h < -0.1) continue;
      if (h < 0.05 && x > -1 && x < 27 && z > 1 && z < 17) { let md = 9; for (const p of paths) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < md) md = d; } if (md < 0.5) continue; }
      if (fi < NF && Math.random() < 0.05) {
        o.position.set(x, h, z); o.rotation.set(rnd(-0.15, 0.15), rnd(0, 6.28), rnd(-0.15, 0.15)); o.scale.setScalar(rnd(0.5, 0.8)); o.updateMatrix();
        fm.setMatrixAt(fi, o.matrix); fm.setColorAt(fi++, c.setScalar(rnd(0.9, 1.1)));
      } else if (gi < NG) {
        o.position.set(x, h - 0.01, z); o.rotation.set(0, rnd(0, 6.28), 0); o.scale.set(rnd(0.8, 1.2), rnd(0.16, 0.3), rnd(0.8, 1.2)); o.updateMatrix();
        gm.setMatrixAt(gi, o.matrix); gm.setColorAt(gi++, c.setScalar(rnd(0.8, 1.15)));
      }
    }
    scene.add(gm, fm);
  }

  /* ---------- 돔집 · 솥 언덕집 ---------- */
  const cream = mat(0xf3e6cc), tanM = mat(0xd89c5e), woodM = mat(0x8a5a38), navyM = mat(0x2b4a66), darkM = mat(0x3a3036);
  const chimneys = [];
  function dome(x, z, s) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 0.7, 28), cream); base.position.y = 0.35;
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.02, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), tanM); top.position.y = 0.7; top.scale.y = 0.85;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.55), woodM); door.position.set(0, 0.275, 1.045);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16, 0, Math.PI), woodM); arch.position.set(0, 0.55, 1.045);
    const ring = new THREE.Group(), tor = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 20), woodM), disc = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), navyM);
    ring.add(tor, disc); ring.position.set(0.55, 0.72, 0.8); ring.rotation.y = Math.atan2(0.55, 0.8);
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 10), darkM); ch.position.set(-0.4, 1.5, -0.2);
    g.add(base, top, door, arch, ring, ch);
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.position.set(x, hf(x, z) - 0.03, z); g.scale.setScalar(s); g.rotation.y = Math.atan2(13 - x, 8 - z);
    scene.add(g); chimneys.push(new THREE.Vector3(x - 0.4 * s * Math.cos(g.rotation.y), g.position.y + 1.8 * s, z + 0.4 * s * Math.sin(g.rotation.y)));
  }
  [[-1.6, 6, 1], [-1.2, 12.5, 1.1], [27.4, 5.5, 1], [27.8, 13, 1.1], [-3, 2.6, 1.2], [30, 1, 1.3], [-4, -3, 1.3], [32, 9, 1.2], [29, 18, 1.1], [-3, 18.5, 1.1], [3, -7, 1.4], [25, -7, 1.4], [-9, 8, 1.2], [36, 14, 1.2], [34, -2, 1.5]].forEach(([x, z, s]) => dome(x, z, s));
  const potG = new THREE.Group();
  [[6.0, 5.6, 0x5a8444, 0], [5.6, 5.1, 0x62904b, 1.2], [5.1, 4.6, 0x6a9a52, 2.4]].forEach(([rt, rb, c, y]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 1.2, 48), mat(c)); m.position.y = y + 0.6; m.castShadow = m.receiveShadow = true; potG.add(m);
  });
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.3, 48), mat(0x25252a, { roughness: 0.6 })); lid.position.y = 3.75; potG.add(lid);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.32, 12, 48), mat(0x2d2d32, { roughness: 0.5 })); rim.rotation.x = Math.PI / 2; rim.position.y = 3.75; potG.add(rim);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i - 2) * 0.5, w = new THREE.Group();
    w.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 20), woodM), new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), navyM));
    w.position.set(Math.cos(a) * 5.5, 1.9, Math.sin(a) * 5.5); w.rotation.y = Math.PI / 2 - a; potG.add(w);
  }
  { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), woodM), a = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16, 0, Math.PI), woodM); d.position.set(0, 0.55, 5.72); a.position.set(0, 1.1, 5.72); potG.add(d, a); }
  potG.position.set(13, 0, -6); scene.add(potG);

  /* ---------- 조리대 · 쿠첸 밥솥 · 하치 ---------- */
  const COOK = new THREE.Vector3(14.1, 0.95, 2.0);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.95, 0.8), mat(0xc99565)); counter.position.set(12.8, 0.475, 2.1); counter.castShadow = counter.receiveShadow = true; scene.add(counter);
  // 쿠첸 밥솥 (실제 제품 사진을 단순화): 브론즈 몸통 + 검은 뚜껑(안쪽 스텐 판·주황 추) + 티타늄 내솥 + 앞면 표시창
  const cooker = new THREE.Group(); cooker.position.copy(COOK); cooker.scale.set(1.6, 1.84, 1.6);
  const panelC = document.createElement('canvas'); panelC.width = 256; panelC.height = 400;
  const panelT = new THREE.CanvasTexture(panelC); panelT.colorSpace = THREE.SRGBColorSpace; let panelKey = '';
  function drawPanel(mode, digits) {   // mode 0: 보온 켜짐, 1: 취사 켜짐
    const g = panelC.getContext('2d'); g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, 256, 400); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 22px sans-serif'; ['메뉴', '보온', '취사'].forEach((t, i) => { g.fillStyle = (i === 1 && mode === 0) || (i === 2 && mode === 1) ? '#9dffc8' : '#bbb'; g.fillText(t, 52 + i * 76, 34); });
    g.fillStyle = '#f2f2f2'; g.font = `700 ${digits.length > 3 ? 88 : 118}px monospace`; g.fillText(digits, 128, 130);
    g.fillStyle = '#c8c8c8'; g.font = '600 24px sans-serif';
    [['고압   쾌속   무압', 232], ['찰진백미  고슬백미', 268], ['혼합잡곡   솥   밥', 304], ['건강콩밥   수 비 드', 340], ['현미100   만 능 찜', 376]].forEach(([t, y]) => g.fillText(t, 128, y));
    panelT.needsUpdate = true;
  }
  drawPanel(0, '188');
  const lidPivot = new THREE.Group(), potRice = new THREE.Mesh(new THREE.SphereGeometry(0.38, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff, { roughness: 0.9 }));
  {
    const bronze = mat(0x4d4338, { roughness: 0.42, metalness: 0.35 }), blackM = mat(0x17171a, { roughness: 0.35 }), steel = mat(0xd9d9dc, { roughness: 0.3, metalness: 0.4 });
    const lathe = (pts, m, side) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 48), side ? new THREE.MeshStandardMaterial({ color: 0x9a948e, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }) : m);
    const flat = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; return o; };
    cooker.add(lathe([[0, 0.08], [0.5, 0.08], [0.52, 0.14], [0.535, 0.32], [0.52, 0.52], [0.47, 0.57], [0.42, 0.57]], bronze));
    cooker.add(flat(new THREE.CylinderGeometry(0.52, 0.5, 0.1, 48), blackM, 0, 0.04, 0), flat(new THREE.TorusGeometry(0.44, 0.022, 8, 48), blackM, 0, 0.575, 0, Math.PI / 2));
    cooker.add(flat(new THREE.PlaneGeometry(0.27, 0.4), new THREE.MeshBasicMaterial({ map: panelT }), 0, 0.34, 0.539));
    const bc = document.createElement('canvas'); bc.width = 512; bc.height = 64; { const g = bc.getContext('2d'); g.fillStyle = '#4a4036'; g.fillRect(0, 0, 512, 64); g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; ['모드', '예약', '< MENU >', '시작', '취소'].forEach((t, i) => g.fillText(t, 50 + i * 103, 32)); }
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace; cooker.add(flat(new THREE.PlaneGeometry(0.5, 0.062), new THREE.MeshBasicMaterial({ map: bt }), 0, 0.14, 0.533));
    // 내솥(티타늄 회색, 양옆 검은 손잡이). 뚜껑을 열면 보이고 밥이 담겨 있다
    const pot = new THREE.Group(); pot.position.y = 0.27;
    pot.add(lathe([[0, 0], [0.37, 0], [0.41, 0.05], [0.43, 0.34], [0.425, 0.365], [0.405, 0.36], [0.385, 0.06], [0, 0.03]], null, true));
    pot.add(flat(new THREE.TorusGeometry(0.416, 0.014, 8, 48), steel, 0, 0.365, 0, Math.PI / 2));
    [-1, 1].forEach(sx => pot.add(flat(new THREE.BoxGeometry(0.1, 0.05, 0.13), blackM, sx * 0.475, 0.34, 0)));
    potRice.scale.y = 0.32; potRice.position.y = 0.26; pot.add(potRice); cooker.add(pot);
    // 뚜껑: 뒤쪽 경첩으로 열리고, 안쪽에 스텐 판·링·주황 추·증기구
    lidPivot.position.set(0, 0.575, -0.47); const lid = new THREE.Group(); lid.position.z = 0.47; lidPivot.add(lid);
    lid.add(flat(new THREE.CylinderGeometry(0.5, 0.52, 0.11, 48), blackM, 0, 0.04, 0), flat(new THREE.TorusGeometry(0.5, 0.015, 8, 48), bronze, 0, 0.095, 0, Math.PI / 2), flat(new THREE.BoxGeometry(0.16, 0.05, 0.05), mat(0x2a2a2d), 0, 0.06, 0.5));
    const under = new THREE.Group(); under.position.y = -0.02;
    under.add(flat(new THREE.CircleGeometry(0.34, 40), steel, 0, 0, 0, Math.PI / 2), flat(new THREE.TorusGeometry(0.4, 0.03, 10, 48), steel, 0, 0, 0, Math.PI / 2), flat(new THREE.RingGeometry(0.34, 0.43, 40), mat(0x222226), 0, 0.001, 0, Math.PI / 2));
    under.add(flat(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 20), mat(0xe8761a, { roughness: 0.45 }), 0, -0.02, 0), flat(new THREE.BoxGeometry(0.2, 0.02, 0.06), mat(0x2a2a2d), 0, 0, 0.46));
    [-1, 0, 1].forEach(i => under.add(flat(new THREE.BoxGeometry(0.07, 0.005, 0.015), mat(0x555559), i * 0.1, -0.003, 0.26)));
    lid.add(under); cooker.add(lidPivot);
  }
  cooker.traverse(m => { if (m.isMesh) m.castShadow = true; });
  scene.add(cooker);

  /* ---------- 몽글몽글 털 캐릭터 (레퍼런스: 달걀형 몸 · 머리 위 뾰족 털 · 세로결 털 · 큰 눈 · 나선 뿔) ---------- */
  const noiseTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), d = g.createImageData(128, 128);
    // 셸마다 같은 점무늬가 겹치지 않도록 길쭉한 섬유형 알파 패턴을 만든다.
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const i = y * 128 + x, strand = Math.sin(x * 2.17 + y * 0.11) * 0.5 + 0.5, v = Math.pow(strand, 5) * (0.55 + Math.random() * 0.45) * 255;
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(34, 3.5); return t; })();
  const furCardTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'), d = g.createImageData(c.width, c.height);
    const hairs = [[-0.36, 0.82], [-0.19, 0.94], [0, 1], [0.2, 0.9], [0.37, 0.78]];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4, u = x / (c.width - 1) - 0.5, v = y / (c.height - 1); let a = 0;
      for (const [center, len] of hairs) { if (v >= len) continue; const t = v / len, width = 0.075 * Math.pow(1 - t, 0.42) + 0.012;
        a = Math.max(a, Math.pow(Math.max(0, 1 - Math.abs(u - center) / width), 1.55) * Math.min(1, t * 11) * Math.pow(1 - t, 0.38)); }
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = Math.round(Math.min(1, a) * 255); }
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const egg = (() => { const g = new THREE.SphereGeometry(0.5, 44, 32), p = g.attributes.position;       // 머리와 몸이 끊기지 않는 둥근 털뭉치
    for (let i = 0; i < p.count; i++) { const u = p.getY(i) + 0.5, k = 1.18 - 0.22 * u * u; p.setXYZ(i, p.getX(i) * k, p.getY(i) * 1.28, p.getZ(i) * k); }
    g.computeVertexNormals(); return g; })();
  const frontZ = y => { const ys = y / 1.28, u = ys + 0.5, k = 1.18 - 0.22 * u * u; return Math.sqrt(Math.max(0.25 - ys * ys, 0)) * k; };   // 높이 y 에서 얼굴 표면의 z
  const small = new THREE.SphereGeometry(1, 12, 10), tuftG = new THREE.ConeGeometry(0.12, 0.3, 12);
  const hornG = (() => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.075 * (1 - t) * (1 + 0.16 * Math.sin(t * 26)) + 0.004, t * 0.3)); } return new THREE.LatheGeometry(pts, 10); })();
  // 얇은 반투명 Hair Card. 원뿔 털보다 실루엣이 부드럽고 같은 밀도에서 삼각형 수도 적다.
  const strandG = new THREE.PlaneGeometry(0.04, 0.05, 1, 1); strandG.translate(0, 0.025, 0);
  const black = new THREE.MeshPhysicalMaterial({ color: 0x140c1d, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 });
  const irisM = new THREE.MeshPhysicalMaterial({ color: 0x39204f, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfffbf7, roughness: 0.18 }), pinkM = new THREE.MeshBasicMaterial({ color: 0xf46f9d, transparent: true, opacity: 0.5, depthWrite: false });
  const redM = new THREE.MeshStandardMaterial({ color: 0x6c1736, roughness: 0.35 }), tongueM = new THREE.MeshStandardMaterial({ color: 0xf28aa5, roughness: 0.55 }), skinM = new THREE.MeshStandardMaterial({ color: 0xfff3e9, roughness: 0.7 });
  const furCache = new Map(), tint = (c, t, to) => c.clone().lerp(new THREE.Color(to), t);
  const furMats = hex => {
    if (!furCache.has(hex)) { const c = new THREE.Color(hex); furCache.set(hex, { base: mat(tint(c, 0.1, 0x000000)), claw: mat(0xf0b886, { roughness: 0.7 }),
      strand: new THREE.MeshStandardMaterial({ color: tint(c, 0.12, 0xffffff), map: furCardTex, alphaMap: furCardTex, transparent: true, opacity: 0.72, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, roughness: 0.95 }),
      shells: [1, 2, 3, 4].map(i => new THREE.MeshLambertMaterial({ color: tint(c, 0.045 * i, 0xffffff), alphaMap: noiseTex, alphaTest: 0.32 + i * 0.1, side: THREE.DoubleSide })) }); }
    return furCache.get(hex);
  };
  function addFurClumps(parent, material, density, seed = 1) {
    const pos = egg.attributes.position, nor = egg.attributes.normal, fur = new THREE.InstancedMesh(strandG, material, density), up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion(), spin = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4(); let placed = 0;
    for (let tries = 0; placed < density && tries < density * 5; tries++) {
      const i = (tries * 97 + seed * 53) % pos.count; p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i).normalize();
      // 눈·입 바로 앞은 비우고 가장자리와 머리 위에는 털을 남겨 얼굴이 털에 파묻힌 듯 보이게 한다.
      if (p.z > 0.39 && p.y > -0.25 && p.y < 0.34 && Math.abs(p.x) < 0.39) continue;
      const jitter = 0.72 + (((i * 31 + seed * 17) % 100) / 100) * 0.56;
      q.setFromUnitVectors(up, n); spin.setFromAxisAngle(n, ((i * 43 + seed * 19) % 360) * Math.PI / 180); q.premultiply(spin);
      s.set(jitter, jitter * (0.92 + Math.max(0, p.y) * 0.28), jitter); p.addScaledVector(n, 0.012); m.compose(p, q, s); fur.setMatrixAt(placed++, m);
    }
    fur.count = placed; fur.instanceMatrix.needsUpdate = true; fur.frustumCulled = false; parent.add(fur); return fur;
  }
  function addSmallHorn(parent, sx, material) {
    const hg = new THREE.Group(), h = new THREE.Mesh(hornG, material); hg.add(h);
    for (let i = 1; i <= 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.066 - i * 0.012, 0.008, 5, 14), material); ring.rotation.x = Math.PI / 2; ring.position.y = i * 0.065; hg.add(ring); }
    hg.position.set(sx * 0.24, 0.47, 0.035); hg.rotation.z = -sx * 0.42; parent.add(hg);
  }
  // opt: color, horns:'none'|'small'|'long', hornColor, bows, happy, lashes, furDetail:'medium'|'high'
  function makeFluffy({ color, horns = 'small', hornColor = 0xe8a672, bows = false, happy = true, lashes = false, furDetail = 'medium', furSeed = 1 }) {
    const g = new THREE.Group(), b = new THREE.Group(); b.position.y = 0.63; g.add(b);
    const f = furMats(color.getHex());
    const core = new THREE.Mesh(egg, f.base); core.castShadow = true; b.add(core);
    const shells = f.shells.map((m, i) => { const sh = new THREE.Mesh(egg, m); sh.scale.setScalar(1 + 0.023 * (i + 1)); b.add(sh); return sh; });
    const highFur = furDetail === 'high' ? addFurClumps(b, f.strand, 2600, furSeed) : null;
    const tuft = new THREE.Mesh(tuftG, f.base); tuft.position.set(0, 0.64, -0.02); tuft.rotation.z = 0.12; b.add(tuft);              // 머리 위 뾰족한 털
    const tf = new THREE.Mesh(tuftG, f.shells[1]); tf.position.copy(tuft.position); tf.rotation.copy(tuft.rotation); tf.scale.setScalar(1.15); b.add(tf);
    // 얼굴
    const eyeY = 0.15, ez = frontZ(eyeY) + 0.006;
    const eyes = [-1, 1].map(sx => {
      const e = new THREE.Group(), sclera = new THREE.Mesh(small, white); sclera.scale.set(0.145, 0.155, 0.055); e.add(sclera);
      const iris = new THREE.Mesh(small, irisM); iris.scale.set(0.105, 0.12, 0.052); iris.position.z = 0.045; e.add(iris);
      const p = new THREE.Mesh(small, black); p.scale.set(0.072, 0.088, 0.045); p.position.z = 0.085; e.add(p);
      const h1 = new THREE.Mesh(small, white); h1.scale.setScalar(0.034); h1.position.set(0.038, 0.046, 0.126); e.add(h1);
      const h2 = new THREE.Mesh(small, white); h2.scale.setScalar(0.014); h2.position.set(-0.032, -0.04, 0.126); e.add(h2);
      if (lashes) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.009, 4, 16, Math.PI * 0.7), black); l.position.set(0, 0.045, 0.025); l.rotation.z = sx * -0.15; e.add(l); }
      e.position.set(sx * 0.19, eyeY, ez); e.rotation.y = sx * 0.22; b.add(e); return e; });
    [-1, 1].forEach(sx => { const c = new THREE.Mesh(small, pinkM); c.scale.set(0.09, 0.055, 0.018); c.position.set(sx * 0.31, -0.015, frontZ(-0.015) - 0.012); c.rotation.y = sx * 0.72; b.add(c); });
    [-1, 1].forEach(sx => { const n = new THREE.Mesh(small, black); n.scale.setScalar(0.012); n.position.set(sx * 0.024, 0.015, frontZ(0.015) + 0.025); b.add(n); });
    const mouth = new THREE.Group(), mz = frontZ(-0.03) + 0.004;
    if (happy) { const m = new THREE.Mesh(small, redM); m.scale.set(0.082, 0.047, 0.024); mouth.add(m); const tongue = new THREE.Mesh(small, tongueM); tongue.scale.set(0.035, 0.016, 0.012); tongue.position.set(0, -0.025, 0.024); mouth.add(tongue); [-1, 1].forEach(sx => { const t = new THREE.Mesh(small, white); t.scale.set(0.016, 0.019, 0.012); t.position.set(sx * 0.028, 0.032, 0.018); mouth.add(t); }); }
    else { const m = new THREE.Mesh(small, black); m.scale.set(0.026, 0.006, 0.01); mouth.add(m); }
    mouth.position.set(0, -0.065, mz); b.add(mouth);
    const open = new THREE.Mesh(small, redM); open.scale.set(0.05, 0.055, 0.02); open.position.set(0, -0.04, mz); open.visible = false; b.add(open);
    // 팔(가슴 앞에 모은 손, 발톱 3개) · 발(발가락 3개)
    const arms = [];
    [-1, 1].forEach(sx => {
      const ag = new THREE.Group(), a = new THREE.Mesh(small, f.base); a.scale.set(0.14, 0.17, 0.14); ag.add(a); ag.position.set(sx * 0.36, -0.13, 0.43); ag.rotation.z = sx * 0.52; b.add(ag); arms.push(ag);
      for (let i = -1; i <= 1; i++) { const c = new THREE.Mesh(small, f.claw); c.scale.setScalar(0.025); c.position.set(sx * 0.31 + i * 0.035, -0.025, 0.55); b.add(c); }
      const ft = new THREE.Mesh(small, f.claw); ft.scale.set(0.14, 0.07, 0.18); ft.position.set(sx * 0.2, -0.615, 0.12); b.add(ft);
      for (let i = -1; i <= 1; i++) { const t = new THREE.Mesh(small, f.claw); t.scale.setScalar(0.04); t.position.set(sx * 0.2 + i * 0.07, -0.61, 0.29); b.add(t); }
    });
    // 뿔
    const hm = mat(hornColor, { roughness: 0.55 });
    if (horns === 'small') [-1, 1].forEach(sx => addSmallHorn(b, sx, hm));
    if (horns === 'long') [-1, 1].forEach(sx => { for (let i = 0; i < 11; i++) { const t = i / 10, s2 = new THREE.Mesh(small, hm);
      s2.scale.setScalar(0.05 * (1 - t) + 0.01); s2.position.set(sx * (0.2 + 0.2 * Math.sin(t * 2.1)), 0.46 + 0.5 * t, 0.02 - 0.05 * t); b.add(s2); } });
    if (bows) [-1, 1].forEach(sx => { const bw = new THREE.Group(), m = mat(0xf27fa5, { roughness: 0.5 });
      [-1, 1].forEach(s2 => { const w = new THREE.Mesh(tuftG, m); w.scale.set(0.5, 0.45, 0.5); w.position.x = s2 * 0.05; w.rotation.z = -s2 * Math.PI / 2; bw.add(w); });
      const kn = new THREE.Mesh(small, m); kn.scale.setScalar(0.035); bw.add(kn); bw.position.set(sx * 0.27, 0.5, 0.12); b.add(bw); });
    return { g, b, eyes, mouth, open, arms, shells, highFur };
  }
  const plushFiberTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); x.fillStyle = '#f4f0eb'; x.fillRect(0, 0, 256, 256);
    // 고양이 게임 모델처럼 실제 털 지오메트리 대신, 짧고 부드러운 털결을 색 텍스처에 굽는다.
    let seed = 4187; const rand = () => ((seed = seed * 1664525 + 1013904223 >>> 0) / 4294967296);
    for (let i = 0; i < 2600; i++) {
      const px = rand() * 256, py = rand() * 256, len = 3 + rand() * 11, bend = (rand() - 0.5) * 2.8;
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + bend, py + len * 0.45, px + bend * 0.45, py + len);
      const light = rand() > 0.42; x.strokeStyle = light ? `rgba(255,255,255,${0.05 + rand() * 0.16})` : `rgba(72,58,50,${0.025 + rand() * 0.085})`;
      x.lineWidth = 0.35 + rand() * 0.8; x.lineCap = 'round'; x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.4, 1.35); t.anisotropy = 4; return t;
  })();
  const GLB_VARIANTS = [
    { grain: '쌀', key: 'Rice', node: 'Variant_Rice', body: 0xf7f0df },
    { grain: '귀리', key: 'Oat', node: 'Variant_Oat', body: 0xd9bb7e },
    { grain: '서리태', key: 'BlackBean', node: 'Variant_BlackBean', body: 0x403a4e }
  ];
  const heroTemplates = new Map();
  const variantSlot = value => Math.abs(Math.trunc(Number.isFinite(Number(value)) ? Number(value) : 0)) % GLB_VARIANTS.length;
  function makeGlbFluffy(variantIndex = 0) {
    const variant = GLB_VARIANTS[variantSlot(variantIndex)];
    const template = heroTemplates.get(variant.node); if (!template) return null;
    const g = new THREE.Group(), b = template.clone(true); g.add(b);
    const eyes = [`Eye_L_${variant.key}`, `Eye_R_${variant.key}`].map(name => b.getObjectByName(name)).filter(Boolean);
    const mouth = b.getObjectByName(`Mouth_${variant.key}`); if (!mouth) return null;
    const open = mouth.clone(true); open.name = 'Mouth_Open'; open.scale.set(1.08, 1.3, 1.08); open.visible = false; b.add(open);
    const arms = [`Arm_L_${variant.key}`, `Arm_R_${variant.key}`].map(name => b.getObjectByName(name)).filter(Boolean);
    const highFur = b.getObjectByName('Fur_Strands_LOD0'); if (highFur) highFur.visible = false;
    b.traverse(o => { if (o.isMesh || o.isInstancedMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.material?.name?.startsWith('Body_') || o.material?.name?.startsWith('Band_')) {
        o.material = o.material.clone(); o.material.map = plushFiberTex; o.material.bumpMap = plushFiberTex;
        o.material.emissive.copy(o.material.color); o.material.emissiveIntensity = 0.05;
        o.material.bumpScale = 0.012; o.material.roughness = 0.96; o.material.needsUpdate = true;
      }
    } });
    return { g, b, eyes, mouth, open, arms, shells: [], highFur, source: 'hachi.glb', variantIndex, grain: variant.grain };
  }
  let hachi = makeFluffy({ color: new THREE.Color(0xf6efe2), horns: 'none', bows: false, lashes: false, furDetail: 'medium', furSeed: 91 });
  hachi.g.position.set(11.7, 0, 1.35); hachi.g.scale.setScalar(1.5); scene.add(hachi.g);

  /* ---------- 식탁 · 의자 · 그릇 ---------- */
  const tops = [], bowls = [], slots = [];
  const stoolG = new THREE.CylinderGeometry(0.3, 0.26, 0.3, 16), stoolM = mat(0xb98557);
  L.tables.forEach((tb, ti) => {
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 48), mat(0xb98650, { emissive: 0x2a1c10 })); wood.scale.set(L.TABLE_RX * K + 0.06, 1, L.TABLE_RY * K + 0.06); wood.position.set(tb.x * K, 0.68, tb.y * K);
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.04, 48), mat(0xfff3d6, { emissive: 0x4a3a28 })); cloth.scale.set(L.TABLE_RX * K, 1, L.TABLE_RY * K); cloth.position.set(tb.x * K, 0.74, tb.y * K);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.62, 12), mat(0x9a6c3c)); leg.position.set(tb.x * K, 0.31, tb.y * K);
    [wood, cloth, leg].forEach(m => { m.castShadow = m.receiveShadow = true; scene.add(m); }); tops.push(cloth, wood);
    for (let s = 0; s < L.SEATS; s++) {
      const sp = L.seatPos(ti, s), bp = L.bowlPos(ti, s);
      const st = new THREE.Mesh(stoolG, stoolM); st.position.set(sp.x * K, 0.15, sp.y * K); st.castShadow = st.receiveShadow = true; scene.add(st);
      const bg = new THREE.Group(); bg.position.set(bp.x * K, 0.76, bp.y * K); bg.visible = false;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.13, 24), mat(0xf7efe2, { roughness: 0.4 })); bowl.position.y = 0.065; bowl.userData.bowl = { t: ti, s };
      const rice = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff, { roughness: 0.8 })); rice.position.y = 0.12;
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), mat(0xf7efe2)); dish.position.set(0.32, 0.015, 0);
      const food = new THREE.Mesh(small, mat(0xffffff)); food.scale.set(0.07, 0.04, 0.07); food.position.set(0.32, 0.05, 0);
      const dish2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), mat(0xf7efe2)); dish2.position.set(0.3, 0.015, 0.24); dish2.visible = false;
      const food2 = new THREE.Mesh(small, mat(0xffffff)); food2.scale.set(0.06, 0.035, 0.06); food2.position.set(0.3, 0.048, 0.24); food2.visible = false;   // 친구가 나눠준 반찬
      bg.add(bowl, rice, dish, food, dish2, food2); bg.traverse(m => { if (m.isMesh) m.castShadow = true; }); scene.add(bg); bowls.push(bowl);
      slots.push({ t: ti, s, bg, rice, food, dish2, food2 });
    }
  });
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })); hoverRing.position.y = 0.04; hoverRing.visible = false; scene.add(hoverRing);
  const target = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })); target.position.y = 0.04; target.visible = false; scene.add(target);

  /* ---------- 사람들 (이름표 · 말풍선은 DOM) ---------- */
  const PALETTE = GLB_VARIANTS.map(v => v.body);
  const labels = document.getElementById('labels'), ents = new Map(), v = new THREE.Vector3();
  function replaceWithHeroGlb(e, look) {
    const fresh = makeGlbFluffy(look); if (!fresh || e.fl.source === 'hachi.glb') return;
    fresh.g.position.copy(e.fl.g.position); fresh.g.quaternion.copy(e.fl.g.quaternion); fresh.g.scale.copy(e.fl.g.scale);
    scene.remove(e.fl.g); scene.add(fresh.g); e.fl = fresh;
  }
  new GLTFLoader().load('./assets/characters/hachi.glb', gltf => {
    for (const variant of GLB_VARIANTS) { const node = gltf.scene.getObjectByName(variant.node); if (node) heroTemplates.set(variant.node, node); }
    if (!heroTemplates.size) { console.warn('hachi.glb: grain variant nodes missing; using procedural fallback.'); return; }
    const guide = makeGlbFluffy(0);
    if (guide) {
      guide.g.position.copy(hachi.g.position); guide.g.quaternion.copy(hachi.g.quaternion); guide.g.scale.copy(hachi.g.scale);
      scene.remove(hachi.g); scene.add(guide.g); hachi = guide;
    }
    for (const p of api.everyone()) { const e = ents.get(p.id); if (e) replaceWithHeroGlb(e, Math.floor(p.look == null ? 30 : p.look)); }
  }, undefined, error => console.warn('hachi.glb load failed; using procedural fallback.', error));
  function makeEnt(p) {
    const lk = Math.floor(p.look == null ? 30 : p.look), slot = variantSlot(lk), isMe = p === api.me;
    const baseScale = isMe ? 1.22 : 0.94 + (lk % 5) * 0.035;
    const fl = makeGlbFluffy(slot) || makeFluffy({ color: new THREE.Color(PALETTE[slot]), horns: 'none', happy: true, lashes: false, furDetail: isMe ? 'high' : 'medium', furSeed: lk + 7 });
    fl.g.scale.setScalar(baseScale);
    scene.add(fl.g);
    const el = document.createElement('div'); el.className = 'lab' + (isMe ? ' me' : ''); el.innerHTML = '<div class="bub"></div><div class="nm"></div>'; labels.appendChild(el);
    return { fl, el, bub: el.firstChild, nm: el.lastChild, yaw: 0, hop: 0, bt: '', nt: '', baseScale };
  }
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- 증기 ---------- */
  const parts = [], pool = [];
  function puff(x, y, z, n, size) {
    for (let i = 0; i < n && parts.length < 260; i++) {
      const sp = pool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 }));
      sp.position.set(x + rnd(-0.12, 0.12) * size, y, z + rnd(-0.12, 0.12) * size); scene.add(sp);
      parts.push({ sp, vx: rnd(-0.12, 0.12), vy: rnd(0.35, 0.8) * (0.6 + size * 0.3), vz: rnd(-0.12, 0.12), r: rnd(0.12, 0.26) * size, life: 0, max: rnd(1.6, 2.8) });
    }
  }
  const cookerPuff = (n, size) => puff(COOK.x + rnd(-0.2, 0.2), 2.1, COOK.z, n, size);

  /* ---------- 카메라 (드래그로 회전, 휠로 확대) ---------- */
  const view = { yaw: 0, pitch: 0.5, dist: 9, tx: 13, tz: 14.6 };
  const rotate = (dx, dy) => { view.yaw -= dx * 0.006; view.pitch = clamp(view.pitch + dy * 0.004, 0.12, 1.2); };
  const zoom = d => { view.dist = clamp(view.dist + d * 0.01, 4, 14); };
  const snap = () => { view.tx = api.me.x * K; view.tz = api.me.y * K; };
  function resize() { R.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }

  /* ---------- 클릭 해석 ---------- */
  const ray = new THREE.Raycaster();
  function pick(cx, cy) {
    const r = cv.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    ray.setFromCamera(new THREE.Vector2(px / r.width * 2 - 1, -(py / r.height) * 2 + 1), cam);
    let best = null, bd = 40;
    for (const p of api.S.players.values()) {
      const e = ents.get(p.id); if (!e) continue;
      v.set(p.x * K, e.fl.g.position.y + 0.6, p.y * K).project(cam); if (v.z > 1) continue;
      const d = Math.hypot((v.x * 0.5 + 0.5) * r.width - px, (-v.y * 0.5 + 0.5) * r.height - py); if (d < bd) { bd = d; best = p; }
    }
    if (best) return { kind: 'person', p: best };
    const hit = ray.intersectObjects(tops.concat(bowls.filter(m => m.parent.visible)), false)[0];
    if (hit) return hit.object.userData.bowl ? { kind: 'bowl', ...hit.object.userData.bowl } : { kind: 'table' };
    const o = ray.ray.origin, d = ray.ray.direction, t = -o.y / d.y;
    if (!(t > 0)) return { kind: 'none' };
    const x = (o.x + d.x * t) / K, y = (o.z + d.z * t) / K;
    for (let ti = 0; ti < L.tables.length; ti++) for (let s = 0; s < L.SEATS; s++) { const sp = L.seatPos(ti, s); if (Math.hypot(x - sp.x, y - sp.y) < 60) return { kind: 'seat', t: ti, s }; }
    return { kind: 'ground', x, y };
  }

  /* ---------- 매 프레임 ---------- */
  let steamAcc = 0;
  function render(t, dt) {
    const { me, S } = api, all = api.everyone(), tms = t; windU.value = t / 1000;
    for (const m of mist) m.sp.position.set(m.x + Math.sin(t / 9000 + m.ph) * 1.6, m.y, m.z + Math.cos(t / 11000 + m.ph) * 1.2);
    // 사람 추가/제거
    const alive = new Set(all.map(p => p.id));
    for (const [id, e] of ents) if (!alive.has(id)) { scene.remove(e.fl.g); e.el.remove(); ents.delete(id); }
    const active = new Set(all.filter(p => p.b && tms < p.b.until && !S.muted.has(p.id)).sort((a, b) => b.b.start - a.b.start).slice(0, 3));
    const W = innerWidth, H = innerHeight;
    for (const p of all) {
      let e = ents.get(p.id); if (!e) { e = makeEnt(p); ents.set(p.id, e); }
      const g = e.fl.g, seated = p.table >= 0, moving = !seated && Math.hypot(p.tx - p.x, p.ty - p.y) > 2;
      let want = e.yaw;
      if (seated) want = Math.atan2(L.tables[p.table].x - p.x, L.tables[p.table].y - p.y); else if (moving) want = Math.atan2(p.tx - p.x, p.ty - p.y);
      e.yaw += wrap(want - e.yaw) * Math.min(1, dt * 10);
      e.hop = moving ? -Math.abs(Math.sin(tms / 110)) * -0.09 : 0;
      const sq = p.bumpT ? Math.max(0, 1 - (tms - p.bumpT) / 220) : 0;
      g.position.set(p.x * K, (seated ? 0.3 : 0) + e.hop + Math.sin(tms / 900 + (p.id || 0)) * 0.008, p.y * K);
      g.rotation.y = e.yaw; g.scale.set(e.baseScale * (1 + sq * 0.06), e.baseScale * (1 - sq * 0.08), e.baseScale * (1 + sq * 0.06));
      if (e.fl.highFur) e.fl.highFur.visible = cam.position.distanceTo(g.position) < 14;
      const blink = ((tms + (p.id || 0) * 777) % 4500) < 120 || (p.phase === 'cooking' && p !== me);
      e.fl.eyes.forEach(ey => { ey.scale.y = e.fl.source === 'hachi.glb' ? 1 : (blink ? 0.28 : 1); });
      e.fl.open.visible = sq > 0.01; e.fl.mouth.visible = !e.fl.open.visible;
      // 이름표 / 말풍선
      v.set(p.x * K, g.position.y + 1.5 * g.scale.y, p.y * K).project(cam);
      const show = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      e.el.style.display = show ? '' : 'none';
      if (show) {
        e.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W}px,${(-v.y * 0.5 + 0.5) * H}px) translate(-50%,-100%)`;
        const nm = p === me ? '나 · ' + p.name : p.name; if (e.nt !== nm) { e.nm.textContent = nm; e.nt = nm; }
        e.el.classList.toggle('faded', S.muted.has(p.id));
        const on = active.has(p); e.bub.style.display = on ? '' : 'none';
        if (on) { if (e.bt !== p.b.text) { e.bub.textContent = p.b.text; e.bt = p.b.text; } e.bub.style.opacity = clamp((p.b.until - tms) / 400, 0, 1); e.bub.classList.toggle('unread', !!(S.reply && S.reply.from === p.id && tms < S.reply.until)); }
      }
    }
    // 그릇
    for (const sl of slots) {
      const o = all.find(p => p.table === sl.t && p.seat === sl.s), eat = o && o.phase === 'eating';
      sl.bg.visible = !!o; if (!o) continue;
      sl.rice.visible = !!eat && o.food > 0.001; sl.rice.scale.set(0.55 + 0.45 * o.food, 0.3 + 0.9 * o.food, 0.55 + 0.45 * o.food);
      sl.dish2.visible = sl.food2.visible = !!o.share; if (o.share) sl.food2.material.color.setHex(DISH_COLOR[o.share] || 0xffffff);
      sl.food.visible = !!(o.dish && o.dish !== 'none'); if (sl.food.visible) sl.food.material.color.setHex(DISH_COLOR[o.dish] || 0xffffff);
      if (eat && o.food > 0.05 && Math.random() < 0.05 * o.food * dt * 60) puff(sl.bg.position.x, 0.95, sl.bg.position.z, 1, 0.5);
    }
    // 하치 · 쿠첸 밥솥 (내 식사 단계를 보여 준다)
    const ph = me.phase, serving = ph === 'choosing' || ph === 'eating';
    hachi.g.position.y = Math.sin(tms / 700) * 0.04; hachi.b.rotation.z = serving ? Math.sin(tms / 380) * 0.04 : 0;
    if (hachi.highFur) hachi.highFur.visible = cam.position.distanceTo(hachi.g.position) < 17;
    hachi.arms.forEach((a, i) => { a.rotation.x = serving ? Math.sin(tms / 260 + i * Math.PI) * 0.18 : 0; });
    hachi.g.rotation.y = clamp(Math.atan2(me.x * K - hachi.g.position.x, me.y * K - hachi.g.position.z), -0.9, 0.9);
    const bl = (tms % 4200) < 130; hachi.eyes.forEach(ey => { ey.scale.y = bl ? 0.12 : 1; });
    cooker.position.x = COOK.x + (ph === 'ready' ? Math.sin(tms / 60) * 0.012 : ph === 'cooking' ? Math.sin(tms / 45) * 0.005 : 0);
    const potOpen = me.lidOpen || tms < S.potOpenUntil;
    lidPivot.rotation.x += ((potOpen ? -1.78 : 0) - lidPivot.rotation.x) * Math.min(1, dt * 10); potRice.visible = potOpen;
    const sec = ph === 'cooking' ? Math.max(0, Math.ceil((S.cookEnd - tms) / 1000)) : 0, key = ph === 'cooking' ? 'c' + sec : ph === 'ready' ? (Math.floor(tms / 400) % 2 ? 'End' : '   ') : 'idle';
    if (key !== panelKey) { panelKey = key; drawPanel(ph === 'cooking' ? 1 : 0, ph === 'cooking' ? '0:' + String(sec).padStart(2, '0') : ph === 'ready' ? key : '188'); }
    const f = dt * 60;
    if (ph === 'cooking' && Math.random() < 0.28 * f) cookerPuff(1, 0.8);
    if (ph === 'ready' && Math.random() < 0.55 * f) cookerPuff(1, 1.1);
    if (serving && Math.random() < 0.25 * f) cookerPuff(1, 1);
    steamAcc += dt; if (steamAcc > 0.25) { steamAcc = 0; puff(13 + rnd(-0.5, 0.5), 4, -6, 1, 5); const c = chimneys[Math.random() * chimneys.length | 0]; if (Math.random() < 0.3) puff(c.x, c.y, c.z, 1, 1.2); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life += dt;
      if (q.life > q.max) { scene.remove(q.sp); pool.push(q.sp); parts.splice(i, 1); continue; }
      q.sp.position.x += q.vx * dt; q.sp.position.y += q.vy * dt; q.sp.position.z += q.vz * dt; q.r += dt * 0.1 * (1 + q.r * 2);
      q.sp.scale.setScalar(q.r * 2); q.sp.material.opacity = Math.sin(q.life / q.max * Math.PI) * 0.5;
    }
    // 가는 곳 · 의자 표시
    const walking = me.table < 0 && Math.hypot(me.tx - me.x, me.ty - me.y) > 6;
    target.visible = walking; if (walking) { target.position.set(me.tx * K, 0.04, me.ty * K); target.scale.setScalar(1 + Math.sin(tms / 150) * 0.1); }
    const hs = S.hoverSeat; hoverRing.visible = !!hs; if (hs) { const sp = L.seatPos(hs.t, hs.s); hoverRing.position.set(sp.x * K, 0.04, sp.y * K); }
    // 카메라
    const k = Math.min(1, dt * 6); view.tx += (me.x * K - view.tx) * k; view.tz += (me.y * K - view.tz) * k;
    const cp = Math.cos(view.pitch), cx = view.tx + Math.sin(view.yaw) * view.dist * cp, cz = view.tz + Math.cos(view.yaw) * view.dist * cp;
    cam.position.set(cx, Math.max(Math.sin(view.pitch) * view.dist + 1.2, hf(cx, cz) + 0.8), cz); cam.lookAt(view.tx, 0.9, view.tz);
    sunL.position.set(view.tx + sunDir.x * 50, sunDir.y * 50, view.tz + sunDir.z * 50); sunL.target.position.set(view.tx, 0, view.tz);
    sky.position.copy(cam.position);
    R.render(scene, cam);
  }
  resize();
  function setFog(k) {   // 0(맑음) ~ 1(짙은 안개)
    scene.fog.density = 0.013 + 0.03 * k;
    for (const m of mist) m.sp.material.opacity = Math.min(0.5, m.bo * (1 + 2.5 * k));
  }
  return { render, resize, pick, puff, cookerPuff, rotate, zoom, snap, setFog };
}
