import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../utils/rng.js';
import { TRACK_HEIGHT } from '../config.js';
import { Frontage } from './Frontage.js';
import { SHOPS, shopSignTexture } from './textures.js';

// A hand-built 90s neighbourhood around the player's road loop (no street grid):
// row 1 — walk-ups, brownstones, corner stores and an old hotel right on the loop's sidewalks,
// rows 2–4 — taller brick and stone blocks behind them, then a hazy skyline,
// the river with a suspension bridge and an elevated subway line.
// Inside the loop: a diner island (small loops) or a park with a basketball court.

const SLAB_H = 0.3;
const FLOOR_H = 3.0;
const WALK_Y = TRACK_HEIGHT + 0.25; // loop sidewalk top
const ROAD_EDGE = 7.2; // loop center → building front
const EL_Z = -125;
const RIVER = { z0: -215, z1: -175 };

const BRICK = [0xa4523a, 0x8f4430, 0xb5654a, 0x9a5a44, 0x7f3b2c];
const STONE = [0x7a4b38, 0x6b3f30, 0x86553f]; // brownstone
const PLASTER = [0xe3d3b5, 0xd9c4a0, 0xcfd8dc, 0xe8c9a9, 0xb9cfc4];
const TRIM = 0xf1ead9;
const GLASS = [0x46658a, 0x557aa3, 0x3b5675];
const LIT = 0xffd98a;
const TREE_COLORS = [0x5cbf3a, 0x4caf50, 0x7ccf3f, 0x3f9e3a];
const SIGN_EXTRA = [{ name: 'HOTEL', fg: '#ff3b3b', bg: '#1c1f26' }, { name: 'DINER', fg: '#e23b5a', bg: '#fff3e0' }];
const HOTEL_SIGN = SHOPS.length;
const DINER_SIGN = SHOPS.length + 1;

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);

function paint(g, color) {
  if (g.index) g = g.toNonIndexed();
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

// Collects colored geometry in a local frame, then places it in the world.
class Kit {
  constructor() {
    this.geos = [];
    this.signs = new Map(); // sign index → plane geometries
  }

  box(w, h, d, x, y, z, color) {
    this.geos.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
  }

  geo(g, color) {
    this.geos.push(paint(g, color));
  }

  sign(idx, w, h, x, y, z, ry = 0) {
    const g = new THREE.PlaneGeometry(w, h).rotateY(ry).translate(x, y, z);
    if (!this.signs.has(idx)) this.signs.set(idx, []);
    this.signs.get(idx).push(g);
  }

  // Moves everything collected so far by (x, z, ry) into the target kit.
  placeInto(target, x, z, ry) {
    _m.compose(new THREE.Vector3(x, 0, z), _q.setFromAxisAngle(_up, ry), _one);
    for (const g of this.geos) target.geos.push(g.applyMatrix4(_m));
    for (const [k, list] of this.signs) {
      if (!target.signs.has(k)) target.signs.set(k, []);
      for (const g of list) target.signs.get(k).push(g.applyMatrix4(_m));
    }
    this.geos = [];
    this.signs = new Map();
  }
}

// ---------------------------------------------------------------------------------------
// Building prefabs. Local frame: front wall at z = 0 facing +z, body in z ∈ [-d, 0].
// ---------------------------------------------------------------------------------------

function windows(k, rng, { w, d, floors, from = 1, wall, lit = 0.12, arch = false, cheap = false }) {
  const cols = Math.max(1, Math.floor((w - 0.8) / 2.1));
  const sideCols = Math.max(1, Math.floor((d - 1.2) / 2.4));
  const glass = rng.pick(GLASS);
  for (let f = from; f < floors; f++) {
    const y = SLAB_H + f * FLOOR_H + 1.45;
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (w / cols) * (c + 0.5);
      k.box(1.0, 1.55, 0.1, x, y, 0.03, rng.chance(lit) ? LIT : glass);
      if (cheap) continue;
      k.box(1.3, 0.14, 0.28, x, y - 0.86, 0.08, TRIM); // sill
      k.box(1.25, 0.2, 0.16, x, y + 0.88, 0.05, arch ? wall : TRIM); // lintel
    }
    for (const sx of cheap ? [] : [-1, 1]) {
      for (let c = 0; c < sideCols; c++) {
        const z = -0.9 - ((d - 1.4) / sideCols) * (c + 0.5);
        k.box(0.1, 1.55, 1.0, sx * (w / 2 + 0.03), y, z, rng.chance(lit) ? LIT : glass);
        k.box(0.26, 0.14, 1.3, sx * (w / 2 + 0.08), y - 0.86, z, TRIM);
      }
    }
  }
}

function cornice(k, w, d, top, color) {
  k.box(w + 0.5, 0.35, d + 0.5, 0, top + 0.17, -d / 2, color);
  k.box(w + 0.25, 0.25, d + 0.25, 0, top - 0.15, -d / 2, color);
}

function waterTower(k, x, z, top) {
  for (const [ox, oz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) k.box(0.14, 2.2, 0.14, x + ox, top + 1.1, z + oz, 0x3a3236);
  k.box(1.9, 0.12, 1.9, x, top + 2.2, z, 0x3a3236);
  k.geo(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 12).translate(x, top + 3.35, z), 0x8b5e3c);
  for (const yy of [2.7, 3.4, 4.1]) k.geo(new THREE.CylinderGeometry(1.14, 1.14, 0.08, 12).translate(x, top + yy, z), 0x3a3236);
  k.geo(new THREE.ConeGeometry(1.25, 0.9, 12).translate(x, top + 4.9, z), 0x5d4030);
}

function roofJunk(k, rng, w, d, top) {
  for (let i = rng.int(1, 3); i > 0; i--) k.box(1.2, 0.8, 1.0, rng.float(-w / 2 + 1, w / 2 - 1), top + 0.4, -rng.float(1, d - 1), 0xc9ced6);
  if (rng.chance(0.5)) k.box(1.4, 1.6, 1.4, rng.float(-w / 2 + 1, w / 2 - 1), top + 0.8, -rng.float(1.2, d - 1.2), 0x8a8f99);
}

function storefront(k, rng, w, shopIdx) {
  const y = SLAB_H;
  const shop = SHOPS[shopIdx];
  k.box(w - 0.4, 0.5, 0.25, 0, y + 0.25, 0.1, 0x3a3236);
  k.box(w - 0.6, 1.9, 0.12, 0, y + 1.45, 0.06, rng.chance(0.5) ? 0x6f8fae : LIT);
  const door = rng.chance(0.5) ? -w / 2 + 1.1 : w / 2 - 1.1;
  k.box(1.0, 2.2, 0.16, door, y + 1.1, 0.12, 0x6b3f22);
  k.box(w - 0.2, 0.2, 0.3, 0, y + 2.55, 0.12, 0x3a3236);
  // Striped awning, then the sign board above it.
  const stripes = Math.max(4, Math.round((w - 1) / 0.6));
  const sw = (w - 1) / stripes;
  for (let i = 0; i < stripes; i++) {
    const g = new THREE.BoxGeometry(sw, 0.08, 1.4).rotateX(0.35).translate(-w / 2 + 0.5 + sw * (i + 0.5), y + 2.85, 0.7);
    k.geo(g, i % 2 ? 0xffffff : shop.awning);
  }
  const bw = Math.min(w - 0.6, 7);
  k.box(bw + 0.3, 1.1, 0.2, 0, y + 3.7, 0.1, 0x1c1f26);
  k.sign(shopIdx, bw, 0.9, 0, y + 3.7, 0.22);
}

function fireEscape(k, w, floors, side) {
  const col = 0x24262b;
  const u = side * (w / 2 - 2.0);
  for (let f = 1; f < floors; f++) {
    const y = SLAB_H + f * FLOOR_H + 0.05;
    k.box(3.0, 0.08, 1.1, u, y, 0.6, col);
    k.box(3.0, 0.06, 0.06, u, y + 0.8, 1.13, col);
    for (const e of [-1.47, 0, 1.47]) k.box(0.05, 0.8, 0.05, u + e, y + 0.4, 1.13, col);
    if (f < floors - 1) {
      const dir = f % 2 ? 1 : -1;
      k.geo(new THREE.BoxGeometry(0.5, Math.hypot(2.0, FLOOR_H), 0.06).rotateZ(dir * Math.atan2(2.0, FLOOR_H)).translate(u, y + FLOOR_H / 2, 0.85), col);
    }
  }
}

// Brick walk-up: shop on the ground floor, windows, cornice, fire escape, water tower.
function walkup(k, rng, w, d) {
  const floors = rng.int(3, 5);
  const wall = rng.pick(BRICK);
  const top = SLAB_H + floors * FLOOR_H;
  k.box(w, top - SLAB_H, d, 0, SLAB_H + (top - SLAB_H) / 2, -d / 2, wall);
  k.box(w + 0.04, 0.2, d + 0.04, 0, SLAB_H + FLOOR_H, -d / 2, TRIM);
  windows(k, rng, { w, d, floors, wall, arch: rng.chance(0.5) });
  storefront(k, rng, w, rng.int(0, SHOPS.length - 1));
  cornice(k, w, d, top, rng.chance(0.6) ? TRIM : 0x5d4a3f);
  if (w > 7 && rng.chance(0.7)) fireEscape(k, w, floors, rng.chance(0.5) ? 1 : -1);
  if (rng.chance(0.55)) waterTower(k, rng.float(-w / 2 + 1.5, w / 2 - 1.5), -d * rng.float(0.3, 0.7), top + 0.35);
  else roofJunk(k, rng, w, d, top + 0.35);
}

// Brownstone row house: stoop, tall windows, heavy dark cornice.
function brownstone(k, rng, w, d) {
  const floors = rng.int(3, 4);
  const wall = rng.pick(STONE);
  const top = SLAB_H + floors * FLOOR_H + 0.8;
  k.box(w, top - SLAB_H, d, 0, SLAB_H + (top - SLAB_H) / 2, -d / 2, wall);
  k.box(w + 0.04, 1.0, d + 0.04, 0, SLAB_H + 0.5, -d / 2, 0x5a3a2c); // basement
  windows(k, rng, { w, d, floors, from: 0, wall, lit: 0.08 });
  const sx = rng.chance(0.5) ? -w / 2 + 1.4 : w / 2 - 1.4;
  for (let i = 0; i < 5; i++) k.box(1.8, 0.3, 0.45, sx, SLAB_H + 0.15 + i * 0.3, 2.0 - i * 0.42, 0x8a6a58);
  k.box(1.9, 0.12, 1.0, sx, SLAB_H + 1.55, 0.45, 0x8a6a58);
  for (const e of [-0.95, 0.95]) k.geo(new THREE.BoxGeometry(0.06, 0.06, 2.6).rotateX(0.48).translate(sx + e, SLAB_H + 1.6, 1.2), 0x1c1f26);
  k.box(1.1, 2.3, 0.14, sx, SLAB_H + 2.7, 0.04, 0x3d2418);
  cornice(k, w, d, top, 0x3d2a22);
  k.box(w + 0.6, 0.5, 0.6, 0, top - 0.2, 0.05, 0x3d2a22);
  if (rng.chance(0.25)) waterTower(k, 0, -d / 2, top + 0.35);
  else roofJunk(k, rng, w, d, top + 0.35);
}

// Corner convenience store: one or two floors, colored stripes, big lit windows.
function cornerStore(k, rng, w, d) {
  const two = rng.chance(0.5);
  const wall = rng.pick(PLASTER);
  const top = SLAB_H + (two ? 2 : 1) * FLOOR_H + 0.6;
  k.box(w, top - SLAB_H, d, 0, SLAB_H + (top - SLAB_H) / 2, -d / 2, wall);
  const [a, b, c] = rng.pick([[0xe23b2a, 0xffffff, 0x2e8b57], [0xf28c28, 0xffffff, 0xd8342b], [0x1e5fbf, 0xffd23f, 0x1e5fbf]]);
  const by = SLAB_H + FLOOR_H - 0.1;
  k.box(w + 0.1, 0.3, d + 0.1, 0, by, -d / 2, a);
  k.box(w + 0.1, 0.2, d + 0.1, 0, by + 0.25, -d / 2, b);
  k.box(w + 0.1, 0.3, d + 0.1, 0, by + 0.5, -d / 2, c);
  k.box(w - 0.8, 2.2, 0.12, 0, SLAB_H + 1.4, 0.06, LIT);
  for (let x = -w / 2 + 1.5; x < w / 2 - 1; x += 1.6) k.box(0.1, 2.2, 0.16, x, SLAB_H + 1.4, 0.08, 0xe9e4d8);
  k.box(1.1, 2.3, 0.16, w / 2 - 1.2, SLAB_H + 1.15, 0.1, 0xd0d6dc);
  k.box(w - 0.4, 0.5, 0.25, 0, SLAB_H + 0.25, 0.12, 0x3a3236);
  const idx = rng.pick([6, 9, 7, 0]); // 24 HR, GROCERY, DONUTS, PIZZA
  const sw = Math.min(w - 1, 6);
  k.box(sw + 0.3, 1.1, 0.2, 0, top + 0.6, -0.2, 0x1c1f26);
  for (const s of [-1, 1]) k.box(0.1, 0.6, 0.1, s * sw / 3, top + 0.1, -0.2, 0x1c1f26);
  k.sign(idx, sw, 0.9, 0, top + 0.6, -0.08);
  if (two) windows(k, rng, { w, d, floors: 2, wall });
  roofJunk(k, rng, w, d, top);
}

// Old hotel: taller, with a vertical neon HOTEL blade sign.
function hotel(k, rng, w, d) {
  const floors = rng.int(6, 8);
  const wall = rng.pick([...BRICK, 0xc9b38a]);
  const top = SLAB_H + floors * FLOOR_H;
  k.box(w, top - SLAB_H, d, 0, SLAB_H + (top - SLAB_H) / 2, -d / 2, wall);
  windows(k, rng, { w, d, floors, wall, lit: 0.2 });
  storefront(k, rng, w, rng.int(0, SHOPS.length - 1));
  cornice(k, w, d, top, TRIM);
  const sx = w / 2 - 0.6;
  k.box(0.25, 6.6, 1.6, sx, top - 4.5, 0.95, 0x1c1f26);
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(6.2, 1.35).rotateZ(Math.PI / 2).rotateY((s * Math.PI) / 2).translate(sx + s * 0.14, top - 4.5, 0.95);
    if (!k.signs.has(HOTEL_SIGN)) k.signs.set(HOTEL_SIGN, []);
    k.signs.get(HOTEL_SIGN).push(g);
  }
  waterTower(k, -w / 4, -d / 2, top + 0.35);
}

// Back rows: plain taller brick/stone blocks with window grids and roof junk.
function block(k, rng, w, d, floors, cheap) {
  const wall = rng.chance(0.65) ? rng.pick(BRICK) : rng.pick(PLASTER);
  const top = SLAB_H + floors * FLOOR_H;
  k.box(w, top - SLAB_H, d, 0, SLAB_H + (top - SLAB_H) / 2, -d / 2, wall);
  windows(k, rng, { w, d, floors, from: 0, wall, lit: 0.1, cheap });
  cornice(k, w, d, top, rng.chance(0.5) ? TRIM : 0x5d4a3f);
  if (cheap) return;
  if (rng.chance(0.5)) waterTower(k, rng.float(-w / 2 + 1.5, w / 2 - 1.5), -d * rng.float(0.3, 0.7), top + 0.35);
  else roofJunk(k, rng, w, d, top + 0.35);
}

// ---------------------------------------------------------------------------------------

export class City {
  constructor(scene) {
    this.static = new THREE.Group();
    this.dynamic = new THREE.Group();
    scene.add(this.static, this.dynamic);
    this.mats = {
      kit: new THREE.MeshLambertMaterial({ vertexColors: true }),
      ground: new THREE.MeshLambertMaterial({ color: 0xd3cabb }),
      water: new THREE.MeshStandardMaterial({ color: 0x3fa9e0, roughness: 0.12, metalness: 0.15 }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
      crown: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      globe: new THREE.MeshBasicMaterial({ color: 0xfff1c1 }),
    };
    this.signMats = [...SHOPS, ...SIGN_EXTRA].map((s) => new THREE.MeshBasicMaterial({ map: shopSignTexture(s) }));
    this.treeGeos = {
      trunk: new THREE.CylinderGeometry(0.16, 0.22, 1.7, 6).translate(0, 0.85, 0),
      crown: new THREE.IcosahedronGeometry(1.35, 1).translate(0, 2.7, 0),
    };
    this.frontage = new Frontage({ slabH: WALK_Y, floorH: FLOOR_H });
    this.buildStatic();
  }

  mesh(geos, shadow = false) {
    const m = new THREE.Mesh(mergeGeometries(geos), this.mats.kit);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }

  // --- static backdrop: ground, river + bridge, skyline, elevated subway -------------------

  buildStatic() {
    const g = this.static;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), this.mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = SLAB_H;
    ground.receiveShadow = true;
    g.add(ground);

    const k = new Kit();
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, RIVER.z1 - RIVER.z0), this.mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, SLAB_H + 0.04, (RIVER.z0 + RIVER.z1) / 2);
    g.add(water);
    k.box(1400, 1.0, 1, 0, SLAB_H + 0.5, RIVER.z1, 0xbfb8aa);
    k.box(1400, 1.0, 1, 0, SLAB_H + 0.5, RIVER.z0, 0xbfb8aa);

    // Suspension bridge across the river, stone towers and cables.
    const bx = 70;
    const bz = (RIVER.z0 + RIVER.z1) / 2;
    const span = RIVER.z1 - RIVER.z0 + 30;
    k.box(10, 1, span, bx, 5, bz, 0x9aa0a8);
    const towers = [RIVER.z1 - 8, RIVER.z0 + 8];
    for (const z of towers) {
      k.box(12, 26, 3, bx, 13, z, 0xb59a7a);
      k.box(4, 9, 3.3, bx, 15, z, 0x7d6a55);
    }
    for (const s of [-4.6, 4.6]) {
      const a = towers[0], b = towers[1];
      const segs = 10;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const y0 = 26 - 20 * 4 * t0 * (1 - t0), y1 = 26 - 20 * 4 * t1 * (1 - t1);
        const z0 = a + (b - a) * t0, z1 = a + (b - a) * t1;
        const len = Math.hypot(z1 - z0, y1 - y0);
        k.geo(new THREE.BoxGeometry(0.3, 0.3, len).rotateX(Math.atan2(y1 - y0, z1 - z0) * -1).translate(bx + s, (y0 + y1) / 2, (z0 + z1) / 2), 0x5a5f68);
      }
    }

    // Distant skyline beyond the river and a ring of mid-rise city around the edges.
    const rng = new RNG(99);
    for (let i = 0; i < 70; i++) {
      const x = rng.float(-420, 420);
      const z = rng.float(-340, -240);
      const h = rng.float(25, 110) * (Math.abs(x) < 150 ? 1.4 : 1);
      const w = rng.float(10, 22);
      k.box(w, h, w, x, h / 2, z, rng.pick([0x9fb0c8, 0xb4c0d3, 0x8fa2bd, 0xc3cbd8]));
      if (rng.chance(0.25)) k.box(w * 0.6, h * 0.2, w * 0.6, x, h * 1.1, z, 0xa9b7cb);
    }
    for (let i = 0; i < 140; i++) {
      const a = rng.float(-0.5, Math.PI + 0.5);
      const r = rng.float(160, 300);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r + 20;
      const h = rng.float(12, 45);
      const w = rng.float(10, 20);
      k.box(w, h, w, x, h / 2, z, rng.pick([0xb98a72, 0xc4a68c, 0xb7bfcb, 0xa9796a]));
    }

    // Elevated subway along EL_Z.
    const steel = 0x2f6b5a;
    k.box(700, 0.9, 7, 0, 8.5, EL_Z, steel);
    for (const dz of [-3.4, 3.4]) k.box(700, 0.6, 0.3, 0, 9.2, EL_Z + dz, 0x3d806c);
    for (let x = -340; x <= 340; x += 14) {
      for (const dz of [-3.2, 3.2]) k.box(0.6, 8.5, 0.6, x, 4.25, EL_Z + dz, steel);
      k.box(0.5, 0.8, 7.4, x, 7.7, EL_Z, steel);
    }
    k.box(700, 0.02, 9, 0, SLAB_H + 0.01, EL_Z, 0x55575f);
    g.add(this.mesh(k.geos, true));

    const t = new Kit();
    for (let i = 0; i < 5; i++) {
      const x = i * 9.6;
      t.box(9.2, 2.6, 2.8, x, 1.6, 0, 0xc9ced6);
      t.box(9.25, 0.9, 2.85, x, 2.0, 0, 0x3b5675);
      t.box(9.25, 0.25, 2.85, x, 1.1, 0, 0x7b3fe4);
      t.box(9.0, 0.2, 2.6, x, 2.95, 0, 0x9aa0a8);
    }
    this.el = { mesh: this.mesh(t.geos, true), x: -300 };
    this.el.mesh.position.set(this.el.x, 9.0, EL_Z + 1.6);
    g.add(this.el.mesh);
  }

  // --- dynamic: everything shaped around the current loop --------------------------------

  buildDynamic(path, _pillars, exclusions) {
    for (const child of [...this.dynamic.children]) {
      this.dynamic.remove(child);
      child.geometry?.dispose();
      child.dispose?.();
    }
    const world = new Kit();
    const local = new Kit();
    const placed = []; // footprints: center, unit axis (along the front), half sizes
    const trees = [];
    const p = { x: 0, z: 0 };
    const t = { x: 0, z: 0 };

    const pointFree = (x, z, minRoad) => {
      if (path.distanceTo(x, z) < minRoad) return false;
      if (Math.abs(z - EL_Z) < 6 || z < RIVER.z1 + 4) return false;
      if (exclusions.some((e) => (e.x - x) ** 2 + (e.z - z) ** 2 < e.r * e.r)) return false;
      for (const f of placed) {
        const dx = x - f.cx, dz = z - f.cz;
        const u = dx * f.ax + dz * f.az;
        const v = -dx * f.az + dz * f.ax;
        if (Math.abs(u) < f.hw + 0.2 && Math.abs(v) < f.hd + 0.2) return false;
      }
      return true;
    };
    const footprintFree = (cx, cz, ax, az, hw, hd, minRoad) => {
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-0.5, 1], [0.5, 1], [-0.5, -1], [0.5, -1]]) {
        const x = cx + ax * u * hw - az * v * hd;
        const z = cz + az * u * hw + ax * v * hd;
        if (!pointFree(x, z, minRoad)) return false;
      }
      return true;
    };

    // Centerpiece inside the loop at the point farthest from the road.
    const b = path.bounds;
    let best = { d: 0, x: 0, z: 0 };
    for (let x = b.minX; x <= b.maxX; x += 2) {
      for (let z = b.minZ; z <= b.maxZ; z += 2) {
        if (!path.containsPoint(x, z)) continue;
        const d = path.distanceTo(x, z);
        if (d > best.d) best = { d, x, z };
      }
    }
    if (best.d > 11) {
      const r = Math.min(best.d - 6, 10);
      if (best.d < 20) this.diner(local, best.x, best.z, r);
      else this.park(local, best.x, best.z, r, trees);
      local.placeInto(world, 0, 0, 0);
      placed.push({ cx: best.x, cz: best.z, ax: 1, az: 0, hw: r, hd: r });
    }

    // Rows of buildings along both sides of the loop.
    const rng = new RNG(1234);
    const rows = [
      { offset: ROAD_EDGE, depth: [8, 11], kind: 'front' },
      { offset: ROAD_EDGE + 12.5, depth: [10, 13], kind: 'back' },
      { offset: ROAD_EDGE + 27, depth: [12, 16], kind: 'far' },
      { offset: ROAD_EDGE + 45, depth: [12, 18], kind: 'far' },
      { offset: ROAD_EDGE + 65, depth: [14, 20], kind: 'far' },
      { offset: ROAD_EDGE + 87, depth: [14, 20], kind: 'far' },
    ];
    for (const row of rows) {
      for (const side of [1, -1]) {
        let s = rng.float(0, 4);
        while (s < path.length) {
          path.pointAt(s, p);
          path.tangentAt(s, t);
          const rx = -t.z * side, rz = t.x * side; // away from the road
          const w = rng.float(7, 12);
          const d = rng.float(row.depth[0], row.depth[1]);
          const fx = p.x + rx * row.offset, fz = p.z + rz * row.offset; // front middle
          const cx = fx + (rx * d) / 2, cz = fz + (rz * d) / 2;
          const lr = new RNG(rng.int(0, 1e9));
          // How fast the building line moves per unit of road (> 1 on the outside of curves).
          const q = path.pointAt(s + 1, { x: 0, z: 0 });
          const qt = path.tangentAt(s + 1, { x: 0, z: 0 });
          const rate = Math.max(0.3, Math.hypot(q.x - qt.z * side * row.offset - fx, q.z + qt.x * side * row.offset - fz));
          if (footprintFree(cx, cz, t.x, t.z, w / 2, d / 2, row.offset - 0.4)) {
            const ry = Math.atan2(-rx, -rz); // local +z faces the road
            if (row.kind === 'front') {
              const roll = lr.next();
              if (roll < 0.42) walkup(local, lr, w, d);
              else if (roll < 0.72) brownstone(local, lr, w, d);
              else if (roll < 0.9) cornerStore(local, lr, w, d);
              else hotel(local, lr, w, d);
            } else {
              block(local, lr, w, d, row.kind === 'back' ? lr.int(5, 8) : lr.int(7, 12), row.offset > 40);
            }
            local.placeInto(world, fx, fz, ry);
            placed.push({ cx, cz, ax: t.x, az: t.z, hw: w / 2, hd: d / 2, row: row.kind });
            s += (w + 0.3) / rate;
          } else {
            if (row.kind === 'front' && lr.chance(0.5)) {
              const x = p.x + rx * 6.2, z = p.z + rz * 6.2;
              if (pointFree(x, z, 5.4)) trees.push([x, z, lr.float(0.8, 1.1)]);
            }
            s += 2.5 / rate;
          }
        }
      }
    }

    this.placed = placed;
    // Street furniture: lamps, hydrants, mailboxes, phone booths, subway entrance.
    const props = {
      add: (w, h, d, x, y, z, color, ry = 0) => world.geo(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z), color),
      addGeometry: (g, color) => world.geo(g, color),
    };
    const excl = (x, z, r = 0) => exclusions.some((e) => (e.x - x) ** 2 + (e.z - z) ** 2 < (e.r + r) ** 2);
    this.frontage.sidewalk(path, excl, props);
    const globes = this.frontage.lamps(path, excl, props);

    const add = (m) => this.dynamic.add(m);
    add(this.mesh(world.geos, true));
    add(new THREE.Mesh(mergeGeometries(globes.map((g) => g.index ? g.toNonIndexed() : g).map((g) => (g.deleteAttribute('uv'), g))), this.mats.globe));
    for (const [idx, list] of world.signs) add(new THREE.Mesh(mergeGeometries(list), this.signMats[idx]));
    if (trees.length) {
      const trunk = new THREE.InstancedMesh(this.treeGeos.trunk, this.mats.trunk, trees.length);
      const crown = new THREE.InstancedMesh(this.treeGeos.crown, this.mats.crown, trees.length);
      trees.forEach(([x, z, sc], i) => {
        _m.compose(new THREE.Vector3(x, WALK_Y, z), _q.identity(), new THREE.Vector3(sc, sc, sc));
        trunk.setMatrixAt(i, _m);
        crown.setMatrixAt(i, _m);
        crown.setColorAt(i, _c.set(TREE_COLORS[i % TREE_COLORS.length]));
      });
      trunk.castShadow = crown.castShadow = true;
      add(trunk);
      add(crown);
    }
  }

  // Round island with a chrome diner, patio umbrellas and planters.
  diner(k, cx, cz, r) {
    const y = SLAB_H;
    k.geo(new THREE.CylinderGeometry(r, r, 0.12, 40).translate(cx, y + 0.06, cz), 0xc98f6a);
    const s = Math.min(1, (r - 1) / 6.5);
    const W = 9 * s, D = 5 * s;
    k.box(W + 0.4, 0.7, D + 0.2, cx, y + 0.35, cz, 0x1c1f26);
    for (let i = 0; i < Math.round(W / 0.78); i++) k.box(0.39, 0.5, D + 0.25, cx - W / 2 + 0.2 + i * 0.78, y + 0.35, cz, 0xf4f1e6);
    k.box(W, 2.4, D, cx, y + 1.9, cz, 0xdfe3e8);
    k.box(W + 0.1, 1.0, D + 0.1, cx, y + 1.8, cz, LIT);
    for (let x = -W / 2 + 0.8; x < W / 2; x += 1.1) k.box(0.1, 1.0, D + 0.14, cx + x, y + 1.8, cz, 0xdfe3e8);
    k.box(W + 0.15, 0.22, D + 0.15, cx, y + 1.18, cz, 0xe23b5a);
    k.box(W + 0.15, 0.22, D + 0.15, cx, y + 2.42, cz, 0xe23b5a);
    k.box(W + 0.3, 0.3, D + 0.3, cx, y + 3.2, cz, 0xe23b5a);
    k.box(W + 0.35, 0.08, D + 0.35, cx, y + 3.0, cz, 0xff3fa4);
    k.box(W * 0.8, 0.3, D * 0.8, cx, y + 3.45, cz, 0xb9c0c8);
    for (let i = 0; i < 8; i++) k.box(0.5, 0.1, 1.1, cx - 2 + i * 0.5, y + 2.75, cz + D / 2 + 0.5, i % 2 ? 0xffffff : 0xe23b5a);
    k.box(4.4, 1.4, 0.3, cx + 1.2, y + 4.4, cz, 0xe23b5a);
    k.sign(DINER_SIGN, 4.0, 1.1, cx + 1.2, y + 4.4, cz + 0.17);
    k.sign(DINER_SIGN, 4.0, 1.1, cx + 1.2, y + 4.4, cz - 0.17, Math.PI);
    k.geo(new THREE.CylinderGeometry(0.9, 0.7, 1.4, 16).translate(cx - 2.6, y + 4.3, cz), 0xffffff);
    k.geo(new THREE.CylinderGeometry(0.82, 0.82, 0.08, 16).translate(cx - 2.6, y + 5.0, cz), 0x5a3a24);
    k.geo(new THREE.TorusGeometry(0.4, 0.12, 6, 12).translate(cx - 1.6, y + 4.3, cz), 0xffffff);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(a) * (r - 2), z = cz + Math.sin(a) * (r - 2);
      if (Math.abs(x - cx) < W / 2 + 1 && Math.abs(z - cz) < D / 2 + 1) continue;
      k.geo(new THREE.ConeGeometry(1.2, 0.5, 8).translate(x, y + 2.2, z), i % 2 ? 0xe23b5a : 0x2e8b57);
      k.geo(new THREE.CylinderGeometry(0.05, 0.05, 2, 6).translate(x, y + 1.1, z), 0xf4f1e6);
      k.geo(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10).translate(x, y + 0.75, z), 0xf4f1e6);
    }
    const n = Math.round(r * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * (r - 0.6), z = cz + Math.sin(a) * (r - 0.6);
      k.box(0.8, 0.5, 0.8, x, y + 0.3, z, 0x9a5b3c);
      k.geo(new THREE.IcosahedronGeometry(0.45, 0).translate(x, y + 0.8, z), i % 3 ? 0x4caf50 : 0xf06292);
    }
  }

  // Bigger loops: a park with a basketball court, paths and trees.
  park(k, cx, cz, r, trees) {
    const y = SLAB_H;
    k.geo(new THREE.CylinderGeometry(r, r, 0.1, 40).translate(cx, y + 0.05, cz), 0x7cc35a);
    k.box(r * 2 - 1, 0.04, 2, cx, y + 0.12, cz, 0xe9dcc2);
    k.box(2, 0.04, r * 2 - 1, cx, y + 0.12, cz, 0xe9dcc2);
    const bx = cx + r * 0.45, bz = cz - r * 0.45;
    k.box(9, 0.06, 6, bx, y + 0.14, bz, 0x3f8f6b);
    k.box(8, 0.06, 5, bx, y + 0.16, bz, 0xd9773b);
    k.box(0.12, 0.02, 5, bx, y + 0.2, bz, 0xffffff);
    for (const s of [-1, 1]) {
      k.box(0.2, 3, 0.2, bx + s * 4.3, y + 1.5, bz, 0x30343c);
      k.box(0.1, 1, 1.6, bx + s * 4.1, y + 2.9, bz, 0xffffff);
    }
    const rng = new RNG(5);
    for (let i = 0; i < r * 2.5; i++) {
      const a = rng.float(0, 6.28), d = rng.float(2, r - 1);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.abs(x - cx) < 1.5 || Math.abs(z - cz) < 1.5 || (Math.abs(x - bx) < 5.5 && Math.abs(z - bz) < 4)) continue;
      trees.push([x, z, rng.float(0.9, 1.3)]);
    }
  }

  update(dt) {
    this.el.x += 14 * dt;
    if (this.el.x > 340) this.el.x = -380;
    this.el.mesh.position.x = this.el.x;
  }
}
