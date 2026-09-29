import * as THREE from 'three';

const GLOVE = new THREE.MeshStandardMaterial({ color: 0xf6f2ff, roughness: .6, flatShading: true });
const GLOVE_DARK = new THREE.MeshStandardMaterial({ color: 0xd8d0ee, roughness: .6, flatShading: true });
const CUFF = new THREE.MeshStandardMaterial({ color: 0x3ab8e8, roughness: .5, flatShading: true });
const GOLD = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffb000, emissiveIntensity: .4, roughness: .4, flatShading: true });

// Finger pose: [baseCurl, midCurl, spread]. curl in radians toward palm.
const S = [0, 0, 0], C = [1.5, 1.7, 0];
const POSES = {
  open:      { f: [[0, .1, -.12], [0, .1, -.04], [0, .1, .04], [0, .1, .14]], thumb: [.2, .1, .9] },
  fingergun: { f: [S, C, C, C], thumb: [-.2, 0, .1] },
  doubletap: { f: [[0, 0, -.18], [0, 0, .14], C, C], thumb: [1.0, .9, .6] },
  scope:     { f: [[1.0, 1.1, 0], [0, .05, 0], [0, .05, .06], [0, .05, .14]], thumb: [.9, .5, .5], ok: true },
  horns:     { f: [[0, 0, -.12], C, C, [0, 0, .2]], thumb: [1.0, .9, .6] },
  trinity:   { f: [[0, 0, -.1], C, C, [0, 0, .2]], thumb: [-.3, 0, 1.0] },
  seal:      { f: [[0, 0, 0], [0, 0, 0], [.1, .1, 0], [.15, .1, 0]], thumb: [.2, 0, .2] },
  cast:      { f: [[0, 0, -.2], [0, 0, -.06], [0, 0, .06], [0, 0, .22]], thumb: [0, 0, 1.1] },
};

class Hand {
  constructor(mirror = 1) {
    this.mirror = mirror;
    this.root = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(.09, .034, .1), GLOVE);
    this.root.add(palm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.05, .058, .07, 10), CUFF);
    cuff.rotation.x = Math.PI / 2; cuff.position.z = .085; this.root.add(cuff);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.05, .005, 6, 14), GOLD);
    ring.position.z = .052; this.root.add(ring);
    this.fingers = [];
    const xs = [-.033, -.011, .011, .033], lens = [.05, .055, .051, .04];
    for (let i = 0; i < 4; i++) {
      const base = new THREE.Group(); base.position.set(xs[i] * mirror, 0, -.05);
      const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(.0125, lens[i], 3, 6), GLOVE);
      seg1.rotation.x = Math.PI / 2; seg1.position.z = -lens[i] / 2; base.add(seg1);
      const mid = new THREE.Group(); mid.position.z = -lens[i]; base.add(mid);
      const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(.0118, lens[i] * .8, 3, 6), GLOVE_DARK);
      seg2.rotation.x = Math.PI / 2; seg2.position.z = -lens[i] * .4; mid.add(seg2);
      this.root.add(base);
      this.fingers.push({ base, mid, cur: [0, 0, 0] });
    }
    const tb = new THREE.Group(); tb.position.set(-.045 * mirror, -.004, -.005);
    const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(.014, .038, 3, 6), GLOVE);
    t1.rotation.x = Math.PI / 2; t1.position.z = -.02; tb.add(t1);
    const tm = new THREE.Group(); tm.position.z = -.04; tb.add(tm);
    const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(.013, .03, 3, 6), GLOVE_DARK);
    t2.rotation.x = Math.PI / 2; t2.position.z = -.016; tm.add(t2);
    this.root.add(tb);
    this.thumb = { base: tb, mid: tm, cur: [0, 0, 0] };
    // magic glow on the fingertip / palm
    this.glow = new THREE.PointLight(0x9fe0ff, 0, .8, 2);
    this.glow.position.set(-.033 * mirror, 0, -.16); this.root.add(this.glow);
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0, toneMapped: false }));
    this.tip.position.copy(this.glow.position); this.root.add(this.tip);
    this.pose = 'open';
  }

  setPose(name) { this.pose = name; }

  update(dt) {
    const P = POSES[this.pose] || POSES.open;
    const k = 1 - Math.exp(-dt * 22);
    this.fingers.forEach((f, i) => {
      const t = P.f[i];
      for (let j = 0; j < 3; j++) f.cur[j] += (t[j] - f.cur[j]) * k;
      f.base.rotation.x = -f.cur[0] * 1;
      f.mid.rotation.x = -f.cur[1];
      f.base.rotation.y = -f.cur[2] * this.mirror;
    });
    const t = P.thumb, th = this.thumb;
    for (let j = 0; j < 3; j++) th.cur[j] += (t[j] - th.cur[j]) * k;
    th.base.rotation.set(-th.cur[0] * .6, (th.cur[2] * .9 - .2) * this.mirror, -th.cur[1] * .5 * this.mirror);
    th.mid.rotation.x = -th.cur[1];
  }
}

export class Hands {
  constructor(camera) {
    this.group = new THREE.Group();
    this.group.scale.setScalar(.85); this.group.position.z = -.04;
    camera.add(this.group);
    this.right = new Hand(1); this.left = new Hand(-1);
    this.group.add(this.right.root, this.left.root);
    this.fill = new THREE.PointLight(0xffe0ff, .35, 1.5, 2); this.fill.position.set(0, .3, 0); this.group.add(this.fill);
    this.t = 0; this.recoil = 0; this.swap = 0; this.reload = 0; this.cast = 0; this.aim = 0;
    this.twoHand = false; this.gesture = 'fingergun';
    this.tipColor = new THREE.Color(0xbfefff);
  }

  setGesture(id, twoHand, color) {
    this.gesture = id; this.twoHand = twoHand; this.swap = 1;
    this.tipColor.setHex(color);
    this.right.tip.material.color.copy(this.tipColor); this.right.glow.color.copy(this.tipColor);
    this.left.tip.material.color.copy(this.tipColor); this.left.glow.color.copy(this.tipColor);
  }

  fire() { this.recoil = 1; this.right.glow.intensity = .8; this.right.tip.material.opacity = 1; if (this.twoHand) { this.left.glow.intensity = .8; this.left.tip.material.opacity = 1; } }
  doCast() { this.cast = 1; this.left.glow.intensity = 1; this.left.tip.material.opacity = 1; }

  update(dt, moveSpeed, aiming, reloading, charging) {
    this.t += dt * (moveSpeed > .5 ? 1 : .25);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.swap = Math.max(0, this.swap - dt * 4);
    this.cast = Math.max(0, this.cast - dt * 3);
    this.aim += ((aiming ? 1 : 0) - this.aim) * (1 - Math.exp(-dt * 14));
    for (const h of [this.right, this.left]) { h.glow.intensity *= Math.exp(-dt * 10); h.tip.material.opacity *= Math.exp(-dt * 8); }

    const bobA = Math.min(moveSpeed / 7, 1.4);
    const bx = Math.sin(this.t * 9) * .012 * bobA, by = Math.abs(Math.cos(this.t * 9)) * .014 * bobA;
    const R = this.right.root, L = this.left.root;
    const g = this.gesture;
    // right hand pose + placement
    this.right.setPose(g === 'seal' ? 'seal' : g);
    let rp = new THREE.Vector3(.19, -.17, -.44), rr = new THREE.Euler(.55, .25, 0);
    if (g === 'fingergun') rr.set(.5, .28, -1.25);   // sideways "cool" finger gun
    if (g === 'doubletap') rr.set(.5, .25, -1.1);
    if (g === 'horns' || g === 'trinity') rr.set(.75, .2, -.25);
    if (g === 'scope') { rp.set(.12, -.12, -.4); rr.set(.9, -.3, -.6); }
    if (g === 'seal') { rp.set(.03, -.15, -.42); rr.set(.7, 0, -1.45); }
    // aiming pulls the hand toward the center
    rp.lerp(new THREE.Vector3(.07, -.12, -.36), this.aim * (g === 'scope' ? 0 : .7));
    rp.x += bx; rp.y += by - this.swap * .25 - this.recoil * .01; rp.z += this.recoil * .06;
    rr.x += this.recoil * .35;
    if (reloading) { // blow on the fingertip: bring hand up to the mouth
      const k = Math.sin(Math.min(reloading, 1) * Math.PI);
      rp.lerp(new THREE.Vector3(.02, -.08, -.22), k * .9); rr.x += k * 1.1; rr.z -= k * .3;
    }
    R.position.copy(rp); R.rotation.copy(rr);

    // left hand
    let lp = new THREE.Vector3(-.21, -.18, -.44), lr = new THREE.Euler(.5, -.25, .3);
    if (this.twoHand && g === 'seal') { lp.set(-.03, -.15, -.42); lr.set(.7, 0, 1.45); this.left.setPose('seal'); }
    else if (this.twoHand && g === 'scope') { lp.set(-.12, -.12, -.4); lr.set(.9, .3, .6); this.left.setPose('scope'); }
    else if (charging) { lp.set(-.18, -.12, -.42); lr.set(-1.2, 0, .2); this.left.setPose('cast'); this.left.glow.intensity = Math.max(this.left.glow.intensity, .6 + Math.sin(this.t * 30) * .2); }
    else { this.left.setPose(this.cast > .3 ? 'cast' : 'open'); lr.set(.5 - this.cast, -.3, .7); lp.y += this.cast * .08; lp.z -= this.cast * .1; }
    lp.x -= bx; lp.y += by - (this.twoHand ? this.swap * .25 : 0);
    L.position.copy(lp); L.rotation.copy(lr);
    if (this.aim > .5 && g === 'scope') this.group.visible = false; else this.group.visible = true;
    this.right.update(dt); this.left.update(dt);
  }

  // World position of the right fingertip (muzzle)
  muzzle(out) { return this.right.tip.getWorldPosition(out); }
  palm(out) { return this.left.tip.getWorldPosition(out); }
}
