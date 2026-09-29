import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GameMap } from './map.js';
import { Hands } from './hands.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Actor } from './actor.js';
import { Combat } from './combat.js';
import { BotBrain } from './bot.js';
import { HEROES, GESTURES, SPELLS, BOT_NAMES, DIFFICULTY, MATCH } from './data.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');
const SIM = +(params.get('sim') || 1); // logic steps per rendered frame (headless verification)

class Game {
  constructor() {
    this.canvas = $('#gl');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: params.has('shots') });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, params.has('lowres') ? 1 : 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !params.has('noshadow'); this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x2a1454, .011);
    this.sky();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .03, 600);
    this.scene.add(this.camera);
    this.baseFov = 72;

    const hemi = new THREE.HemisphereLight(0x9f86ff, 0x3a1850, 1.6); this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xd8c0ff, 1.5); moon.position.set(30, 60, -40);
    moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 160 }); moon.shadow.bias = -.0008;
    this.scene.add(moon);
    this.scene.add(new THREE.AmbientLight(0x6040a0, .5));

    this.map = new GameMap(this.scene);
    this.fx = new FX(this.scene, this.camera);
    this.hands = new Hands(this.camera);
    this.audio = new Audio();
    this.combat = new Combat(this);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .85, .55, .72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.keys = {}; this.mouse = { l: false, r: false, lp: false }; this.dx = 0; this.dy = 0;
    this.heroIdx = 0; this.diffIdx = 1; this.diff = DIFFICULTY[1];
    this.state = 'title'; this.actors = []; this.shakeAmt = 0;
    this.clock = new THREE.Clock();
    this.orbit = 0;
    this.buildUI(); this.bindInput();
    addEventListener('resize', () => this.resize());
    window.__game = this;
    this.renderer.setAnimationLoop(() => this.frame());
    if (params.get('screen')) this.go(params.get('screen'));
    if (AUTO) { this.heroIdx = +(params.get('hero') || 0); setTimeout(() => this.startMatch(), 200); }
  }

  sky() {
    const g = new THREE.SphereGeometry(400, 32, 16);
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vp; void main(){ vp=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vp; void main(){ float h=normalize(vp).y; vec3 top=vec3(.12,.05,.32), mid=vec3(.42,.16,.55), low=vec3(.95,.38,.62); vec3 c=mix(low,mid,smoothstep(-.05,.18,h)); c=mix(c,top,smoothstep(.18,.7,h)); gl_FragColor=vec4(c,1.); }' });
    this.scene.add(new THREE.Mesh(g, m));
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
  }

  // ================= UI =================
  buildUI() {
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { this.audio.init().then(() => this.audio.play('ui')); this.go(b.dataset.go); }));
    // gesture chart
    const users = id => HEROES.filter(h => h.gestures.includes(id)).map(h => h.jp).join('・');
    $('#gchart').innerHTML = Object.values(GESTURES).map(g => `<div class="gitem">${g.twoHand ? '<span class="two">両手</span>' : ''}<b>${g.emoji} ${g.jp}</b><br><small style="margin:0">${g.en}</small><br><b style="font-size:12px">${g.mode}</b><br><span style="font-size:11px;color:#7a6d91">${users(g.id)}</span></div>`).join('');
    // hero cards
    $('#heroes').innerHTML = HEROES.map((h, i) => `
      <div class="hero" data-i="${i}">
        <div class="top" style="background:${h.color}"><div class="ic">${h.emoji}</div><div><div class="nm">${h.name}</div><span class="jp">${h.jp}</span><span class="role">${h.role} ${h.roleEn}</span></div><div class="num">${i + 1}</div><div class="sel">SELECT!</div></div>
        <div class="body">
          <div class="title">「${h.title}」 <small>${h.titleEn}</small></div>
          <div>${h.desc}</div>
          ${[['体力', h.hp, 220, '#36d07f'], ['魔力', h.mp, 150, '#8b6bff'], ['速さ', h.speed, 7.5, '#ffcc33']].map(([n, v, mx, c]) => `<div class="stat"><span>${n}</span><div class="t"><i style="width:${v / mx * 100}%;background:${c}"></i></div><span>${v}</span></div>`).join('')}
          <div class="sec">右手ジェスチャー <small>GESTURES</small></div>
          ${h.gestures.map((g, k) => `<div class="row"><span class="k">${k + 1}</span>${GESTURES[g].emoji} <b>${GESTURES[g].jp}</b> <small>${GESTURES[g].en}</small><span class="tag ${GESTURES[g].twoHand ? 'two' : ''}">${GESTURES[g].twoHand ? '両手' : '片手'}</span></div>`).join('')}
          <div class="sec">左手の魔法 <small>SPELLS</small></div>
          ${h.spells.map(s => `<div class="row"><span class="k">${SPELLS[s].key}</span>${SPELLS[s].emoji}<div><b>${SPELLS[s].jp}</b><span class="d">${SPELLS[s].desc}</span></div></div>`).join('')}
        </div>
      </div>`).join('');
    document.querySelectorAll('.hero').forEach(el => el.addEventListener('click', () => { this.selectHero(+el.dataset.i); this.audio.play('ui'); }));
    document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => { this.diffIdx = +b.dataset.diff; this.diff = DIFFICULTY[this.diffIdx]; document.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('on', x === b)); this.audio.play('ui'); }));
    $('#sortie').addEventListener('click', () => this.startMatch());
    $('#resume').addEventListener('click', () => this.resume());
    this.selectHero(0);
  }

  selectHero(i) {
    this.heroIdx = (i + HEROES.length) % HEROES.length;
    document.querySelectorAll('.hero').forEach((el, k) => el.classList.toggle('on', k === this.heroIdx));
    $('#sortie-name').textContent = HEROES[this.heroIdx].jp;
  }

  go(name) {
    for (const s of ['title', 'howto', 'select']) $('#scr-' + s).classList.toggle('hidden', s !== name);
    $('#scr-result').classList.add('hidden'); $('#pause').classList.add('hidden'); $('#hud').classList.add('hidden'); $('#board').classList.add('hidden');
    if (['title', 'howto', 'select'].includes(name)) {
      this.state = 'menu';
      this.clearMatch();
      if (document.pointerLockElement) document.exitPointerLock();
      this.audio.init().then(() => this.audio.music('title'));
    }
  }

  // ================= INPUT =================
  bindInput() {
    addEventListener('keydown', e => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (this.state === 'menu' && !$('#scr-select').classList.contains('hidden')) {
        if (e.code === 'ArrowLeft') this.selectHero(this.heroIdx - 1);
        if (e.code === 'ArrowRight') this.selectHero(this.heroIdx + 1);
        if (e.code === 'Enter') this.startMatch();
      }
      if (e.code === 'Escape' && !$('#scr-howto').classList.contains('hidden')) this.go('title');
      if (this.state !== 'play' && this.state !== 'countdown') return;
      const p = this.player;
      if (e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (p.setGesture(i)) this.onSwap(p); }
      if (e.code === 'KeyR' && p.startReload()) this.onReload(p);
      if (['KeyQ', 'KeyE', 'KeyF'].includes(e.code)) this.spellDown(e.code.slice(3));
      if (e.code === 'F9') { e.preventDefault(); this.toggleRecord(); }
      if (e.code === 'Tab') this.showBoard(true);
    });
    addEventListener('keyup', e => {
      this.keys[e.code] = false;
      if (['KeyQ', 'KeyE', 'KeyF'].includes(e.code)) this.spellUp(e.code.slice(3));
      if (e.code === 'Tab') this.showBoard(false);
    });
    this.canvas.addEventListener('mousedown', e => {
      if (this.state === 'play' && !document.pointerLockElement) { this.canvas.requestPointerLock(); return; }
      if (e.button === 0) { this.mouse.l = true; this.mouse.lp = true; }
      if (e.button === 2) this.mouse.r = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => { if (document.pointerLockElement) { this.dx += e.movementX; this.dy += e.movementY; } });
    addEventListener('wheel', e => { if (this.state !== 'play') return; const p = this.player; const n = p.hero.gestures.length; if (p.setGesture((p.gIdx + (e.deltaY > 0 ? 1 : -1) + n) % n)) this.onSwap(p); });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.state === 'play' && !AUTO && !this.recording) this.pause(); });
  }

  pause() { this.state = 'paused'; $('#pause').classList.remove('hidden'); }
  resume() { $('#pause').classList.add('hidden'); this.state = 'play'; this.canvas.requestPointerLock(); }

  // ================= MATCH =================
  clearMatch() {
    for (const a of this.actors) if (a.avatar) this.scene.remove(a.avatar.root);
    this.actors = []; this.player = null;
    for (let i = this.combat.bolts.length - 1; i >= 0; i--) this.combat.kill(i);
    for (const z of this.combat.zones) this.scene.remove(z.mesh);
    for (const w of this.combat.walls) this.scene.remove(w.mesh);
    this.combat.zones = []; this.combat.walls = [];
    $('#killfeed').innerHTML = '';
  }

  async startMatch() {
    await this.audio.init();
    this.clearMatch();
    for (const s of ['title', 'howto', 'select']) $('#scr-' + s).classList.add('hidden');
    $('#scr-result').classList.add('hidden'); $('#hud').classList.remove('hidden');
    const hero = HEROES[this.heroIdx];
    this.player = new Actor(this, { name: 'YOU', team: 'azure', hero, isPlayer: true });
    this.actors.push(this.player);
    const botHeroes = { azure: [HEROES[1], HEROES[2], HEROES[0]], blaze: [HEROES[2], HEROES[1], HEROES[0], HEROES[0]] };
    for (const team of ['azure', 'blaze']) BOT_NAMES[team].forEach((n, i) => {
      const a = new Actor(this, { name: n, team, hero: botHeroes[team][i] });
      a.brain = new BotBrain(a, this); a.fireMul = this.diff.fireMul; a.dmgMul = this.diff.dmgMul;
      this.actors.push(a);
    });
    if (AUTO) { this.player.brain = new BotBrain(this.player, this); this.player.fireMul = 1; this.player.dmgMul = 1; }
    this.actors.forEach(a => this.spawn(a, true));
    this.score = { azure: 0, blaze: 0 }; this.timeLeft = MATCH.time; this.multi = { n: 0, t: 0 };
    this.hands.setGesture(this.player.gesture.id, this.player.gesture.twoHand, this.player.gesture.color);
    this.buildHudBars();
    this.state = 'countdown'; this.countT = 2.99;
    this.audio.music('battle');
    if (!AUTO) this.canvas.requestPointerLock?.();
  }

  spawn(a, initial) {
    const list = this.map.spawns[a.team];
    const idx = initial ? this.actors.filter(x => x.team === a.team).indexOf(a) % list.length : (Math.random() * list.length) | 0;
    a.spawnAt(list[idx], a.team === 'azure' ? 0 : Math.PI);
  }

  onShoot(a, g, origin) {
    if (a.isPlayer) { this.hands.fire(); this.audio.play(g.id); this.shakeAmt = Math.max(this.shakeAmt, g.id === 'scope' ? .5 : g.pellets > 1 ? .35 : .1);
      if (Math.random() < (g.id === 'scope' ? 1 : .18)) this.fx.pop(this.muzzle().addScaledVector(this.aimDir(), 3), g.onoma[(Math.random() * g.onoma.length) | 0]); }
    else { this.audio.play(g.id, this.spatial(origin)); if (a.avatar) a.avatar.glow.material.opacity = 1; if (Math.random() < .06) this.fx.pop(origin.clone(), g.onoma[0]); }
    if (!a.isPlayer) this.fx.burst(origin, g.color, 4, 2, .2, .12, 0);
  }

  onSwap(a) { if (a.isPlayer) { this.hands.setGesture(a.gesture.id, a.gesture.twoHand, a.gesture.color); this.audio.play('swap'); this.buildHudBars(); } }
  onReload(a) { if (a.isPlayer) { this.audio.play('reload'); } else this.audio.play('reload', { ...this.spatial(a.pos), vol: this.spatial(a.pos).vol * .5 }); }
  onCast(a, id) { if (a.isPlayer) { this.hands.doCast(); } }

  onDamage(t, amount, src, head, point) {
    if (src.isPlayer) {
      const hm = $('#hitmark'); hm.classList.add('on'); hm.classList.toggle('kill', t.hp <= 0); setTimeout(() => hm.classList.remove('on'), 90);
      this.audio.play(head ? 'headshot' : 'hit');
      if (head) this.fx.pop(point, 'HEADSHOT!', 'hs');
      else if (Math.random() < .3) this.fx.pop(point, ['POW!', 'BAM!', 'ZAP!'][(Math.random() * 3) | 0]);
    }
    if (t.isPlayer) { this.audio.play('hurt'); this.shakeAmt = Math.max(this.shakeAmt, .4); this.hurtFlash = 1; }
    this.fx.burst(point, head ? 0xffe070 : 0xff5aa0, head ? 18 : 10, 5, .25, .4, 6);
  }

  onKill(victim, killer, weapon, head) {
    victim.stats.d++; victim.stats.streak = 0; victim.respawnT = MATCH.respawn;
    victim.killer = killer; victim.killWeapon = weapon;
    const team = killer.team !== victim.team ? killer.team : (victim.team === 'azure' ? 'blaze' : 'azure');
    this.score[team]++;
    if (killer !== victim) { killer.stats.k++; killer.stats.streak++; killer.stats.best = Math.max(killer.stats.best, killer.stats.streak); }
    const now = performance.now();
    for (const [a, t] of victim.recentHits) if (a !== killer && a.team !== victim.team && now - t < 5000) { a.stats.a++; if (a.isPlayer) this.fx.banner('アシスト ' + victim.name, 'jp'); }
    victim.recentHits.clear();
    const p = victim.eye();
    this.fx.burst(p, victim.team === 'azure' ? 0x2fb4ff : 0xff5a3c, 50, 9, .4, .9, 5);
    this.fx.burst(p, 0xffffff, 20, 4, .3, .6, -2);
    this.fx.ring(victim.pos, victim.team === 'azure' ? 0x2fb4ff : 0xff5a3c, 3);
    this.fx.pop(p, head ? 'HEADSHOT KO!' : 'KO!', 'hs');
    if (victim.avatar) victim.avatar.root.visible = false;
    this.audio.play('death', this.spatial(p));
    if (killer.isPlayer) {
      this.audio.play('kill');
      if (now - this.multi.t < 4000) this.multi.n++; else this.multi.n = 1;
      this.multi.t = now;
      const names = ['', '', 'ダブルキル！', 'トリプルキル！', 'クアドラキル！', 'ヘックスエース！'];
      if (this.multi.n >= 2) this.fx.banner(names[Math.min(this.multi.n, 5)], 'jp');
    }
    if (victim.isPlayer) { this.audio.play('death'); $('#killer-name').textContent = killer.name; $('#killer-weapon').textContent = `${weapon.emoji || '✨'} ${weapon.jp}`; }
    // kill feed
    const kf = document.createElement('div'); kf.className = 'kf';
    const nm = a => `<span class="${a.team === 'azure' ? 'a' : 'b'} ${a.isPlayer ? 'me' : ''}">${a.name}</span>`;
    kf.innerHTML = `${nm(killer)} ${weapon.emoji || '✨'}${head ? '🎯' : ''} ${nm(victim)}`;
    $('#killfeed').prepend(kf); setTimeout(() => kf.remove(), 6000);
    while ($('#killfeed').children.length > 6) $('#killfeed').lastChild.remove();
    if (this.score[team] >= MATCH.killsToWin) this.endMatch();
  }

  endMatch() {
    this.state = 'over'; this.hands.group.visible = false; $('#center-msg').innerHTML = '';
    if (document.pointerLockElement) document.exitPointerLock();
    const win = this.score.azure > this.score.blaze ? 'azure' : this.score.blaze > this.score.azure ? 'blaze' : null;
    this.audio.music('victory');
    this.audio.play(win === 'azure' ? 'kill' : 'death');
    const all = [...this.actors].sort((a, b) => b.stats.k - a.stats.k || b.stats.dmg - a.stats.dmg);
    const mvp = all[0];
    const p = this.player.stats;
    const acc = p.shots ? Math.round(p.hits / p.shots * 100) : 0;
    const el = $('#scr-result');
    el.innerHTML = `
      <div class="victory ${win === 'azure' ? '' : 'lose'}">${win === 'azure' ? 'VICTORY!' : win ? 'DEFEAT...' : 'DRAW'}<small>${win === 'azure' ? '勝利！' : win ? '敗北…' : '引き分け'}</small></div>
      <div class="final"><span class="a">${this.score.azure}</span> : <span class="b">${this.score.blaze}</span></div>
      <div class="chips"><span class="chip">🏆 MVP <b>${mvp.name}</b> ${mvp.hero.jp} ${mvp.stats.k}/${mvp.stats.d}/${mvp.stats.a}</span></div>
      ${this.boardHTML(mvp)}
      <div class="chips">${[['キル', p.k], ['デス', p.d], ['アシスト', p.a], ['ダメージ', Math.round(p.dmg)], ['回復', Math.round(p.heal)], ['命中率', acc + '%'], ['ヘッドショット', p.hs], ['最大連続キル', p.best], ['難易度', this.diff.name]].map(([k, v]) => `<span class="chip">${k} <b>${v}</b></span>`).join('')}</div>
      <div class="res-btns"><button class="btn big pink" id="again">もう一回 <small>REMATCH</small></button><button class="btn" id="tosel">ヒーロー選択 <small>HERO SELECT</small></button><button class="btn" id="totitle">タイトル <small>TITLE</small></button></div>`;
    el.classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#board').classList.add('hidden');
    $('#again').onclick = () => this.startMatch(); $('#tosel').onclick = () => this.go('select'); $('#totitle').onclick = () => this.go('title');
    window.__result = { score: { ...this.score }, win, player: { ...p }, mvp: mvp.name };
  }

  boardHTML(mvp) {
    const t = team => {
      const rows = this.actors.filter(a => a.team === team).sort((a, b) => b.stats.k - a.stats.k);
      return `<div class="tbl ${team}"><h4><span>${team.toUpperCase()} ${team === 'azure' ? 'アズール' : 'ブレイズ'}</span><span>${this.score[team]}</span></h4><table><tr><th>名前</th><th>K</th><th>D</th><th>A</th><th>ダメージ</th><th>回復</th></tr>
        ${rows.map(a => `<tr class="${a.isPlayer ? 'you' : ''}"><td>${a.hero.emoji} ${a.name} ${a === mvp ? '<span class="mvp">MVP</span>' : ''}<span class="sub">${a.hero.jp}・${a.hero.role}</span></td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.a}</td><td>${Math.round(a.stats.dmg)}</td><td>${Math.round(a.stats.heal)}</td></tr>`).join('')}</table></div>`;
    };
    return `<div class="tables">${t('azure')}${t('blaze')}</div>`;
  }

  showBoard(on) { const b = $('#board'); if (on && this.player) { b.innerHTML = this.boardHTML(); b.classList.remove('hidden'); } else b.classList.add('hidden'); }

  // ================= HUD =================
  buildHudBars() {
    const p = this.player, h = p.hero;
    $('#me-icon').textContent = h.emoji; $('#me-name').textContent = h.name; $('#me-jp').textContent = h.jp; $('#me-role').textContent = h.role;
    $('#gest-bar').innerHTML = h.gestures.map((g, i) => `<div class="g ${i === p.gIdx ? 'on' : ''}"><span class="key">${i + 1}</span>${GESTURES[g].twoHand ? '<span class="two">両手</span>' : ''}<span class="e">${GESTURES[g].emoji}</span>${GESTURES[g].jp}<div class="ammo" id="ammo-${g}"></div></div>`).join('');
    $('#spell-bar').innerHTML = h.spells.map(s => `<div class="sp" id="sp-${s}"><span class="key">${SPELLS[s].key}</span>${SPELLS[s].emoji}<span class="cost">◆${SPELLS[s].cost}</span><div class="cdv hidden"></div></div>`).join('');
  }

  updateHud() {
    const p = this.player;
    $('#s-azure').textContent = this.score.azure; $('#s-blaze').textContent = this.score.blaze;
    const t = Math.max(0, Math.ceil(this.timeLeft)); $('#clock').textContent = `${t / 60 | 0}:${String(t % 60).padStart(2, '0')}`;
    $('#hp-fill').style.width = (p.hp / p.maxHp * 100) + '%'; $('#hp-fill').classList.toggle('low', p.hp < p.maxHp * .35); $('#hp-txt').textContent = Math.ceil(p.hp);
    $('#mp-fill').style.width = (p.mp / p.maxMp * 100) + '%'; $('#mp-txt').textContent = Math.floor(p.mp);
    for (const g of p.hero.gestures) {
      const el = document.getElementById('ammo-' + g); if (!el) continue;
      const G = GESTURES[g], n = Math.min(G.mag, 13), filled = Math.ceil(p.ammo[g] / G.mag * n);
      const key = filled + '/' + n; if (el.dataset.k !== key) { el.dataset.k = key; el.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < filled ? '' : 'x'}"></i>`).join(''); }
    }
    for (const s of p.hero.spells) {
      const el = document.getElementById('sp-' + s); if (!el) continue;
      const cd = p.cd[s]; const cdv = el.querySelector('.cdv');
      cdv.classList.toggle('hidden', cd <= 0); if (cd > 0) cdv.textContent = cd.toFixed(1);
      el.classList.toggle('locked', p.gesture.twoHand); el.classList.toggle('charging', this.charging === s);
      el.style.opacity = p.mp < SPELLS[s].cost ? .55 : 1;
    }
    document.querySelectorAll('#gest-bar .g').forEach((el, i) => el.classList.toggle('on', i === p.gIdx));
    $('#reload-tip').textContent = p.reloadT > 0 ? 'フーッ… RELOADING' : p.ammo[p.gesture.id] === 0 ? 'R でリロード' : this.charging ? `${SPELLS[this.charging].jp} — 離して発動` : '';
    $('#death').classList.toggle('hidden', p.alive); if (!p.alive) $('#respawn-cd').textContent = Math.ceil(p.respawnT);
    const scoped = p.alive && p.gesture.id === 'scope' && p.aimT > 0;
    $('#scope').classList.toggle('hidden', !scoped); $('#crosshair').classList.toggle('hidden', scoped || !p.alive);
  }

  // ================= PLAYER =================
  muzzle() { return this.hands.muzzle(new THREE.Vector3()); }
  aimDir() {
    const cd = new THREE.Vector3(); this.camera.getWorldDirection(cd);
    const cp = this.camera.getWorldPosition(new THREE.Vector3());
    const far = cp.clone().addScaledVector(cd, 200);
    const t = this.map.raycast(cp, far);
    let target = t !== null ? cp.clone().lerp(far, t) : far;
    // aim-assist-free: also consider actors under the crosshair
    for (const a of this.actors) { if (a === this.player) continue; const r = a.intersect(cp, far); if (r && (t === null || r.t < t)) target = cp.clone().lerp(far, r.t); }
    return target.sub(this.muzzle()).normalize();
  }
  aimPoint(maxD = 16) {
    const cd = new THREE.Vector3(); this.camera.getWorldDirection(cd);
    const cp = this.camera.getWorldPosition(new THREE.Vector3());
    const far = cp.clone().addScaledVector(cd, maxD);
    const t = this.map.raycast(cp, far);
    return t !== null ? cp.lerp(far, t) : far;
  }

  spellIdFor(key) { return this.player.hero.spells.find(s => SPELLS[s].key === key); }
  spellDown(key) {
    const id = this.spellIdFor(key); if (!id) return;
    if (SPELLS[id].cast === 'aim') { if (this.player.canCast(id)) this.charging = id; }
    else this.combat.cast(this.player, id);
  }
  spellUp(key) {
    const id = this.spellIdFor(key);
    if (id && this.charging === id) { this.combat.cast(this.player, id, this.aimPoint()); this.charging = null; }
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;
    if (p.brain) { p.brain.update(dt); return; }
    const sens = .0022 * (p.aimT > 0 && p.gesture.id === 'scope' ? .4 : 1);
    p.yaw -= this.dx * sens; p.pitch -= this.dy * sens; p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch)); this.dx = this.dy = 0;
    const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3();
    if (this.keys.KeyW) wish.add(f); if (this.keys.KeyS) wish.sub(f); if (this.keys.KeyD) wish.add(r); if (this.keys.KeyA) wish.sub(r);
    if (wish.lengthSq()) wish.normalize();
    p.move(dt, wish, this.keys.ShiftLeft || this.keys.ShiftRight, this.keys.Space);
    if (p.jumped) { p.jumped = false; this.audio.play('jump'); }
    this.stepT = (this.stepT || 0) + dt * Math.hypot(p.vel.x, p.vel.z);
    if (p.onGround && this.stepT > 2.4) { this.stepT = 0; this.audio.play('step'); }
    p.aimT = this.mouse.r ? 1 : 0;
    if (this.state === 'play') this.combat.tryFire(p, this.muzzle(), this.aimDir(), this.mouse.lp, this.mouse.l);
    this.mouse.lp = false;
    this.combat.updateBursts(dt, p);
  }

  updateCamera(dt) {
    const p = this.player;
    this.camera.position.copy(p.eye());
    if (!p.alive && p.killer) { // death cam: look at killer
      const back = p.eye().add(new THREE.Vector3(0, 1.5, 0));
      this.camera.position.lerp(back, .5);
      this.camera.lookAt(p.killer.eye());
    } else this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    if (this.shakeAmt > 0) { this.camera.rotation.x += (Math.random() - .5) * this.shakeAmt * .03; this.camera.rotation.y += (Math.random() - .5) * this.shakeAmt * .03; this.shakeAmt = Math.max(0, this.shakeAmt - dt * 3); }
    const targetFov = p.aimT > 0 ? (p.gesture.id === 'scope' ? 26 : 58) : (Math.hypot(p.vel.x, p.vel.z) > p.speed * 1.2 ? 78 : this.baseFov);
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-dt * 14)); this.camera.updateProjectionMatrix();
    this.hands.group.visible = p.alive;
    this.hands.update(dt, Math.hypot(p.vel.x, p.vel.z), p.aimT > 0, p.reloadT > 0 ? 1 - p.reloadT / p.gesture.reload : 0, !!this.charging);
  }

  shake(p, a) { const d = p.distanceTo(this.camera.position); this.shakeAmt = Math.max(this.shakeAmt, a * Math.max(0, 1 - d / 20)); }
  spatial(p) {
    const cp = this.camera.position, d = p.distanceTo(cp);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const dir = p.clone().sub(cp).normalize();
    return { vol: Math.max(0, 1 - d / 45) ** 1.6, pan: dir.dot(right) * .8 };
  }

  // ================= RECORD (F9) =================
  toggleRecord() {
    if (this.recorder) { this.recorder.stop(); return; }
    const stream = this.canvas.captureStream(60);
    if (this.audio.recDest) this.audio.recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const chunks = []; this.recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
    this.recorder.ondataavailable = e => chunks.push(e.data);
    this.recorder.onstop = () => {
      const blob = new Blob(chunks, { type }); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `hexslinger_${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
      this.recorder = null; this.recording = false; $('#rec').classList.add('hidden');
    };
    this.recorder.start(); this.recording = true; $('#rec').classList.remove('hidden');
  }

  // ================= LOOP =================
  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.state === 'menu' || this.state === 'title') {
      this.orbit += dt * .05;
      this.camera.position.set(Math.cos(this.orbit) * 34, 16, Math.sin(this.orbit) * 34); this.camera.lookAt(0, 3, 0);
      this.hands.group.visible = false;
    }
    if (this.state === 'countdown') {
      this.countT -= SIM > 1 ? 1 : dt;
      const n = Math.ceil(this.countT);
      if (n !== this.lastCount) { this.lastCount = n; this.audio.play(n > 0 ? 'countdown' : 'go'); }
      $('#center-msg').innerHTML = n > 0 ? `${n}<small>よーい… READY?</small>` : 'GO!';
      this.updatePlayerLookOnly();
      for (const a of this.actors) a.update(0);
      if (this.countT <= 0) { this.state = 'play'; setTimeout(() => { if (this.state === 'play') $('#center-msg').innerHTML = ''; }, 600); }
    }
    const steps = this.state === 'play' ? SIM : 1;
    for (let k = 0; k < steps && this.state === 'play'; k++) this.step(SIM > 1 ? 1 / 30 : dt);
    if (this.player && (this.state === 'play' || this.state === 'countdown' || this.state === 'paused')) { this.updateCamera(this.state === 'paused' ? 0 : dt); this.updateHud(); }
    this.fx.update(dt);
    this.composer.render();
  }

  step(dt) {
    {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); }
      this.updatePlayer(dt);
      for (const a of this.actors) {
        if (a.brain && !a.isPlayer) a.brain.update(dt);
        if (!a.alive) { a.respawnT -= dt; if (a.respawnT <= 0) this.spawn(a); }
        a.update(dt);
      }
      this.combat.update(dt);
      if (SIM > 1) this.fx.update(dt);
    }
  }

  updatePlayerLookOnly() {
    const p = this.player; if (p.brain) return;
    p.yaw -= this.dx * .0022; p.pitch -= this.dy * .0022; p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch)); this.dx = this.dy = 0;
  }
}

new Game();
