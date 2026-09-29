import * as THREE from 'three';
import { GESTURES } from './data.js';

const HOTSPOTS = [[0, -2, 2.4], [0, 14, 0], [0, -18, 0], [-19, 0, 0], [30, -29, 3.2], [-30, 29, 3.2], [33, 0, 0], [-33, 0, 0], [12, 14, 0], [-12, -12, 0], [20, 30, 0], [-20, -30, 0]];

export class BotBrain {
  constructor(actor, game) {
    this.a = actor; this.g = game;
    this.path = []; this.repath = 0; this.goal = null;
    this.target = null; this.seenT = 0; this.strafe = 1; this.strafeT = 0;
    this.aimErr = new THREE.Vector3(); this.errT = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.thinkT = Math.random() * .3; this.spellT = 2 + Math.random() * 3;
    this.wish = new THREE.Vector3();
  }

  diff() { return this.g.diff; }

  visibleEnemies() {
    const a = this.a, out = [];
    const eye = a.eye();
    for (const e of this.g.actors) {
      if (!e.alive || e.team === a.team) continue;
      const d = e.pos.distanceTo(a.pos);
      if (d > 55) continue;
      if (e.veilT > 0 && d > 9 && e.revealT <= 0) continue;
      // field of view (~200deg) unless close
      const to = e.pos.clone().sub(a.pos); to.y = 0; to.normalize();
      const f = new THREE.Vector3(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
      if (d > 6 && to.dot(f) < -0.2 && e.revealT <= 0 && !a.recentHits.has(e)) continue;
      if (!this.g.map.lineOfSight(eye, e.headCenter())) continue;
      out.push({ e, d });
    }
    out.sort((x, y) => x.d - y.d);
    return out;
  }

  pickGesture(dist) {
    const gs = this.a.hero.gestures;
    let best = 0;
    if (gs.includes('scope') && dist > 22) best = gs.indexOf('scope');
    else if (gs.includes('doubletap') && dist < 8) best = gs.indexOf('doubletap');
    else if (gs.includes('seal') && dist < 18) best = gs.indexOf('seal');
    else if (gs.includes('trinity') && dist > 16) best = gs.indexOf('trinity');
    else best = 0;
    if (this.a.setGesture(best)) this.g.onSwap(this.a);
  }

  update(dt) {
    const a = this.a, G = this.g, D = this.diff();
    if (!a.alive) return;
    this.thinkT -= dt; this.repath -= dt; this.spellT -= dt; this.strafeT -= dt;
    // --- perception
    if (this.thinkT <= 0) {
      this.thinkT = .2;
      const vis = this.visibleEnemies();
      const prev = this.target;
      this.target = vis.length ? vis[0].e : null;
      if (this.target && this.target !== prev) this.seenT = -D.react * (.7 + Math.random() * .6); // reaction delay
      if (this.target) { this.lastSeen = this.target.pos.clone(); this.pickGesture(vis[0].d); }
      // healer: find hurt ally in LOS
      this.healTarget = null;
      if (a.hero.id === 'mudra' && (!this.target || vis[0].d > 20)) {
        let worst = null;
        for (const o of G.actors) if (o !== a && o.alive && o.team === a.team && o.hp < o.maxHp * .8 && o.pos.distanceTo(a.pos) < 25 && G.map.lineOfSight(a.eye(), o.eye())) if (!worst || o.hp / o.maxHp < worst.hp / worst.maxHp) worst = o;
        this.healTarget = worst;
      }
    }
    if (this.target && !this.target.alive) this.target = null;
    this.seenT += dt;

    // --- movement goal
    const wish = this.wish.set(0, 0, 0);
    let sprint = false, jump = false;
    const tgt = this.target;
    if (tgt) {
      const dist = tgt.pos.distanceTo(a.pos);
      const pref = a.gesture.id === 'scope' ? 26 : a.gesture.id === 'doubletap' ? 5 : a.hero.id === 'gauntlet' ? 9 : 14;
      const to = tgt.pos.clone().sub(a.pos); to.y = 0; to.normalize();
      const side = new THREE.Vector3(-to.z, 0, to.x);
      if (this.strafeT <= 0) { this.strafe = Math.random() < .5 ? -1 : 1; this.strafeT = .6 + Math.random() * 1.2; }
      wish.addScaledVector(side, this.strafe * .8);
      if (dist > pref + 4) wish.addScaledVector(to, 1); else if (dist < pref - 4) wish.addScaledVector(to, -.8);
      if (Math.random() < dt * .3 && a.onGround) jump = true;
      this.path = []; this.goal = null;
    } else {
      if (!this.goal || this.repath <= 0 || a.pos.distanceTo(this.goal) < 2) this.chooseGoal();
      const next = this.path[0];
      if (next) {
        const to = next.clone().sub(a.pos); to.y = 0;
        if (to.length() < 1.2) this.path.shift();
        wish.copy(to.normalize()); sprint = true;
      }
    }
    if (wish.lengthSq() > 1) wish.normalize();

    // stuck detection → jump / repath
    if (a.pos.distanceTo(this.lastPos) < dt * 1.2 && wish.lengthSq() > .1) this.stuckT += dt; else this.stuckT = 0;
    this.lastPos.copy(a.pos);
    if (this.stuckT > .4) { jump = true; if (this.stuckT > 1.2) { this.chooseGoal(true); this.stuckT = 0; this.strafe *= -1; } }
    a.move(dt, wish, sprint, jump);

    // --- aim
    const lookAt = tgt ? tgt.pos.clone().setY(tgt.pos.y + (Math.random() < .3 ? 1.6 : 1.15)) : this.healTarget ? this.healTarget.eye() : (this.path[0] ? this.path[0].clone().setY(this.path[0].y + 1.6) : null);
    if (lookAt) {
      this.errT -= dt;
      if (this.errT <= 0) { this.errT = .35; const e = D.aimErr * (tgt ? Math.max(1, tgt.pos.distanceTo(a.pos) * .35) : 0); this.aimErr.set((Math.random() - .5) * e, (Math.random() - .5) * e * .7, (Math.random() - .5) * e); }
      if (tgt) { lookAt.add(this.aimErr); if (tgt.veilT > 0) lookAt.add(this.aimErr); }
      const d = lookAt.sub(a.eye());
      const yaw = Math.atan2(-d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      let dy = yaw - a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      const turn = 1 - Math.exp(-dt * (tgt ? 10 : 5));
      a.yaw += dy * turn; a.pitch += (pitch - a.pitch) * turn;
      a.aimT = tgt && a.gesture.id === 'scope' ? 1 : 0;
      // fire
      const shootAt = (tgt && this.seenT > 0 && Math.abs(dy) < .25) || (this.healTarget && !tgt && Math.abs(dy) < .2);
      if (shootAt && a.reloadT <= 0) {
        const g = a.gesture;
        G.combat.tryFire(a, a.eye().addScaledVector(a.lookDir(), .6).add(new THREE.Vector3(0, -.35, 0)), a.lookDir(), true, true);
      }
      if (!tgt && a.ammo[a.gesture.id] < a.gesture.mag * .5) a.startReload();
    }
    G.combat.updateBursts(dt, a);

    // --- spells
    if (this.spellT <= 0) { this.spellT = 1.5 + Math.random() * 2.5; this.useSpell(tgt); }
  }

  useSpell(tgt) {
    const a = this.a, C = this.g.combat, sp = a.hero.spells;
    const lowHp = a.hp < a.maxHp * .35;
    const d = tgt ? tgt.pos.distanceTo(a.pos) : 99;
    const tryC = (id, target) => sp.includes(id) && a.canCast(id) && C.cast(a, id, target);
    if (a.gesture.twoHand) { a.setGesture(0); }
    if (lowHp && (tryC('phase') || tryC('veil') || tryC('mirror') || tryC('spring', a.pos.clone()))) return;
    if (tgt) {
      if (d < 20 && Math.random() < .6 && tryC('fireball')) return;
      if (d < 8 && (tryC('ember') || tryC('purify'))) return;
      if (tryC('mirror')) return;
      if (d < 14 && tryC('snare', tgt.pos.clone())) return;
    } else {
      if (Math.random() < .3 && tryC('hexmine', a.pos.clone())) return;
      if (Math.random() < .3 && tryC('snare', a.pos.clone())) return;
      const hurt = this.g.actors.filter(o => o.alive && o.team === a.team && o.hp < o.maxHp * .6 && o.pos.distanceTo(a.pos) < 10);
      if (hurt.length && tryC('spring', hurt[0].pos.clone())) return;
    }
  }

  chooseGoal(random) {
    const a = this.a, G = this.g;
    let goal;
    if (!random && this.lastSeen && Math.random() < .6) { goal = this.lastSeen; this.lastSeen = null; }
    else {
      // head toward an enemy (roughly) half the time, otherwise contest a hotspot
      const enemies = G.actors.filter(e => e.alive && e.team !== a.team);
      if (!random && enemies.length && Math.random() < .45) goal = enemies[(Math.random() * enemies.length) | 0].pos.clone();
      else { const h = HOTSPOTS[(Math.random() * HOTSPOTS.length) | 0]; goal = new THREE.Vector3(h[0], h[2], h[1]); }
    }
    this.goal = goal;
    this.path = G.map.path(a.pos, goal);
    this.repath = 4 + Math.random() * 3;
  }
}
