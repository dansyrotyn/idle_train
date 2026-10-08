import * as THREE from 'three';
import { coinFaceTexture, sparkleTexture } from '../world/textures.js';
import { COIN_SVG } from '../ui/svg.js';

const MAX_SPARKS = 700;
const MAX_COINS = 60;
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// 3D particles (sparkles, coins, shock rings) and DOM overlays (floating "+N", coins
// flying into the HUD counter).
export class Effects {
  constructor(scene, camera, layer, getCoinTarget) {
    this.camera = camera;
    this.layer = layer; // DOM element over the canvas
    this.getCoinTarget = getCoinTarget; // () => {x, y} in layer pixels
    this.onCoinArrive = null;

    // Sparkles: one Points cloud, faded by darkening the additive color.
    const geo = new THREE.BufferGeometry();
    this.sPos = new Float32Array(MAX_SPARKS * 3);
    this.sCol = new Float32Array(MAX_SPARKS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.9,
        map: sparkleTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    this.sp = Array.from({ length: MAX_SPARKS }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 }));
    this.spNext = 0;

    // Coins popping out of reward lines.
    const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16);
    coinGeo.rotateX(Math.PI / 2);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc531, metalness: 0.6, roughness: 0.3, emissive: 0x6b4300 });
    const face = new THREE.MeshStandardMaterial({ map: coinFaceTexture(), metalness: 0.4, roughness: 0.35, emissive: 0x4a3000 });
    this.coins = new THREE.InstancedMesh(coinGeo, [gold, face, face], MAX_COINS);
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    scene.add(this.coins);
    this.cp = [];

    // Expanding rings for merges and purchases.
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.rings = [];
    this.scene = scene;

    // DOM pools.
    this.labels = [];
    this.flyers = [];
    this.labelPool = Array.from({ length: 36 }, () => this.makeEl('fx-label'));
    this.flyerPool = Array.from({ length: 24 }, () => {
      const el = this.makeEl('fx-coin');
      el.innerHTML = COIN_SVG;
      return el;
    });
    this.lastFlyer = 0;
    this.time = 0;
  }

  makeEl(cls) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.display = 'none';
    this.layer.appendChild(el);
    return el;
  }

  sparkle(pos, { count = 30, color = 0xffe27a, speed = 6, up = 3, spread = 1.5, life = 0.9 } = {}) {
    _c.set(color);
    for (let i = 0; i < count; i++) {
      const p = this.sp[this.spNext];
      const idx = this.spNext * 3;
      this.spNext = (this.spNext + 1) % MAX_SPARKS;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 2 - 1;
      const sp = speed * (0.4 + Math.random() * 0.6);
      p.vx = Math.cos(a) * Math.sqrt(1 - e * e) * sp;
      p.vy = Math.abs(e) * sp + up;
      p.vz = Math.sin(a) * Math.sqrt(1 - e * e) * sp;
      p.max = p.life = life * (0.6 + Math.random() * 0.6);
      p.r = _c.r;
      p.g = _c.g;
      p.b = _c.b;
      this.sPos[idx] = pos.x + (Math.random() - 0.5) * spread;
      this.sPos[idx + 1] = pos.y + (Math.random() - 0.5) * spread;
      this.sPos[idx + 2] = pos.z + (Math.random() - 0.5) * spread;
    }
  }

  coinBurst(pos, count = 2) {
    for (let i = 0; i < count; i++) {
      if (this.cp.length >= MAX_COINS) this.cp.shift();
      const a = Math.random() * Math.PI * 2;
      this.cp.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * 2.5, vy: 7 + Math.random() * 3, vz: Math.sin(a) * 2.5,
        rot: Math.random() * 6, spin: 8 + Math.random() * 6,
        life: 0.9,
      });
    }
  }

  ring(pos, { color = 0xffffff, size = 6, life = 0.6 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0, life, size });
  }

  project(pos) {
    _v.copy(pos).project(this.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    const w = this.layer.clientWidth;
    const h = this.layer.clientHeight;
    const x = (_v.x * 0.5 + 0.5) * w;
    const y = (-_v.y * 0.5 + 0.5) * h;
    if (x < -40 || x > w + 40 || y < -40 || y > h + 40) return null;
    return { x, y };
  }

  floatText(pos, text) {
    const el = this.labelPool.pop();
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    this.labels.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
  }

  flyCoin(pos) {
    if (this.time - this.lastFlyer < 0.09) return;
    const start = this.project(pos);
    const el = start && this.flyerPool.pop();
    if (!el) return;
    this.lastFlyer = this.time;
    el.style.display = 'block';
    this.flyers.push({ el, start, t: 0, bend: (Math.random() - 0.5) * 120 });
  }

  update(dt) {
    this.time += dt;

    for (let i = 0; i < MAX_SPARKS; i++) {
      const p = this.sp[i];
      const idx = i * 3;
      if (p.life <= 0) {
        this.sCol[idx] = this.sCol[idx + 1] = this.sCol[idx + 2] = 0;
        continue;
      }
      p.life -= dt;
      p.vy -= 9 * dt;
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      this.sPos[idx] += p.vx * dt;
      this.sPos[idx + 1] += p.vy * dt;
      this.sPos[idx + 2] += p.vz * dt;
      const f = Math.max(0, p.life / p.max);
      this.sCol[idx] = p.r * f;
      this.sCol[idx + 1] = p.g * f;
      this.sCol[idx + 2] = p.b * f;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;

    let n = 0;
    for (let i = this.cp.length - 1; i >= 0; i--) {
      const c = this.cp[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.cp.splice(i, 1);
        continue;
      }
      c.vy -= 22 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rot += c.spin * dt;
      const s = Math.min(1, c.life / 0.25);
      _q.setFromEuler(_e.set(0, c.rot, 0));
      _m.compose(_v.set(c.x, c.y, c.z), _q, _s.set(s, s, s));
      this.coins.setMatrixAt(n++, _m);
    }
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt / r.life;
      if (r.t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - r.t, 3);
      r.mesh.scale.setScalar(0.5 + e * r.size);
      r.mesh.material.opacity = 0.9 * (1 - r.t);
    }

    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.t += dt / 1.0;
      const p = l.t < 1 && this.project(l.pos);
      if (!p) {
        l.el.style.display = 'none';
        this.labelPool.push(l.el);
        this.labels.splice(i, 1);
        continue;
      }
      const rise = 70 * (1 - Math.pow(1 - l.t, 2));
      const sc = l.t < 0.15 ? 0.6 + (l.t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (l.t - 0.15) * 0.4);
      l.el.style.transform = `translate3d(${p.x + l.dx}px, ${p.y - rise}px, 0) translate(-50%, -50%) scale(${sc})`;
      l.el.style.opacity = String(l.t < 0.7 ? 1 : 1 - (l.t - 0.7) / 0.3);
    }

    if (this.flyers.length) {
      const target = this.getCoinTarget();
      for (let i = this.flyers.length - 1; i >= 0; i--) {
        const f = this.flyers[i];
        f.t += dt / 0.65;
        if (f.t >= 1) {
          f.el.style.display = 'none';
          this.flyerPool.push(f.el);
          this.flyers.splice(i, 1);
          this.onCoinArrive?.();
          continue;
        }
        const t = f.t * f.t * (3 - 2 * f.t);
        const cx = (f.start.x + target.x) / 2 + f.bend;
        const cy = Math.min(f.start.y, target.y) - 60;
        const u = 1 - t;
        const x = u * u * f.start.x + 2 * u * t * cx + t * t * target.x;
        const y = u * u * f.start.y + 2 * u * t * cy + t * t * target.y;
        const sc = 1 - t * 0.35;
        f.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${sc})`;
      }
    }
  }
}
