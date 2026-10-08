import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pathFrames, sweepProfile } from './sweep.js';
import { asphaltTexture, sidewalkTexture } from './city/atlas.js';

// Deck cross-section (u = right, v = up from the deck top), counter-clockwise.
const DECK = [
  [-2.2, -1.5], [2.2, -1.5], [3.0, -0.9], [3.0, 0.55], [2.6, 0.55],
  [2.6, 0], [-2.6, 0], [-2.6, 0.55], [-3.0, 0.55], [-3.0, -0.9],
];
export const DECK_HALF_WIDTH = 3.0;


// The player's road loop: a ground-level city boulevard.
export class Viaduct {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const walkTex = sidewalkTexture();
    const asphalt = asphaltTexture();
    this.mats = {
      concrete: new THREE.MeshLambertMaterial({ color: 0xffffff, map: walkTex }), // sidewalk
      bed: new THREE.MeshLambertMaterial({ color: 0xa8a8ac, map: asphalt }), // asphalt
      rail: new THREE.MeshBasicMaterial({ color: 0xf4f1e6 }), // edge lines
      sleeper: new THREE.MeshBasicMaterial({ color: 0xffd23f }), // center line
      neon: new THREE.MeshBasicMaterial({ color: 0xffb020 }), // reflector strip
      pillar: new THREE.MeshLambertMaterial({ color: 0xd2cdc4 }),
      cap: new THREE.MeshLambertMaterial({ color: 0xd8d2c6 }),
    };
    this.pillars = [];
  }

  // Ground-level boulevard: asphalt, curbs and wide sidewalks on both sides (the outer one
  // opens where city streets join), white edge lines and a yellow double center line.
  // gapAt(x, z): true where a side street crosses the outer sidewalk.
  build(path, gapAt = null) {
    this.clear();
    const frames = pathFrames(path, 0.6);
    const loop = [...frames, frames[0]]; // open copy, so tiled textures have no seam
    const flat = (u0, u1, v, mat, uvScale = 1) =>
      new THREE.Mesh(sweepProfile(loop, [[u1, v], [u0, v]], { closed: false, profileClosed: false, uvScale }), mat);

    const bed = flat(-4.2, 4.2, 0.0, this.mats.bed, 1 / 8);
    bed.receiveShadow = true;
    const INNER = [[7.4, -0.4], [7.4, 0.25], [4.2, 0.25], [4.2, -0.05]];
    const OUTER = [[-4.2, -0.05], [-4.2, 0.25], [-7.4, 0.25], [-7.4, -0.4]];
    const walks = [sweepProfile(loop, INNER, { closed: false, profileClosed: false, uvScale: 0.25 })];
    const lines = [sweepProfile(frames, [[3.7, 0.012], [3.5, 0.012]], { profileClosed: false })];
    const caps = [];
    for (const run of this.runs(frames, gapAt)) {
      walks.push(sweepProfile(run, OUTER, { closed: false, profileClosed: false, uvScale: 0.25 }));
      lines.push(sweepProfile(run, [[-3.5, 0.012], [-3.7, 0.012]], { closed: false, profileClosed: false }));
      if (run.length < frames.length) caps.push(this.cap(run[0], -1), this.cap(run[run.length - 1], 1));
    }
    const walk = new THREE.Mesh(mergeGeometries(walks), this.mats.concrete);
    walk.receiveShadow = true;
    const edge = new THREE.Mesh(mergeGeometries(lines), this.mats.rail);
    const center = new THREE.Mesh(
      mergeGeometries([-0.18, 0.18].map((c) => sweepProfile(frames, [[c + 0.08, 0.014], [c - 0.08, 0.014]], { profileClosed: false }))),
      this.mats.sleeper,
    );
    this.group.add(bed, walk, edge, center);
    if (caps.length) {
      const capMesh = new THREE.Mesh(mergeGeometries(caps), this.mats.cap);
      capMesh.receiveShadow = true;
      this.group.add(capMesh);
    }
  }

  // Consecutive frames whose outer sidewalk isn't cut by a side street (open lists).
  runs(frames, gapAt) {
    if (!gapAt) return [[...frames, frames[0]]];
    const ok = frames.map((f) => !gapAt(f.x - f.rx * 5.8, f.z - f.rz * 5.8) && !gapAt(f.x - f.rx * 4.4, f.z - f.rz * 4.4) && !gapAt(f.x - f.rx * 7.2, f.z - f.rz * 7.2));
    const n = frames.length;
    if (ok.every(Boolean)) return [[...frames, frames[0]]];
    const start = ok.findIndex((v, i) => !v && ok[(i + 1) % n]);
    const out = [];
    let run = null;
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (ok[i]) (run ??= []).push(frames[i]);
      else if (run) {
        if (run.length > 1) out.push(run);
        run = null;
      }
    }
    if (run && run.length > 1) out.push(run);
    return out;
  }

  // End face of an outer sidewalk run (dir -1 at the start, +1 at the end).
  cap(f, dir) {
    const g = new THREE.BufferGeometry();
    const P = (u, v) => [f.x + f.rx * u, f.y + v, f.z + f.rz * u];
    const pts = dir > 0 ? [P(-4.2, -0.05), P(-7.4, -0.4), P(-7.4, 0.25), P(-4.2, 0.25)] : [P(-7.4, -0.4), P(-4.2, -0.05), P(-4.2, 0.25), P(-7.4, 0.25)];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.8, 0, 0.8, 0.1, 0, 0.1], 2));
    return g;
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
