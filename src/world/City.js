import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../utils/rng.js';
import { hash2 } from '../utils/math.js';
import { PERIOD, HALF_ROAD, SIDEWALK, BLOCK, ROAD_MIN, ROAD_MAX, blockBounds } from './grid.js';
import { FACADE_STYLES, FACADE_TILE, FACADE_CELL, facadeTexture, posterTextures } from './textures.js';

const FLOOR_H = FACADE_CELL.h;
const SLAB_H = 0.3; // sidewalk / block slab height
const INNER_MIN = ROAD_MIN; // inner blocks: -5..4
const INNER_MAX = ROAD_MAX - 1;
const FAR_MIN = -11;
const FAR_MAX = 10;
export const RIVER = { z0: -200, z1: -162 };
const FERRIS = { x: -60, z: -238 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

// Collects instance transforms + colors, then emits one InstancedMesh.
class Instances {
  constructor() {
    this.mats = [];
    this.cols = [];
  }

  add(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, color = null) {
    _q.setFromAxisAngle(_up, ry);
    this.mats.push(new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
    this.cols.push(color);
  }

  build(geo, mat, { castShadow = false, receiveShadow = false } = {}) {
    const n = this.mats.length;
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    mesh.count = n;
    this.mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    if (this.cols.some((c) => c !== null)) {
      this.cols.forEach((c, i) => mesh.setColorAt(i, _c.set(c ?? 0xffffff)));
    }
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

// Merges colored boxes into one geometry (vertex colors).
class BoxBatch {
  constructor() {
    this.geos = [];
  }

  add(w, h, d, x, y, z, color, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.paint(g, color);
    this.geos.push(g);
  }

  addGeometry(g, color) {
    this.paint(g, color);
    this.geos.push(g);
  }

  paint(g, color) {
    _c.set(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }

  build(mat, { castShadow = false, receiveShadow = true } = {}) {
    if (!this.geos.length) return null;
    const geo = mergeGeometries(this.geos.map((g) => (g.index ? g.toNonIndexed() : g)));
    this.geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

// Building walls with world-scaled facade UVs, batched per facade style.
class BuildingBatch {
  constructor() {
    this.walls = new Map(); // style -> { pos, nor, uv, col }
    this.roofs = { pos: [], nor: [], col: [] };
  }

  add(b) {
    const { x0, z0, x1, z1, height: h, style, tint, uOff } = b;
    let w = this.walls.get(style);
    if (!w) this.walls.set(style, (w = { pos: [], nor: [], uv: [], col: [] }));
    const faces = [
      [x1, z0, x0, z0, 0, -1],
      [x0, z1, x1, z1, 0, 1],
      [x1, z1, x1, z0, 1, 0],
      [x0, z0, x0, z1, -1, 0],
    ];
    const vMax = h / FACADE_TILE.h;
    for (const [ax, az, bx, bz, nx, nz] of faces) {
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = uOff;
      const u1 = uOff + len / FACADE_TILE.w;
      const quad = [
        [ax, 0, az, u0, 0],
        [bx, 0, bz, u1, 0],
        [bx, h, bz, u1, vMax],
        [ax, 0, az, u0, 0],
        [bx, h, bz, u1, vMax],
        [ax, h, az, u0, vMax],
      ];
      for (const [x, y, z, u, v] of quad) {
        w.pos.push(x, y, z);
        w.nor.push(nx, 0, nz);
        w.uv.push(u, v);
        w.col.push(tint, tint, tint);
      }
    }
    _c.set(FACADE_STYLES[style].roof).multiplyScalar(tint);
    const r = this.roofs;
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) {
      r.pos.push(x, h, z);
      r.nor.push(0, 1, 0);
      r.col.push(_c.r, _c.g, _c.b);
    }
  }

  build(wallMats, roofMat) {
    const meshes = [];
    for (const [style, w] of this.walls) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(w.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(w.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(w.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(w.col, 3));
      const m = new THREE.Mesh(g, wallMats[style]);
      m.castShadow = m.receiveShadow = true;
      meshes.push(m);
    }
    if (this.roofs.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.roofs.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.roofs.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.roofs.col, 3));
      const m = new THREE.Mesh(g, roofMat);
      m.receiveShadow = true;
      meshes.push(m);
    }
    return meshes;
  }
}

const AWNING_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0xfdd835, 0x8e24aa];
const TREE_COLORS = [0x5cbf3a, 0x4caf50, 0x7ccf3f, 0x3f9e3a, 0x6cc644];
const BLOSSOM = 0xf7a8c8;
const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xff8a65, 0x26c6da, 0xffffff];

function pickStyle(rng, floors) {
  if (floors >= 9) return rng.weighted([['glass', 55], ['white', 35], ['beige', 10]]);
  if (floors <= 3) {
    return rng.weighted([['brick', 35], ['beige', 18], ['terracotta', 20], ['teal', 12], ['pink', 15]]);
  }
  return rng.weighted([['brick', 30], ['beige', 18], ['terracotta', 14], ['white', 16], ['teal', 10], ['pink', 7], ['glass', 5]]);
}

function rectCircleOverlap(x0, z0, x1, z1, c) {
  const dx = Math.max(x0 - c.x, 0, c.x - x1);
  const dz = Math.max(z0 - c.z, 0, c.z - z1);
  return dx * dx + dz * dz < c.r * c.r;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.static = new THREE.Group();
    this.dynamic = new THREE.Group();
    scene.add(this.static, this.dynamic);

    const wallMats = {};
    for (const style of Object.keys(FACADE_STYLES)) {
      wallMats[style] = new THREE.MeshLambertMaterial({ map: facadeTexture(style), vertexColors: true });
    }
    this.mats = {
      walls: wallMats,
      roof: new THREE.MeshLambertMaterial({ vertexColors: true }),
      ground: new THREE.MeshLambertMaterial({ color: 0x62666f }),
      slab: new THREE.MeshLambertMaterial({ vertexColors: true }),
      marking: new THREE.MeshLambertMaterial({ color: 0xf2f2ee, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      props: new THREE.MeshLambertMaterial({ vertexColors: true }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
      crown: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      awning: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      lampPole: new THREE.MeshLambertMaterial({ color: 0x4a525c }),
      lampHead: new THREE.MeshBasicMaterial({ color: 0xfff1c1 }),
      water: new THREE.MeshStandardMaterial({ color: 0x3fa9e0, roughness: 0.12, metalness: 0.15 }),
      billboardFrame: new THREE.MeshLambertMaterial({ color: 0x3b414c }),
      boatHull: new THREE.MeshLambertMaterial({ vertexColors: true }),
    };
    this.posters = posterTextures().map((map) => new THREE.MeshBasicMaterial({ map }));

    this.geos = {
      trunk: new THREE.CylinderGeometry(0.16, 0.22, 1.7, 6).translate(0, 0.85, 0),
      crown: new THREE.IcosahedronGeometry(1.35, 1).translate(0, 2.7, 0),
      lampPole: mergeGeometries([
        new THREE.CylinderGeometry(0.08, 0.1, 4.4, 6).translate(0, 2.2, 0),
        new THREE.BoxGeometry(0.1, 0.1, 1.1).translate(0, 4.35, 0.5),
      ]),
      lampHead: new THREE.BoxGeometry(0.42, 0.16, 0.6).translate(0, 4.27, 1.0),
      awning: new THREE.BoxGeometry(1, 0.28, 1.3),
    };

    this.boats = [];
    this.buildStatic();
  }

  // ---------------------------------------------------------------------------
  // Static: ground, slabs, markings, far city, river, landmarks.
  // ---------------------------------------------------------------------------

  buildStatic() {
    const g = this.static;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), this.mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);

    const slabs = new BoxBatch();
    const far = new BuildingBatch();
    const props = new BoxBatch();
    const trees = new Instances();

    for (let i = FAR_MIN; i <= FAR_MAX; i++) {
      for (let j = FAR_MIN; j <= FAR_MAX; j++) {
        const b = blockBounds(i, j);
        if (b.z1 > RIVER.z0 - 14 && b.z0 < RIVER.z1 + 8) continue; // river and embankments
        slabs.add(BLOCK, SLAB_H, BLOCK, b.cx, SLAB_H / 2, b.cz, 0xd6d0c4);
        const inner = i >= INNER_MIN && i <= INNER_MAX && j >= INNER_MIN && j <= INNER_MAX;
        if (inner) continue;
        if (Math.hypot(b.cx - FERRIS.x, b.cz - FERRIS.z) < 30) {
          slabs.add(BLOCK - 2 * SIDEWALK, 0.06, BLOCK - 2 * SIDEWALK, b.cx, SLAB_H + 0.03, b.cz, 0x7cc35a);
          continue;
        }
        this.planFarBlock(new RNG(hash2(i + 300, j + 300)), b, far);
      }
    }

    // Embankments along the river.
    const cityEdge = INNER_MIN * PERIOD - HALF_ROAD;
    const nearZ = (RIVER.z1 + cityEdge) / 2;
    const farZ = RIVER.z0 - 7;
    slabs.add(1400, SLAB_H, cityEdge - RIVER.z1, 0, SLAB_H / 2, nearZ, 0xd9cdb5);
    slabs.add(1400, SLAB_H, 14, 0, SLAB_H / 2, farZ, 0xd9cdb5);
    slabs.add(1400, 1.2, 0.8, 0, 0.6, RIVER.z1, 0xbfb8aa);
    slabs.add(1400, 1.2, 0.8, 0, 0.6, RIVER.z0, 0xbfb8aa);
    for (let x = -330; x <= 330; x += 11) {
      trees.add(x + 3, SLAB_H, nearZ + 1.5, 0, 1, 1, 1, TREE_COLORS[(x / 11) & 3]);
      trees.add(x, SLAB_H, farZ - 2, 0, 1.1, 1.1, 1.1, TREE_COLORS[((x / 11) + 2) & 3]);
    }

    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, RIVER.z1 - RIVER.z0), this.mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.08, (RIVER.z0 + RIVER.z1) / 2);
    g.add(water);

    // Bridge over the river.
    const bz = (RIVER.z0 + RIVER.z1) / 2;
    const bl = RIVER.z1 - RIVER.z0 + 10;
    props.add(10, 1.0, bl, 0, 3.2, bz, 0xcfc9bf);
    props.add(0.4, 1.0, bl, -5, 4.2, bz, 0xe8e4dc);
    props.add(0.4, 1.0, bl, 5, 4.2, bz, 0xe8e4dc);
    props.add(7, 3, 3, 0, 1.5, bz, 0xbfb8aa);
    for (const x of [-5.5, 5.5]) {
      props.add(0.9, 22, 0.9, x, 11, bz, 0xf2f2f2);
      for (let k = 1; k <= 5; k++) {
        const d = k * 3.4;
        for (const sgn of [-1, 1]) {
          const len = Math.hypot(d, 20 - 4.2);
          const cable = new THREE.BoxGeometry(0.12, 0.12, len);
          cable.rotateX(Math.atan2(20 - 4.2, d) * sgn);
          cable.translate(x, (20 + 4.2) / 2, bz + (sgn * d) / 2);
          props.addGeometry(cable, 0xf2f2f2);
        }
      }
    }

    // Lane markings and zebra crossings.
    const dashes = new Instances();
    const zebra = new Instances();
    const stop = HALF_ROAD + SIDEWALK + 0.5;
    for (let k = ROAD_MIN; k <= ROAD_MAX; k++) {
      for (let m = ROAD_MIN; m < ROAD_MAX; m++) {
        for (let d = m * PERIOD + stop + 1; d < (m + 1) * PERIOD - stop; d += 3.6) {
          dashes.add(k * PERIOD, 0.03, d + 0.9, 0);
          dashes.add(d + 0.9, 0.03, k * PERIOD, Math.PI / 2);
        }
      }
    }
    for (let k = ROAD_MIN; k <= ROAD_MAX; k++) {
      for (let m = ROAD_MIN; m <= ROAD_MAX; m++) {
        const x = k * PERIOD;
        const z = m * PERIOD;
        for (let t = -3; t <= 3; t += 1.5) {
          if (m > ROAD_MIN) zebra.add(x + t, 0.03, z - HALF_ROAD - 1.4, 0);
          if (m < ROAD_MAX) zebra.add(x + t, 0.03, z + HALF_ROAD + 1.4, 0);
          if (k > ROAD_MIN) zebra.add(x - HALF_ROAD - 1.4, 0.03, z + t, Math.PI / 2);
          if (k < ROAD_MAX) zebra.add(x + HALF_ROAD + 1.4, 0.03, z + t, Math.PI / 2);
        }
      }
    }
    const dashGeo = new THREE.PlaneGeometry(0.22, 1.8).rotateX(-Math.PI / 2);
    const zebraGeo = new THREE.PlaneGeometry(0.75, 2.4).rotateX(-Math.PI / 2);
    g.add(dashes.build(dashGeo, this.mats.marking, { receiveShadow: true }));
    g.add(zebra.build(zebraGeo, this.mats.marking, { receiveShadow: true }));

    g.add(slabs.build(this.mats.slab));
    g.add(...far.build(this.mats.walls, this.mats.roof));
    g.add(props.build(this.mats.props, { castShadow: true }));
    g.add(trees.build(this.geos.trunk, this.mats.trunk));
    g.add(trees.build(this.geos.crown, this.mats.crown));

    this.buildFerrisWheel();
    this.buildBoats();
  }

  planFarBlock(rng, b, batch) {
    const farBank = b.cz < RIVER.z0;
    const r = Math.hypot(b.cx, b.cz);
    const lot = { x0: b.x0 + SIDEWALK, z0: b.z0 + SIDEWALK, x1: b.x1 - SIDEWALK, z1: b.z1 - SIDEWALK };
    const split = rng.chance(0.55);
    const rects = split
      ? [
          { x0: lot.x0, z0: lot.z0, x1: lot.x0 + 8.1, z1: lot.z1 },
          { x0: lot.x1 - 8.1, z0: lot.z0, x1: lot.x1, z1: lot.z1 },
        ]
      : [lot];
    for (const rc of rects) {
      let floors = Math.round(rng.float(4, 11) + (farBank ? rng.float(4, 18) : 0) + (r > 220 ? rng.float(0, 6) : 0));
      if (rng.chance(0.12)) floors += rng.int(6, 14);
      const style = pickStyle(rng, floors);
      batch.add({ ...rc, height: floors * FLOOR_H + 0.5, style, tint: rng.float(0.9, 1.05), uOff: rng.float(0, 1) });
    }
  }

  buildFerrisWheel() {
    const g = new THREE.Group();
    g.position.set(FERRIS.x, 0, FERRIS.z);
    const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
    const R = 17;
    const hub = 21;
    for (const x of [-2.2, 2.2]) {
      for (const sgn of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 23, 0.7), white);
        leg.position.set(x, hub / 2, sgn * 5);
        leg.rotation.x = sgn * -0.25;
        g.add(leg);
      }
    }
    const wheel = new THREE.Group();
    wheel.position.y = hub;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.35, 8, 64), white);
    ring.rotation.y = Math.PI / 2;
    wheel.add(ring);
    const spokes = new THREE.BoxGeometry(0.2, R * 2, 0.2);
    for (let k = 0; k < 8; k++) {
      const s = new THREE.Mesh(spokes, white);
      s.rotation.x = (k * Math.PI) / 8;
      wheel.add(s);
    }
    const cabinGeo = new THREE.BoxGeometry(2.2, 2.0, 2.0);
    const cabins = [];
    const colors = [0xff5f6d, 0xffc371, 0x47c9ff, 0x7ee081, 0xc792ea, 0xff8a65];
    for (let k = 0; k < 16; k++) {
      const c = new THREE.Mesh(cabinGeo, new THREE.MeshLambertMaterial({ color: colors[k % colors.length] }));
      const a = (k / 16) * Math.PI * 2;
      c.userData.a = a;
      c.position.set(0, Math.sin(a) * R, Math.cos(a) * R);
      wheel.add(c);
      cabins.push(c);
    }
    g.add(wheel);
    this.static.add(g);
    this.ferris = { wheel, cabins };
  }

  buildBoats() {
    const batchFor = (hull, cabin) => {
      const b = new BoxBatch();
      b.add(6, 1.0, 2.4, 0, 0.5, 0, hull);
      b.add(2.6, 1.1, 1.8, -0.6, 1.5, 0, cabin);
      b.add(6.1, 0.2, 2.5, 0, 0.95, 0, 0xe53935);
      return b.build(this.mats.boatHull, { castShadow: false, receiveShadow: false });
    };
    const specs = [
      { z: RIVER.z1 - 9, x: -150, speed: 4 },
      { z: RIVER.z0 + 10, x: 80, speed: -3 },
      { z: RIVER.z1 - 20, x: 260, speed: 2.5 },
    ];
    for (const s of specs) {
      const mesh = batchFor(0xffffff, s.speed > 0 ? 0x2f6fd6 : 0x37c25a);
      mesh.position.set(s.x, 0.1, s.z);
      mesh.rotation.y = s.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.static.add(mesh);
      this.boats.push({ mesh, speed: s.speed });
    }
  }

  // ---------------------------------------------------------------------------
  // Dynamic: inner city buildings, trees, lamps, parks — shaped around the track.
  // ---------------------------------------------------------------------------

  buildDynamic(path, pillars, exclusions) {
    for (const child of [...this.dynamic.children]) {
      this.dynamic.remove(child);
      if (child.geometry && !Object.values(this.geos).includes(child.geometry)) child.geometry.dispose();
      child.dispose?.();
    }

    const batch = new BuildingBatch();
    const fills = new BoxBatch();
    const props = new BoxBatch();
    const trees = new Instances();
    const lampPoles = new Instances();
    const awnings = new Instances();
    const billboardCands = [];

    const nearPillar = (x, z, r) => pillars.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);
    const excluded = (x, z) => exclusions.some((e) => (e.x - x) ** 2 + (e.z - z) ** 2 < e.r * e.r);
    const treeOk = (x, z) => !nearPillar(x, z, 2.4) && !excluded(x, z) && path.distanceTo(x, z) > 1.2;
    const addTree = (rng, x, z, scale = 1) => {
      const blossom = rng.chance(0.1);
      const color = blossom ? BLOSSOM : rng.pick(TREE_COLORS);
      const s = scale * rng.float(0.8, 1.2);
      if (treeOk(x, z)) trees.add(x, SLAB_H, z, rng.float(0, 6.28), s, s, s, color);
    };

    for (let i = INNER_MIN; i <= INNER_MAX; i++) {
      for (let j = INNER_MIN; j <= INNER_MAX; j++) {
        const b = blockBounds(i, j);
        const rng = new RNG(hash2(i + 100, j + 100));
        const lot = { x0: b.x0 + SIDEWALK, z0: b.z0 + SIDEWALK, x1: b.x1 - SIDEWALK, z1: b.z1 - SIDEWALK };
        const r = Math.hypot(b.cx, b.cz);
        const type = r < 25 ? 'buildings' : rng.weighted([['buildings', 80], ['park', 12], ['plaza', 8]]);

        // Street trees and lamps along the four sidewalks.
        const edge = HALF_ROAD + 1.1;
        for (const [ax, az, dx, dz] of [
          [b.x0, b.z0, 1, 0],
          [b.x0, b.z1, 1, 0],
          [b.x0, b.z0, 0, 1],
          [b.x1, b.z0, 0, 1],
        ]) {
          const nx = dz !== 0 ? (ax === b.x0 ? 1 : -1) : 0;
          const nz = dx !== 0 ? (az === b.z0 ? 1 : -1) : 0;
          for (const t of [4, 18]) {
            const x = ax + dx * t + nx * (edge - HALF_ROAD);
            const z = az + dz * t + nz * (edge - HALF_ROAD);
            if (rng.chance(0.75)) addTree(rng, x, z, 0.85);
          }
          const lx = ax + dx * 11 + nx * 0.6;
          const lz = az + dz * 11 + nz * 0.6;
          const ry = Math.atan2(-nx, -nz);
          if (!nearPillar(lx, lz, 1.6) && !excluded(lx, lz)) lampPoles.add(lx, SLAB_H, lz, ry);
        }

        if (type === 'park') {
          fills.add(lot.x1 - lot.x0, 0.08, lot.z1 - lot.z0, b.cx, SLAB_H + 0.04, b.cz, 0x7cc35a);
          fills.add(lot.x1 - lot.x0, 0.1, 2.2, b.cx, SLAB_H + 0.05, b.cz, 0xe9dcc2);
          fills.add(2.2, 0.1, lot.z1 - lot.z0, b.cx, SLAB_H + 0.05, b.cz, 0xe9dcc2);
          for (let k = 0; k < 16; k++) {
            const x = rng.float(lot.x0 + 1, lot.x1 - 1);
            const z = rng.float(lot.z0 + 1, lot.z1 - 1);
            if (Math.abs(x - b.cx) > 1.8 && Math.abs(z - b.cz) > 1.8) addTree(rng, x, z, 1.05);
          }
          continue;
        }
        if (type === 'plaza') {
          fills.add(lot.x1 - lot.x0, 0.08, lot.z1 - lot.z0, b.cx, SLAB_H + 0.04, b.cz, 0xeadfc9);
          if (!excluded(b.cx, b.cz) && path.distanceTo(b.cx, b.cz) > 4) {
            props.addGeometry(new THREE.CylinderGeometry(3, 3.2, 0.7, 20).translate(b.cx, SLAB_H + 0.35, b.cz), 0xcfd5dc);
            props.addGeometry(new THREE.CylinderGeometry(2.6, 2.6, 0.1, 20).translate(b.cx, SLAB_H + 0.66, b.cz), 0x59c3f0);
            props.addGeometry(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 10).translate(b.cx, SLAB_H + 1.1, b.cz), 0xcfd5dc);
          }
          for (const [ox, oz] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) {
            props.add(1.8, 0.6, 1.8, b.cx + ox, SLAB_H + 0.3, b.cz + oz, 0xb9a58a);
            addTree(rng, b.cx + ox, b.cz + oz, 0.95);
          }
          continue;
        }

        for (const bd of this.planBuildings(rng, lot, r)) {
          const d = path.distanceToRect(bd.x0, bd.z0, bd.x1, bd.z1);
          const hitsExclusion = exclusions.some((e) => rectCircleOverlap(bd.x0, bd.z0, bd.x1, bd.z1, e));
          if (d < 4.2 || hitsExclusion) {
            // Lot under the viaduct: open pavement with a couple of trees.
            fills.add(bd.x1 - bd.x0, 0.06, bd.z1 - bd.z0, (bd.x0 + bd.x1) / 2, SLAB_H + 0.03, (bd.z0 + bd.z1) / 2, 0xe3d8c3);
            for (const [tx, tz] of bd.treeSpots) addTree(rng, tx, tz, 0.9);
            continue;
          }
          // Keep the viaduct in view: low-rise next to it, taller further away.
          let floors = bd.floors;
          if (d < 9.5) floors = Math.min(floors, 2);
          else if (d < 16) floors = Math.min(floors, 3);
          else if (d < 26) floors = Math.min(floors, 5);
          const height = floors * FLOOR_H + 0.5;
          batch.add({ ...bd, height });
          this.addRoofProps(props, bd, height, floors);
          if (bd.awning && floors >= 2) {
            const a = bd.awning;
            awnings.add(a.x, 3.1, a.z, a.ry, a.len, 1, 1, a.color);
          }
          if (d > 6 && d < 32 && floors >= 2 && bd.style !== 'glass') billboardCands.push({ bd, d, height });
        }
      }
    }

    const add = (m) => m && this.dynamic.add(m);
    batch.build(this.mats.walls, this.mats.roof).forEach(add);
    add(fills.build(this.mats.slab));
    add(props.build(this.mats.props, { castShadow: true }));
    add(trees.build(this.geos.trunk, this.mats.trunk, { castShadow: true }));
    add(trees.build(this.geos.crown, this.mats.crown, { castShadow: true }));
    add(lampPoles.build(this.geos.lampPole, this.mats.lampPole, { castShadow: true }));
    add(lampPoles.build(this.geos.lampHead, this.mats.lampHead));
    add(awnings.build(this.geos.awning, this.mats.awning, { castShadow: true }));
    this.buildBillboards(billboardCands, path);
  }

  planBuildings(rng, lot, r) {
    const gap = 0.8;
    const xm = (lot.x0 + lot.x1) / 2;
    const zm = (lot.z0 + lot.z1) / 2;
    const pattern = rng.weighted([
      ['single', r > 70 ? 25 : 8],
      ['halfX', 18],
      ['halfZ', 18],
      ['quad', 26],
      ['row3', 16],
      ['mixed', 18],
    ]);
    let rects;
    const h = gap / 2;
    switch (pattern) {
      case 'single':
        rects = [{ ...lot }];
        break;
      case 'halfX':
        rects = [{ ...lot, x1: xm - h }, { ...lot, x0: xm + h }];
        break;
      case 'halfZ':
        rects = [{ ...lot, z1: zm - h }, { ...lot, z0: zm + h }];
        break;
      case 'row3': {
        const w = (lot.x1 - lot.x0 - 2 * gap) / 3;
        rects = [0, 1, 2].map((k) => ({ ...lot, x0: lot.x0 + k * (w + gap), x1: lot.x0 + k * (w + gap) + w }));
        break;
      }
      case 'mixed':
        rects = [
          { ...lot, x1: xm - h },
          { x0: xm + h, z0: lot.z0, x1: lot.x1, z1: zm - h },
          { x0: xm + h, z0: zm + h, x1: lot.x1, z1: lot.z1 },
        ];
        break;
      default:
        rects = [
          { x0: lot.x0, z0: lot.z0, x1: xm - h, z1: zm - h },
          { x0: xm + h, z0: lot.z0, x1: lot.x1, z1: zm - h },
          { x0: lot.x0, z0: zm + h, x1: xm - h, z1: lot.z1 },
          { x0: xm + h, z0: zm + h, x1: lot.x1, z1: lot.z1 },
        ];
    }

    return rects.map((rc) => {
      // Every random draw happens regardless of the track, so the city stays stable
      // across track upgrades (only nearby buildings get lowered or removed).
      const inset = rng.float(0, 0.4);
      const x0 = rc.x0 + inset, z0 = rc.z0 + inset, x1 = rc.x1 - inset, z1 = rc.z1 - inset;
      let floors;
      if (r < 50) floors = rng.int(2, 4);
      else if (r < 100) floors = rng.int(3, 7);
      else floors = rng.int(4, 10);
      if (pattern === 'single' && r > 60 && rng.chance(0.35)) floors += rng.int(5, 12);
      else rng.next();
      const style = pickStyle(rng, floors);
      const tint = rng.float(0.92, 1.05);
      const uOff = rng.float(0, 1);
      const props = { ac: rng.int(0, 3), acSpots: [], tank: rng.chance(0.45), tankSpot: [rng.next(), rng.next()], garden: rng.chance(0.15) };
      for (let k = 0; k < 3; k++) props.acSpots.push([rng.next(), rng.next()]);
      const treeSpots = [0, 1].map(() => [rng.float(x0 + 1, x1 - 1), rng.float(z0 + 1, z1 - 1)]);

      let awning = null;
      const awningRoll = rng.next();
      const awningColor = rng.pick(AWNING_COLORS);
      const sides = [];
      if (Math.abs(z0 - lot.z0) < 0.5) sides.push('n');
      if (Math.abs(z1 - lot.z1) < 0.5) sides.push('s');
      if (Math.abs(x0 - lot.x0) < 0.5) sides.push('w');
      if (Math.abs(x1 - lot.x1) < 0.5) sides.push('e');
      const side = sides[Math.floor(rng.next() * sides.length)];
      if (side && awningRoll < 0.4) {
        const w = x1 - x0, d = z1 - z0;
        if (side === 'n') awning = { x: (x0 + x1) / 2, z: z0 - 0.6, ry: 0, len: w * 0.75 };
        if (side === 's') awning = { x: (x0 + x1) / 2, z: z1 + 0.6, ry: 0, len: w * 0.75 };
        if (side === 'w') awning = { x: x0 - 0.6, z: (z0 + z1) / 2, ry: Math.PI / 2, len: d * 0.75 };
        if (side === 'e') awning = { x: x1 + 0.6, z: (z0 + z1) / 2, ry: Math.PI / 2, len: d * 0.75 };
        awning.color = awningColor;
      }
      return { x0, z0, x1, z1, floors, style, tint, uOff, props, treeSpots, awning };
    });
  }

  addRoofProps(batch, bd, h, floors) {
    const { x0, z0, x1, z1, props } = bd;
    const w = x1 - x0;
    const d = z1 - z0;
    const at = ([u, v], m) => [x0 + m + u * (w - 2 * m), z0 + m + v * (d - 2 * m)];
    if (props.garden && floors <= 6 && w > 5 && d > 5) {
      batch.add(w * 0.7, 0.35, d * 0.7, (x0 + x1) / 2, h + 0.17, (z0 + z1) / 2, 0x6fbf4a);
      batch.addGeometry(new THREE.IcosahedronGeometry(0.9, 0).translate(x0 + w * 0.3, h + 0.9, z0 + d * 0.35), 0x4caf50);
      batch.addGeometry(new THREE.IcosahedronGeometry(0.7, 0).translate(x0 + w * 0.65, h + 0.8, z0 + d * 0.62), 0x5cbf3a);
      return;
    }
    if (props.tank && bd.style === 'brick' && floors >= 3 && w > 4 && d > 4) {
      const [tx, tz] = at(props.tankSpot, 2);
      batch.addGeometry(new THREE.CylinderGeometry(1.0, 1.0, 1.7, 12).translate(tx, h + 1.55, tz), 0x8b5e3c);
      batch.addGeometry(new THREE.ConeGeometry(1.1, 0.7, 12).translate(tx, h + 2.75, tz), 0x6d4a2f);
      batch.add(1.6, 0.7, 1.6, tx, h + 0.35, tz, 0x555b63);
    }
    for (let k = 0; k < props.ac && w > 3 && d > 3; k++) {
      const [ax, az] = at(props.acSpots[k], 1.2);
      batch.add(1.3, 0.8, 1.1, ax, h + 0.4, az, 0xc9ced6);
    }
  }

  buildBillboards(cands, path) {
    cands.sort((a, b) => a.d - b.d);
    const chosen = [];
    for (const c of cands) {
      const cx = (c.bd.x0 + c.bd.x1) / 2;
      const cz = (c.bd.z0 + c.bd.z1) / 2;
      if (chosen.some((o) => Math.hypot(o.cx - cx, o.cz - cz) < 45)) continue;
      chosen.push({ ...c, cx, cz });
      if (chosen.length >= 5) break;
    }
    const p = { x: 0, z: 0 };
    chosen.forEach((c, i) => {
      // Face the nearest point of the track.
      let best = Infinity;
      let tx = 0;
      let tz = 0;
      for (let s = 0; s < path.length; s += 2) {
        path.pointAt(s, p);
        const dd = (p.x - c.cx) ** 2 + (p.z - c.cz) ** 2;
        if (dd < best) {
          best = dd;
          tx = p.x;
          tz = p.z;
        }
      }
      const g = new THREE.Group();
      g.position.set(c.cx, c.height, c.cz);
      g.rotation.y = Math.atan2(tx - c.cx, tz - c.cz);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.9, 0.3), this.mats.billboardFrame);
      frame.position.y = 3.6;
      frame.castShadow = true;
      g.add(frame);
      for (const x of [-2.5, 2.5]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 0.25), this.mats.billboardFrame);
        post.position.set(x, 0.9, 0);
        g.add(post);
      }
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.6), this.posters[i % this.posters.length]);
      poster.position.set(0, 3.6, 0.16);
      g.add(poster);
      this.dynamic.add(g);
    });
  }

  update(dt) {
    if (this.ferris) {
      this.ferris.wheel.rotation.x += dt * 0.08;
      for (const c of this.ferris.cabins) c.rotation.x = -this.ferris.wheel.rotation.x;
    }
    for (const b of this.boats) {
      b.mesh.position.x += b.speed * dt;
      if (b.mesh.position.x > 420) b.mesh.position.x = -420;
      if (b.mesh.position.x < -420) b.mesh.position.x = 420;
    }
  }
}

export { SHIRTS };
