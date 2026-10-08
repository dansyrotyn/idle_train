import * as THREE from 'three';

const colorCache = new Map();
const _c = new THREE.Color();

// Hex color → linear [r, g, b] (vertex colors are in the linear working space).
export function lin(hex) {
  if (Array.isArray(hex)) return hex;
  let c = colorCache.get(hex);
  if (!c) {
    _c.set(hex);
    c = [_c.r, _c.g, _c.b];
    colorCache.set(hex, c);
  }
  return c;
}

export function mulColor(hex, k) {
  const c = lin(hex);
  return [c[0] * k, c[1] * k, c[2] * k];
}

// Collects textured, vertex-colored geometry in a movable local frame and bakes it into
// one indexed BufferGeometry. Local frame: rotation `ry` about Y, then translation.
// UV argument: atlas cell name, a rect {u0,v0,u1,v1}, {tw, th} for world-tiled UVs,
// or nothing (the atlas's white cell, so the vertex color shows as is).
export class Builder {
  constructor(rects = null) {
    this.R = rects;
    this.white = rects?.white ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
    this.pos = [];
    this.nor = [];
    this.uvs = [];
    this.col = [];
    this.idx = [];
    this.vc = 0;
    this.frame(0, 0, 0, 0);
  }

  frame(x, y, z, ry = 0) {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.cs = Math.cos(ry);
    this.sn = Math.sin(ry);
    return this;
  }

  // Local → world for a point (used by callers that need world positions).
  world(x, z, out = { x: 0, z: 0 }) {
    out.x = this.ox + this.cs * x + this.sn * z;
    out.z = this.oz - this.sn * x + this.cs * z;
    return out;
  }

  rect(uv) {
    if (!uv) return this.white;
    if (typeof uv === 'string') return this.R?.[uv] ?? this.white;
    return uv;
  }

  v(x, y, z, nx, ny, nz, u, w, c) {
    const cs = this.cs, sn = this.sn;
    this.pos.push(this.ox + cs * x + sn * z, this.oy + y, this.oz - sn * x + cs * z);
    this.nor.push(cs * nx + sn * nz, ny, -sn * nx + cs * nz);
    this.uvs.push(u, w);
    this.col.push(c[0], c[1], c[2]);
    return this.vc++;
  }

  // UVs for a face spanning [a, b] horizontally and [y0, y1] vertically.
  corners(uv, a, b, y0, y1) {
    if (uv && uv.tw) return [a / uv.tw, y0 / uv.th, b / uv.tw, y1 / uv.th];
    const r = this.rect(uv);
    if (r === this.white) {
      const u = (r.u0 + r.u1) / 2, v = (r.v0 + r.v1) / 2;
      return [u, v, u, v];
    }
    return [r.u0, r.v0, r.u1, r.v1];
  }

  // Four local points, counter-clockwise seen from the front.
  // p0 → (u0, v0), p1 → (u1, v0), p2 → (u1, v1), p3 → (u0, v1).
  quad(p0, p1, p2, p3, uv, color, uvc = null) {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const [u0, v0, u1, v1] = uvc ?? this.corners(uv, 0, 1, 0, 1);
    const c = lin(color);
    const i = this.v(p0[0], p0[1], p0[2], nx, ny, nz, u0, v0, c);
    this.v(p1[0], p1[1], p1[2], nx, ny, nz, u1, v0, c);
    this.v(p2[0], p2[1], p2[2], nx, ny, nz, u1, v1, c);
    this.v(p3[0], p3[1], p3[2], nx, ny, nz, u0, v1, c);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  // Vertical face on the line P0 + U * t (U = unit (ux, uz)), t ∈ [a, b], y ∈ [y0, y1].
  // Its normal is (-uz, 0, ux): U runs left → right for a viewer in front of it.
  face(x0, z0, ux, uz, a, b, y0, y1, uv, color) {
    const [u0, v0, u1, v1] = this.corners(uv, a, b, y0, y1);
    const c = lin(color);
    const nx = -uz, nz = ux;
    const xa = x0 + ux * a, za = z0 + uz * a, xb = x0 + ux * b, zb = z0 + uz * b;
    const i = this.v(xa, y0, za, nx, 0, nz, u0, v0, c);
    this.v(xb, y0, zb, nx, 0, nz, u1, v0, c);
    this.v(xb, y1, zb, nx, 0, nz, u1, v1, c);
    this.v(xa, y1, za, nx, 0, nz, u0, v1, c);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  // Horizontal rectangle facing up (or down).
  flat(x0, z0, x1, z1, y, uv, color, down = false) {
    const [u0, v0, u1, v1] = uv && uv.tw ? [x0 / uv.tw, -z1 / uv.th, x1 / uv.tw, -z0 / uv.th] : this.corners(uv, 0, 1, 0, 1);
    const c = lin(color);
    const ny = down ? -1 : 1;
    const i = this.v(x0, y, z1, 0, ny, 0, u0, v0, c);
    this.v(x1, y, z1, 0, ny, 0, u1, v0, c);
    this.v(x1, y, z0, 0, ny, 0, u1, v1, c);
    this.v(x0, y, z0, 0, ny, 0, u0, v1, c);
    if (down) this.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
    else this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  // Axis-aligned box. `uv` for the sides (string/rect/tile), `top` for the lid.
  // opts: { top, bottom: false, sides: true, skip: Set of 'px','nx','pz','nz' }
  box(x0, y0, z0, x1, y1, z1, color, uv = null, opts = {}) {
    const skip = opts.skip;
    const off = uv && uv.tw ? x1 - x0 : 0; // keeps tiled windows continuous around the corner
    if (!skip?.has('pz')) this.face(x0, z1, 1, 0, 0, x1 - x0, y0, y1, uv, color);
    if (!skip?.has('nz')) this.face(x1, z0, -1, 0, 0, x1 - x0, y0, y1, uv, color);
    if (!skip?.has('px')) this.face(x1, z1 + off, 0, -1, off, off + z1 - z0, y0, y1, uv, color);
    if (!skip?.has('nx')) this.face(x0, z0, 0, 1, 0, z1 - z0, y0, y1, uv, color);
    if (opts.top !== false) this.flat(x0, z0, x1, z1, y1, opts.top ?? null, opts.topColor ?? color);
    if (opts.bottom) this.flat(x0, z0, x1, z1, y0, null, color, true);
  }

  // Box centered at (x, z) with size (w, d), from y0 to y1.
  cbox(x, z, w, d, y0, y1, color, uv = null, opts = {}) {
    this.box(x - w / 2, y0, z - d / 2, x + w / 2, y1, z + d / 2, color, uv, opts);
  }

  // Box rotated about Y around its own center (local frame stays the builder's).
  rbox(x, z, w, d, y0, y1, ry, color, uv = null) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (u, v, y) => [x + c * u + s * v, y, z - s * u + c * v];
    const hw = w / 2, hd = d / 2;
    const pts = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
    for (let k = 0; k < 4; k++) {
      const [ua, va] = pts[k], [ub, vb] = pts[(k + 1) % 4];
      this.quad(P(ua, va, y0), P(ub, vb, y0), P(ub, vb, y1), P(ua, va, y1), uv, color);
    }
    this.quad(P(-hw, hd, y1), P(hw, hd, y1), P(hw, -hd, y1), P(-hw, -hd, y1), null, color);
  }

  // Thin bar between two points (square cross-section), for rails, ladders, cables.
  bar(ax, ay, az, bx, by, bz, t, color) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1;
    // Two perpendicular unit vectors.
    let px = -dz, py = 0, pz = dx;
    let pl = Math.hypot(px, pz);
    if (pl < 1e-5) {
      px = 1;
      pz = 0;
      pl = 1;
    }
    px /= pl;
    pz /= pl;
    const qx = (dy * pz - dz * py) / len, qy = (dz * px - dx * pz) / len, qz = (dx * py - dy * px) / len;
    const h = t / 2;
    const corner = (k) => {
      const s1 = k === 0 || k === 3 ? -h : h;
      const s2 = k < 2 ? -h : h;
      return [px * s1 + qx * s2, py * s1 + qy * s2, pz * s1 + qz * s2];
    };
    for (let k = 0; k < 4; k++) {
      const c0 = corner(k), c1 = corner((k + 1) % 4);
      this.quad(
        [ax + c0[0], ay + c0[1], az + c0[2]],
        [ax + c1[0], ay + c1[1], az + c1[2]],
        [bx + c1[0], by + c1[1], bz + c1[2]],
        [bx + c0[0], by + c0[1], bz + c0[2]],
        null,
        color,
      );
    }
  }

  // Cylinder (optionally tapered) with a top cap. uv cell wraps once around.
  cyl(x, z, r0, y0, y1, seg, color, uv = null, { r1 = r0, cap = true, capColor = color } = {}) {
    const rc = this.rect(uv);
    const plain = rc === this.white;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const uA = plain ? (rc.u0 + rc.u1) / 2 : rc.u0 + ((rc.u1 - rc.u0) * k) / seg;
      const uB = plain ? uA : rc.u0 + ((rc.u1 - rc.u0) * (k + 1)) / seg;
      const vA = plain ? (rc.v0 + rc.v1) / 2 : rc.v0, vB = plain ? vA : rc.v1;
      this.quad(
        [x + Math.sin(a0) * r0, y0, z + Math.cos(a0) * r0],
        [x + Math.sin(a1) * r0, y0, z + Math.cos(a1) * r0],
        [x + Math.sin(a1) * r1, y1, z + Math.cos(a1) * r1],
        [x + Math.sin(a0) * r1, y1, z + Math.cos(a0) * r1],
        null,
        color,
        [uA, vA, uB, vB],
      );
    }
    if (cap && r1 > 0.001) this.disc(x, z, r1, y1, seg, capColor);
  }

  disc(x, z, r, y, seg, color, uv = null) {
    const c = lin(color);
    const [u, v] = this.corners(uv, 0, 1, 0, 1);
    const center = this.v(x, y, z, 0, 1, 0, u, v, c);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      this.v(x + Math.sin(a) * r, y, z + Math.cos(a) * r, 0, 1, 0, u, v, c);
    }
    for (let k = 0; k < seg; k++) this.idx.push(center, center + 1 + k, center + 2 + k);
  }

  cone(x, z, r, y0, y1, seg, color) {
    this.cyl(x, z, r, y0, y1, seg, color, null, { r1: 0.0001, cap: false });
  }

  // Appends a three.js geometry (local coordinates) in one color.
  geometry(g, color, uv = null) {
    const p = g.attributes.position, n = g.attributes.normal;
    const c = lin(color);
    const [u, v] = this.corners(uv, 0, 1, 0, 1);
    const base = this.vc;
    for (let i = 0; i < p.count; i++) this.v(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), u, v, c);
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    g.dispose();
  }

  get empty() {
    return this.vc === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
