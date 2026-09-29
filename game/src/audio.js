// Audio engine.
// Everything has a synthesized Web Audio fallback, so the game is fully playable with zero asset files.
// Generated assets (Lyria music / ElevenLabs SFX produced by the dedicated audio session) are dropped into
// public/audio/ and listed in public/audio/manifest.json:
//   { "music": { "title": "bgm_title.mp3", "battle": "bgm_battle.mp3", "victory": "jingle_victory.mp3" },
//     "sfx":   { "fingergun": "sfx_fingergun.mp3", "doubletap": "...", "kill": "...", ... } }
// Any key present in the manifest overrides the synthesized version.

export class Audio {
  constructor() {
    this.ctx = null; this.buffers = {}; this.manifest = { music: {}, sfx: {} };
    this.musicNode = null; this.musicName = null; this.seqTimer = null;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = .8;
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = .9;
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = .42;
    this.comp = this.ctx.createDynamicsCompressor();
    this.sfxBus.connect(this.master); this.musicBus.connect(this.master); this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
    this.recDest = this.ctx.createMediaStreamDestination(); this.comp.connect(this.recDest);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    try {
      const r = await fetch('./audio/manifest.json');
      if (r.ok) this.manifest = Object.assign(this.manifest, await r.json());
    } catch { /* no generated assets: synth only */ }
    const all = [...Object.entries(this.manifest.music || {}).map(([k, v]) => ['music:' + k, v]), ...Object.entries(this.manifest.sfx || {}).map(([k, v]) => ['sfx:' + k, v])];
    await Promise.all(all.map(async ([k, f]) => {
      try { const b = await (await fetch('./audio/' + f)).arrayBuffer(); this.buffers[k] = await this.ctx.decodeAudioData(b); } catch { /* keep synth */ }
    }));
  }

  // ---------- SFX ----------
  play(name, { vol = 1, pan = 0, rate = 1 } = {}) {
    if (!this.ctx) return;
    const out = this.ctx.createStereoPanner(); out.pan.value = Math.max(-1, Math.min(1, pan));
    const g = this.ctx.createGain(); g.gain.value = vol; g.connect(out); out.connect(this.sfxBus);
    const buf = this.buffers['sfx:' + name];
    if (buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate * (0.96 + Math.random() * .08); s.connect(g); s.start(); return; }
    const fn = this['s_' + name]; if (fn) fn.call(this, g, this.ctx.currentTime, rate);
  }

  osc(type, f0, f1, t, dur, dest, vol = .5, attack = .003) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .02);
  }
  nz(t, dur, dest, vol = .5, type = 'bandpass', f0 = 1200, f1 = 800, q = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
  }

  s_fingergun(d, t) { this.osc('square', 1400, 180, t, .12, d, .22); this.osc('sine', 2600, 900, t, .08, d, .2); this.nz(t, .08, d, .35, 'highpass', 3000, 1500); }
  s_doubletap(d, t) { this.nz(t, .22, d, .7, 'lowpass', 3000, 300); this.osc('sawtooth', 320, 60, t, .2, d, .3); this.osc('square', 900, 200, t + .02, .1, d, .15); }
  s_scope(d, t) { this.osc('sawtooth', 2400, 80, t, .45, d, .3); this.nz(t, .3, d, .5, 'bandpass', 5000, 400, .7); this.osc('sine', 120, 40, t, .4, d, .5); }
  s_horns(d, t) { this.osc('square', 900, 300, t, .07, d, .18); this.nz(t, .05, d, .3, 'bandpass', 2500, 1200); }
  s_trinity(d, t) { this.osc('triangle', 1600, 500, t, .08, d, .25); this.nz(t, .05, d, .25, 'highpass', 4000, 2000); }
  s_seal(d, t) { this.osc('sawtooth', 500, 150, t, .09, d, .18); this.nz(t, .07, d, .3, 'lowpass', 1800, 400); }
  s_hit(d, t) { this.osc('sine', 1800, 1700, t, .06, d, .25); }
  s_headshot(d, t) { this.osc('sine', 2400, 2300, t, .08, d, .3); this.osc('triangle', 3600, 3400, t + .05, .12, d, .2); }
  s_kill(d, t) { [880, 1175, 1568].forEach((f, i) => this.osc('triangle', f, f, t + i * .06, .18, d, .25)); }
  s_hurt(d, t) { this.osc('sawtooth', 220, 90, t, .18, d, .25); this.nz(t, .12, d, .3, 'lowpass', 800, 200); }
  s_death(d, t) { this.osc('sawtooth', 440, 55, t, .9, d, .3); this.osc('square', 220, 40, t + .1, .8, d, .15); }
  s_reload(d, t) { this.nz(t, .45, d, .35, 'bandpass', 700, 2200, .8); this.osc('sine', 600, 1200, t + .35, .15, d, .12); }
  s_swap(d, t) { this.nz(t, .06, d, .25, 'highpass', 5000, 3000); this.osc('sine', 700, 1100, t, .06, d, .12); }
  s_cast(d, t) { this.osc('sine', 300, 1600, t, .35, d, .25, .05); this.nz(t, .35, d, .2, 'bandpass', 800, 4000, 2); }
  s_phase(d, t) { this.osc('sine', 1800, 200, t, .4, d, .3, .01); this.nz(t, .4, d, .3, 'bandpass', 6000, 500, 3); }
  s_veil(d, t) { [0, .08, .16].forEach(k => this.osc('sine', 1400 - k * 2000, 600, t + k, .35, d, .15)); }
  s_fireball(d, t) { this.nz(t, .6, d, .5, 'lowpass', 400, 2400, 2); this.osc('sawtooth', 110, 220, t, .5, d, .15, .05); }
  s_explode(d, t) { this.nz(t, .9, d, 1, 'lowpass', 1800, 60); this.osc('sine', 90, 30, t, .8, d, .8); }
  s_heal(d, t) { [523, 659, 784, 1046].forEach((f, i) => this.osc('sine', f, f, t + i * .05, .3, d, .15)); }
  s_ui(d, t) { this.osc('square', 1100, 1500, t, .06, d, .12); }
  s_countdown(d, t) { this.osc('square', 880, 880, t, .18, d, .2); }
  s_go(d, t) { this.osc('square', 1760, 1760, t, .4, d, .25); this.osc('square', 1320, 1320, t, .4, d, .15); }
  s_step(d, t) { this.nz(t, .05, d, .12, 'lowpass', 500, 200); }
  s_jump(d, t) { this.nz(t, .1, d, .15, 'bandpass', 800, 1600); }

  // ---------- Music ----------
  music(name) {
    if (!this.ctx || this.musicName === name) return;
    this.stopMusic(); this.musicName = name;
    const buf = this.buffers['music:' + name];
    if (buf) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = name !== 'victory'; s.connect(this.musicBus); s.start(); this.musicNode = s; return;
    }
    this.synthMusic(name);
  }

  stopMusic() {
    if (this.musicNode) { try { this.musicNode.stop(); } catch {} this.musicNode = null; }
    if (this.seqTimer) { clearInterval(this.seqTimer); this.seqTimer = null; }
    this.musicName = null;
  }

  // Procedural "neon J-pop synthwave" sequencer (fallback when no Lyria track is present).
  synthMusic(name) {
    const bpm = name === 'battle' ? 138 : 104, step = 60 / bpm / 4;
    const prog = name === 'battle' ? [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]] : [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
    const lead = name === 'battle' ? [12, 0, 7, 0, 10, 0, 7, 12, 15, 0, 14, 12, 10, 0, 7, 0] : [7, 0, 0, 12, 0, 11, 0, 7, 0, 0, 4, 0, 5, 0, 7, 0];
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    let n = 0, next = this.ctx.currentTime + .1;
    const d = this.musicBus;
    const tick = () => {
      while (next < this.ctx.currentTime + .25) {
        const bar = (n / 16 | 0) % 4, s = n % 16, ch = prog[bar], t = next;
        if (name === 'victory' && n > 48) { this.stopMusic(); return; }
        // kick / snare / hat
        if (s % 4 === 0) this.osc('sine', 150, 40, t, .25, d, .9);
        if (name === 'battle' && s % 8 === 4) this.nz(t, .18, d, .5, 'bandpass', 1800, 900, .8);
        if (s % 2 === 1) this.nz(t, .04, d, .18, 'highpass', 8000, 6000);
        // bass
        if (s % 2 === 0) this.osc('sawtooth', mtof(ch[0] - 24), mtof(ch[0] - 24), t, step * 1.8, d, .22);
        // arp
        this.osc('square', mtof(ch[s % 3] + 12), mtof(ch[s % 3] + 12), t, step * .9, d, .05);
        // lead
        if (lead[s]) this.osc('triangle', mtof(ch[0] + lead[s]), mtof(ch[0] + lead[s]), t, step * 1.6, d, .1);
        // pad
        if (s === 0) ch.forEach(m => this.osc('sawtooth', mtof(m), mtof(m), t, step * 15, d, .025, .3));
        n++; next += step;
      }
    };
    this.seqTimer = setInterval(tick, 50); tick();
  }
}
