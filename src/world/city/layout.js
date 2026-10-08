import { RNG } from '../../utils/rng.js';
import { lerp } from '../../utils/math.js';
import { VIEW, fitView, followFactor } from '../../camera/FollowCamera.js';
import { MIN_FLOORS, buildingTop, floorGrid, floorsUnder } from './buildings.js';

// City plan around the player's loop. The loop runs along streets of a 30-unit grid:
// every grid cell outside the loop is a block (sidewalk slab + lots), cells inside are the
// loop's island (diner / park). North of the loop: one block row, the elevated train
// street, a row of warehouses, then the waterfront and the river. The camera looks north,
// so lots between it and the loop get a height budget from sightlines to the road.

export const GRID = 30;
export const ROAD = 3.2; // city street half-width
export const WALK = 2.6; // city sidewalk width
export const FRONT = ROAD + WALK; // street centerline → building line
export const LOOP_ROAD = 4.2;
export const LOOP_FRONT = 7.4; // loop centerline → building line (loop sidewalk outer edge)
export const LOOP_SLAB = 4.4; // block slabs start under the loop sidewalk
export const ROAD_Y = 0.3;
export const SLAB_Y = 0.56;

// Distance to the loop centerline on a 0.5-unit grid around the loop.
export class DistField {
  constructor(path, pad = 16, cell = 0.5) {
    const b = path.bounds;
    this.cell = cell;
    this.pad = pad;
    this.x0 = b.minX - pad;
    this.z0 = b.minZ - pad;
    this.nx = Math.ceil((b.maxX - b.minX + 2 * pad) / cell) + 1;
    this.nz = Math.ceil((b.maxZ - b.minZ + 2 * pad) / cell) + 1;
    const d = new Float32Array(this.nx * this.nz).fill(pad * pad);
    const rc = Math.ceil(pad / cell);
    for (let k = 0; k < path.count; k += 2) {
      const px = path.xs[k], pz = path.zs[k];
      const ci = Math.round((px - this.x0) / cell), cj = Math.round((pz - this.z0) / cell);
      const j0 = Math.max(0, cj - rc), j1 = Math.min(this.nz - 1, cj + rc);
      const i0 = Math.max(0, ci - rc), i1 = Math.min(this.nx - 1, ci + rc);
      for (let j = j0; j <= j1; j++) {
        const dz = this.z0 + j * cell - pz;
        const dz2 = dz * dz;
        const o = j * this.nx;
        for (let i = i0; i <= i1; i++) {
          const dx = this.x0 + i * cell - px;
          const dd = dx * dx + dz2;
          if (dd < d[o + i]) d[o + i] = dd;
        }
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.sqrt(d[i]);
    this.d = d;
    this.x1 = this.x0 + (this.nx - 1) * cell;
    this.z1 = this.z0 + (this.nz - 1) * cell;
  }

  at(x, z) {
    const i = Math.round((x - this.x0) / this.cell), j = Math.round((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return this.pad;
    return this.d[j * this.nx + i];
  }
}

// Max top of anything built at a point (keeps the zoomed-in camera out of buildings).
export class HeightMap {
  constructor(cell = 10) {
    this.cell = cell;
    this.map = new Map();
  }

  add(x0, z0, x1, z1, top) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = i * 100003 + j;
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(x0, z0, x1, z1, top);
      }
    }
  }

  at(x, z) {
    const list = this.map.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    let h = 0;
    if (list) {
      for (let i = 0; i < list.length; i += 5) {
        if (x >= list[i] && x <= list[i + 2] && z >= list[i + 1] && z <= list[i + 3] && list[i + 4] > h) h = list[i + 4];
      }
    }
    return h;
  }
}

const FLOORS = {
  hero: [[1, 2], [2, 4], [3, 3], [4, 1]],
  loopside: [[2, 2], [3, 3], [4, 3], [5, 2]],
  elnear: [[2, 5], [3, 5]],
  elfar: [[3, 2], [4, 3], [5, 3], [6, 2]],
  wharf: [[5, 3], [6, 4], [7, 3]],
  city: [[4, 2], [5, 3], [6, 3], [7, 2], [8, 1]],
};
const STYLE = {
  walkup: [['red', 4], ['darkred', 3], ['brown', 3], ['tan', 2], ['grey', 1]],
  corner: [['cream', 3], ['mint', 2], ['red', 2], ['tan', 2]],
  hotel: [['tan', 1], ['grey', 1], ['darkred', 1]],
  warehouse: [['red', 2], ['darkred', 2], ['brown', 2]],
  deco: [['grey', 2], ['tan', 1], ['cream', 1]],
  theater: [['cream', 1], ['grey', 1]],
  shops1: [['cream', 2], ['mint', 2], ['tan', 1], ['red', 1]],
  firehouse: [['red', 1]],
  brownstone: [['brownstone', 1]],
};
const BLADES = ['vsign:pizza', 'vsign:bar', 'vsign:deli'];
const BILLBOARDS = ['bb:city', 'bb:cola', 'bb:radio', 'bb:drive'];
const MURALS = ['mural:eastside', 'mural:idle', 'mural:graffiti'];

export function planCity(path, level) {
  const rng = new RNG(7300 + level * 131);
  const B = path.bounds;
  const field = new DistField(path);
  const minZ = Math.round(B.minZ / GRID) * GRID;
  const zE = minZ - GRID; // elevated train street
  const zW = minZ - 2 * GRID; // waterfront street

  // Camera poses the player can reach (narrowest phone → farthest camera, lowest pitch).
  const fit = fitView(path, 0.46, { pitch: VIEW.pitch - 0.04 });
  const camAt = (tx, tz, D, az, pitch) => ({
    x: tx + Math.sin(az) * Math.cos(pitch) * D,
    y: 0.6 + Math.sin(pitch) * D,
    z: tz + Math.cos(az) * Math.cos(pitch) * D,
  });
  const cams = [-0.45, 0, 0.45].map((k) => camAt(fit.target.x, fit.target.z, fit.distance, fit.az + k, fit.pitch));
  const capD = Math.min(fit.distance, VIEW.cap);
  if (capD < fit.distance) {
    const f = followFactor(fit.distance, capD);
    const p = { x: 0, z: 0 };
    for (const [s0, s1] of path.straights) {
      path.pointAt((s0 + s1) / 2, p);
      cams.push(camAt(lerp(fit.target.x, p.x, f), lerp(fit.target.z, p.z, f), capD, fit.az, fit.pitch));
    }
  }
  const dirs = [-0.6, 0, 0.6].map((k) => ({ x: Math.sin(VIEW.az + k), z: Math.cos(VIEW.az + k) }));
  const viewDir = dirs[1];

  // Extents: far enough to fill the view, down to where the lowest view ray meets the ground.
  const main = cams[1];
  const hitBack = main.y / Math.tan(fit.pitch + (VIEW.fov * Math.PI) / 360);
  const zHit = main.z - Math.cos(fit.az) * hitBack;
  const Z1 = Math.max(Math.ceil((B.maxZ + 60) / GRID) * GRID, Math.ceil((zHit + 25) / GRID) * GRID);
  const X0 = Math.floor((B.minX - 210) / GRID) * GRID;
  const X1 = Math.ceil((B.maxX + 210) / GRID) * GRID;

  // Height budget: a building at (x, z) must stay under every sightline to the road behind it.
  const budget = (x, z) => {
    let best = Infinity;
    for (const c of cams) {
      let dx = x - c.x, dz = z - c.z;
      const dQ = Math.hypot(dx, dz) || 1;
      dx /= dQ;
      dz /= dQ;
      let t0 = 0, t1 = 600;
      for (const [o, d, lo, hi] of [[x, dx, field.x0, field.x1], [z, dz, field.z0, field.z1]]) {
        if (Math.abs(d) < 1e-6) {
          if (o < lo || o > hi) t1 = -1;
          continue;
        }
        const ta = (lo - o) / d, tb = (hi - o) / d;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
      for (let t = Math.max(0.5, t0); t <= t1; t += 0.75) {
        if (field.at(x + dx * t, z + dz * t) < 3.2) {
          const dR = dQ + t;
          const h = c.y + (0.8 - c.y) * (dQ / dR);
          if (h < best) best = h;
          break;
        }
      }
    }
    return best;
  };

  const segType = (ax, az, bx, bz) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (field.at(mx, mz) < 2.5) return 'loop';
    if (path.containsPoint(mx, mz)) return 'interior';
    return 'street';
  };

  // Streets (grid segments that aren't the loop or inside it).
  const streets = [];
  const interiorSegs = [];
  for (let z = zW; z <= Z1; z += GRID) {
    for (let x = X0; x < X1; x += GRID) {
      const t = segType(x, z, x + GRID, z);
      const seg = { ax: x, az: z, bx: x + GRID, bz: z, h: true, el: z === zE, water: z === zW };
      if (t === 'street') streets.push(seg);
      else if (t === 'interior') interiorSegs.push(seg);
    }
  }
  for (let x = X0; x <= X1; x += GRID) {
    for (let z = zW; z < Z1; z += GRID) {
      const t = segType(x, z, x, z + GRID);
      const seg = { ax: x, az: z, bx: x, bz: z + GRID, h: false };
      if (t === 'street') streets.push(seg);
      else if (t === 'interior') interiorSegs.push(seg);
    }
  }

  // Blocks.
  const blocks = [];
  const interior = [];
  for (let z = zW; z < Z1; z += GRID) {
    for (let x = X0; x < X1; x += GRID) {
      if (path.containsPoint(x + GRID / 2, z + GRID / 2)) {
        interior.push({ x0: x, z0: z, x1: x + GRID, z1: z + GRID });
        continue;
      }
      const s = {
        n: segType(x, z, x + GRID, z),
        s: segType(x, z + GRID, x + GRID, z + GRID),
        w: segType(x, z, x, z + GRID),
        e: segType(x + GRID, z, x + GRID, z + GRID),
      };
      const ins = (t, a, b) => (t === 'loop' ? a : b);
      const slab = { x0: x + ins(s.w, LOOP_SLAB, ROAD), x1: x + GRID - ins(s.e, LOOP_SLAB, ROAD), z0: z + ins(s.n, LOOP_SLAB, ROAD), z1: z + GRID - ins(s.s, LOOP_SLAB, ROAD) };
      const zone = { x0: x + ins(s.w, LOOP_FRONT, FRONT), x1: x + GRID - ins(s.e, LOOP_FRONT, FRONT), z0: z + ins(s.n, LOOP_FRONT, FRONT), z1: z + GRID - ins(s.s, LOOP_FRONT, FRONT) };
      const dist = path.distanceToRect(x, z, x + GRID, z + GRID);
      const north = z < minZ && x + GRID > B.minX - 75 && x < B.maxX + 75;
      blocks.push({
        x0: x, z0: z, x1: x + GRID, z1: z + GRID, sides: s, slab, zone, dist,
        detailed: dist < 42 || north,
        nearLoop: path.distanceToRect(slab.x0, slab.z0, slab.x1, slab.z1) < 7.5,
        row: z === zW ? 'wharf' : z === zE ? 'el' : 'city',
      });
    }
  }

  // Strips of lots: each detailed block is split into two halves facing opposite sides.
  const halves = [];
  for (const blk of blocks) {
    if (!blk.detailed) continue;
    const Z = blk.zone, s = blk.sides;
    if (Z.x1 - Z.x0 < 8 || Z.z1 - Z.z0 < 8) continue;
    const ns = s.n === 'loop' || s.s === 'loop' || !(s.e === 'loop' || s.w === 'loop');
    const list = [];
    if (ns) {
      const zm = (Z.z0 + Z.z1) / 2;
      list.push({ side: 's', n: { x: 0, z: 1 }, sx: Z.x0, sz: Z.z1, len: Z.x1 - Z.x0, depth: Z.z1 - zm, front: s.s, ends: [s.w, s.e] });
      list.push({ side: 'n', n: { x: 0, z: -1 }, sx: Z.x1, sz: Z.z0, len: Z.x1 - Z.x0, depth: zm - Z.z0, front: s.n, ends: [s.e, s.w] });
    } else {
      const xm = (Z.x0 + Z.x1) / 2;
      list.push({ side: 'e', n: { x: 1, z: 0 }, sx: Z.x1, sz: Z.z1, len: Z.z1 - Z.z0, depth: Z.x1 - xm, front: s.e, ends: [s.s, s.n] });
      list.push({ side: 'w', n: { x: -1, z: 0 }, sx: Z.x0, sz: Z.z0, len: Z.z1 - Z.z0, depth: xm - Z.x0, front: s.w, ends: [s.n, s.s] });
    }
    for (const h of list) {
      h.block = blk;
      h.a = { x: h.n.z, z: -h.n.x };
      h.facing = h.n.x * viewDir.x + h.n.z * viewDir.z;
      if (h.front === 'loop') h.zone = h.facing > 0.5 ? 'hero' : 'loopside';
      else if (blk.row === 'el' && h.side === 'n') h.zone = 'elnear';
      else if (blk.row === 'wharf') h.zone = h.side === 's' ? 'elfar' : 'wharf';
      else h.zone = 'city';
      h.lots = [];
      halves.push(h);
    }
    blk.halves = list;
  }

  // Special buildings: one theater on the loop, a hotel, a firehouse.
  const pickHalf = (fn) => {
    const c = halves.filter(fn);
    return c.length ? c[Math.floor(rng.next() * c.length)] : null;
  };
  const special = new Map();
  const th = pickHalf((h) => h.zone === 'hero' && h.len > 14);
  if (th) special.set(th, 'theater');
  const ho = pickHalf((h) => !special.has(h) && (h.zone === 'loopside' || h.zone === 'elfar') && h.facing > -0.2 && h.len > 14);
  if (ho) special.set(ho, 'hotel');
  const fh = pickHalf((h) => !special.has(h) && (h.zone === 'city' || h.zone === 'elfar') && h.facing > 0.5 && h.len > 14);
  if (fh) special.set(fh, 'firehouse');

  const lots = [];
  const opens = [];
  const p = { x: 0, z: 0 };
  const worldOf = (h, t, out = p) => {
    out.x = h.sx + h.a.x * t;
    out.z = h.sz + h.a.z * t;
    return out;
  };

  for (const h of halves) {
    const sp = special.get(h);
    let widths;
    if (h.zone === 'wharf') widths = rng.chance(0.5) ? [h.len] : [h.len * 0.55, h.len * 0.45];
    else if (sp === 'theater' || sp === 'hotel') widths = rng.chance(0.5) ? [h.len - 6.2, 6.2] : [6.2, h.len - 6.2];
    else if (sp === 'firehouse') widths = [8.6, h.len - 8.6];
    else widths = cut(h.len, rng);
    let t = 0;
    widths.forEach((w, k) => {
      const lot = makeLot(h, t, w, k, widths.length, sp && w > 8 ? sp : null);
      h.lots.push(lot);
      t += w;
    });
  }

  function makeLot(h, t, w, k, count, sp) {
    const d = h.depth;
    const c = worldOf(h, t + w / 2, { x: 0, z: 0 });
    const lot = {
      half: h, x: c.x, z: c.z, ry: Math.atan2(h.n.x, h.n.z), w, d, n: h.n, a: h.a,
      left: { street: k === 0, cover: 0 }, right: { street: k === count - 1, cover: 0 }, back: { cover: 0 },
      corner: k === 0 || k === count - 1,
    };
    // World footprint.
    const xs = [], zs = [];
    for (const [u, v] of [[-w / 2, 0], [w / 2, 0], [w / 2, -d], [-w / 2, -d]]) {
      xs.push(c.x + h.a.x * u + h.n.x * v);
      zs.push(c.z + h.a.z * u + h.n.z * v);
    }
    lot.aabb = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    lot.pts = xs.map((x, i) => [x, zs[i]]).concat([[c.x - h.n.x * d * 0.5, c.z - h.n.z * d * 0.5]]);

    // Lots the loop cuts into (concave corners) become plazas.
    let intrude = false;
    for (const [px, pz] of lot.pts) if (field.at(px, pz) < LOOP_FRONT - 0.3) intrude = true;
    for (let i = 0; i < 4 && !intrude; i++) {
      const [ax, az] = lot.pts[i], [bx, bz] = lot.pts[(i + 1) % 4];
      if (field.at((ax + bx) / 2, (az + bz) / 2) < LOOP_FRONT - 0.3) intrude = true;
    }
    lot.maxTop = Math.min(...lot.pts.map(([px, pz]) => budget(px, pz)));
    const dist = path.distanceToRect(lot.aabb.x0, lot.aabb.z0, lot.aabb.x1, lot.aabb.z1);
    lot.detail = dist < 28 ? 2 : dist < 56 ? 1 : 0;

    if (intrude) return openLot(lot, 'plaza');

    let type = sp ?? chooseType(h, lot, w);
    let floors = type === 'firehouse' ? 3 : type === 'hotel' ? rng.int(6, 8) : type === 'theater' ? rng.int(2, 3) : type === 'deco' ? rng.int(11, 16) : rng.weighted(FLOORS[h.zone]);
    if (type === 'shops1') floors = 1;
    if (type === 'warehouse') floors = rng.weighted(FLOORS.wharf);
    floors = Math.min(floors, floorsUnder(type, lot.maxTop));
    if (floors < MIN_FLOORS[type]) {
      if (type === 'deco' || type === 'hotel') {
        type = 'walkup';
        floors = Math.min(rng.weighted(FLOORS[h.zone]), floorsUnder(type, lot.maxTop));
      }
      if (floors < MIN_FLOORS[type]) {
        if (floorsUnder('shops1', lot.maxTop) >= 1 && rng.chance(0.55)) {
          type = 'shops1';
          floors = 1;
        } else return openLot(lot, rng.chance(0.75) ? 'parking' : 'plaza');
      }
    }
    if (type === 'corner' && floors > 4) type = 'walkup';
    Object.assign(lot, {
      type, floors,
      style: rng.weighted(STYLE[type]),
      tint: (() => {
        const k = rng.float(0.88, 1.06);
        return [k, k * rng.float(0.97, 1.02), k * rng.float(0.95, 1.01)];
      })(),
      shop: rng.int(0, 15),
      top: floorGrid(type, floors).top,
      peak: buildingTop(type, floors),
    });
    lots.push(lot);
    return lot;
  }

  function chooseType(h, lot, w) {
    const z = h.zone;
    if (z === 'wharf') return 'warehouse';
    if (lot.corner && (z === 'hero' || z === 'loopside' || z === 'city' || z === 'elnear') && rng.chance(0.5)) return 'corner';
    if (z === 'hero') return rng.chance(0.25) ? 'shops1' : 'walkup';
    if (z === 'elnear') return rng.chance(0.35) ? 'shops1' : 'walkup';
    if (z === 'city' && w > 7.5 && h.block.dist > 22 && rng.chance(0.1)) return 'deco';
    if ((z === 'city' || z === 'loopside') && rng.chance(0.25)) return 'brownstone';
    if (z === 'elfar' && rng.chance(0.2)) return 'warehouse';
    return 'walkup';
  }

  function openLot(lot, kind) {
    lot.open = kind;
    lot.top = 0.6;
    lot.peak = 0.6;
    opens.push(lot);
    return lot;
  }

  // One gas station on a visible corner along the loop (unless the island has one).
  const islandGas = level === 1;
  if (!islandGas) {
    const cand = halves
      .filter((h) => (h.zone === 'hero' || h.zone === 'loopside') && h.facing > -0.2)
      .flatMap((h) => [h.lots[0], h.lots[h.lots.length - 1]])
      .filter((l) => l && l.w >= 6.5 && !l.open);
    if (cand.length) {
      const l = cand[Math.floor(rng.next() * cand.length)];
      lots.splice(lots.indexOf(l), 1);
      openLot(l, 'gas');
    }
  }

  // Neighbour covers and visibility.
  for (const h of halves) {
    const L = h.lots;
    for (let k = 0; k < L.length; k++) {
      L[k].left.cover = k > 0 ? L[k - 1].top : 0;
      L[k].right.cover = k < L.length - 1 ? L[k + 1].top : 0;
    }
  }
  for (const blk of blocks) {
    if (!blk.halves) continue;
    const [A, Bh] = blk.halves;
    for (const [h, o] of [[A, Bh], [Bh, A]]) {
      for (const lot of h.lots) {
        let cover = Infinity;
        for (const other of o.lots) {
          const ov = Math.min(lot.aabb.x1, other.aabb.x1) - Math.max(lot.aabb.x0, other.aabb.x0);
          const ovz = Math.min(lot.aabb.z1, other.aabb.z1) - Math.max(lot.aabb.z0, other.aabb.z0);
          if ((h.n.z !== 0 ? ov : ovz) > 0.2) cover = Math.min(cover, other.top);
        }
        lot.back.cover = cover === Infinity ? 0 : cover;
      }
    }
  }
  const faceVisible = (nx, nz, px, pz) => {
    for (const d of dirs) if (nx * d.x + nz * d.z > 0.05) return true;
    for (const c of cams) {
      const dx = c.x - px, dz = c.z - pz;
      if ((nx * dx + nz * dz) / (Math.hypot(dx, dz) || 1) > 0.02) return true;
    }
    return false;
  };
  for (const lot of lots) {
    const { n, a, x, z, d, w } = lot;
    lot.vis = {
      front: faceVisible(n.x, n.z, x, z),
      back: faceVisible(-n.x, -n.z, x - n.x * d, z - n.z * d),
      right: faceVisible(a.x, a.z, x + (a.x * w) / 2 - (n.x * d) / 2, z + (a.z * w) / 2 - (n.z * d) / 2),
      left: faceVisible(-a.x, -a.z, x - (a.x * w) / 2 - (n.x * d) / 2, z - (a.z * w) / 2 - (n.z * d) / 2),
    };
  }

  // Decorations: blade signs, rooftop billboards, murals, ghost signs.
  let bb = 0, mu = 0;
  for (const lot of lots) {
    const facing = lot.half.facing;
    if (lot.type === 'walkup' && lot.vis.front && facing > 0.3 && lot.floors >= 3 && rng.chance(0.2)) lot.blade = rng.pick(BLADES);
    if ((lot.type === 'shops1' || lot.type === 'corner' || (lot.type === 'walkup' && lot.floors <= 2)) && facing > 0.4 && lot.w >= 6 && lot.peak + 6 < lot.maxTop && rng.chance(0.35)) {
      lot.billboard = BILLBOARDS[bb++ % BILLBOARDS.length];
    }
    if (lot.type === 'warehouse' && rng.chance(0.6)) lot.ghost = true;
    if (mu < 4 && lot.detail >= 1) {
      for (const key of ['left', 'right']) {
        if (!lot[key].street && lot.vis[key] && lot.top - Math.max(0.56, lot[key].cover) > 8.5 && !lot.mural && rng.chance(0.6)) {
          lot.mural = key;
          lot.muralCell = MURALS[mu++ % MURALS.length];
        }
      }
    }
  }

  // Junctions where city streets meet the loop: sidewalk gaps, crosswalks, traffic lights.
  const bands = [];
  const junctions = [];
  for (const st of streets) {
    const nearLoop = path.distanceToRect(Math.min(st.ax, st.bx) - ROAD, Math.min(st.az, st.bz) - ROAD, Math.max(st.ax, st.bx) + ROAD, Math.max(st.az, st.bz) + ROAD) < 12;
    if (!nearLoop) continue;
    if (st.h) bands.push({ x0: Math.min(st.ax, st.bx) - 1, x1: Math.max(st.ax, st.bx) + 1, z0: st.az - ROAD, z1: st.az + ROAD });
    else bands.push({ x0: st.ax - ROAD, x1: st.ax + ROAD, z0: Math.min(st.az, st.bz) - 1, z1: Math.max(st.az, st.bz) + 1 });
    for (const [px, pz, qx, qz] of [[st.ax, st.az, st.bx, st.bz], [st.bx, st.bz, st.ax, st.az]]) {
      if (field.at(px, pz) > 9) continue;
      const dx = Math.sign(qx - px), dz = Math.sign(qz - pz);
      let t = 0;
      while (t < 14 && field.at(px + dx * t, pz + dz * t) < LOOP_FRONT) t += 0.25;
      junctions.push({ x: px, z: pz, dx, dz, mouth: t, street: st });
      if (px === st.ax && pz === st.az) st.startMouth = t;
      else st.endMouth = t;
    }
  }
  const gapAt = (x, z) => {
    for (const b of bands) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
    return false;
  };

  // Island features by level.
  const order = level <= 1 ? ['diner', 'gas'] : ['court', 'diner', 'playground', 'pond', 'grove', 'ballfield', 'grove'];
  interior.sort((A, Bc) => Bc.z0 - A.z0 || A.x0 - Bc.x0); // camera side first
  if (level <= 1) interior.sort((A, Bc) => Bc.x0 - A.x0);
  interior.forEach((c, i) => (c.feature = order[i % order.length]));

  const heights = new HeightMap();
  for (const lot of lots) heights.add(lot.aabb.x0, lot.aabb.z0, lot.aabb.x1, lot.aabb.z1, lot.peak);

  return {
    path, level, field, fit, cams, dirs, viewDir, budget,
    minZ, zE, zW, X0, X1, Z1,
    blocks, halves, lots, opens, streets, interior, interiorSegs, junctions,
    gapAt, heights, rng,
  };
}

// Frontage widths along a strip: 5.4–9.4 units, no slivers.
function cut(len, rng) {
  const ws = [];
  let rest = len;
  while (rest > 0.01) {
    let w = rest < 11 ? rest : rng.float(5.4, 9.4);
    const left = rest - w;
    if (left > 0.01 && left < 4.8) w = rest / 2;
    ws.push(w);
    rest -= w;
  }
  return ws;
}

