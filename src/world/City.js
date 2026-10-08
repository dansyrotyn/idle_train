import * as THREE from 'three';
import { RNG } from '../utils/rng.js';
import { clamp } from '../utils/math.js';
import { TRACKS, TRACK_HEIGHT } from '../config.js';
import { Builder } from './city/Builder.js';
import { getAtlas, skylineTexture, skylineGlassTexture, skylineDecoTexture, asphaltTexture, sidewalkTexture, waterTexture, grassTexture } from './city/atlas.js';
import { planCity, GRID, ROAD, FRONT, LOOP_FRONT, ROAD_Y, SLAB_Y } from './city/layout.js';
import { buildBuilding, farBox, GROUND } from './city/buildings.js';
import * as P from './city/props.js';
import { buildBackdrop } from './city/backdrop.js';
import { Life } from './city/life.js';

// A 90s city around the player's loop, rebuilt for every loop size: a street grid of brick
// walk-ups, corner stores, brownstones and specials (theater, hotel, firehouse) with street
// furniture, traffic and pedestrians; an elevated train, the waterfront, a stone suspension
// bridge, harbour cranes and the downtown skyline to the north. The loop's island holds a
// chrome diner (small loops) or a park.

const MAX_SLOTS = Math.max(...TRACKS.map((t) => t.maxGates));
const CHUNK = 120;
const WALK_Y = TRACK_HEIGHT + 0.25; // loop sidewalk top
const ISLAND_Y = 0.5;
const TILE4 = { tw: 4, th: 4 };
const MARK_Y = ROAD_Y + 0.012;
const MARK = 0xf0ede4;
const TREE_COLORS = [0x5cbf3a, 0x4caf50, 0x7ccf3f, 0x3f9e3a, 0x6aa84f, 0x8bc34a];
const FAR_TINTS = [[[0.86, 0.62, 0.52], 3], [[0.92, 0.85, 0.74], 3], [[0.8, 0.8, 0.82], 2], [[0.95, 0.92, 0.86], 2], [[0.72, 0.5, 0.42], 1]];
const ROOFS = [0x5d5a57, 0x6b6560, 0x4f4d4c, 0x7a716a];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

// Runs of a 0.5-unit sampled test along [a0, a1].
function runs(a0, a1, test, step = 0.5) {
  const out = [];
  let start = null;
  for (let a = a0; ; a += step) {
    const end = Math.min(a + step, a1);
    const ok = a < a1 - 1e-6 && test((a + end) / 2);
    if (ok && start === null) start = a;
    if (!ok && start !== null) {
      out.push([start, Math.min(a, a1)]);
      start = null;
    }
    if (a >= a1 - 1e-6) break;
  }
  return out;
}

export class City {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const atlas = getAtlas();
    this.rects = atlas.rects;
    this.waterTex = waterTexture();
    this.mats = {
      lit: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true }),
      sky: new THREE.MeshLambertMaterial({ map: skylineTexture(), vertexColors: true }),
      glass: new THREE.MeshLambertMaterial({ map: skylineGlassTexture(), vertexColors: true }),
      deco: new THREE.MeshLambertMaterial({ map: skylineDecoTexture(), vertexColors: true }),
      walk: new THREE.MeshLambertMaterial({ map: sidewalkTexture(), vertexColors: true }),
      asphalt: new THREE.MeshLambertMaterial({ map: asphaltTexture(), vertexColors: true }),
      grass: new THREE.MeshLambertMaterial({ map: grassTexture(), vertexColors: true }),
      water: new THREE.MeshPhongMaterial({ map: this.waterTex, specular: 0x3a4a5a, shininess: 60 }),
      cable: new THREE.LineBasicMaterial({ color: 0x4a463f }),
      crown: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x7a5233 }),
    };
    this.treeGeos = {
      crown: new THREE.IcosahedronGeometry(1.45, 1).scale(1, 0.92, 1).translate(0, 3.1, 0),
      trunk: new THREE.CylinderGeometry(0.14, 0.2, 2.0, 5).translate(0, 1.0, 0),
    };
    this.life = new Life(this.group, this.mats);
    this.meshes = [];
    this.planData = null;
    this.time = 0;
  }

  plan(path, level) {
    this.planData = planCity(path, level);
    return this.planData;
  }

  heightAt(x, z) {
    return this.planData ? this.planData.heights.at(x, z) : 0;
  }

  buildDynamic(path, plan = null, exclusions = []) {
    this.clear();
    if (!plan || plan.path !== path) plan = this.plan(path, plan?.level ?? 0);
    this.planData = plan;
    const rects = this.rects;
    const chunks = new Map();
    const at = (x, z) => {
      const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
      let c = chunks.get(key);
      if (!c) chunks.set(key, (c = { lit: new Builder(rects), glow: new Builder(rects), sky: new Builder(), walk: new Builder() }));
      return c;
    };
    const far = { lit: new Builder(rects), glow: new Builder(rects), sky: new Builder(), glass: new Builder(), deco: new Builder(), walk: new Builder(), water: new Builder() };
    const ctx = {
      plan, at, far, lines: [], trees: [], exclusions,
      rng: new RNG(1000 + plan.level * 3),
      slots: path.computeSlots(MAX_SLOTS).slice(0, TRACKS[plan.level]?.maxGates ?? 8),
      budget: new Map(),
    };
    ctx.fits = (x, z, top) => {
      const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
      let v = ctx.budget.get(k);
      if (v === undefined) ctx.budget.set(k, (v = plan.budget(x, z)));
      return v > top;
    };

    const ground = new Builder();
    ground.flat(plan.X0 - 420, plan.zW - ROAD, plan.X1 + 420, plan.Z1 + 500, ROAD_Y, { tw: 8, th: 8 }, 0xffffff);
    const grass = new Builder();

    this.buildSlabs(ctx);
    this.buildLots(ctx);
    this.buildFarBlocks(ctx);
    this.buildStreets(ctx);
    this.buildLoopside(ctx);
    this.buildIsland(ctx, grass);
    const bd = buildBackdrop(ctx);

    const M = this.mats;
    for (const c of chunks.values()) {
      this.add(c.lit, M.lit, true);
      this.add(c.glow, M.glow, false);
      this.add(c.sky, M.sky, true);
      this.add(c.walk, M.walk, false);
    }
    this.add(far.lit, M.lit, false);
    this.add(far.glow, M.glow, false);
    this.add(far.sky, M.sky, false);
    this.add(far.glass, M.glass, false);
    this.add(far.deco, M.deco, false);
    this.add(far.walk, M.walk, false);
    this.add(far.water, M.water, false, false);
    this.add(ground, M.asphalt, false);
    this.add(grass, M.grass, false);
    if (ctx.lines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ctx.lines, 3));
      const l = new THREE.LineSegments(g, M.cable);
      this.group.add(l);
      this.meshes.push(l);
    }
    this.addTrees(ctx.trees, ctx.rng);
    this.life.build(plan, { ...bd, stationS: ctx.slots[0] });
  }

  add(builder, mat, cast, receive = true) {
    if (builder.empty) return;
    const m = new THREE.Mesh(builder.build(), mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    this.group.add(m);
    this.meshes.push(m);
  }

  // --- blocks ------------------------------------------------------------------------------

  // Sidewalk slabs. Next to the loop they are cut along its sidewalk (which covers the seam).
  buildSlabs({ plan, at }) {
    const f = plan.field;
    for (const blk of plan.blocks) {
      const S = blk.slab;
      const w = at((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2).walk.frame(0, 0, 0, 0);
      if (!blk.nearLoop) {
        w.box(S.x0, ROAD_Y - 0.05, S.z0, S.x1, SLAB_Y, S.z1, 0xffffff, TILE4, { top: TILE4 });
        continue;
      }
      const ok = (x, z) => f.at(x, z) >= 6.2;
      for (let z = S.z0; z < S.z1 - 1e-6; z += 0.5) {
        const z1 = Math.min(z + 0.5, S.z1), zc = (z + z1) / 2;
        for (const [a, b] of runs(S.x0, S.x1, (x) => ok(x, zc))) w.flat(a, z, b, z1, SLAB_Y, TILE4, 0xffffff);
      }
      const s = blk.sides, CURB = 0xd8d2c6;
      if (s.s === 'street') for (const [a, b] of runs(S.x0, S.x1, (x) => ok(x, S.z1 - 0.25))) w.face(a, S.z1, 1, 0, 0, b - a, ROAD_Y, SLAB_Y, TILE4, CURB);
      if (s.n === 'street') for (const [a, b] of runs(S.x0, S.x1, (x) => ok(x, S.z0 + 0.25))) w.face(b, S.z0, -1, 0, 0, b - a, ROAD_Y, SLAB_Y, TILE4, CURB);
      if (s.e === 'street') for (const [a, b] of runs(S.z0, S.z1, (z) => ok(S.x1 - 0.25, z))) w.face(S.x1, b, 0, -1, 0, b - a, ROAD_Y, SLAB_Y, TILE4, CURB);
      if (s.w === 'street') for (const [a, b] of runs(S.z0, S.z1, (z) => ok(S.x0 + 0.25, z))) w.face(S.x0, a, 0, 1, 0, b - a, ROAD_Y, SLAB_Y, TILE4, CURB);
    }
  }

  buildLots(ctx) {
    const { plan, at, rng, trees } = ctx;
    for (const lot of plan.lots) {
      const c = at(lot.x, lot.z);
      c.lit.frame(lot.x, 0, lot.z, lot.ry);
      c.glow.frame(lot.x, 0, lot.z, lot.ry);
      buildBuilding(c.lit, c.glow, rng, lot);
    }
    const f = plan.field, vd = plan.viewDir, cx = plan.path.center.x, cz = plan.path.center.z;
    const BB = ['bb:cola', 'bb:drive', 'bb:city', 'bb:radio'];
    let bb = rng.int(0, 3);
    for (const lot of plan.opens) {
      const c = at(lot.x, lot.z);
      if (lot.open === 'gas') P.gasStation(c.lit, c.glow, rng, lot.x, lot.z, lot.ry, lot.w, lot.d);
      else if (lot.open === 'parking') {
        // Billboards only past the loop, where they face the camera without hiding anything.
        const behind = (lot.x - cx) * vd.x + (lot.z - cz) * vd.z < -8;
        P.parkingLot(c.lit, c.glow, rng, lot, trees, behind && rng.chance(0.8) ? BB[bb++ % BB.length] : null);
      }
      else if (lot.pts.some(([x, z]) => f.at(x, z) < LOOP_FRONT + 0.2)) {
        // Corner the loop cuts into: a few trees and a bench on the sidewalk.
        for (let u = -lot.w / 2 + 1.6; u < lot.w / 2 - 1; u += 3.6) {
          for (let v = -1.8; v > -lot.d + 1; v -= 3.6) {
            const x = lot.x + lot.a.x * u + lot.n.x * v, z = lot.z + lot.a.z * u + lot.n.z * v;
            if (f.at(x, z) > 9.2 && ctx.fits(x, z, GROUND + 4.8) && rng.chance(0.7)) trees.push({ x, z });
          }
        }
      } else P.plazaLot(c.lit, c.glow, rng, lot, trees);
    }
  }

  // Blocks away from the loop: plain boxes with tiled windows, under the sightline budget.
  buildFarBlocks(ctx) {
    const { plan, at, rng } = ctx;
    const B = (x, z) => {
      const k = `${Math.round(x)},${Math.round(z)}`;
      let v = ctx.budget.get(k);
      if (v === undefined) ctx.budget.set(k, (v = plan.budget(x, z)));
      return v;
    };
    for (const blk of plan.blocks) {
      if (blk.detailed) continue;
      const Z = blk.zone;
      const c = at((Z.x0 + Z.x1) / 2, (Z.z0 + Z.z1) / 2);
      const xm = Z.x0 + (Z.x1 - Z.x0) * rng.float(0.35, 0.65), zm = Z.z0 + (Z.z1 - Z.z0) * rng.float(0.35, 0.65);
      const tall = clamp((blk.dist - 50) / 150, 0, 1);
      for (const [x0, x1] of [[Z.x0, xm], [xm, Z.x1]]) {
        for (const [z0, z1] of [[Z.z0, zm], [zm, Z.z1]]) {
          const cap = Math.min(B(x0, z0), B(x1, z0), B(x0, z1), B(x1, z1), B((x0 + x1) / 2, (z0 + z1) / 2)) - GROUND - 0.4;
          let h = rng.float(8, 19) + tall * rng.float(0, 24);
          if (rng.chance(0.06)) h += rng.float(18, 40);
          h = Math.min(h, cap);
          if (h < 3.6) {
            this.farParking(c.lit, rng, x0, z0, x1, z1);
            continue;
          }
          farBox(c.sky.frame(0, 0, 0, 0), x0, z0, x1, z1, GROUND, h, rng.weighted(FAR_TINTS), rng.pick(ROOFS));
          plan.heights.add(x0, z0, x1, z1, GROUND + h);
        }
      }
    }
  }

  farParking(b, rng, x0, z0, x1, z1) {
    b.frame(0, 0, 0, 0);
    b.flat(x0 + 0.4, z0 + 0.4, x1 - 0.4, z1 - 0.4, GROUND + 0.03, null, 0x45474d);
    for (let z = z0 + 2.6; z < z1 - 2; z += 5.4) {
      for (let x = x0 + 1.8; x < x1 - 1.4; x += 2.6) {
        if (rng.chance(0.55)) P.parkedCar(b, x, z, rng.chance(0.5) ? 0 : Math.PI, rng, GROUND + 0.03);
      }
    }
  }

  // --- streets ----------------------------------------------------------------------------

  buildStreets(ctx) {
    const { plan, at, rng, trees } = ctx;
    const Bd = plan.path.bounds;
    const near = (x, z, r) => x > Bd.minX - r && x < Bd.maxX + r && z > Bd.minZ - r && z < Bd.maxZ + r;

    for (const st of plan.streets) {
      const mx = (st.ax + st.bx) / 2, mz = (st.az + st.bz) / 2;
      if (!near(mx, mz, 150)) continue;
      const dx = Math.sign(st.bx - st.ax), dz = Math.sign(st.bz - st.az);
      const px = -dz, pz = dx; // right of the segment direction
      const c = at(mx, mz);
      const b = c.lit;
      const pt = (t, o) => [st.ax + dx * t + px * o, st.az + dz * t + pz * o];
      const rect = (t0, t1, o0, o1, color, y = MARK_Y) => {
        const [x0, z0] = pt(t0, o0), [x1, z1] = pt(t1, o1);
        b.frame(0, 0, 0, 0).flat(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y, null, color);
      };
      const t0 = st.startMouth != null ? st.startMouth + 3.4 : FRONT + 0.8;
      const t1 = GRID - (st.endMouth != null ? st.endMouth + 3.4 : FRONT + 0.8);

      if (st.el || st.water) {
        rect(t0, t1, -0.24, -0.11, 0xf2c12e);
        rect(t0, t1, 0.11, 0.24, 0xf2c12e);
      } else {
        for (let t = t0 + 0.5; t < t1 - 1; t += 4.5) rect(t, Math.min(t + 2.2, t1), -0.07, 0.07, MARK);
      }

      // Crosswalks and stop lines at city intersections.
      if (near(mx, mz, 100)) {
        for (const end of [0, 1]) {
          if ((end ? st.endMouth : st.startMouth) != null) continue;
          const ta = end ? GRID - FRONT + 0.2 : ROAD + 0.2, tb = end ? GRID - ROAD - 0.2 : FRONT - 0.2;
          for (let o = -2.85; o < 2.8; o += 0.95) rect(ta, tb, o, o + 0.5, MARK);
          const ts = end ? GRID - FRONT - 0.7 : FRONT + 0.3;
          rect(ts, ts + 0.4, end ? 0.1 : -3.0, end ? 3.0 : -0.1, MARK);
        }
      }

      if (st.el || st.water) continue;
      // Parked cars along both curbs.
      if (near(mx, mz, 110)) {
        for (const side of [-1, 1]) {
          for (let t = t0 + 1.5; t < t1 - 2; t += 5.8) {
            if (!rng.chance(0.5)) continue;
            const [x, z] = pt(t + rng.float(-0.4, 0.4), side * 2.25);
            P.parkedCar(b, x, z, Math.atan2(dx, dz) + (side > 0 ? 0 : Math.PI), rng);
          }
        }
      }
      // Street trees in pits.
      if (near(mx, mz, 85)) {
        for (const side of [-1, 1]) {
          for (let t = t0 + 1.2; t < t1 - 1; t += rng.float(6.5, 9)) {
            const [x, z] = pt(t, side * (ROAD + 0.9));
            if (!rng.chance(0.7) || !ctx.fits(x, z, GROUND + 4.8)) continue;
            b.frame(0, 0, 0, 0).flat(x - 0.6, z - 0.6, x + 0.6, z + 0.6, SLAB_Y + 0.03, null, 0x5b4a3a);
            trees.push({ x, z });
          }
        }
      }
    }

    // Where streets meet the loop: crosswalk over the sidewalk gap, stop line, traffic light.
    for (const j of plan.junctions) {
      const { x, z, dx, dz, mouth } = j;
      const px = -dz, pz = dx;
      const c = at(x, z);
      const pt = (t, o) => [x + dx * t + px * o, z + dz * t + pz * o];
      const rect = (t0, t1, o0, o1, color) => {
        const [x0, z0] = pt(t0, o0), [x1, z1] = pt(t1, o1);
        c.lit.frame(0, 0, 0, 0).flat(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), MARK_Y, null, color);
      };
      for (let o = -2.85; o < 2.8; o += 0.95) rect(mouth - 2.9, mouth - 0.3, o, o + 0.5, MARK);
      rect(mouth + 0.3, mouth + 0.7, -3.0, -0.1, MARK);
      const [lx, lz] = pt(mouth + 1.2, -(ROAD + 0.75));
      P.trafficLight(c.lit, c.glow, lx, lz, Math.atan2(dx, dz), -1, GROUND);
    }
  }

  // --- along the loop ---------------------------------------------------------------------

  buildLoopside(ctx) {
    const { plan, at, rng, trees, slots } = ctx;
    const path = plan.path, L = path.length;
    const dS = (a, b) => {
      const d = (((a - b) % L) + L) % L;
      return Math.min(d, L - d);
    };
    const station = slots[0];
    const used = [];
    const p = { x: 0, z: 0 }, t = { x: 0, z: 0 };
    const pose = (s, u) => {
      path.pointAt(s, p);
      path.tangentAt(s, t);
      return { x: p.x - t.z * u, z: p.z + t.x * u, px: p.x, pz: p.z, rx: -t.z, rz: t.x, tx: t.x, tz: t.z };
    };
    const free = (s, u, r = 1.6) => {
      if (slots.some((q) => dS(s, q) < 3.4)) return false;
      if (u < 0 && dS(s, station) < 7.5) return false;
      for (const [s2, u2, r2] of used) if (Math.sign(u2) === Math.sign(u) && dS(s, s2) < r + r2) return false;
      for (const k of [-r, 0, r]) {
        const q = pose(s + k, u);
        if (plan.gapAt(q.x, q.z)) return false;
        for (const e of ctx.exclusions) if (Math.hypot(q.x - e.x, q.z - e.z) < e.r) return false;
      }
      return true;
    };
    const toRoad = (q, u) => (u < 0 ? Math.atan2(q.rx, q.rz) : Math.atan2(-q.rx, -q.rz));
    const vd = plan.viewDir;
    // Trees only where they can't hide the road from the camera.
    const treeOk = (q) => (q.x - q.px) * vd.x + (q.z - q.pz) * vd.z < -0.5 && ctx.fits(q.x, q.z, WALK_Y + 4.8);

    // Bus shelters and subway entrances on the long straights (outer sidewalk).
    let shelters = 0, subways = 0;
    for (const [s0, s1] of [...path.straights].sort((a, b) => b[1] - b[0] - (a[1] - a[0]))) {
      if (s1 - s0 < 16) continue;
      if (shelters < 2) {
        const s = s0 + (s1 - s0) * rng.float(0.25, 0.4);
        if (free(s, -5.3, 2.8)) {
          const q = pose(s, -5.3);
          const c = at(q.x, q.z);
          P.busShelter(c.lit, q.x, q.z, toRoad(q, -1), WALK_Y);
          used.push([s, -5.3, 2.8]);
          shelters++;
        }
      }
      if (subways < 2) {
        const s = s0 + (s1 - s0) * rng.float(0.6, 0.75);
        if (free(s, -6.35, 2.4)) {
          const q = pose(s, -6.35);
          const c = at(q.x, q.z);
          P.subwayEntrance(c.lit, c.glow, q.x, q.z, Math.atan2(q.tx, q.tz), WALK_Y);
          used.push([s, -6.35, 2.4]);
          subways++;
        }
      }
    }

    // Street lights, alternating sides.
    for (let s = 3, k = 0; s < L - 2; s += 11, k++) {
      const u = k % 2 ? -4.75 : 4.75;
      if (!free(s, u, 0.6)) continue;
      const q = pose(s, u);
      const c = at(q.x, q.z);
      P.streetLamp(c.lit, c.glow, q.x, q.z, toRoad(q, u), WALK_Y);
      used.push([s, u, 0.6]);
    }

    // Small furniture and trees.
    const OUTER = [['none', 7], ['hydrant', 2], ['trash', 2], ['news', 2], ['mail', 1], ['phone', 0.7], ['bench', 1], ['tree', 3], ['cart', 0.3]];
    const INNER = [['none', 6], ['bench', 2], ['trash', 1.5], ['hydrant', 1], ['tree', 4]];
    for (const side of [-1, 1]) {
      for (let s = rng.float(0, 3); s < L; s += rng.float(2.8, 4.2)) {
        const kind = rng.weighted(side < 0 ? OUTER : INNER);
        if (kind === 'none') continue;
        const curb = kind === 'tree' || kind === 'hydrant' || kind === 'news';
        const u = side * (curb ? 5.1 : 6.75);
        if (!free(s, u, 1.1)) continue;
        const q = pose(s, u);
        if (kind === 'tree' && !treeOk(q)) continue;
        const c = at(q.x, q.z);
        const ry = toRoad(q, u);
        switch (kind) {
          case 'hydrant': P.hydrant(c.lit, q.x, q.z, WALK_Y); break;
          case 'trash': P.trashCan(c.lit, q.x, q.z, WALK_Y); break;
          case 'news': P.newsBoxes(c.lit, q.x, q.z, ry + Math.PI, rng, WALK_Y); break;
          case 'mail': P.mailbox(c.lit, q.x, q.z, ry, WALK_Y); break;
          case 'phone': P.phoneBooth(c.lit, q.x, q.z, ry, WALK_Y); break;
          case 'bench': P.bench(c.lit, q.x, q.z, ry, WALK_Y); break;
          case 'cart': P.hotdogCart(c.lit, q.x, q.z, ry, WALK_Y); break;
          case 'tree':
            c.lit.frame(0, 0, 0, 0).flat(q.x - 0.6, q.z - 0.6, q.x + 0.6, q.z + 0.6, WALK_Y + 0.02, null, 0x5b4a3a);
            trees.push({ x: q.x, z: q.z, y: WALK_Y });
            break;
        }
        used.push([s, u, 1.1]);
      }
    }
  }

  // --- the loop's island -----------------------------------------------------------------

  buildIsland(ctx, grassB) {
    const { plan, at, rng, trees } = ctx;
    const path = plan.path, f = plan.field, B = path.bounds;
    const inside = (x, z) => path.containsPoint(x, z);

    grassB.frame(0, 0, 0, 0);
    for (let z = B.minZ; z < B.maxZ; z += 0.5) {
      for (const [a, b] of runs(B.minX, B.maxX, (x) => inside(x, z + 0.25) && f.at(x, z + 0.25) >= 7.0)) {
        grassB.flat(a, z, b, z + 0.5, ISLAND_Y, { tw: 6, th: 6 }, 0xffffff);
      }
    }

    // Paths along the grid lines inside the loop, a fountain where they cross.
    const segs = plan.interiorSegs;
    const PATH = 0xd8c9ae;
    for (const s of segs) {
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const dx = (s.bx - s.ax) / len, dz = (s.bz - s.az) / len;
      const c = at((s.ax + s.bx) / 2, (s.az + s.bz) / 2);
      for (const [a, b] of runs(0, len, (t) => f.at(s.ax + dx * t, s.az + dz * t) >= 7.3)) {
        const x0 = s.ax + dx * a, z0 = s.az + dz * a, x1 = s.ax + dx * b, z1 = s.az + dz * b;
        c.lit.frame(0, 0, 0, 0).flat(Math.min(x0, x1) - (s.h ? 0 : 1.2), Math.min(z0, z1) - (s.h ? 1.2 : 0), Math.max(x0, x1) + (s.h ? 0 : 1.2), Math.max(z0, z1) + (s.h ? 1.2 : 0), ISLAND_Y + 0.03, null, PATH);
        for (let t = a + 4; t < b - 2; t += 12) {
          const x = s.ax + dx * t + dz * 1.8, z = s.az + dz * t - dx * 1.8;
          P.parkLamp(c.lit, c.glow, x, z, ISLAND_Y);
          if (rng.chance(0.6)) P.bench(c.lit, s.ax + dx * (t + 3) - dz * 1.9, s.az + dz * (t + 3) + dx * 1.9, Math.atan2(dz, -dx), ISLAND_Y);
        }
      }
    }
    const deg = new Map();
    for (const s of segs) for (const k of [`${s.ax},${s.az}`, `${s.bx},${s.bz}`]) deg.set(k, (deg.get(k) ?? 0) + 1);
    const fountains = [];
    for (const [k, n] of deg) {
      const [x, z] = k.split(',').map(Number);
      if (n < 2 || f.at(x, z) < 11) continue;
      const c = at(x, z);
      c.lit.frame(0, 0, 0, 0).disc(x, z, 4.6, ISLAND_Y + 0.04, 16, PATH);
      P.fountain(c.lit, c.glow, x, z, ISLAND_Y);
      fountains.push({ x, z });
    }

    const dseg = (x, z, s) => {
      const tx = clamp(x, Math.min(s.ax, s.bx), Math.max(s.ax, s.bx)), tz = clamp(z, Math.min(s.az, s.bz), Math.max(s.az, s.bz));
      return Math.hypot(x - tx, z - tz);
    };
    const clear = (x, z) => {
      let c = f.at(x, z) - 7.8;
      for (const s of segs) c = Math.min(c, dseg(x, z, s) - 1.7);
      for (const q of fountains) c = Math.min(c, Math.hypot(x - q.x, z - q.z) - 5.2);
      return inside(x, z) ? c : -1;
    };
    const rectFits = (x0, z0, x1, z1) => {
      for (let x = x0; x <= x1 + 0.01; x += Math.max(0.5, (x1 - x0) / 8)) if (clear(x, z0) < 0 || clear(x, z1) < 0) return false;
      for (let z = z0; z <= z1 + 0.01; z += Math.max(0.5, (z1 - z0) / 8)) if (clear(x0, z) < 0 || clear(x1, z) < 0) return false;
      return true;
    };

    for (const cell of plan.interior) {
      const ccx = (cell.x0 + cell.x1) / 2, ccz = (cell.z0 + cell.z1) / 2;
      let best = null;
      for (let z = cell.z0 + 0.5; z < cell.z1; z += 1) {
        for (let x = cell.x0 + 0.5; x < cell.x1; x += 1) {
          const c = clear(x, z);
          const score = c - 0.02 * Math.hypot(x - ccx, z - ccz);
          if (!best || score > best.score) best = { x, z, c, score };
        }
      }
      if (!best || best.c < 2.2) continue;
      const { x: cx, z: cz } = best;
      const ch = at(cx, cz);
      const b = ch.lit, g = ch.glow;
      let used = 0; // radius taken by the feature
      const feature = cell.feature;

      if (feature === 'diner') {
        for (let len = 12; len >= 7; len--) {
          const hw = len / 2 + 0.3;
          if (!rectFits(cx - hw, cz - 2.8, cx + hw, cz + 4.0)) continue;
          b.frame(0, 0, 0, 0);
          for (let z = cz - 4.5; z < cz + 6.5; z += 0.5) {
            for (const [a, e] of runs(cx - hw - 2.5, cx + hw + 2.5, (x) => clear(x, z + 0.25) > -0.3)) b.flat(a, z, e, z + 0.5, ISLAND_Y + 0.03, null, 0x8e8b86);
          }
          P.diner(b, g, cx, cz, 0, len);
          for (const sx of [1, -1]) {
            const x = cx + sx * (hw + 1.4), z = cz + 3.6;
            if (clear(x, z) > -0.5 && ctx.fits(x, z, ISLAND_Y + 9.8)) {
              P.dinerPoleSign(b, g, x, z, 0, ISLAND_Y);
              break;
            }
          }
          for (const sx of [-1, 1]) {
            const x = cx + sx * (hw + 1.5), z = cz - 0.6;
            if (clear(x, z - 2.1) > 0.2 && clear(x, z + 2.1) > 0.2) P.parkedCar(b, x, z, rng.chance(0.5) ? 0 : Math.PI, rng, ISLAND_Y + 0.03);
          }
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2 + 0.3;
            const x = cx + Math.cos(a) * (hw + 3.2), z = cz + Math.sin(a) * 4.8;
            if (clear(x, z) > 0.4 && ctx.fits(x, z, ISLAND_Y + 7.6)) P.palm(b, x, z, ISLAND_Y, rng.float(5.2, 6.8));
          }
          used = hw + 2;
          break;
        }
      } else if (feature === 'gas') {
        for (const [w, d] of [[12, 10], [10, 9], [9, 7.5]]) {
          if (!rectFits(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2)) continue;
          P.gasStation(b, g, rng, cx, cz + d / 2, 0, w, d);
          used = Math.hypot(w, d) / 2;
          break;
        }
      } else if (feature === 'court') {
        for (const [w, d] of [[17, 11], [14.5, 10], [12, 8.5]]) {
          if (!rectFits(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2)) continue;
          P.courtLot(b, rng, cx, cz + d / 2, 0, w, d, ISLAND_Y);
          used = Math.hypot(w, d) / 2;
          break;
        }
      } else if (feature === 'playground' && best.c >= 7.2) {
        P.playground(b, cx, cz, ISLAND_Y);
        for (const [bx, bz, ry] of [[cx, cz + 6.2, 0], [cx - 6.2, cz, -Math.PI / 2]]) if (clear(bx, bz) > 0) P.bench(b, bx, bz, ry + Math.PI, ISLAND_Y);
        used = 7.2;
      } else if (feature === 'pond' && best.c >= 6.8) {
        P.pond(b, cx, cz, ISLAND_Y);
        used = 6.8;
      } else if (feature === 'ballfield' && best.c >= 8.5) {
        P.ballfield(b, cx, cz + 4, ISLAND_Y);
        used = 8.5;
      }

      // Trees on the rest of the lawn.
      const cand = [];
      if (feature === 'grove' || !used) P.grove(rng, cx - best.c, cz - best.c, cx + best.c, cz + best.c, cand, ISLAND_Y);
      const area = (cell.x1 - cell.x0) * (cell.z1 - cell.z0);
      for (let i = 0; i < area / 55; i++) cand.push({ x: rng.float(cell.x0, cell.x1), z: rng.float(cell.z0, cell.z1), y: ISLAND_Y });
      for (const tr of cand) {
        if (clear(tr.x, tr.z) < 0.6 || Math.hypot(tr.x - cx, tr.z - cz) < used + 1.6) continue;
        if (!ctx.fits(tr.x, tr.z, ISLAND_Y + 4.9)) continue;
        trees.push(tr);
      }
    }
  }

  addTrees(list, rng) {
    if (!list.length) return;
    const crown = new THREE.InstancedMesh(this.treeGeos.crown, this.mats.crown, list.length);
    const trunk = new THREE.InstancedMesh(this.treeGeos.trunk, this.mats.trunk, list.length);
    list.forEach((t, i) => {
      const s = t.s ?? rng.float(0.85, 1.2);
      _q.setFromAxisAngle(_up, rng.float(0, Math.PI * 2));
      _m.compose(_p.set(t.x, t.y ?? GROUND, t.z), _q, _s.set(s, s * rng.float(0.9, 1.12), s));
      crown.setMatrixAt(i, _m);
      trunk.setMatrixAt(i, _m);
      crown.setColorAt(i, _c.set(rng.pick(TREE_COLORS)));
    });
    for (const m of [crown, trunk]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      this.group.add(m);
      this.meshes.push(m);
    }
  }

  update(dt) {
    this.time += dt;
    this.waterTex.offset.set(this.time * 0.004, this.time * 0.012);
    this.life.update(dt);
  }

  clear() {
    const shared = new Set(Object.values(this.treeGeos));
    for (const m of this.meshes) {
      this.group.remove(m);
      if (!shared.has(m.geometry)) m.geometry.dispose();
      if (m.isInstancedMesh) m.dispose();
    }
    this.meshes = [];
    this.life.clear();
  }
}
