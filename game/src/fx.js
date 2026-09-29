import * as THREE from 'three';

const MAX = 3000;

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX); this.grav = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; varying vec3 vC; varying float vA; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); float z=-mv.z; gl_PointSize=min(size*600./z, 56.); vA=smoothstep(.6,2.2,z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-.5; float r=length(d); if(r>.5) discard; float a=smoothstep(.5,0.,r); gl_FragColor=vec4(vC*a*1.3*vA, a*vA); }`,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
    this.i = 0;
    this.popLayer = document.getElementById('popups');
    this.pops = [];
    this.tmp = new THREE.Vector3();
    this.rings = [];
    // sakura petals
    const pg = new THREE.BufferGeometry(); const pp = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) { pp[i * 3] = (Math.random() - .5) * 90; pp[i * 3 + 1] = Math.random() * 14; pp[i * 3 + 2] = (Math.random() - .5) * 90; }
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.petals = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffa0e0, size: .12, transparent: true, opacity: .85 }));
    scene.add(this.petals);
  }

  spawn(p, v, color, size, life, grav = 0) {
    const i = this.i = (this.i + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    const c = color.isColor ? color : new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3); this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav;
  }

  burst(p, color, n = 20, speed = 6, size = .25, life = .5, grav = 6) {
    const c = new THREE.Color(color), v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.set(Math.random() - .5, Math.random() - .3, Math.random() - .5).normalize().multiplyScalar(speed * (.3 + Math.random() * .7));
      this.spawn(p, v, c, size * (.5 + Math.random()), life * (.5 + Math.random() * .8), grav);
    }
  }

  trail(p, color, size = .18) { this.spawn(p, new THREE.Vector3((Math.random() - .5) * .3, (Math.random() - .5) * .3, (Math.random() - .5) * .3), color, size, .22, 0); }

  ring(p, color, radius, dur = .5) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.copy(p); m.position.y += .1; this.scene.add(m);
    this.rings.push({ m, t: 0, dur, radius });
  }

  // Comic onomatopoeia text anchored to a world position.
  pop(p, text, cls = '') {
    const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
    this.popLayer.appendChild(el);
    this.pops.push({ el, p: p.clone(), t: 0 });
    if (this.pops.length > 14) { const o = this.pops.shift(); o.el.remove(); }
  }

  // Screen-centered text (e.g. "ダブルキル！")
  banner(text, cls = 'jp') {
    const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
    el.style.left = '50%'; el.style.top = '62%';
    this.popLayer.appendChild(el); setTimeout(() => el.remove(), 1000);
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0) this.size[i] = 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;

    for (let k = this.rings.length - 1; k >= 0; k--) {
      const r = this.rings[k]; r.t += dt; const f = r.t / r.dur;
      r.m.scale.setScalar(.2 + f * r.radius); r.m.material.opacity = 1 - f;
      if (f >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); this.rings.splice(k, 1); }
    }

    const pp = this.petals.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      let y = pp.getY(i) - dt * .6, x = pp.getX(i) + Math.sin(y * 2 + i) * dt * .5 + dt * .3;
      if (y < 0) { y = 14; x = (Math.random() - .5) * 90; }
      pp.setX(i, x); pp.setY(i, y);
    }
    pp.needsUpdate = true;

    const w = innerWidth, h = innerHeight;
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const o = this.pops[k]; o.t += dt;
      if (o.t > 1) { o.el.remove(); this.pops.splice(k, 1); continue; }
      this.tmp.copy(o.p).project(this.camera);
      if (this.tmp.z > 1) { o.el.style.display = 'none'; continue; }
      o.el.style.display = '';
      o.el.style.left = ((this.tmp.x + 1) / 2 * w) + 'px'; o.el.style.top = ((1 - this.tmp.y) / 2 * h) + 'px';
    }
  }
}
