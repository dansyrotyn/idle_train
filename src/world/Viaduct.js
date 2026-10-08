import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_HEIGHT as H } from '../config.js';
import { pathFrames, sweepProfile } from './sweep.js';

// Deck cross-section (u = right, v = up from the deck top), counter-clockwise.
const DECK = [
  [-2.2, -1.5], [2.2, -1.5], [3.0, -0.9], [3.0, 0.55], [2.6, 0.55],
  [2.6, 0], [-2.6, 0], [-2.6, 0.55], [-3.0, 0.55], [-3.0, -0.9],
];
export const DECK_HALF_WIDTH = 3.0;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

// The player's road loop: a ground-level city boulevard.
export class Viaduct {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mats = {
      concrete: new THREE.MeshLambertMaterial({ color: 0xcfc8bb, side: THREE.DoubleSide }), // sidewalk
      bed: new THREE.MeshLambertMaterial({ color: 0x3a3c44 }), // asphalt
      rail: new THREE.MeshBasicMaterial({ color: 0xf4f1e6 }), // edge lines
      sleeper: new THREE.MeshBasicMaterial({ color: 0xffd23f }), // center dashes
      neon: new THREE.MeshBasicMaterial({ color: 0xffb020 }), // reflector strip
      pillar: new THREE.MeshLambertMaterial({ color: 0xd2cdc4 }),
    };
    this.pillars = []; // world {x, z} of every pillar, for the city to keep clear
  }

  // Ground-level boulevard over the city streets: asphalt, curbs + sidewalk on both sides,
  // white edge lines and a yellow double center line (the corners cut through block corners).
  build(path) {
    this.clear();
    const frames = pathFrames(path, 0.6);
    const flat = (u0, u1, v, mat) =>
      new THREE.Mesh(sweepProfile(frames, [[u1, v], [u0, v]], { profileClosed: false }), mat);

    const bed = flat(-4.2, 4.2, 0.0, this.mats.bed);
    bed.receiveShadow = true;
    const walks = [
      sweepProfile(frames, [[7, -0.4], [7, 0.25], [4.2, 0.25], [4.2, -0.05]], { profileClosed: false }),
      sweepProfile(frames, [[-4.2, -0.05], [-4.2, 0.25], [-7, 0.25], [-7, -0.4]], { profileClosed: false }),
    ];
    const walk = new THREE.Mesh(mergeGeometries(walks), this.mats.concrete);
    walk.receiveShadow = true;
    const lines = new THREE.Mesh(
      mergeGeometries([-3.6, 3.6].map((c) => sweepProfile(frames, [[c + 0.1, 0.012], [c - 0.1, 0.012]], { profileClosed: false }))),
      this.mats.rail,
    );
    const center = new THREE.Mesh(
      mergeGeometries([-0.18, 0.18].map((c) => sweepProfile(frames, [[c + 0.08, 0.014], [c - 0.08, 0.014]], { profileClosed: false }))),
      this.mats.sleeper,
    );
    this.group.add(bed, walk, lines, center);
    this.group.add(this.buildSleepers(path));
  }

  // White lane dashes between the two lanes of each direction.
  buildSleepers(path) {
    const step = 4;
    const n = Math.floor(path.length / step);
    const geo = new THREE.BoxGeometry(0.14, 0.02, 1.8);
    const mesh = new THREE.InstancedMesh(geo, this.mats.rail, n * 2);
    const p = { x: 0, z: 0 };
    const t = { x: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      const s = (i * path.length) / n;
      path.pointAt(s, p);
      path.tangentAt(s, t);
      _q.setFromAxisAngle(_up, Math.atan2(t.x, t.z));
      for (const [k, side] of [[0, 1.9], [1, -1.9]]) {
        _m.compose(_p.set(p.x - t.z * side, H + 0.014, p.z + t.x * side), _q, _s);
        mesh.setMatrixAt(i * 2 + k, _m);
      }
    }
    mesh.receiveShadow = true;
    return mesh;
  }

  // A curved piece of track for the HUD button icon.
  createIconModel() {
    const frames = [];
    const R = 7;
    for (let k = 0; k <= 32; k++) {
      const a = (k / 32) * Math.PI * 0.75;
      frames.push({ x: Math.cos(a) * R, y: 0, z: Math.sin(a) * R, rx: -Math.cos(a), rz: -Math.sin(a) });
    }
    const g = new THREE.Group();
    const purple = new THREE.MeshLambertMaterial({ color: 0x8d7bf0 });
    g.add(new THREE.Mesh(sweepProfile(frames, DECK, { closed: false }), purple));
    g.add(new THREE.Mesh(sweepProfile(frames, [[2.6, 0.012], [-2.6, 0.012]], { closed: false, profileClosed: false }), this.mats.bed));
    for (const c of [-2.1, 0, 2.1]) {
      const prof = [[c + 0.14, 0.03], [c - 0.14, 0.03]];
      g.add(new THREE.Mesh(sweepProfile(frames, prof, { closed: false, profileClosed: false }), c ? this.mats.rail : this.mats.sleeper));
    }
    const neon = [[3.02, 0.12], [3.02, 0.4]];
    g.add(new THREE.Mesh(sweepProfile(frames, neon, { closed: false, profileClosed: false }), this.mats.neon));
    // Caps so the cut ends don't look hollow.
    const shape = new THREE.Shape(DECK.map(([u, v]) => new THREE.Vector2(u, v)));
    const capMat = new THREE.MeshLambertMaterial({ color: 0x6f5fd0, side: THREE.DoubleSide });
    for (const f of [frames[0], frames[frames.length - 1]]) {
      const cap = new THREE.Mesh(new THREE.ShapeGeometry(shape), capMat);
      const right = new THREE.Vector3(f.rx, 0, f.rz);
      const up = new THREE.Vector3(0, 1, 0);
      const fwd = new THREE.Vector3().crossVectors(right, up);
      cap.matrix.makeBasis(right, up, fwd).setPosition(f.x, f.y, f.z);
      cap.matrixAutoUpdate = false;
      g.add(cap);
    }
    return g;
  }

  clear() {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
      child.dispose?.();
    }
    this.pillars = [];
  }
}
