import * as THREE from 'three';
import { RNG } from '../../utils/rng.js';
import { TRACK_HEIGHT } from '../../config.js';
import { getAtlas } from './atlas.js';
import { Builder } from './Builder.js';
import { GROUND } from './buildings.js';
import { carShape, CAR_COLORS } from './props.js';
import { EL } from './backdrop.js';
import { GRID, ROAD_Y } from './layout.js';

// Moving city life: oncoming traffic on the loop, cars on the through streets and the bridge,
// the elevated train, a ferry on the river and pedestrians on the sidewalks.

const WHITE = 0xffffff;
const WALK_Y = TRACK_HEIGHT + 0.25;
const KINDS = ['sedan', 'taxi', 'van', 'bus', 'truck', 'police'];
const TINTED = new Set(['sedan', 'van', 'truck']);
const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xf2f2f2, 0x1c1f26, 0xe67e22, 0xff6fa8, 0x16a085];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const _f = { x: 0, z: 0 };
const _r = { x: 0, z: 0 };
const _t = { x: 0, z: 0 };

function pickKind(rng) {
  return rng.weighted([['sedan', 10], ['taxi', 4], ['van', 2], ['bus', 0.8], ['truck', 1.2], ['police', 0.6]]);
}

export class Life {
  constructor(parent, mats) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.mats = mats;
    const rects = getAtlas().rects;
    this.carGeo = {};
    for (const kind of KINDS) {
      const b = new Builder(rects);
      carShape(b, kind, kind === 'taxi' ? 0xffc21a : kind === 'police' ? 0xf4f4f2 : WHITE);
      this.carGeo[kind] = b.build();
    }
    const torso = new Builder(rects);
    torso.cbox(0, 0, 0.52, 0.3, 0.76, 1.44, WHITE);
    torso.cbox(-0.33, 0, 0.13, 0.18, 0.86, 1.38, WHITE);
    torso.cbox(0.33, 0, 0.13, 0.18, 0.86, 1.38, WHITE);
    const rest = new Builder(rects);
    rest.cbox(-0.13, 0, 0.21, 0.24, 0, 0.8, 0x2c3550);
    rest.cbox(0.13, 0, 0.21, 0.24, 0, 0.8, 0x2c3550);
    rest.cbox(0, 0, 0.28, 0.28, 1.46, 1.78, 0xe9b98f);
    rest.box(-0.16, 1.7, -0.16, 0.16, 1.84, 0.1, 0x3b2a20);
    this.pedGeo = { torso: torso.build(), rest: rest.build() };
    this.trainGeo = buildTrain(rects);
    this.ferryGeo = buildFerry(rects);
    this.cars = [];
    this.peds = [];
    this.meshes = [];
    this.trains = [];
    this.time = 0;
  }

  // info: { bridge, el, ferry, promenade } from the backdrop, plus { stationS }.
  build(plan, info) {
    this.clear();
    const rng = new RNG(99 + plan.level * 7);
    const path = plan.path;
    this.path = path;
    this.plan = plan;
    this.stationS = info.stationS ?? 0;
    const cars = [];

    // Oncoming traffic on the loop's outer lane.
    const nLoop = Math.max(2, Math.round(path.length / 46));
    for (let i = 0; i < nLoop; i++) cars.push({ kind: pickKind(rng), route: { loop: true, v: -8.5 }, s: ((i + rng.float(0, 0.35)) * path.length) / nLoop });

    // Through streets (east-west lines the loop doesn't cut) and the bridge.
    const lanes = [];
    const byZ = new Map();
    for (const st of plan.streets) if (st.h) byZ.set(st.az, (byZ.get(st.az) ?? 0) + 1);
    const full = Math.round((plan.X1 - plan.X0) / GRID);
    const xa = plan.X0 - 60, xb = plan.X1 + 60;
    for (const [z, n] of byZ) {
      if (n < full) continue;
      const v = rng.float(7, 10);
      lanes.push({ ox: xa, oz: z + 1.4, dx: 1, dz: 0, len: xb - xa, y: ROAD_Y, v, gap: [24, 40] });
      lanes.push({ ox: xb, oz: z - 1.4, dx: -1, dz: 0, len: xb - xa, y: ROAD_Y, v: v * rng.float(0.85, 1.1), gap: [24, 40] });
    }
    const br = info.bridge;
    if (br) {
      const len = br.s1 - br.s0;
      for (const [x, dir, v] of [[-1.8, 1, 10], [-4.6, 1, 8], [1.8, -1, 10.5], [4.6, -1, 8.5]]) {
        const s = dir > 0 ? br.s0 : br.s1;
        lanes.push({
          ox: br.ox + br.ux * s + br.ax * x, oz: br.oz + br.uz * s + br.az * x,
          dx: br.ux * dir, dz: br.uz * dir, len, y: br.y, v, gap: [10, 22],
        });
      }
    }
    for (const lane of lanes) {
      for (let s = rng.float(0, 10); s < lane.len; s += rng.float(lane.gap[0], lane.gap[1])) cars.push({ kind: pickKind(rng), route: lane, s });
    }

    // Instanced meshes per kind.
    const byKind = new Map(KINDS.map((k) => [k, []]));
    for (const c of cars) byKind.get(c.kind).push(c);
    this.carMeshes = [];
    for (const [kind, list] of byKind) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(this.carGeo[kind], this.mats.lit, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      list.forEach((c, i) => {
        c.mesh = mesh;
        c.i = i;
        if (TINTED.has(kind)) mesh.setColorAt(i, _c.set(rng.pick(CAR_COLORS)));
      });
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.cars = cars;

    // Pedestrians.
    const peds = [];
    const n = Math.round(path.length / 7);
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        peds.push({ loop: true, lat: side * rng.float(5.4, 6.6), s: rng.float(0, path.length), v: rng.float(1.0, 1.6) * (rng.chance(0.5) ? 1 : -1), ph: rng.float(0, 6.3) });
      }
    }
    const lineWalk = (z0, z1, x0, x1, count) => {
      for (let i = 0; i < count; i++) {
        const dir = rng.chance(0.5) ? 1 : -1;
        peds.push({ ox: dir > 0 ? x0 : x1, oz: rng.float(z0, z1), dx: dir, dz: 0, len: x1 - x0, s: rng.float(0, x1 - x0), v: rng.float(1.0, 1.6), ph: rng.float(0, 6.3), y: GROUND });
      }
    };
    const pr = info.promenade;
    if (pr) lineWalk(pr.z - 3.5, pr.z + 2.5, pr.x0, pr.x1, Math.round((pr.x1 - pr.x0) / 9));
    if (info.el) {
      const span = plan.X1 - plan.X0;
      lineWalk(info.el.z + 3.7, info.el.z + 5.2, plan.X0, plan.X1, Math.round(span / 14));
      lineWalk(info.el.z - 5.2, info.el.z - 3.7, plan.X0, plan.X1, Math.round(span / 18));
    }
    const torso = new THREE.InstancedMesh(this.pedGeo.torso, this.mats.lit, peds.length);
    const rest = new THREE.InstancedMesh(this.pedGeo.rest, this.mats.lit, peds.length);
    torso.castShadow = true; // legs and heads are too small to matter in the shadow map
    for (const m of [torso, rest]) {
      m.frustumCulled = false;
      this.group.add(m);
      this.meshes.push(m);
    }
    peds.forEach((p, i) => torso.setColorAt(i, _c.set(rng.pick(SHIRTS))));
    this.peds = peds;
    this.pedMeshes = { torso, rest };

    // Elevated trains, one each way, and the ferry.
    if (info.el) {
      const el = info.el;
      for (const [dz, dir, x] of [[EL.tracks[1], 1, el.x0], [EL.tracks[0], -1, el.x1 - 150]]) {
        const m = new THREE.Mesh(this.trainGeo, this.mats.lit);
        m.castShadow = true;
        m.receiveShadow = true;
        m.position.set(x, el.y, el.z + dz);
        m.rotation.y = dir > 0 ? 0 : Math.PI;
        this.group.add(m);
        this.trains.push({ mesh: m, dir, x0: el.x0, x1: el.x1, v: 15 });
      }
    }
    if (info.ferry) {
      const f = info.ferry;
      const m = new THREE.Mesh(this.ferryGeo, this.mats.lit);
      m.position.set((f.x0 + f.x1) / 2 - 40, f.y, f.z);
      this.group.add(m);
      this.trains.push({ mesh: m, dir: 1, x0: f.x0, x1: f.x1, v: 3.2 });
    }
    this.update(0);
  }

  update(dt) {
    if (!this.path) return;
    this.time += dt;
    const path = this.path, L = path.length;

    for (const c of this.cars) {
      const r = c.route;
      if (r.loop) {
        c.s = (((c.s + r.v * dt) % L) + L) % L;
        const f = path.pointAt(c.s - 1.3, _f), b = path.pointAt(c.s + 1.3, _r);
        let hx = f.x - b.x, hz = f.z - b.z;
        const hl = Math.hypot(hx, hz) || 1;
        hx /= hl;
        hz /= hl;
        _p.set((f.x + b.x) / 2 - hz * 1.9, TRACK_HEIGHT, (f.z + b.z) / 2 + hx * 1.9);
        _q.setFromAxisAngle(_up, Math.atan2(hx, hz));
      } else {
        c.s += r.v * dt;
        if (c.s > r.len) c.s -= r.len;
        _p.set(r.ox + r.dx * c.s, r.y, r.oz + r.dz * c.s);
        _q.setFromAxisAngle(_up, Math.atan2(r.dx, r.dz));
      }
      _m.compose(_p, _q, _s.set(1, 1, 1));
      c.mesh.setMatrixAt(c.i, _m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;

    const { torso, rest } = this.pedMeshes ?? {};
    if (torso) {
      const gapAt = this.plan.gapAt;
      this.peds.forEach((p, i) => {
        p.ph += dt * 7 * Math.abs(p.v);
        let scale = 1, yaw;
        if (p.loop) {
          p.s = (((p.s + p.v * dt) % L) + L) % L;
          path.pointAt(p.s, _f);
          path.tangentAt(p.s, _t);
          const x = _f.x - _t.z * p.lat, z = _f.z + _t.x * p.lat;
          let d = Math.abs(p.s - this.stationS) % L;
          d = Math.min(d, L - d);
          if (d < 5.5 && p.lat < 0) scale = 0.001;
          _p.set(x, gapAt(x, z) ? ROAD_Y : WALK_Y, z);
          yaw = Math.atan2(_t.x, _t.z) + (p.v < 0 ? Math.PI : 0);
        } else {
          p.s += p.v * dt;
          if (p.s > p.len) p.s -= p.len;
          _p.set(p.ox + p.dx * p.s, p.y, p.oz + p.dz * p.s);
          yaw = Math.atan2(p.dx, p.dz);
        }
        _p.y += Math.abs(Math.sin(p.ph)) * 0.07;
        _q.setFromAxisAngle(_up, yaw + Math.sin(p.ph) * 0.07);
        _m.compose(_p, _q, _s.set(scale, scale, scale));
        torso.setMatrixAt(i, _m);
        rest.setMatrixAt(i, _m);
      });
    }

    for (const t of this.trains) {
      const x = t.mesh.position.x + t.dir * t.v * dt;
      t.mesh.position.x = x > t.x1 ? t.x0 : x < t.x0 ? t.x1 : x;
    }
  }

  clear() {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.dispose();
    }
    for (const t of this.trains) this.group.remove(t.mesh);
    this.meshes = [];
    this.trains = [];
    this.cars = [];
    this.peds = [];
    this.pedMeshes = null;
    this.path = null;
  }
}

// Five silver subway cars (local +x is forward), wheels on y = 0.
function buildTrain(rects) {
  const b = new Builder(rects);
  for (let i = 0; i < 5; i++) {
    const x0 = -26 + i * 10.4 + 0.15, x1 = x0 + 10.1;
    b.box(x0, 0.55, -1.45, x1, 3.35, 1.45, 0xc9ccd1, null, { topColor: 0x9a9ea5 });
    for (let k = 0; k < 4; k++) {
      const wx = x0 + 0.9 + k * 2.35;
      b.face(wx, 1.46, 1, 0, 0, 1.5, 1.75, 2.65, 'carglass', WHITE);
      b.face(wx + 1.5, -1.46, -1, 0, 0, 1.5, 1.75, 2.65, 'carglass', WHITE);
    }
    b.face(x0, 1.465, 1, 0, 0, 10.1, 1.38, 1.58, null, 0x8e1b14);
    b.face(x1, -1.465, -1, 0, 0, 10.1, 1.38, 1.58, null, 0x8e1b14);
    if (i % 2 === 1) b.face(x0 + 2, 1.47, 1, 0, 0, 6, 0.65, 3.1, 'mural:graffiti', WHITE);
    for (const bx of [x0 + 1.8, x1 - 1.8]) b.cbox(bx, 0, 2.2, 2.4, 0, 0.6, 0x2a2a2a);
  }
  b.face(25.86, 1.0, 0, -1, 0, 2.0, 1.8, 2.7, 'carglass', WHITE);
  b.face(25.86, 1.2, 0, -1, 0, 0.5, 1.0, 1.25, null, 0xfff4c8);
  b.face(25.86, -0.7, 0, -1, 0, 0.5, 1.0, 1.25, null, 0xfff4c8);
  b.face(-25.86, -1.0, 0, 1, 0, 2.0, 1.8, 2.7, 'carglass', WHITE);
  return b.build();
}

// Orange harbour ferry, bow to +x.
function buildFerry(rects) {
  const b = new Builder(rects);
  b.box(-15, -0.6, -4.6, 15, 2.3, 4.6, 0xf26a1b, null, { topColor: 0x8a8580 });
  b.box(-12.5, 2.3, -4.0, 12.5, 5.0, 4.0, 0xf26a1b);
  for (const z of [4.01, -4.01]) {
    for (let x = -11.5; x < 11; x += 2.2) {
      if (z > 0) b.face(x, z, 1, 0, 0, 1.4, 3.1, 4.3, 'carglass', WHITE);
      else b.face(x + 1.4, z, -1, 0, 0, 1.4, 3.1, 4.3, 'carglass', WHITE);
    }
  }
  b.box(-9, 5.0, -3.4, 9, 7.0, 3.4, 0xf2efe6);
  b.box(-3, 7.0, -2.2, 3, 8.6, 2.2, 0xf2efe6);
  b.face(-2.6, 2.21, 1, 0, 0, 5.2, 7.5, 8.3, 'carglass', WHITE);
  b.cbox(0, 0, 1.0, 1.0, 8.6, 10.2, 0x1c1f26);
  return b.build();
}
