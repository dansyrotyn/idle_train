import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../utils/rng.js';
import { PERIOD, HALF_ROAD, SIDEWALK, BLOCK, ROAD_MIN, ROAD_MAX, LANE_OFFSET, blockBounds } from './grid.js';

const STOP = HALF_ROAD + SIDEWALK + 0.5; // stop line distance from the intersection center
const LANE_LEN = PERIOD - 2 * STOP;
const CYCLE = 16;
const LIGHT_RANGE = 4; // intersections with visible traffic lights: |k|,|m| <= this
const PED_RANGE = 3; // blocks with pedestrians: -PED_RANGE-1 .. PED_RANGE

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

function colored(geo, color) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([_c.r, _c.g, _c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}

const box = (w, h, d, x, y, z, color) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

function wheels(xs, zs, r = 0.32) {
  const out = [];
  for (const x of xs) {
    for (const z of zs) {
      const g = new THREE.CylinderGeometry(r, r, 0.26, 10).rotateZ(Math.PI / 2).translate(x, r, z);
      out.push(colored(g, 0x1f2329));
    }
  }
  return out;
}

const plain = (geo) => (geo.index ? geo.toNonIndexed() : geo);

// Car models: "paint" takes the per-instance color, "trim" carries fixed vertex colors.
function carModels() {
  const glass = 0x2c3e55;
  const lightF = 0xfff2c0;
  const lightR = 0xd32f2f;
  return {
    sedan: {
      len: 3.8,
      speed: [6.5, 9],
      paint: mergeGeometries([
        plain(new THREE.BoxGeometry(1.8, 0.62, 3.8).translate(0, 0.58, 0)),
        plain(new THREE.BoxGeometry(1.6, 0.12, 1.9).translate(0, 1.38, -0.2)),
      ]),
      trim: mergeGeometries([
        box(1.58, 0.46, 1.86, 0, 1.1, -0.2, glass),
        ...wheels([-0.86, 0.86], [-1.25, 1.25]),
        box(0.4, 0.16, 0.06, -0.58, 0.68, 1.91, lightF),
        box(0.4, 0.16, 0.06, 0.58, 0.68, 1.91, lightF),
        box(0.4, 0.14, 0.06, -0.58, 0.7, -1.91, lightR),
        box(0.4, 0.14, 0.06, 0.58, 0.7, -1.91, lightR),
      ]),
    },
    taxi: {
      len: 3.8,
      speed: [7, 9.5],
      paint: mergeGeometries([
        plain(new THREE.BoxGeometry(1.8, 0.62, 3.8).translate(0, 0.58, 0)),
        plain(new THREE.BoxGeometry(1.6, 0.12, 1.9).translate(0, 1.38, -0.2)),
      ]),
      trim: mergeGeometries([
        box(1.58, 0.46, 1.86, 0, 1.1, -0.2, glass),
        box(0.75, 0.26, 0.38, 0, 1.57, -0.2, 0xffffff),
        box(1.82, 0.12, 3.82, 0, 0.62, 0, 0x222222),
        ...wheels([-0.86, 0.86], [-1.25, 1.25]),
        box(0.4, 0.16, 0.06, -0.58, 0.68, 1.91, lightF),
        box(0.4, 0.16, 0.06, 0.58, 0.68, 1.91, lightF),
      ]),
    },
    van: {
      len: 4.4,
      speed: [6, 8],
      paint: plain(new THREE.BoxGeometry(1.9, 1.5, 4.4).translate(0, 1.07, 0)),
      trim: mergeGeometries([
        box(1.8, 0.55, 0.08, 0, 1.45, 2.21, glass),
        box(1.94, 0.45, 2.4, 0, 1.45, 0.7, glass),
        ...wheels([-0.9, 0.9], [-1.45, 1.45]),
        box(0.4, 0.18, 0.06, -0.62, 0.72, 2.21, lightF),
        box(0.4, 0.18, 0.06, 0.62, 0.72, 2.21, lightF),
      ]),
    },
    bus: {
      len: 7.6,
      speed: [5, 7],
      paint: plain(new THREE.BoxGeometry(2.3, 2.3, 7.6).translate(0, 1.5, 0)),
      trim: mergeGeometries([
        box(2.34, 0.85, 6.6, 0, 1.85, -0.2, glass),
        box(2.1, 1.0, 0.08, 0, 1.85, 3.81, glass),
        box(2.32, 0.08, 7.62, 0, 2.66, 0, 0xffffff),
        ...wheels([-1.05, 1.05], [-2.6, 2.4], 0.42),
        box(0.45, 0.2, 0.06, -0.75, 0.75, 3.81, lightF),
        box(0.45, 0.2, 0.06, 0.75, 0.75, 3.81, lightF),
      ]),
    },
  };
}

const PAINTS = {
  sedan: [0xe53935, 0x1e88e5, 0xf5f5f5, 0xb0bec5, 0x37474f, 0x43a047, 0xfb8c00, 0x26a69a, 0x8e24aa],
  taxi: [0xffc928],
  van: [0xf5f5f5, 0xeceff1, 0x90caf9, 0xffe082],
  bus: [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835],
};

// Street traffic on the road grid (right-hand driving, traffic lights) plus pedestrians.
export class Traffic {
  constructor(scene, { cars = 90 } = {}) {
    this.time = 0;
    this.rng = new RNG(4242);
    this.group = new THREE.Group();
    scene.add(this.group);

    this.buildLanes();
    this.buildCars(cars);
    this.buildLights();
    this.buildPedestrians();
  }

  // --- road network ---------------------------------------------------------------

  inGrid(k, m) {
    return k >= ROAD_MIN && k <= ROAD_MAX && m >= ROAD_MIN && m <= ROAD_MAX;
  }

  laneKey(k, m, dk, dm) {
    return `${k},${m},${dk},${dm}`;
  }

  buildLanes() {
    this.lanes = new Map();
    for (let k = ROAD_MIN; k <= ROAD_MAX; k++) {
      for (let m = ROAD_MIN; m <= ROAD_MAX; m++) {
        for (const [dk, dm] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!this.inGrid(k + dk, m + dm)) continue;
          const rx = -dm;
          const rz = dk;
          const ax = k * PERIOD, az = m * PERIOD;
          this.lanes.set(this.laneKey(k, m, dk, dm), {
            k, m, dk, dm,
            toK: k + dk,
            toM: m + dm,
            axis: dk !== 0 ? 'x' : 'z',
            sx: ax + dk * STOP + rx * LANE_OFFSET,
            sz: az + dm * STOP + rz * LANE_OFFSET,
            cars: [],
            reservedUntil: 0,
          });
        }
      }
    }
    this.laneList = [...this.lanes.values()];
  }

  pickNext(lane) {
    const { toK: k, toM: m, dk, dm } = lane;
    const options = [
      [dk, dm, 0.55],
      [-dm, dk, 0.27], // right turn
      [dm, -dk, 0.18], // left turn
    ].filter(([a, b]) => this.inGrid(k + a, m + b));
    if (!options.length) return this.lanes.get(this.laneKey(k, m, -dk, -dm));
    let r = this.rng.next() * options.reduce((s, o) => s + o[2], 0);
    for (const [a, b, w] of options) {
      r -= w;
      if (r <= 0) return this.lanes.get(this.laneKey(k, m, a, b));
    }
    const [a, b] = options[0];
    return this.lanes.get(this.laneKey(k, m, a, b));
  }

  light(k, m, axis) {
    const t = (this.time + ((k * 7 + m * 13) % CYCLE + CYCLE)) % CYCLE;
    if (axis === 'x') return t < 6.5 ? 'g' : t < 7.8 ? 'y' : 'r';
    return t >= 8.3 && t < 14.8 ? 'g' : t >= 14.8 && t < 15.6 ? 'y' : 'r';
  }

  // --- cars --------------------------------------------------------------------------

  buildCars(count) {
    this.models = carModels();
    const paintMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const trimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = {};
    this.cars = [];
    const types = ['sedan', 'sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'van', 'bus'];
    const counts = {};
    const plan = [];
    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      plan.push(type);
      counts[type] = (counts[type] || 0) + 1;
    }
    for (const [type, n] of Object.entries(counts)) {
      const md = this.models[type];
      const paint = new THREE.InstancedMesh(md.paint, paintMat, n);
      const trim = new THREE.InstancedMesh(md.trim, trimMat, n);
      for (const mesh of [paint, trim]) {
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
      paint.castShadow = true;
      this.meshes[type] = { paint, trim, used: 0 };
    }

    // Scatter cars over random lanes without overlaps.
    for (const type of plan) {
      const md = this.models[type];
      for (let tries = 0; tries < 30; tries++) {
        const lane = this.rng.pick(this.laneList);
        const progress = this.rng.float(1, LANE_LEN - 1);
        const clash = lane.cars.some((c) => Math.abs(c.progress - progress) < (c.len + md.len) / 2 + 2);
        if (clash) continue;
        const slot = this.meshes[type].used++;
        const car = {
          type, slot, lane, progress,
          len: md.len,
          speed: 0,
          maxSpeed: this.rng.float(md.speed[0], md.speed[1]),
          state: 'lane',
          committed: false,
          next: null,
          turn: null,
        };
        car.next = this.pickNext(lane);
        this.meshes[type].paint.setColorAt(slot, _c.set(this.rng.pick(PAINTS[type])));
        lane.cars.push(car);
        this.cars.push(car);
        break;
      }
    }
    for (const lane of this.laneList) lane.cars.sort((a, b) => b.progress - a.progress);
    for (const { paint, trim, used } of Object.values(this.meshes)) {
      paint.count = trim.count = used;
      if (paint.instanceColor) paint.instanceColor.needsUpdate = true;
    }
  }

  updateCars(dt) {
    for (const car of this.cars) {
      const lane = car.lane;
      const idx = lane.cars.indexOf(car);
      const leader = idx > 0 ? lane.cars[idx - 1] : null;
      let limit = Infinity;
      if (leader) limit = leader.progress - leader.len / 2 - (car.progress + car.len / 2) - 1.4;

      if (car.state === 'lane' && !car.committed) {
        const next = car.next;
        const last = next.cars[next.cars.length - 1];
        const room = !last || last.progress - last.len / 2 > car.len + 1.5;
        const go = this.light(lane.toK, lane.toM, lane.axis) === 'g' && room && this.time >= next.reservedUntil;
        const toStop = LANE_LEN - car.progress;
        if (go && toStop < 1.5) {
          car.committed = true;
          next.reservedUntil = this.time + 1.4;
        } else if (!go) {
          limit = Math.min(limit, toStop);
        }
      }

      let target = car.maxSpeed;
      if (limit < Infinity) target = Math.min(target, Math.sqrt(2 * 12 * Math.max(0, limit)));
      if (car.state === 'turn') target = Math.min(target, 5.5);
      car.speed = target > car.speed ? Math.min(target, car.speed + 5 * dt) : target;
      const step = car.speed * dt;
      car.progress += step;

      if (car.state === 'lane' && car.progress >= LANE_LEN && car.committed) {
        this.startTurn(car);
      }
      if (car.state === 'turn') {
        car.turn.d += step;
        if (car.turn.d >= car.turn.len) this.finishTurn(car);
      }
    }
  }

  startTurn(car) {
    const a = car.lane;
    const b = car.next;
    const p0 = { x: a.sx + a.dk * LANE_LEN, z: a.sz + a.dm * LANE_LEN };
    const p2 = { x: b.sx, z: b.sz };
    let p1;
    if (a.dk === b.dk && a.dm === b.dm) p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
    else {
      const t = (p2.x - p0.x) * a.dk + (p2.z - p0.z) * a.dm;
      p1 = { x: p0.x + a.dk * t, z: p0.z + a.dm * t };
    }
    let len = 0;
    let prev = p0;
    for (let i = 1; i <= 8; i++) {
      const q = bezier(p0, p1, p2, i / 8);
      len += Math.hypot(q.x - prev.x, q.z - prev.z);
      prev = q;
    }
    car.state = 'turn';
    car.turn = { p0, p1, p2, len, d: car.progress - LANE_LEN };
  }

  finishTurn(car) {
    const over = car.turn.d - car.turn.len;
    const old = car.lane;
    const i = old.cars.indexOf(car);
    if (i >= 0) old.cars.splice(i, 1);
    car.lane = car.next;
    car.lane.cars.push(car);
    car.progress = over;
    car.state = 'lane';
    car.committed = false;
    car.turn = null;
    car.next = this.pickNext(car.lane);
  }

  renderCars() {
    for (const car of this.cars) {
      let x, z, yaw;
      if (car.state === 'turn') {
        const t = Math.min(1, car.turn.d / car.turn.len);
        const p = bezier(car.turn.p0, car.turn.p1, car.turn.p2, t);
        const d = bezierTangent(car.turn.p0, car.turn.p1, car.turn.p2, t);
        x = p.x;
        z = p.z;
        yaw = Math.atan2(d.x, d.z);
      } else {
        const l = car.lane;
        x = l.sx + l.dk * car.progress;
        z = l.sz + l.dm * car.progress;
        yaw = Math.atan2(l.dk, l.dm);
      }
      _q.setFromAxisAngle(_up, yaw);
      _m.compose(_p.set(x, 0, z), _q, _one);
      const mesh = this.meshes[car.type];
      mesh.paint.setMatrixAt(car.slot, _m);
      mesh.trim.setMatrixAt(car.slot, _m);
    }
    for (const { paint, trim } of Object.values(this.meshes)) {
      paint.instanceMatrix.needsUpdate = true;
      trim.instanceMatrix.needsUpdate = true;
    }
  }

  // --- traffic lights -----------------------------------------------------------------

  buildLights() {
    const poleGeo = mergeGeometries([
      plain(new THREE.CylinderGeometry(0.09, 0.11, 3.6, 6).translate(0, 1.8, 0)),
      plain(new THREE.BoxGeometry(0.4, 1.0, 0.4).translate(0, 3.9, 0)),
    ]);
    const lampGeo = new THREE.IcosahedronGeometry(0.22, 0).translate(0, 4.15, 0);
    const corners = [
      [1, 1, 'z'],
      [-1, -1, 'z'],
      [-1, 1, 'x'],
      [1, -1, 'x'],
    ];
    const list = [];
    for (let k = -LIGHT_RANGE; k <= LIGHT_RANGE; k++) {
      for (let m = -LIGHT_RANGE; m <= LIGHT_RANGE; m++) {
        for (const [sx, sz, axis] of corners) list.push({ k, m, axis, x: k * PERIOD + sx * 5.3, z: m * PERIOD + sz * 5.3 });
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f47 }), list.length);
    const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), list.length);
    list.forEach((l, i) => {
      _m.makeTranslation(l.x, 0.3, l.z);
      poles.setMatrixAt(i, _m);
      lamps.setMatrixAt(i, _m);
      lamps.setColorAt(i, _c.set(0xff3b30));
      l.state = null;
    });
    poles.castShadow = true;
    poles.computeBoundingSphere();
    lamps.computeBoundingSphere();
    this.group.add(poles, lamps);
    this.lightList = list;
    this.lampMesh = lamps;
  }

  renderLights() {
    let dirty = false;
    const colors = { g: 0x3dff6e, y: 0xffc400, r: 0xff3b30 };
    this.lightList.forEach((l, i) => {
      const st = this.light(l.k, l.m, l.axis);
      if (st !== l.state) {
        l.state = st;
        this.lampMesh.setColorAt(i, _c.set(colors[st]));
        dirty = true;
      }
    });
    if (dirty) this.lampMesh.instanceColor.needsUpdate = true;
  }

  // --- pedestrians ---------------------------------------------------------------------

  buildPedestrians() {
    const shirts = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xff8a65, 0x26c6da, 0xffffff, 0xec407a];
    const bodyGeo = new THREE.CylinderGeometry(0.24, 0.27, 0.8, 7).translate(0, 1.0, 0);
    const restGeo = mergeGeometries([
      box(0.4, 0.62, 0.24, 0, 0.31, 0, 0x34405a),
      colored(new THREE.SphereGeometry(0.22, 6, 4).translate(0, 1.62, 0), 0xf2c49b),
    ]);
    this.peds = [];
    const side = BLOCK - SIDEWALK; // ring side length along the sidewalk middle
    for (let i = -PED_RANGE - 1; i <= PED_RANGE; i++) {
      for (let j = -PED_RANGE - 1; j <= PED_RANGE; j++) {
        const b = blockBounds(i, j);
        for (let n = 0; n < 3; n++) {
          this.peds.push({
            cx: b.cx,
            cz: b.cz,
            half: side / 2,
            p: this.rng.float(0, side * 4),
            dir: this.rng.chance(0.5) ? 1 : -1,
            speed: this.rng.float(1.0, 1.6),
            phase: this.rng.float(0, 6.28),
            shirt: this.rng.pick(shirts),
          });
        }
      }
    }
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.pedBody = new THREE.InstancedMesh(bodyGeo, mat, this.peds.length);
    this.pedRest = new THREE.InstancedMesh(restGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), this.peds.length);
    this.peds.forEach((p, i) => this.pedBody.setColorAt(i, _c.set(p.shirt)));
    for (const mesh of [this.pedBody, this.pedRest]) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.pedSide = side;
  }

  renderPedestrians(dt) {
    const side = this.pedSide;
    const perim = side * 4;
    this.peds.forEach((p, i) => {
      p.p = (p.p + p.dir * p.speed * dt + perim) % perim;
      const seg = Math.floor(p.p / side);
      const t = p.p - seg * side;
      const h = p.half;
      let x, z, dx, dz;
      if (seg === 0) [x, z, dx, dz] = [-h + t, -h, 1, 0];
      else if (seg === 1) [x, z, dx, dz] = [h, -h + t, 0, 1];
      else if (seg === 2) [x, z, dx, dz] = [h - t, h, -1, 0];
      else [x, z, dx, dz] = [-h, h - t, 0, -1];
      const bob = Math.abs(Math.sin(this.time * 7 * p.speed + p.phase)) * 0.08;
      _q.setFromAxisAngle(_up, Math.atan2(dx * p.dir, dz * p.dir));
      _m.compose(_p.set(p.cx + x, 0.3 + bob, p.cz + z), _q, _one);
      this.pedBody.setMatrixAt(i, _m);
      this.pedRest.setMatrixAt(i, _m);
    });
    this.pedBody.instanceMatrix.needsUpdate = true;
    this.pedRest.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.updateCars(Math.min(dt, 0.1));
    this.renderCars();
    this.renderLights();
    this.renderPedestrians(dt);
  }
}

function bezier(a, b, c, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, z: u * u * a.z + 2 * u * t * b.z + t * t * c.z };
}

function bezierTangent(a, b, c, t) {
  return { x: 2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x), z: 2 * (1 - t) * (b.z - a.z) + 2 * t * (c.z - b.z) };
}
