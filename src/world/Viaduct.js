import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_HEIGHT as H } from '../config.js';
import { isOnRoad } from './grid.js';
import { pathFrames, sweepProfile } from './sweep.js';

// Deck cross-section (u = right, v = up from the deck top), counter-clockwise.
const DECK = [
  [-2.2, -1.5], [2.2, -1.5], [3.0, -0.9], [3.0, 0.55], [2.6, 0.55],
  [2.6, 0], [-2.6, 0], [-2.6, 0.55], [-3.0, 0.55], [-3.0, -0.9],
];
export const DECK_HALF_WIDTH = 3.0;
const DECK_BOTTOM = H - 1.5;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

// The elevated concrete track: deck, rails, sleepers, neon edge strips and pillars.
export class Viaduct {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mats = {
      concrete: new THREE.MeshLambertMaterial({ color: 0xdcd8d0 }),
      bed: new THREE.MeshLambertMaterial({ color: 0xa9a49b }),
      rail: new THREE.MeshStandardMaterial({ color: 0xc3cad3, metalness: 0.85, roughness: 0.28 }),
      sleeper: new THREE.MeshLambertMaterial({ color: 0x7d7266 }),
      neon: new THREE.MeshBasicMaterial({ color: 0x45d1ff }),
      pillar: new THREE.MeshLambertMaterial({ color: 0xd2cdc4 }),
    };
    this.pillars = []; // world {x, z} of every pillar, for the city to keep clear
  }

  build(path) {
    this.clear();
    const frames = pathFrames(path, 0.6);

    const deck = new THREE.Mesh(sweepProfile(frames, DECK), this.mats.concrete);
    deck.castShadow = deck.receiveShadow = true;

    const bed = new THREE.Mesh(
      sweepProfile(frames, [[1.55, 0.012], [-1.55, 0.012]], { profileClosed: false }),
      this.mats.bed,
    );
    bed.receiveShadow = true;

    const railGeos = [-0.72, 0.72].map((c) =>
      sweepProfile(frames, [[c - 0.08, 0.08], [c + 0.08, 0.08], [c + 0.08, 0.24], [c - 0.08, 0.24]]),
    );
    const rails = new THREE.Mesh(mergeGeometries(railGeos), this.mats.rail);
    rails.castShadow = true;

    const neonGeos = [
      sweepProfile(frames, [[3.02, 0.12], [3.02, 0.36]], { profileClosed: false }),
      sweepProfile(frames, [[-3.02, 0.36], [-3.02, 0.12]], { profileClosed: false }),
    ];
    const neon = new THREE.Mesh(mergeGeometries(neonGeos), this.mats.neon);

    this.group.add(deck, bed, rails, neon);
    this.group.add(this.buildSleepers(path));
    this.group.add(...this.buildPillars(path));
  }

  buildSleepers(path) {
    const step = 0.9;
    const n = Math.floor(path.length / step);
    const geo = new THREE.BoxGeometry(2.1, 0.1, 0.36);
    const mesh = new THREE.InstancedMesh(geo, this.mats.sleeper, n);
    const p = { x: 0, z: 0 };
    const t = { x: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      const s = (i * path.length) / n;
      path.pointAt(s, p);
      path.tangentAt(s, t);
      _q.setFromAxisAngle(_up, Math.atan2(t.x, t.z));
      _m.compose(_p.set(p.x, H + 0.05, p.z), _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.receiveShadow = true;
    return mesh;
  }

  // Pillars every ~12 units, nudged along the track so none stands in a street.
  buildPillars(path) {
    const L = path.length;
    const count = Math.round(L / 12);
    const spots = [];
    const p = { x: 0, z: 0 };
    for (let k = 0; k < count; k++) {
      const s0 = ((k + 0.5) * L) / count;
      for (const off of [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6]) {
        const s = s0 + off;
        path.pointAt(s, p);
        if (isOnRoad(p.x, p.z, 1.4)) continue;
        const prev = spots[spots.length - 1];
        if (prev !== undefined && s - prev < 5) continue;
        spots.push(s);
        break;
      }
    }
    if (spots.length > 1 && spots[0] + L - spots[spots.length - 1] < 5) spots.pop();

    const colH = DECK_BOTTOM;
    const colGeo = new THREE.BoxGeometry(1.5, colH, 1.5);
    colGeo.translate(0, colH / 2, 0);
    const capGeo = new THREE.BoxGeometry(4.6, 0.85, 1.7);
    capGeo.translate(0, DECK_BOTTOM - 0.42, 0);
    const baseGeo = new THREE.BoxGeometry(2.1, 0.4, 2.1);
    baseGeo.translate(0, 0.2, 0);
    const geo = mergeGeometries([colGeo, capGeo, baseGeo]);

    const mesh = new THREE.InstancedMesh(geo, this.mats.pillar, spots.length);
    const t = { x: 0, z: 0 };
    this.pillars = spots.map((s, i) => {
      path.pointAt(s, p);
      path.tangentAt(s, t);
      _q.setFromAxisAngle(_up, Math.atan2(t.x, t.z));
      _m.compose(_p.set(p.x, 0, p.z), _q, _s);
      mesh.setMatrixAt(i, _m);
      return { x: p.x, z: p.z };
    });
    mesh.castShadow = mesh.receiveShadow = true;
    return [mesh];
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
    g.add(new THREE.Mesh(sweepProfile(frames, [[1.55, 0.012], [-1.55, 0.012]], { closed: false, profileClosed: false }), this.mats.bed));
    for (const c of [-0.72, 0.72]) {
      const prof = [[c - 0.1, 0.05], [c + 0.1, 0.05], [c + 0.1, 0.3], [c - 0.1, 0.3]];
      g.add(new THREE.Mesh(sweepProfile(frames, prof, { closed: false }), this.mats.rail));
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
