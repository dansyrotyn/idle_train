import * as THREE from 'three';
import { TRACK_HEIGHT as H, TRACKS } from '../config.js';
import { easeOutBack } from '../utils/math.js';
import { coinFaceTexture, signTexture } from './textures.js';

const MAX_SLOTS = Math.max(...TRACKS.map((t) => t.maxGates));

function box(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Reward lines: slot 0 is the station, the rest are neon gates over the track.
export class Gates {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.slots = [];
    this.path = null;
    this.time = 0;

    const coinFace = coinFaceTexture();
    this.mats = {
      frame: new THREE.MeshLambertMaterial({ color: 0x3d4656 }),
      frameLight: new THREE.MeshLambertMaterial({ color: 0x5a6578 }),
      cyan: new THREE.MeshBasicMaterial({ color: 0x46e0ff }),
      yellow: new THREE.MeshBasicMaterial({ color: 0xffd23f }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc531, metalness: 0.6, roughness: 0.3, emissive: 0x6b4300 }),
      coinFace: new THREE.MeshStandardMaterial({ map: coinFace, metalness: 0.4, roughness: 0.35, emissive: 0x4a3000 }),
      roof: new THREE.MeshLambertMaterial({ color: 0x2f6fd6 }),
      roofTrim: new THREE.MeshLambertMaterial({ color: 0xf2f5fa }),
      platform: new THREE.MeshLambertMaterial({ color: 0xd8d0c3 }),
      edge: new THREE.MeshBasicMaterial({ color: 0xffd23f }),
      post: new THREE.MeshLambertMaterial({ color: 0xe8ecf1 }),
      column: new THREE.MeshLambertMaterial({ color: 0xcfcac1 }),
      glass: new THREE.MeshLambertMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35, depthWrite: false }),
      bench: new THREE.MeshLambertMaterial({ color: 0x9a6a44 }),
      sign: new THREE.MeshBasicMaterial({ map: signTexture(), side: THREE.DoubleSide }),
      skin: new THREE.MeshLambertMaterial({ color: 0xf2c49b }),
    };
    this.coinGeo = new THREE.CylinderGeometry(0.78, 0.78, 1.25, 32);
    this.coinGeo.rotateX(Math.PI / 2);
    this.coinMats = [this.mats.gold, this.mats.coinFace, this.mats.coinFace];
    this.shirtMats = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6].map(
      (c) => new THREE.MeshLambertMaterial({ color: c }),
    );
    this.personGeo = { body: new THREE.CylinderGeometry(0.28, 0.3, 1.0, 8), head: new THREE.SphereGeometry(0.24, 10, 8) };
  }

  build(path, count) {
    this.clear();
    this.path = path;
    this.slots = path.computeSlots(MAX_SLOTS);
    for (let i = 0; i < count; i++) this.create(i, false);
  }

  add(index) {
    return this.create(index, true);
  }

  positions() {
    return this.items.map((it) => it.s);
  }

  // Footprint the city must keep free (the station platform sticks out sideways).
  exclusions() {
    const st = this.items[0];
    if (!st) return [];
    const p = this.path.pointAt(st.s);
    const t = this.path.tangentAt(st.s);
    const side = this.path.outwardSide(st.s);
    return [{ x: p.x - t.z * side * 5, z: p.z + t.x * side * 5, r: 10 }];
  }

  clear() {
    const shared = new Set([this.coinGeo, this.personGeo.body, this.personGeo.head]);
    for (const it of this.items) {
      this.group.remove(it.group);
      it.group.traverse((o) => {
        if (o.isMesh && !shared.has(o.geometry)) o.geometry.dispose();
      });
      it.own.forEach((m) => m.dispose());
    }
    this.items = [];
  }

  create(index, animate) {
    const s = this.slots[index];
    const p = this.path.pointAt(s);
    const t = this.path.tangentAt(s);
    const own = [];
    const curtainMat = new THREE.MeshBasicMaterial({
      color: 0x6dff5a,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xb6ff9e, transparent: true, opacity: 0.9 });
    own.push(curtainMat, laserMat);

    const group = index === 0 ? this.createStation(this.path.outwardSide(s)) : this.createGate();
    const coin = group.userData.coin;

    // The green "reward line" curtain across the track.
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 4.9), curtainMat);
    curtain.position.y = 2.6;
    group.add(curtain);
    for (const y of [1.0, 2.4, 3.8]) group.add(box(5.1, 0.07, 0.07, 0, y, 0, laserMat));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.9), curtainMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.06;
    group.add(floor);

    group.position.set(p.x, H, p.z);
    group.rotation.y = Math.atan2(t.x, t.z);
    this.group.add(group);

    const item = { s, group, coin, curtainMat, laserMat, pulse: 0, appear: animate ? 0 : 1, own, index };
    if (animate) group.scale.setScalar(0.001);
    this.items.push(item);
    return item;
  }

  createGate() {
    const m = this.mats;
    const g = new THREE.Group();
    for (const x of [-2.85, 2.85]) {
      const post = box(0.55, 5.4, 0.85, x, 2.7, 0, m.frame);
      post.castShadow = true;
      g.add(post);
      const inner = x < 0 ? x + 0.3 : x - 0.3;
      g.add(box(0.1, 4.0, 0.36, inner, 2.5, 0, m.cyan));
      g.add(box(0.12, 0.5, 0.4, inner, 0.55, 0, m.yellow));
      g.add(box(0.12, 0.5, 0.4, inner, 4.75, 0, m.yellow));
    }
    const beam = box(6.6, 1.3, 1.05, 0, 6.0, 0, m.frame);
    beam.castShadow = true;
    g.add(beam);
    g.add(box(6.0, 0.9, 1.1, 0, 6.0, 0, m.frameLight));
    g.add(box(5.2, 0.1, 0.5, 0, 5.3, 0, m.cyan));
    const coin = new THREE.Mesh(this.coinGeo, this.coinMats);
    coin.position.y = 6.05;
    g.add(coin);
    g.userData.coin = coin;
    return g;
  }

  // side: +1 when the outside of the loop is to the right of travel. Local +x is the
  // travel-left side, so the platform goes to local x = -side * ...
  createStation(side) {
    const m = this.mats;
    const sx = -side;
    const g = new THREE.Group();
    const len = 13;

    const platform = box(3.6, 0.9, len, sx * 4.8, 0.05, 0, m.platform);
    platform.castShadow = platform.receiveShadow = true;
    g.add(platform);
    g.add(box(0.25, 0.03, len, sx * 3.25, 0.51, 0, m.edge));
    for (const z of [-4.5, 4.5]) {
      const col = box(1.2, H - 0.4, 1.2, sx * 4.8, -(H + 0.4) / 2, z, m.column);
      col.castShadow = true;
      g.add(col);
    }

    const roof = box(10.4, 0.45, len + 1, sx * 1.7, 5.65, 0, m.roof);
    roof.castShadow = true;
    g.add(roof);
    g.add(box(10.6, 0.16, len + 1.2, sx * 1.7, 5.35, 0, m.roofTrim));
    for (const z of [-5.5, 0, 5.5]) g.add(box(0.3, 4.9, 0.3, sx * 6.3, 2.95, z, m.post));
    for (const z of [-5.5, 5.5]) g.add(box(0.3, 4.8, 0.3, -sx * 2.85, 2.95, z, m.post));
    g.add(box(0.08, 4.1, len - 1, sx * 6.45, 2.6, 0, m.glass));

    for (const z of [-3, 3]) {
      g.add(box(0.6, 0.12, 2.4, sx * 5.6, 0.95, z, m.bench));
      g.add(box(0.12, 0.5, 2.4, sx * 5.9, 1.2, z, m.bench));
    }

    for (const z of [-(len / 2 + 0.55), len / 2 + 0.55]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), m.sign);
      sign.position.set(sx * 4.8, 4.3, z);
      g.add(sign);
    }

    // A few passengers waiting on the platform.
    for (let i = 0; i < 5; i++) {
      const z = -4.5 + i * 2.2 + (i % 2) * 0.4;
      const x = sx * (3.9 + (i % 3) * 0.55);
      const b = new THREE.Mesh(this.personGeo.body, this.shirtMats[i]);
      b.position.set(x, 1.0, z);
      const h = new THREE.Mesh(this.personGeo.head, m.skin);
      h.position.set(x, 1.72, z);
      g.add(b, h);
    }

    const coin = new THREE.Mesh(this.coinGeo, this.coinMats);
    coin.position.set(0, 6.6, 0);
    coin.scale.setScalar(0.9);
    g.add(coin);
    g.userData.coin = coin;
    return g;
  }

  // Gate on a short deck stub, for the HUD button icon.
  createIconModel() {
    const g = this.createGate();
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(5.1, 4.9),
      new THREE.MeshBasicMaterial({ color: 0x6dff5a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    curtain.position.y = 2.6;
    g.add(curtain);
    for (const y of [1.0, 2.4, 3.8]) g.add(box(5.1, 0.12, 0.12, 0, y, 0, this.mats.edge));
    g.add(box(6.6, 0.8, 2.6, 0, -0.4, 0, this.mats.platform));
    return g;
  }

  pulse(index) {
    const it = this.items[index];
    if (it) it.pulse = 1;
  }

  coinWorldPosition(index, out) {
    const it = this.items[index];
    if (!it) return out.set(0, 0, 0);
    return it.coin.getWorldPosition(out);
  }

  update(dt) {
    this.time += dt;
    for (const it of this.items) {
      it.pulse = Math.max(0, it.pulse - dt * 3);
      it.curtainMat.opacity = 0.22 + 0.06 * Math.sin(this.time * 5 + it.index * 1.7) + it.pulse * 0.5;
      it.laserMat.opacity = 0.65 + 0.3 * it.pulse + 0.1 * Math.sin(this.time * 9 + it.index);
      it.coin.rotation.y += dt * (1.2 + it.pulse * 9);
      if (it.appear < 1) {
        it.appear = Math.min(1, it.appear + dt / 0.6);
        it.group.scale.setScalar(Math.max(0.001, easeOutBack(it.appear, 2.2)));
      }
    }
  }
}
