import * as THREE from 'three';
import { GESTURES, SPELLS } from './data.js';
import { TEAM_COL } from './actor.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.bolts = [];
    this.zones = [];   // springs, mines, snares
    this.walls = [];   // mirror wards
    this.boltGeo = new THREE.SphereGeometry(.1, 8, 6);
    this.trailGeo = new THREE.CylinderGeometry(.045, .01, 1, 6); this.trailGeo.rotateX(Math.PI / 2); this.trailGeo.translate(0, 0, .5);
  }

  // ---------- weapons ----------
  tryFire(actor, origin, dir, trigger /* pressed this frame */, held) {
    const g = actor.gesture;
    if (!actor.alive || actor.reloadT > 0 || actor.swapT > 0) return false;
    if (actor.burst > 0) return false;
    if (actor.fireCd > 0) return false;
    if (!(g.auto ? held : trigger)) return false;
    if (actor.ammo[g.id] <= 0) { actor.startReload() && this.game.onReload(actor); return false; }
    actor.fireCd = g.rate / (actor.fireMul || 1);
    if (g.burst) { actor.burst = g.burst; actor.burstCd = 0; actor.burstOrigin = origin.clone(); actor.burstDir = dir.clone(); return true; }
    this.shoot(actor, origin, dir);
    return true;
  }

  shoot(actor, origin, dir) {
    const g = actor.gesture;
    actor.ammo[g.id]--; actor.stats.shots++;
    if (actor.veilT > 0) actor.veilT = Math.min(actor.veilT, .4); // firing breaks veil
    const spreadMul = actor.aimT > 0 ? .35 : 1;
    for (let i = 0; i < g.pellets; i++) {
      const d = dir.clone();
      const s = g.spread * spreadMul;
      d.x += (Math.random() - .5) * 2 * s; d.y += (Math.random() - .5) * 2 * s; d.z += (Math.random() - .5) * 2 * s; d.normalize();
      this.spawnBolt({ owner: actor, pos: origin.clone(), vel: d.multiplyScalar(g.speed), dmg: g.dmg * (actor.dmgMul || 1), hsMul: g.hsMul, color: actor.hero.id === 'mudra' ? 0x7dffb2 : g.color, weapon: g, heal: actor.hero.id === 'mudra', size: g.id === 'scope' ? 1.8 : g.pellets > 1 ? .7 : 1 });
    }
    this.game.onShoot(actor, g, origin);
  }

  spawnBolt(o) {
    const col = new THREE.Color(o.color);
    const m = new THREE.Mesh(this.boltGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2), toneMapped: false }));
    m.scale.setScalar(o.size || 1);
    const tr = new THREE.Mesh(this.trailGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.5), transparent: true, opacity: .8, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    tr.scale.set(o.size || 1, o.size || 1, 1.6 * (o.size || 1));
    this.game.scene.add(m, tr);
    this.bolts.push({ ...o, mesh: m, trail: tr, life: o.life ?? 1.4, grav: o.grav || 0, team: o.owner.team });
  }

  updateBursts(dt, actor) {
    if (actor.burst > 0) {
      actor.burstCd -= dt;
      if (actor.burstCd <= 0) {
        if (actor.ammo[actor.gesture.id] <= 0) { actor.burst = 0; return; }
        const o = actor.isPlayer ? this.game.muzzle() : actor.burstOrigin;
        const d = actor.isPlayer ? this.game.aimDir() : actor.lookDir();
        this.shoot(actor, o, d); actor.burst--; actor.burstCd = .07;
      }
    }
  }

  update(dt) {
    const G = this.game;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      _a.copy(b.pos);
      b.vel.y -= b.grav * dt;
      _b.copy(b.pos).addScaledVector(b.vel, dt);
      let hitT = G.map.raycast(_a, _b), hitActor = null, head = false;
      // mirror wards reflect enemy bolts
      for (const w of this.walls) {
        if (w.team === b.team) continue;
        const da = _a.clone().sub(w.pos).dot(w.normal), db = _b.clone().sub(w.pos).dot(w.normal);
        if (da > 0 && db <= 0) {
          const t = da / (da - db), p = _a.clone().lerp(_b, t);
          if (Math.abs(p.clone().sub(w.pos).dot(w.right)) < 1.6 && p.y > w.pos.y - .2 && p.y < w.pos.y + 2.6) {
            b.vel.reflect(w.normal); b.team = w.team; b.owner = w.owner; b.pos.copy(p).addScaledVector(w.normal, .05);
            G.fx.burst(p, 0x9fe0ff, 8, 4, .2, .25, 0); hitT = -1; break;
          }
        }
      }
      if (hitT === -1) continue;
      for (const act of G.actors) {
        if (act === b.owner || !act.alive) continue;
        if (act.team === b.team && !b.heal) continue;
        if (act.team === b.team && b.heal && act.hp >= act.maxHp) continue;
        const r = act.intersect(_a, _b);
        if (r && (hitT === null || r.t < hitT)) { hitT = r.t; hitActor = act; head = r.head; }
      }
      if (hitT !== null) {
        const p = _a.clone().lerp(_b, hitT);
        if (b.explode) this.explode(p, b.owner, b.explode.r, b.explode.dmg, b.weapon);
        else if (hitActor) {
          if (hitActor.team === b.team) { this.heal(hitActor, b.dmg * .8, b.owner); G.fx.burst(p, 0x7dffb2, 10, 3, .25, .4, -2); }
          else this.damage(hitActor, b.dmg * (head ? b.hsMul : 1), b.owner, b.weapon, head, p);
        } else {
          G.fx.burst(p, b.color, 8, 4, .18, .3, 5);
        }
        this.kill(i); continue;
      }
      b.pos.copy(_b);
      b.mesh.position.copy(b.pos);
      b.trail.position.copy(b.pos); b.trail.lookAt(_v.copy(b.pos).sub(b.vel));
      if (b.explode) G.fx.trail(b.pos, 0xff8030, .5);
      if (b.life <= 0) { if (b.explode) this.explode(b.pos, b.owner, b.explode.r, b.explode.dmg, b.weapon); this.kill(i); }
    }
    // zones
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]; z.t -= dt;
      if (z.type === 'spring') {
        if (Math.random() < dt * 30) G.fx.spawn(z.pos.clone().add(new THREE.Vector3((Math.random() - .5) * 5, 0, (Math.random() - .5) * 5)), new THREE.Vector3(0, 2.5, 0), 0x7dffb2, .3, .8, 0);
        for (const a of G.actors) if (a.alive && a.team === z.team && a.pos.distanceTo(z.pos) < 3.2) this.heal(a, 22 * dt, z.owner, true);
      } else {
        const trig = G.actors.find(a => a.alive && a.team !== z.team && a.pos.distanceTo(z.pos) < 1.6);
        if (trig) {
          if (z.type === 'mine') this.explode(z.pos.clone().setY(z.pos.y + .5), z.owner, 3, 55, { jp: 'ヘックスマイン', id: 'hexmine' });
          else { trig.rootT = 2.2; trig.revealT = 5; G.fx.ring(z.pos, 0xb070ff, 3, .6); G.audio.play('cast', { vol: .6 }); this.damage(trig, 10, z.owner, { jp: 'スネアルーン', id: 'snare' }, false, trig.eye()); }
          z.t = 0;
        }
      }
      if (z.t <= 0) { G.scene.remove(z.mesh); this.zones.splice(i, 1); }
    }
    for (let i = this.walls.length - 1; i >= 0; i--) { const w = this.walls[i]; w.t -= dt; w.mesh.material.opacity = .35 + Math.sin(performance.now() / 80) * .08; if (w.t <= 0) { G.scene.remove(w.mesh); this.walls.splice(i, 1); } }
  }

  kill(i) { const b = this.bolts[i]; this.game.scene.remove(b.mesh, b.trail); b.mesh.material.dispose(); b.trail.material.dispose(); this.bolts.splice(i, 1); }

  damage(target, amount, src, weapon, head, point) {
    const G = this.game;
    if (!target.alive || target.spawnProtect > 0) return;
    amount = Math.round(amount);
    target.hp -= amount;
    src.stats.dmg += amount; src.stats.hits++;
    if (head) src.stats.hs++;
    target.recentHits.set(src, performance.now());
    if (target.avatar) target.avatar.flash = 1;
    G.onDamage(target, amount, src, head, point);
    if (target.hp <= 0) {
      target.hp = 0; target.alive = false;
      G.onKill(target, src, weapon, head);
    }
  }

  heal(target, amount, src, quiet) {
    if (!target.alive) return;
    const h = Math.min(amount, target.maxHp - target.hp);
    if (h <= 0) return;
    target.hp += h; src.stats.heal += h;
    if (!quiet) this.game.audio.play('heal', { vol: .5 });
  }

  explode(p, owner, r, dmg, weapon) {
    const G = this.game;
    G.fx.burst(p, 0xff8030, 40, 10, .45, .7, 4); G.fx.burst(p, 0xffe070, 20, 6, .3, .5, 2); G.fx.ring(p, 0xff8030, r * 1.2, .45);
    G.fx.pop(p, 'ドカン!', 'hs');
    G.audio.play('explode', G.spatial(p));
    for (const a of G.actors) {
      if (!a.alive || (a.team === owner.team && a !== owner)) continue;
      const d = a.pos.clone().setY(a.pos.y + 1).distanceTo(p);
      if (d < r) this.damage(a, dmg * (a === owner ? .3 : 1) * (1 - d / r * .5), owner, weapon, false, p);
    }
    G.shake(p, .5);
  }

  // ---------- spells ----------
  // target: world point (for aimed spells)
  cast(actor, id, target) {
    const G = this.game, s = SPELLS[id];
    if (!actor.canCast(id)) return false;
    actor.mp -= s.cost; actor.cd[id] = s.cd;
    const eye = actor.eye(), dir = actor.lookDir();
    const tc = TEAM_COL[actor.team];
    switch (id) {
      case 'phase': {
        // Teleport ~12m along the look direction, passing through walls; land on whatever floor is there.
        const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
        let dist = target ? Math.min(14, new THREE.Vector3(target.x - actor.pos.x, 0, target.z - actor.pos.z).length()) : 12;
        let p = null;
        for (let d = dist; d > 1; d -= .5) {
          const q = actor.pos.clone().addScaledVector(flat, d);
          const top = G.map.groundAt(q.x, q.z, actor.pos.y + 3.5, .4, 0);
          if (!G.map.blocked(q.x, top, q.z, .4, 1.8, 0)) { p = new THREE.Vector3(q.x, top, q.z); break; }
        }
        if (!p) { actor.mp += s.cost; actor.cd[id] = 0; return false; }
        G.fx.burst(actor.eye(), 0x9f7bff, 30, 5, .3, .5, 0); G.fx.ring(actor.pos, 0x9f7bff, 2);
        actor.pos.copy(p); actor.vel.set(0, 0, 0);
        G.fx.burst(actor.eye(), 0x9f7bff, 30, 5, .3, .5, 0); G.fx.ring(p, 0x9f7bff, 2);
        G.audio.play('phase', G.spatial(p));
        break;
      }
      case 'veil': actor.veilT = 6; G.audio.play('veil', G.spatial(actor.pos)); G.fx.burst(actor.eye(), 0xd0c0ff, 25, 3, .3, .6, -1); break;
      case 'fireball':
        this.spawnBolt({ owner: actor, pos: eye.clone().addScaledVector(dir, .6), vel: dir.clone().multiplyScalar(26).add(new THREE.Vector3(0, 4, 0)), dmg: 0, color: 0xff6020, weapon: { jp: 'ファイアボール', id: 'fireball' }, explode: { r: 3.6, dmg: 60 }, grav: 12, life: 3, size: 3 });
        G.audio.play('fireball', G.spatial(eye));
        break;
      case 'mirror': {
        const n = new THREE.Vector3(dir.x, 0, dir.z).normalize();
        const pos = actor.pos.clone().addScaledVector(n, 1.6);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), new THREE.MeshBasicMaterial({ color: 0x80d8ff, transparent: true, opacity: .4, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        mesh.position.copy(pos).setY(pos.y + 1.3); mesh.lookAt(mesh.position.clone().add(n));
        G.scene.add(mesh);
        this.walls.push({ pos, normal: n, right: new THREE.Vector3(-n.z, 0, n.x), team: actor.team, owner: actor, t: 4, mesh });
        G.audio.play('cast', G.spatial(pos));
        break;
      }
      case 'hexmine': case 'snare': case 'spring': {
        const p = target ? target.clone() : actor.pos.clone().addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), 4);
        p.y = G.map.groundAt(p.x, p.z, p.y + 1, .1, 0);
        const col = id === 'spring' ? 0x7dffb2 : id === 'hexmine' ? 0xff4060 : 0xb070ff;
        const mesh = new THREE.Mesh(new THREE.RingGeometry(id === 'spring' ? 2.8 : .7, id === 'spring' ? 3.2 : 1, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: id === 'spring' ? .7 : (actor.team === G.player.team ? .8 : .12), side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2; mesh.position.copy(p).setY(p.y + .06); G.scene.add(mesh);
        this.zones.push({ type: id === 'spring' ? 'spring' : id === 'hexmine' ? 'mine' : 'snare', pos: p, team: actor.team, owner: actor, t: id === 'spring' ? 6 : 25, mesh });
        G.fx.ring(p, col, 3); G.audio.play(id === 'spring' ? 'heal' : 'cast', G.spatial(p));
        break;
      }
      case 'ember': {
        G.audio.play('fireball', G.spatial(eye));
        for (let k = 0; k < 60; k++) { const a = (Math.random() - .5) * .8, sp = 10 + Math.random() * 6; const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a); d.y = Math.random() * .2; G.fx.spawn(eye.clone().add(new THREE.Vector3(0, -.5, 0)), d.multiplyScalar(sp), k % 2 ? 0xff6020 : 0xffd040, .5, .6, 0); }
        for (const a of G.actors) {
          if (!a.alive || a.team === actor.team) continue;
          const to = a.pos.clone().sub(actor.pos); const d = to.length(); to.y = 0; to.normalize();
          const fd = new THREE.Vector3(dir.x, 0, dir.z).normalize();
          if (d < 9 && to.dot(fd) > .75 && G.map.lineOfSight(eye, a.eye())) this.damage(a, 45, actor, { jp: 'エンバーウェイブ', id: 'ember' }, false, a.eye());
        }
        break;
      }
      case 'purify': {
        G.fx.ring(actor.pos, 0xfff0a0, 7, .6); G.fx.burst(actor.eye(), 0xfff0a0, 40, 8, .3, .5, 0); G.audio.play('heal', G.spatial(actor.pos));
        for (const a of G.actors) {
          if (!a.alive || a.pos.distanceTo(actor.pos) > 6.5) continue;
          if (a.team === actor.team) this.heal(a, 35, actor, true); else this.damage(a, 30, actor, { jp: 'ピュリファイウェイブ', id: 'purify' }, false, a.eye());
        }
        break;
      }
    }
    G.onCast(actor, id, tc);
    return true;
  }
}
