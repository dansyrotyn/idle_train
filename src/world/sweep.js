import * as THREE from 'three';
import { TRACK_HEIGHT } from '../config.js';

// Frames along a path: position + unit "right" vector in XZ (right = (-t.z, t.x)).
export function pathFrames(path, step, y = TRACK_HEIGHT) {
  const m = Math.max(8, Math.round(path.length / step));
  const frames = [];
  const p = { x: 0, z: 0 };
  const t = { x: 0, z: 0 };
  for (let k = 0; k < m; k++) {
    const s = (k * path.length) / m;
    path.pointAt(s, p);
    path.tangentAt(s, t);
    frames.push({ x: p.x, y, z: p.z, rx: -t.z, rz: t.x });
  }
  return frames;
}

// Sweeps a 2D cross-section (u = right, v = up; counter-clockwise when closed) along frames.
// Flat-shaded across the profile, smooth along the path.
export function sweepProfile(frames, profile, { closed = true, profileClosed = true, uvScale = 1 } = {}) {
  const pCount = profile.length;
  const eCount = profileClosed ? pCount : pCount - 1;
  const fCount = frames.length;
  const segs = closed ? fCount : fCount - 1;
  const vCount = eCount * fCount * 2;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = [];

  const dist = new Float32Array(fCount);
  for (let k = 1; k < fCount; k++) {
    const a = frames[k - 1];
    const b = frames[k];
    dist[k] = dist[k - 1] + Math.hypot(b.x - a.x, b.z - a.z);
  }

  let vi = 0;
  for (let e = 0; e < eCount; e++) {
    const a = profile[e];
    const b = profile[(e + 1) % pCount];
    let nu = b[1] - a[1];
    let nv = -(b[0] - a[0]);
    const nl = Math.hypot(nu, nv) || 1;
    nu /= nl;
    nv /= nl;
    const edgeLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const base = vi;
    for (let k = 0; k < fCount; k++) {
      const f = frames[k];
      for (let j = 0; j < 2; j++) {
        const p = j === 0 ? a : b;
        const o = vi * 3;
        positions[o] = f.x + f.rx * p[0];
        positions[o + 1] = f.y + p[1];
        positions[o + 2] = f.z + f.rz * p[0];
        normals[o] = f.rx * nu;
        normals[o + 1] = nv;
        normals[o + 2] = f.rz * nu;
        uvs[vi * 2] = dist[k] * uvScale;
        uvs[vi * 2 + 1] = j * edgeLen * uvScale;
        vi++;
      }
    }
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % fCount;
      const A = base + k * 2;
      const B = A + 1;
      const D = base + k1 * 2;
      const C = D + 1;
      indices.push(A, D, C, A, C, B);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}
