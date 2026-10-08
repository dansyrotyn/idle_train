import * as THREE from 'three';
import { TRACK_HEIGHT } from '../config.js';

const SPAWN_MIN = 30; // seconds between bonus coins
const SPAWN_MAX = 60;
const LIFETIME = 7; // seconds a coin waits to be tapped
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

// A big spinning bonus coin that pops up over the road now and then. Tapping it pays
// a few seconds of income (later: the hook for an "x3 for an ad" offer).
export class BonusCoin {
  constructor(scene, camera, canvas, onCollect) {
    this.camera = camera;
    this.onCollect = onCollect;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const gold = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.5, roughness: 0.3, emissive: 0x5a3c00 });
    const face = new THREE.MeshStandardMaterial({ color: 0xffe066, metalness: 0.4, roughness: 0.35, emissive: 0x6a4a00 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 32).rotateX(Math.PI / 2), [gold, face, face]);
    const star = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.5, 5).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8 }),
    );
    this.spinner = new THREE.Group();
    this.spinner.add(coin, star);
    this.glow = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.4, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.hit = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.6, 7, 16, 1, true).translate(0, 3.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    this.group.add(this.spinner, this.glow, this.beam, this.hit);
    this.group.scale.setScalar(1.6);

    this.timer = SPAWN_MIN * 0.5;
    this.life = 0;
    this.active = false;
    this.enabled = true;

    canvas.addEventListener('pointerdown', (e) => this.tryTap(e, canvas));
  }

  spawn(path, aheadS) {
    // Somewhere on the road ahead of the cars that is well inside the screen.
    const p = { x: 0, z: 0 };
    const v = new THREE.Vector3();
    let found = false;
    for (let tries = 0; tries < 40 && !found; tries++) {
      const s = aheadS + 12 + Math.random() * path.length * 0.7;
      path.pointAt(s, p);
      v.set(p.x, TRACK_HEIGHT + 3, p.z).project(this.camera);
      found = Math.abs(v.x) < 0.7 && v.y > -0.45 && v.y < 0.6 && v.z < 1;
    }
    if (!found) return; // retry next frame
    this.group.position.set(p.x, TRACK_HEIGHT, p.z);
    this.group.visible = this.active = true;
    this.life = LIFETIME;
    this.age = 0;
  }

  tryTap(e, canvas) {
    if (!this.active) return;
    const r = canvas.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.camera);
    if (!_ray.intersectObject(this.hit).length) return;
    this.active = this.group.visible = false;
    this.timer = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    this.onCollect(this.spinner.getWorldPosition(new THREE.Vector3()));
  }

  update(dt, path, headS) {
    if (!this.active) {
      if (!this.enabled || !path) return;
      this.timer -= dt;
      if (this.timer <= 0) this.spawn(path, headS);
      return;
    }
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.active = this.group.visible = false;
      this.timer = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      return;
    }
    const pop = Math.min(1, this.age / 0.35);
    const scale = Math.sin(pop * Math.PI * 0.5) + 0.3 * Math.sin(pop * Math.PI); // pop with overshoot
    this.spinner.scale.setScalar(Math.max(0.01, scale));
    this.spinner.position.y = 3.2 + Math.sin(this.age * 3) * 0.35;
    this.spinner.rotation.y += dt * 3;
    this.glow.material.opacity = 0.55 + 0.3 * Math.sin(this.age * 6);
    this.beam.material.opacity = 0.2 + 0.1 * Math.sin(this.age * 6);
    // Blink during the last seconds.
    this.spinner.visible = this.life > 1.8 || Math.floor(this.life * 8) % 2 === 0;
  }
}
