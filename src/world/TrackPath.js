import { TRACKS } from '../config.js';

// A closed loop in the XZ plane built from a polygon with filleted (rounded) corners,
// resampled uniformly by arc length so position lookups are O(1).
export class TrackPath {
  constructor(polygon, radius, spacing = 0.25) {
    this.polygon = polygon.map(([x, z]) => ({ x, z }));
    const { pts, arcs } = filletLoop(this.polygon, radius);

    // Cumulative length of the dense polyline (closed).
    const n = pts.length;
    const cum = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) {
      const a = pts[i - 1];
      const b = pts[i % n];
      cum[i] = cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z);
    }
    const total = cum[n];
    this.length = total;

    // Straight stretches between corner arcs, as [s0, s1] arc-length ranges.
    this.straights = arcs.map((arc, i) => {
      const s0 = cum[arc[1]];
      const s1 = i + 1 < arcs.length ? cum[arcs[i + 1][0]] : total + cum[arcs[0][0]];
      return [s0, s1];
    });

    // Uniform resample.
    const count = Math.max(8, Math.ceil(total / spacing));
    this.count = count;
    this.step = total / count;
    this.xs = new Float32Array(count);
    this.zs = new Float32Array(count);
    let seg = 0;
    for (let j = 0; j < count; j++) {
      const s = j * this.step;
      while (seg < n - 1 && cum[seg + 1] < s) seg++;
      const a = pts[seg];
      const b = pts[(seg + 1) % n];
      const segLen = cum[seg + 1] - cum[seg] || 1;
      const t = (s - cum[seg]) / segLen;
      this.xs[j] = a.x + (b.x - a.x) * t;
      this.zs[j] = a.z + (b.z - a.z) * t;
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let j = 0; j < count; j++) {
      minX = Math.min(minX, this.xs[j]);
      maxX = Math.max(maxX, this.xs[j]);
      minZ = Math.min(minZ, this.zs[j]);
      maxZ = Math.max(maxZ, this.zs[j]);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
    this.center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    this.radius = Math.max(maxX - minX, maxZ - minZ) / 2;
  }

  wrap(s) {
    s %= this.length;
    return s < 0 ? s + this.length : s;
  }

  pointAt(s, out = { x: 0, z: 0 }) {
    const f = this.wrap(s) / this.step;
    const i = Math.floor(f) % this.count;
    const t = f - Math.floor(f);
    const j = (i + 1) % this.count;
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * t;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * t;
    return out;
  }

  tangentAt(s, out = { x: 0, z: 0 }) {
    const a = this.pointAt(s - this.step, _a);
    const b = this.pointAt(s + this.step, _b);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    out.x = dx / l;
    out.z = dz / l;
    return out;
  }

  // Approximate distance from a point to the centerline (1-unit sampling).
  distanceTo(x, z) {
    const stride = Math.max(1, Math.round(1 / this.step));
    let best = Infinity;
    for (let i = 0; i < this.count; i += stride) {
      const dx = this.xs[i] - x;
      const dz = this.zs[i] - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // Approximate distance from an axis-aligned rectangle to the centerline.
  distanceToRect(minX, minZ, maxX, maxZ) {
    const b = this.bounds;
    const gap = Math.max(b.minX - maxX, minX - b.maxX, b.minZ - maxZ, minZ - b.maxZ);
    if (gap > 30) return gap;
    const stride = Math.max(1, Math.round(1 / this.step));
    let best = Infinity;
    for (let i = 0; i < this.count; i += stride) {
      const x = this.xs[i];
      const z = this.zs[i];
      const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
      const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  containsPoint(x, z) {
    const p = this.polygon;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if (p[i].z > z !== p[j].z > z && x < ((p[j].x - p[i].x) * (z - p[i].z)) / (p[j].z - p[i].z) + p[i].x) {
        inside = !inside;
      }
    }
    return inside;
  }

  // +1 if the outside of the loop is to the right of the travel direction at s, else -1.
  outwardSide(s) {
    const p = this.pointAt(s, _a);
    const t = this.tangentAt(s, _b);
    const rx = -t.z;
    const rz = t.x;
    return this.containsPoint(p.x + rx * 6, p.z + rz * 6) ? -1 : 1;
  }

  // Reward-line positions. Slot 0 (the station) sits mid-way along the longest straight;
  // each next slot is the straight-side spot farthest from all previous ones.
  computeSlots(count) {
    const L = this.length;
    const cands = [];
    let longest = null;
    for (const [s0, s1] of this.straights) {
      const len = s1 - s0;
      if (len < 1.5) continue;
      if (!longest || len > longest.len + 0.01) longest = { s: (s0 + s1) / 2, len };
      const k = Math.max(1, Math.floor(len / 7));
      for (let i = 0; i < k; i++) cands.push({ s: s0 + (len * (i + 0.5)) / k, pen: 0 });
      cands.push({ s: (s0 + s1) / 2, pen: 0 });
    }
    for (let s = 0; s < L; s += 10) cands.push({ s, pen: 8 });

    const slots = [longest ? longest.s : 0];
    while (slots.length < count) {
      let best = null;
      let bestScore = -Infinity;
      for (const c of cands) {
        let dmin = Infinity;
        for (const s of slots) {
          let d = Math.abs(c.s - s) % L;
          d = Math.min(d, L - d);
          if (d < dmin) dmin = d;
        }
        const score = dmin - c.pen;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      slots.push(best.s);
    }
    return slots.map((s) => this.wrap(s));
  }
}

const _a = { x: 0, z: 0 };
const _b = { x: 0, z: 0 };

function filletLoop(poly, radius) {
  const n = poly.length;
  const pts = [];
  const arcs = []; // [startIndex, endIndex] into pts for each corner
  for (let i = 0; i < n; i++) {
    const P = poly[i];
    const A = poly[(i + n - 1) % n];
    const B = poly[(i + 1) % n];
    let ax = P.x - A.x, az = P.z - A.z;
    const la = Math.hypot(ax, az);
    ax /= la;
    az /= la;
    let bx = B.x - P.x, bz = B.z - P.z;
    const lb = Math.hypot(bx, bz);
    bx /= lb;
    bz /= lb;
    const phi = Math.acos(Math.min(1, Math.max(-1, ax * bx + az * bz)));
    if (phi < 1e-4) {
      arcs.push([pts.length, pts.length]);
      pts.push({ x: P.x, z: P.z });
      continue;
    }
    let d = radius * Math.tan(phi / 2);
    let r = radius;
    const dMax = 0.49 * Math.min(la, lb);
    if (d > dMax) {
      d = dMax;
      r = d / Math.tan(phi / 2);
    }
    const sx = P.x - ax * d, sz = P.z - az * d;
    const ex = P.x + bx * d, ez = P.z + bz * d;
    let nx = -az, nz = ax; // normal of the incoming direction, pointing into the turn
    if (nx * bx + nz * bz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const cx = sx + nx * r, cz = sz + nz * r;
    const a0 = Math.atan2(sz - cz, sx - cx);
    let da = Math.atan2(ez - cz, ex - cx) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 48)));
    const start = pts.length;
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (da * k) / steps;
      pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
    arcs.push([start, pts.length - 1]);
  }
  return { pts, arcs };
}

const cache = new Map();
export function getTrackPath(level) {
  if (!cache.has(level)) {
    const def = TRACKS[level];
    cache.set(level, new TrackPath(def.points, def.radius));
  }
  return cache.get(level);
}
