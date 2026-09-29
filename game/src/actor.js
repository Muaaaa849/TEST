import * as THREE from 'three';
import { GESTURES, SPELLS } from './data.js';

const TEAM_COL = { azure: 0x2fb4ff, blaze: 0xff5a3c };
const GRAV = 24, JUMP = 8.2, RADIUS = .38, HEIGHT = 1.8, EYE = 1.6;

function nameTag(text, team) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '800 44px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(500, g.measureText(text).width + 40);
  g.fillStyle = team === 'azure' ? 'rgba(20,90,160,.85)' : 'rgba(170,40,30,.85)';
  g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 64, 20); g.fill();
  g.fillStyle = '#fff'; g.fillText(text, 256, 48);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(1.9, .36, 1); s.position.y = 2.45;
  return s;
}

export class Avatar {
  constructor(hero, team, name) {
    this.root = new THREE.Group();
    const tc = TEAM_COL[team];
    this.mats = [];
    const M = (color, emissive = 0, ei = 0) => { const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, flatShading: true, roughness: .7, transparent: true }); m.userData.e0 = m.emissive.clone(); m.userData.ei0 = ei; this.mats.push(m); return m; };
    const body = new THREE.Group(); this.body = body; this.root.add(body);
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(.3, .52, 1.25, 8), M(0x2a1f3d)); robe.position.y = .62; body.add(robe);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(.53, .54, .14, 8), M(tc, tc, .8)); trim.position.y = .08; body.add(trim);
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(.34, .36, .14, 8), M(hero.body, hero.body, .3)); sash.position.y = 1.0; body.add(sash);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.0, .05), M(tc, tc, .9)); stripe.position.set(0, .7, .42); stripe.rotation.x = -.18; body.add(stripe);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.38, .3, .18, 8), M(hero.body)); collar.position.y = 1.3; body.add(collar);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.27, 10, 8), M(0x1a1030)); head.position.y = 1.58; body.add(head); this.head = head;
    for (const sx of [-.09, .09]) { const e = new THREE.Mesh(new THREE.BoxGeometry(.07, .04, .02), new THREE.MeshBasicMaterial({ color: tc, toneMapped: false })); e.position.set(sx, 1.6, .25); body.add(e); }
    let hat;
    if (hero.hat === 'cone') { hat = new THREE.Mesh(new THREE.ConeGeometry(.34, .8, 8), M(hero.body)); hat.position.y = 2.05; hat.rotation.z = .12;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .05, 12), M(hero.body)); brim.position.y = 1.74; body.add(brim); }
    else if (hero.hat === 'kasa') { hat = new THREE.Mesh(new THREE.ConeGeometry(.62, .34, 10), M(0xc89a4a)); hat.position.y = 1.9; }
    else { hat = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(hero.body)); hat.position.y = 1.68;
      const top = new THREE.Mesh(new THREE.SphereGeometry(.08, 6, 4), M(0xffd24a, 0xffb000, .6)); top.position.y = 2.0; body.add(top); }
    body.add(hat);
    // floating gloves
    this.hands = [];
    for (const sx of [-.42, .42]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), M(0xf6f2ff)); h.position.set(sx, 1.05, .3); h.scale.set(1, .8, 1.2); body.add(h); this.hands.push(h);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .08, 8), M(0x3ab8e8)); cuff.rotation.x = Math.PI / 2; cuff.position.z = .12; h.add(cuff);
    }
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0 }));
    this.hands[1].add(this.glow); this.glow.position.z = -.14;
    // team ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(.5, .62, 24), new THREE.MeshBasicMaterial({ color: tc, transparent: true, opacity: .7, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .05; this.root.add(ring);
    this.tag = nameTag(name, team); this.root.add(this.tag);
    this.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.flash = 0; this.t = Math.random() * 10;
  }

  update(dt, actor) {
    this.t += dt;
    const sp = Math.hypot(actor.vel.x, actor.vel.z);
    this.body.position.y = Math.abs(Math.sin(this.t * 8)) * .05 * Math.min(sp / 6, 1);
    this.body.rotation.x = Math.min(sp / 7, 1) * .12;
    this.hands.forEach((h, i) => { h.position.y = 1.05 + Math.sin(this.t * 3 + i) * .04; });
    this.hands[1].position.z = .3 + (actor.aimT > 0 ? .15 : 0);
    this.flash = Math.max(0, this.flash - dt * 6);
    const op = actor.veilT > 0 ? .18 : 1;
    const f = this.flash;
    if (f > 0 || this.wasFlash || op !== this.lastOp) {
      for (const m of this.mats) {
        m.opacity = op;
        m.emissive.copy(m.userData.e0).add(new THREE.Color(f, f * .3, f * .5));
        m.emissiveIntensity = f > 0 ? Math.max(1, m.userData.ei0) : m.userData.ei0;
      }
      this.wasFlash = f > 0; this.lastOp = op;
    }
    this.glow.material.opacity *= Math.exp(-dt * 10);
    this.tag.visible = actor.veilT <= 0 || actor.team === actor.game.player.team;
  }

}

export class Actor {
  constructor(game, { name, team, hero, isPlayer = false }) {
    this.game = game; this.name = name; this.team = team; this.hero = hero; this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.onGround = true;
    this.stats = { k: 0, d: 0, a: 0, dmg: 0, heal: 0, hs: 0, shots: 0, hits: 0, streak: 0, best: 0 };
    this.recentHits = new Map();
    this.avatar = null;
    if (!isPlayer) { this.avatar = new Avatar(hero, team, name); game.scene.add(this.avatar.root); }
    this.resetLoadout();
    this.alive = false; this.respawnT = 0;
  }

  resetLoadout() {
    const h = this.hero;
    this.maxHp = h.hp; this.maxMp = h.mp; this.hp = h.hp; this.mp = h.mp;
    this.gIdx = 0; this.ammo = {}; for (const g of h.gestures) this.ammo[g] = GESTURES[g].mag;
    this.reloadT = 0; this.fireCd = 0; this.burst = 0; this.burstCd = 0; this.swapT = 0;
    this.cd = {}; for (const s of h.spells) this.cd[s] = 0;
    this.veilT = 0; this.rootT = 0; this.revealT = 0; this.aimT = 0; this.shieldT = 0;
  }

  get gesture() { return GESTURES[this.hero.gestures[this.gIdx]]; }
  get speed() { return this.hero.speed; }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + EYE, this.pos.z); }
  headCenter(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z); }
  lookDir(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  spawnAt(p, yaw) {
    this.resetLoadout();
    this.pos.copy(p); this.pos.y = this.game.map.groundAt(p.x, p.z, 5) ; this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.alive = true;
    this.spawnProtect = 1.5;
    if (this.avatar) { this.avatar.root.visible = true; this.avatar.root.scale.setScalar(1); }
  }

  setGesture(i) {
    if (i === this.gIdx || i < 0 || i >= this.hero.gestures.length) return false;
    this.gIdx = i; this.reloadT = 0; this.swapT = .3; this.burst = 0; this.aimT = 0;
    return true;
  }

  // wish: THREE.Vector3 (x,z) in world space, length <= 1
  move(dt, wish, sprint, jump) {
    const map = this.game.map;
    const sp = this.rootT > 0 ? 0 : this.speed * (sprint ? 1.45 : 1) * (this.aimT > 0 ? .55 : 1);
    const accel = this.onGround ? 60 : 16;
    const tx = wish.x * sp, tz = wish.z * sp;
    this.vel.x += Math.max(-accel * dt, Math.min(accel * dt, tx - this.vel.x));
    this.vel.z += Math.max(-accel * dt, Math.min(accel * dt, tz - this.vel.z));
    if (jump && this.onGround && this.rootT <= 0) { this.vel.y = JUMP; this.onGround = false; this.jumped = true; }
    this.vel.y -= GRAV * dt;
    // horizontal with collision per-axis (step up allowed)
    const step = this.onGround ? .45 : .2;
    for (const ax of ['x', 'z']) {
      const d = this.vel[ax] * dt; if (!d) continue;
      const nx = ax === 'x' ? this.pos.x + d : this.pos.x, nz = ax === 'z' ? this.pos.z + d : this.pos.z;
      if (!map.blocked(nx, this.pos.y, nz, RADIUS, HEIGHT, step)) {
        this.pos.x = nx; this.pos.z = nz;
        const g = map.groundAt(nx, nz, this.pos.y, RADIUS, step);
        if (this.onGround && g > this.pos.y && g - this.pos.y <= step) this.pos.y = g; // stair step
      } else { this.vel[ax] = 0; this.bumped = true; }
    }
    // vertical
    const ny = this.pos.y + this.vel.y * dt;
    const g = map.groundAt(this.pos.x, this.pos.z, Math.max(this.pos.y, ny), RADIUS, .05);
    if (this.vel.y > 0 && map.blocked(this.pos.x, ny, this.pos.z, RADIUS, HEIGHT, 0)) { this.vel.y = 0; }
    else if (ny <= g) { this.pos.y = g; if (this.vel.y < -2 && !this.onGround) this.landed = true; this.vel.y = 0; this.onGround = true; }
    else { this.pos.y = ny; this.onGround = ny - g < .02; }
    // keep in arena
    const L = map.bounds - 1;
    this.pos.x = Math.max(-L, Math.min(L, this.pos.x)); this.pos.z = Math.max(-L, Math.min(L, this.pos.z));
  }

  // Segment vs this actor. Returns {t, head} or null.
  intersect(a, b) {
    if (!this.alive) return null;
    const ab = new THREE.Vector3().subVectors(b, a), len2 = ab.lengthSq();
    let best = null;
    const test = (cx, cy, cz, r, head) => {
      const ax = cx - a.x, ay = cy - a.y, az = cz - a.z;
      let t = (ax * ab.x + ay * ab.y + az * ab.z) / len2; t = Math.max(0, Math.min(1, t));
      const px = a.x + ab.x * t - cx, py = a.y + ab.y * t - cy, pz = a.z + ab.z * t - cz;
      if (px * px + py * py + pz * pz <= r * r && (!best || t < best.t)) best = { t, head };
    };
    const { x, y, z } = this.pos;
    test(x, y + 1.6, z, .3, true);
    test(x, y + 1.08, z, .44, false);
    test(x, y + .5, z, .48, false);
    return best;
  }

  update(dt) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.swapT = Math.max(0, this.swapT - dt);
    this.veilT = Math.max(0, this.veilT - dt);
    this.rootT = Math.max(0, this.rootT - dt);
    this.revealT = Math.max(0, this.revealT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.spawnProtect = Math.max(0, (this.spawnProtect || 0) - dt);
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.mp = Math.min(this.maxMp, this.mp + dt * 9);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.ammo[this.gesture.id] = this.gesture.mag; this.reloadT = 0; }
    }
    if (this.avatar) {
      this.avatar.root.position.copy(this.pos);
      this.avatar.root.rotation.y = this.yaw;
      this.avatar.update(dt, this);
    }
  }

  startReload() {
    const g = this.gesture;
    if (this.reloadT > 0 || this.ammo[g.id] >= g.mag) return false;
    this.reloadT = g.reload; this.aimT = 0; return true;
  }

  canCast(id) { const s = SPELLS[id]; return this.alive && this.cd[id] <= 0 && this.mp >= s.cost && !this.gesture.twoHand; }
}

export { TEAM_COL, EYE };
