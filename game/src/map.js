import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Deterministic RNG so the map is the same every load.
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const PAL = {
  asphalt: 0x2c2350, plaza: 0xb9a6e8, plazaDark: 0x7d69c4, curb: 0x5ee6e0,
  torii: 0xd8263a, toriiDark: 0x2a1030, wood: 0x5a2e3a, roof: 0x3a2358,
  wallA: 0x4a2f7a, wallB: 0x7a2f6a, wallC: 0x2f3f7a, wallD: 0xc33a5a, wallE: 0xe8d8c8,
  sakura: 0xe070c8, sakura2: 0xb050c0, trunk: 0x4a2a3a, stone: 0x9a90b8,
  crate: 0xd8a060, crate2: 0x6a60c8, taxi: 0xf2c230, car2: 0xe8e0ff,
};

function windowTexture(rng, cols, rows, base = '#2a1a48', lit = ['#ffd27a', '#8fe8ff', '#ff9ad2', '#fff2c0']) {
  const c = document.createElement('canvas');
  c.width = cols * 16; c.height = rows * 16;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const on = rng() < 0.42;
    g.fillStyle = on ? lit[(rng() * lit.length) | 0] : '#140c26';
    g.fillRect(x * 16 + 4, y * 16 + 4, 8, 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}

function neonTexture(text, color, bg = '#12081f', vertical = false) {
  const c = document.createElement('canvas');
  const L = [...text].length;
  c.width = vertical ? 128 : Math.max(256, L * 110); c.height = vertical ? Math.max(256, L * 118) : 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = color; g.lineWidth = 8; g.shadowColor = color; g.shadowBlur = 18;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = '#fff'; g.font = '900 92px "Dela Gothic One", "M PLUS Rounded 1c", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowBlur = 24;
  if (vertical) [...text].forEach((ch, i) => g.fillText(ch, 64, 70 + i * 112));
  else g.fillText(text, c.width / 2, 68);
  g.fillStyle = color; g.globalCompositeOperation = 'source-atop'; g.globalAlpha = .45; g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: c.width / c.height };
}

export class GameMap {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];      // THREE.Box3 list (solid)
    this.batches = new Map(); // material key -> geometries
    this.mats = new Map();
    this.rng = mulberry32(1337);
    this.waypoints = [];
    this.spawns = { azure: [], blaze: [] };
    this.lights = [];
    this.bounds = 46;
    this.build();
  }

  mat(color, emissive = 0, ei = 0) {
    const k = `${color}|${emissive}|${ei}`;
    if (!this.mats.has(k)) this.mats.set(k, new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: .85, metalness: 0, flatShading: true }));
    return this.mats.get(k);
  }

  // Add static geometry that will be merged per-material.
  add(geo, material, pos, rot = 0, solid = false) {
    geo = geo.toNonIndexed ? geo : geo;
    if (rot) geo.rotateY(rot);
    geo.translate(pos.x, pos.y, pos.z);
    const key = material.uuid;
    if (!this.batches.has(key)) this.batches.set(key, { material, geos: [] });
    this.batches.get(key).geos.push(geo);
    if (solid) { geo.computeBoundingBox(); this.colliders.push(geo.boundingBox.clone()); }
    return geo;
  }

  // Axis-aligned box: x,z centre, y = bottom.
  box(x, y, z, w, h, d, color, solid = true, emissive = 0, ei = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), this.mat(color, emissive, ei), new THREE.Vector3(x, y + h / 2, z), 0, solid);
  }

  mesh(obj) { this.scene.add(obj); return obj; }

  build() {
    const r = this.rng;
    // ---------- ground ----------
    this.box(0, -1, 0, 120, 1, 120, PAL.asphalt);
    // plaza around shrine
    this.box(0, 0, 0, 44, 0.08, 40, PAL.plaza, false);
    for (let i = -20; i <= 20; i += 4) this.box(i, 0.08, 0, 0.12, 0.02, 40, PAL.plazaDark, false);
    for (let i = -18; i <= 18; i += 4) this.box(0, 0.08, i, 44, 0.02, 0.12, PAL.plazaDark, false);
    // glowing curbs
    this.box(0, 0, 20.2, 44, 0.25, 0.4, PAL.curb, false, PAL.curb, 1.2);
    this.box(0, 0, -20.2, 44, 0.25, 0.4, PAL.curb, false, PAL.curb, 1.2);
    // road markings
    for (let z = -44; z < 44; z += 6) { this.box(33, 0.01, z, 0.3, 0.02, 3, 0xffffff, false); this.box(-33, 0.01, z, 0.3, 0.02, 3, 0xffffff, false); }

    this.buildShrine();
    this.buildToriiCorridor();
    this.buildStreets();
    this.buildCover();
    this.buildTrees();
    this.buildSkyline();
    this.buildWaypoints();
    this.flush();
  }

  torii(x, z, s = 1, rot = 0, y = 0) {
    const red = this.mat(PAL.torii, PAL.torii, 0.25), dark = this.mat(PAL.toriiDark);
    const parts = [];
    const P = (g, m, px, py, pz) => { g.translate(px, py, pz); parts.push([g, m]); };
    P(new THREE.CylinderGeometry(.28 * s, .32 * s, 5 * s, 8), red, -2.2 * s, 2.5 * s, 0);
    P(new THREE.CylinderGeometry(.28 * s, .32 * s, 5 * s, 8), red, 2.2 * s, 2.5 * s, 0);
    P(new THREE.BoxGeometry(6.4 * s, .45 * s, .6 * s), dark, 0, 5.2 * s, 0);
    P(new THREE.BoxGeometry(5.8 * s, .35 * s, .5 * s), red, 0, 4.75 * s, 0);
    P(new THREE.BoxGeometry(5.2 * s, .3 * s, .4 * s), red, 0, 4.0 * s, 0);
    P(new THREE.BoxGeometry(.8 * s, .8 * s, .2 * s), this.mat(0x111111, 0xffcc33, .8), 0, 4.45 * s, .25 * s);
    for (const [g, m] of parts) { if (rot) g.rotateY(rot); g.translate(x, y, z); this.add(g, m, new THREE.Vector3()); }
    // pillars are solid
    const off = new THREE.Vector3(2.2 * s, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    for (const sgn of [-1, 1]) this.colliders.push(new THREE.Box3(new THREE.Vector3(x + sgn * off.x - .35 * s, y, z + sgn * off.z - .35 * s), new THREE.Vector3(x + sgn * off.x + .35 * s, y + 5 * s, z + sgn * off.z + .35 * s)));
  }

  stairs(x, z, w, fromY, toY, dir, len) {
    // dir: 'n' means climbing toward -z
    const steps = Math.ceil((toY - fromY) / 0.3);
    const dh = (toY - fromY) / steps, dl = len / steps;
    for (let i = 0; i < steps; i++) {
      const h = fromY + dh * (i + 1);
      const off = dl * (i + .5);
      if (dir === 'n') this.box(x, 0, z - off, w, h, dl, PAL.stone);
      else if (dir === 's') this.box(x, 0, z + off, w, h, dl, PAL.stone);
      else if (dir === 'e') this.box(x + off, 0, z, dl, h, w, PAL.stone);
      else this.box(x - off, 0, z, dl, h, w, PAL.stone);
    }
    this.box(x + (dir === 'e' ? len / 2 : dir === 'w' ? -len / 2 : w / 2 + .2), toY, z + (dir === 'n' ? -len / 2 : dir === 's' ? len / 2 : 0), dir === 'n' || dir === 's' ? .2 : len, .1, dir === 'n' || dir === 's' ? len : .2, 0xffe070, false, 0xffe070, 1.5);
  }

  buildShrine() {
    // Raised platform (the "shrine hill")
    this.box(0, 0, -2, 18, 2.4, 12, PAL.wallE);
    this.box(0, 2.4, -2, 18.4, .2, 12.4, PAL.torii, false);
    this.stairs(0, 10.0, 6, 0, 2.4, 'n', 6.0);   // south stairs  z 10 -> 4
    this.stairs(0, -14.0, 6, 0, 2.4, 's', 6.0);  // north stairs z -14 -> -8
    // hall on platform
    const hx = -5, hz = -4.5;
    this.box(hx, 2.4, hz, 6, 3, 4.5, 0x2a1638);
    for (const [dx, dz] of [[-2.8, 2.1], [2.8, 2.1], [-2.8, -2.1], [2.8, -2.1]]) this.box(hx + dx, 2.4, hz + dz, .4, 3.2, .4, PAL.torii);
    const roof = new THREE.ConeGeometry(5.4, 1.8, 4); roof.rotateY(Math.PI / 4); roof.scale(1.3, 1, 1);
    this.add(roof, this.mat(PAL.roof), new THREE.Vector3(hx, 6.5, hz));
    this.box(hx, 5.4, hz + 2.3, 2.2, .7, .1, 0x111111, false, 0xffcc33, 1.1);
    // offering box (cover on platform)
    this.box(3, 2.4, -4, 2.4, 1.1, 1.2, PAL.wood);
    this.box(6.5, 2.4, 1.5, 1.2, 1.1, 2.4, PAL.wood);
    // big torii at the platform front + base
    this.torii(0, 3.2, 1.25, 0, 2.4);
    this.torii(0, 15, 1.1, 0);
    this.torii(0, -17.5, 1.1, 0);
    // stone lanterns
    for (const [lx, lz] of [[-4.5, 12], [4.5, 12], [-4.5, -16], [4.5, -16], [-7.5, 2.5], [7.5, 2.5]]) this.stoneLantern(lx, lz, lz > 0 && lz < 5 ? 2.4 : 0);
    // hanging lantern light
    this.pointLight(0, 6, 4, 0xff6a9a, 16, 20);
  }

  stoneLantern(x, z, y = 0) {
    this.box(x, y, z, .9, .3, .9, PAL.stone);
    this.box(x, y + .3, z, .35, 1.1, .35, PAL.stone);
    this.box(x, y + 1.4, z, .75, .6, .75, 0x221133, false, 0xffc070, 2.2);
    const cap = new THREE.ConeGeometry(.8, .5, 4); cap.rotateY(Math.PI / 4);
    this.add(cap, this.mat(PAL.stone), new THREE.Vector3(x, y + 2.25, z));
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - .45, y, z - .45), new THREE.Vector3(x + .45, y + 2.4, z + .45)));
  }

  buildToriiCorridor() {
    // Senbon-torii along the west side
    for (let z = -16; z <= 12; z += 2.2) this.torii(-19, z, .72, Math.PI / 2);
    // paper lanterns strip along the east plaza edge
    for (let z = -16; z <= 16; z += 4) {
      this.box(19.5, 0, z, .12, 3.2, .12, PAL.wood, false);
      const l = new THREE.SphereGeometry(.38, 8, 6); l.scale(1, 1.3, 1);
      this.add(l, this.mat(0xff3040, 0xff3040, 2.0), new THREE.Vector3(19.5, 3.0, z));
    }
  }

  building(x, z, w, d, h, color, face, sign) {
    this.box(x, 0, z, w, h, d, color);
    // window facade planes on the face towards the arena
    const rng = this.rng;
    const tex = windowTexture(rng, Math.max(2, (face === 'x' ? d : w) / 1.6 | 0), Math.max(2, h / 1.8 | 0), '#' + new THREE.Color(color).multiplyScalar(.55).getHexString());
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: .9, roughness: 1, flatShading: true });
    const pw = face === 'x' ? d : w;
    const plane = new THREE.PlaneGeometry(pw * .92, h * .8);
    const sx = face === '+x' ? 1 : face === '-x' ? -1 : 0, sz = face === '+z' ? 1 : face === '-z' ? -1 : 0;
    if (sx) plane.rotateY(sx * Math.PI / 2); else if (sz < 0) plane.rotateY(Math.PI);
    this.add(plane, m, new THREE.Vector3(x + sx * (w / 2 + .02), h * .52, z + sz * (d / 2 + .02)));
    // roof trim neon
    const trim = [0xff4fa0, 0x57f0ff, 0xffd040, 0xb070ff][(rng() * 4) | 0];
    this.box(x, h, z, w + .2, .25, d + .2, trim, false, trim, 1.6);
    // awning at street level
    if (rng() < .7) {
      const aw = [0xff5a3c, 0x2fb4ff, 0xffcc33, 0xff2d87][(rng() * 4) | 0];
      if (sx) this.box(x + sx * (w / 2 + .8), 2.6, z, 1.6, .18, d * .8, aw, false, aw, .35);
      else this.box(x, 2.6, z + sz * (d / 2 + .8), w * .8, .18, 1.6, aw, false, aw, .35);
    }
    if (sign) this.neonSign(sign.text, sign.color, x + sx * (w / 2 + .3), sign.y ?? h * .7, z + sz * (d / 2 + .3), sx ? sx * Math.PI / 2 : sz < 0 ? Math.PI : 0, sign.size ?? 1.6, sign.vertical);
  }

  neonSign(text, color, x, y, z, rot, size = 1.6, vertical = false) {
    const { tex, aspect } = neonTexture(text, color, '#12081f', vertical);
    const w = vertical ? size : size * aspect, h = vertical ? size / aspect : size;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = rot;
    this.mesh(m);
  }

  pointLight(x, y, z, color, intensity, dist) {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z); this.scene.add(l); this.lights.push(l);
  }

  buildStreets() {
    const B = (x, z, w, d, h, c, face, sign) => this.building(x, z, w, d, h, c, face, sign);
    // east row (faces -x toward the arena), street between x 22..40
    B(43, -32, 8, 12, 14, PAL.wallA, '-x', { text: 'パチンコ', color: '#ff3fa0', vertical: true, size: 1.6, y: 7 });
    B(43, -17, 8, 14, 9, PAL.wallD, '-x', { text: 'ラーメン', color: '#ffcc33', size: 1.4, y: 4.2 });
    B(43, -2, 8, 12, 18, PAL.wallC, '-x', { text: 'カラオケ', color: '#57f0ff', vertical: true, size: 1.8, y: 9 });
    B(43, 13, 8, 14, 11, PAL.wallB, '-x', { text: 'BAR 777', color: '#b070ff', size: 1.4, y: 4.5 });
    B(43, 30, 8, 16, 15, PAL.wallA, '-x', { text: 'ゲーセン', color: '#ff5a3c', size: 1.6, y: 5 });
    // west row (faces +x)
    B(-43, -30, 8, 14, 12, PAL.wallC, '+x', { text: '居酒屋', color: '#ff5a3c', size: 1.5, y: 4 });
    B(-43, -12, 8, 14, 16, PAL.wallB, '+x', { text: 'ホテル', color: '#57f0ff', vertical: true, size: 1.6, y: 8 });
    B(-43, 6, 8, 14, 10, PAL.wallA, '+x', { text: '湯', color: '#ff9ad2', size: 2.2, y: 5 });
    B(-43, 26, 8, 18, 13, PAL.wallD, '+x', { text: 'NEON', color: '#ffcc33', size: 1.4, y: 5 });
    // north row (faces +z)
    B(-24, -43, 16, 8, 12, PAL.wallE, '+z', { text: 'コンビニ', color: '#36d07f', size: 1.3, y: 3.8 });
    B(-4, -43, 14, 8, 20, PAL.wallA, '+z', { text: 'HEX', color: '#ff3fa0', size: 2.4, y: 12 });
    B(16, -43, 16, 8, 14, PAL.wallC, '+z', { text: 'パチスロ', color: '#ffcc33', size: 1.6, y: 6 });
    // south row (faces -z)
    B(-22, 43, 18, 8, 11, PAL.wallB, '-z', { text: '銭湯', color: '#57f0ff', size: 1.8, y: 5 });
    B(0, 43, 14, 8, 16, PAL.wallD, '-z', { text: 'ARCADE', color: '#b070ff', size: 1.6, y: 8 });
    B(22, 43, 16, 8, 12, PAL.wallA, '-z', { text: 'たこ焼', color: '#ff5a3c', size: 1.5, y: 4.5 });

    // Elevated walkway (south-west) with stairs: sniper perch
    this.box(-30, 0, 30, 10, 3.2, 8, PAL.wallE);
    this.box(-30, 3.2, 26.1, 10, .9, .2, PAL.curb, true, PAL.curb, .8);
    this.stairs(-24.8, 32, 3, 0, 3.2, 'e', 5.5);
    // Elevated deck (north-east)
    this.box(30, 0, -30, 10, 3.2, 8, PAL.wallE);
    this.box(30, 3.2, -26.1, 10, .9, .2, PAL.curb, true, PAL.curb, .8);
    this.stairs(24.8, -32, 3, 0, 3.2, 'w', 5.5);

    // Street props: taxis, vending machines
    this.car(33, -8, 0, PAL.taxi); this.car(-34, 14, Math.PI, PAL.car2); this.car(30, 20, 0, PAL.car2); this.car(-33, -22, Math.PI, PAL.taxi);
    for (const [x, z, r] of [[38, 4, -Math.PI / 2], [38, 5.2, -Math.PI / 2], [-38, -4, Math.PI / 2], [-12, -37.5, 0], [12, 37.5, Math.PI]]) this.vending(x, z, r);

    // Arena outer walls (invisible limit, slightly visible neon fence)
    const L = this.bounds;
    for (const [x, z, w, d] of [[0, -L, 2 * L, .5], [0, L, 2 * L, .5], [-L, 0, .5, 2 * L], [L, 0, .5, 2 * L]])
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x - w / 2, -1, z - d / 2), new THREE.Vector3(x + w / 2, 30, z + d / 2)));

    // Coloured street lights
    for (const [x, z, c] of [[30, -24, 0xff3fa0], [30, 8, 0x57f0ff], [-30, 0, 0xffa040], [-30, -26, 0xb070ff], [0, 30, 0xff5a3c], [0, -30, 0x57f0ff], [-12, 18, 0xffe070], [14, -22, 0xff6a9a]]) {
      this.box(x, 0, z, .18, 5, .18, 0x333344, false);
      this.box(x, 5, z, .6, .25, .6, c, false, c, 3);
      this.pointLight(x, 4.6, z, c, 22, 18);
    }
  }

  car(x, z, rot, color) {
    const g1 = new THREE.BoxGeometry(2, 0.9, 4.2), g2 = new THREE.BoxGeometry(1.8, .75, 2.2);
    g1.translate(0, .75, 0); g2.translate(0, 1.55, -.2);
    const glass = new THREE.BoxGeometry(1.84, .5, 2.0); glass.translate(0, 1.6, -.2);
    for (const [g, m] of [[g1, this.mat(color)], [g2, this.mat(color)], [glass, this.mat(0x3050a0, 0x5070ff, .4)]]) { g.rotateY(rot); g.translate(x, 0, z); this.add(g, m, new THREE.Vector3()); }
    for (const sx of [-.8, .8]) for (const sz of [-1.4, 1.4]) { const w = new THREE.CylinderGeometry(.38, .38, .3, 10); w.rotateZ(Math.PI / 2); w.translate(sx, .38, sz); w.rotateY(rot); w.translate(x, 0, z); this.add(w, this.mat(0x151020), new THREE.Vector3()); }
    const hl = new THREE.BoxGeometry(1.6, .15, .1); hl.translate(0, .95, 2.12); hl.rotateY(rot); hl.translate(x, 0, z); this.add(hl, this.mat(0xffffff, 0xfff0c0, 3), new THREE.Vector3());
    const c = Math.abs(Math.sin(rot)) > .5;
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - (c ? 2.1 : 1), 0, z - (c ? 1 : 2.1)), new THREE.Vector3(x + (c ? 2.1 : 1), 1.9, z + (c ? 1 : 2.1))));
  }

  vending(x, z, rot) {
    const body = new THREE.BoxGeometry(1.1, 2, .8); body.translate(0, 1, 0);
    const face = new THREE.PlaneGeometry(.9, 1.3); face.translate(0, 1.2, .41);
    const c = [0xff4040, 0x3080ff, 0xffffff][(this.rng() * 3) | 0];
    for (const [g, m] of [[body, this.mat(c)], [face, this.mat(0x223355, 0x9fe8ff, 1.4)]]) { g.rotateY(rot); g.translate(x, 0, z); this.add(g, m, new THREE.Vector3()); }
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - .55, 0, z - .55), new THREE.Vector3(x + .55, 2, z + .55)));
  }

  buildCover() {
    const r = this.rng;
    const crates = [[-10, 14], [10, 14], [-14, 6], [14, 6], [-12, -12], [12, -13], [-6, 17], [7, -17], [-26, 12], [26, -12], [-26, -8], [26, 4], [-14, 30], [14, 30], [-14, -30], [14, -30], [0, 26], [0, -26], [-36, 0], [36, -18]];
    for (const [x, z] of crates) {
      const big = r() < .5;
      const c = r() < .5 ? PAL.crate : PAL.crate2;
      this.box(x, 0, z, big ? 2.2 : 1.4, big ? 1.4 : 1.1, big ? 2.2 : 1.4, c);
      if (r() < .4) this.box(x + .2, big ? 1.4 : 1.1, z - .1, 1.1, .9, 1.1, c === PAL.crate ? PAL.crate2 : PAL.crate);
    }
    // low neon walls
    for (const [x, z, w, d] of [[-8, 24, 6, .6], [8, 24, 6, .6], [-8, -24, 6, .6], [8, -24, 6, .6], [22, 0, .6, 7], [-24, 20, .6, 5]]) {
      this.box(x, 0, z, w, 1.15, d, 0x3a2a6a);
      this.box(x, 1.15, z, w, .12, d, 0xff4fa0, false, 0xff4fa0, 1.4);
    }
  }

  buildTrees() {
    const r = this.rng;
    const spots = [[-12, 2], [12, 2], [-10, -10], [10, -10], [-14, 16], [14, 16], [-26, -32], [24, 34], [-8, 30], [26, 26], [-26, -18], [30, -12]];
    for (const [x, z] of spots) {
      const s = .8 + r() * .5;
      this.box(x, 0, z, .45 * s, 2.4 * s, .45 * s, PAL.trunk);
      for (let i = 0; i < 4; i++) {
        const g = new THREE.IcosahedronGeometry((1.3 + r() * .6) * s, 0);
        this.add(g, this.mat(i % 2 ? PAL.sakura : PAL.sakura2, 0x601050, .25), new THREE.Vector3(x + (r() - .5) * 2 * s, (2.6 + r() * 1.2) * s, z + (r() - .5) * 2 * s));
      }
    }
    // petals are handled as particles in fx
  }

  buildSkyline() {
    const r = this.rng;
    const skyMatCache = [];
    for (let i = 0; i < 4; i++) {
      const tex = windowTexture(r, 8, 24, '#1a1036', ['#ffd27a', '#8fe8ff', '#ff9ad2', '#b89aff']);
      skyMatCache.push(new THREE.MeshBasicMaterial({ map: tex, color: 0xb0a0d8, fog: true }));
    }
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + r() * .05, d = 70 + r() * 40;
      const w = 6 + r() * 10, h = 18 + r() * 60;
      const g = new THREE.BoxGeometry(w, h, w);
      const m = new THREE.Mesh(g, skyMatCache[i % 4]);
      m.position.set(Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d);
      m.rotation.y = r() * Math.PI;
      this.scene.add(m);
      if (r() < .25) { // antenna blink
        const b = new THREE.Mesh(new THREE.SphereGeometry(.6, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3050, toneMapped: false }));
        b.position.set(m.position.x, h + .5, m.position.z); this.scene.add(b);
      }
    }
    // Tokyo-tower-ish landmark
    const tower = new THREE.Group();
    const tm = new THREE.MeshBasicMaterial({ color: 0xff5030, toneMapped: false, wireframe: true });
    const tg = new THREE.CylinderGeometry(.6, 7, 70, 4, 8, true);
    const t = new THREE.Mesh(tg, tm); t.position.y = 35; tower.add(t);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 2.5, 7), new THREE.MeshBasicMaterial({ color: 0xffd0a0, toneMapped: false })); deck.position.y = 40; tower.add(deck);
    tower.position.set(-60, 0, -95); this.scene.add(tower);
    // moon
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff4e0, toneMapped: false }));
    moon.position.set(70, 80, -160); this.scene.add(moon);
    // stars
    const sg = new THREE.BufferGeometry(); const pts = [];
    for (let i = 0; i < 700; i++) { const a = r() * Math.PI * 2, e = .15 + r() * 1.2, R = 300; pts.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false })));
  }

  flush() {
    for (const { material, geos } of this.batches.values()) {
      const norm = geos.map(g => (g.index ? g.toNonIndexed() : g));
      // keep attributes consistent
      for (const g of norm) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); }
      const merged = mergeGeometries(norm, false);
      const m = new THREE.Mesh(merged, material);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }
    this.batches.clear();
  }

  // ---------- collision helpers ----------
  // Ground height under (x,z) for an entity whose feet are at y (allows stepping up `step`).
  groundAt(x, z, y, radius = .35, step = .45) {
    let g = 0;
    for (const b of this.colliders) {
      if (x + radius <= b.min.x || x - radius >= b.max.x || z + radius <= b.min.z || z - radius >= b.max.z) continue;
      if (b.max.y <= y + step && b.max.y > g) g = b.max.y;
    }
    return g;
  }

  // Does a vertical cylinder at (x, y..y+h, z) intersect a collider that is too tall to step on?
  blocked(x, y, z, radius, h, step = .45) {
    for (const b of this.colliders) {
      if (x + radius <= b.min.x || x - radius >= b.max.x || z + radius <= b.min.z || z - radius >= b.max.z) continue;
      if (b.max.y <= y + step) continue;      // can step on it
      if (b.min.y >= y + h) continue;         // above head
      return true;
    }
    return false;
  }

  // Segment vs colliders. Returns t in [0,1] of first hit or null.
  raycast(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let best = null;
    for (const c of this.colliders) {
      let t0 = 0, t1 = 1, ok = true;
      for (const [o, d, mn, mx] of [[a.x, dx, c.min.x, c.max.x], [a.y, dy, c.min.y, c.max.y], [a.z, dz, c.min.z, c.max.z]]) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } }
        else { let ta = (mn - o) / d, tb = (mx - o) / d; if (ta > tb) [ta, tb] = [tb, ta]; if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { ok = false; break; } }
      }
      if (ok && (best === null || t0 < best)) best = t0;
    }
    return best;
  }

  lineOfSight(a, b) { const t = this.raycast(a, b); return t === null || t > 0.999; }

  buildWaypoints() {
    const W = [];
    // grid over the walkable area, skipping blocked cells
    for (let x = -40; x <= 40; x += 5) for (let z = -40; z <= 40; z += 5) {
      const y = this.groundAt(x, z, 10, .5, 20);
      if (y > .5) { // on something raised: keep only if on platform/decks
        if (this.blocked(x, y, z, .5, 1.8)) continue;
      } else if (this.blocked(x, 0, z, .6, 1.8)) continue;
      W.push(new THREE.Vector3(x, y, z));
    }
    // stair / ramp helpers
    for (const p of [[0, 12, 0], [0, 7, 1.2], [0, 3, 2.4], [0, -16, 0], [0, -11, 1.2], [0, -7, 2.4], [-23, 32, 0], [-27, 32, 1.6], [-30, 29, 3.2], [23, -32, 0], [27, -32, 1.6], [30, -29, 3.2], [5, 0, 2.4], [-5, 0, 2.4], [5, -6, 2.4]])
      W.push(new THREE.Vector3(p[0], p[2], p[1]));
    this.waypoints = W.map((p, i) => ({ id: i, p, n: [] }));
    const up = new THREE.Vector3(0, 1.0, 0);
    for (const a of this.waypoints) for (const b of this.waypoints) {
      if (a.id >= b.id) continue;
      const d = a.p.distanceTo(b.p);
      if (d > 7.6) continue;
      const dy = Math.abs(a.p.y - b.p.y);
      if (dy > 1.3) continue;
      if (!this.lineOfSight(a.p.clone().add(up), b.p.clone().add(up))) continue;
      // make sure there is floor along the path (no walking off decks into walls)
      let ok = true;
      for (let s = 1; s < 4; s++) { const q = a.p.clone().lerp(b.p, s / 4); const gy = this.groundAt(q.x, q.z, Math.max(a.p.y, b.p.y) + .2, .3, .8); if (Math.abs(gy - q.y) > .9) { ok = false; break; } }
      if (!ok) continue;
      a.n.push(b.id); b.n.push(a.id);
    }
    this.spawns.azure = [[-6, 36], [6, 36], [-12, 38], [12, 38], [0, 34]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.spawns.blaze = [[-6, -36], [6, -36], [-12, -38], [12, -38], [0, -34]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  }

  nearestWaypoint(p) {
    let best = null, bd = 1e9;
    for (const w of this.waypoints) { const d = w.p.distanceToSquared(p) + Math.abs(w.p.y - p.y) * 20; if (d < bd) { bd = d; best = w; } }
    return best;
  }

  path(from, to) {
    const s = this.nearestWaypoint(from), g = this.nearestWaypoint(to);
    if (!s || !g) return [];
    const open = new Set([s.id]), came = new Map(), gs = new Map([[s.id, 0]]), fs = new Map([[s.id, s.p.distanceTo(g.p)]]);
    while (open.size) {
      let cur = null, cf = 1e9;
      for (const id of open) { const f = fs.get(id); if (f < cf) { cf = f; cur = id; } }
      if (cur === g.id) { const out = [g.p]; let c = cur; while (came.has(c)) { c = came.get(c); out.unshift(this.waypoints[c].p); } return out; }
      open.delete(cur);
      const cw = this.waypoints[cur];
      for (const nid of cw.n) {
        const t = gs.get(cur) + cw.p.distanceTo(this.waypoints[nid].p);
        if (t < (gs.get(nid) ?? 1e9)) { came.set(nid, cur); gs.set(nid, t); fs.set(nid, t + this.waypoints[nid].p.distanceTo(g.p)); open.add(nid); }
      }
    }
    return [to];
  }
}
