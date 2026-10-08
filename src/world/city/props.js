import { GROUND } from './buildings.js';

// Street furniture, parked cars, open lots and the loop island. Every function places its
// own frame on the builders: (x, z) world position, ry yaw (local +z = facing direction).
// b = lit atlas builder, g = glow builder.

const WHITE = 0xffffff;
const IRON = 0x25272b;
const POLE = 0x4a5a50;

const R = (b, x, z, ry, y = 0) => b.frame(x, y, z, ry);

// --- cars ----------------------------------------------------------------------------------

export const CAR_COLORS = [0x8e1b14, 0x1f4f7a, 0xe8e4da, 0xa9adb3, 0x2e6b5a, 0x6b2a52, 0x1c1f26, 0xc9a227, 0x3d5ba8, 0x7a4b2c];

// Car shapes in local space: centered, facing +z, wheels on y = 0.
export function carShape(b, kind, color) {
  const dark = 0x1a1b1f;
  if (kind === 'bus') {
    b.box(-1.25, 0.35, -5, 1.25, 3.0, 5, WHITE, 'bus', { topColor: 0xe9eaec });
    b.face(-1.2, 5.01, 1, 0, 0, 2.4, 2.35, 2.85, 'busdest', WHITE);
    for (const z of [-3.6, 3.4]) for (const x of [-1.2, 1.2]) b.cbox(x, z, 0.3, 1.0, 0, 0.75, dark);
    return;
  }
  if (kind === 'truck') {
    b.box(-1.0, 0.4, 0.6, 1.0, 2.3, 2.9, color, null);
    b.face(-0.9, 2.91, 1, 0, 0, 1.8, 1.3, 2.1, 'carglass', WHITE);
    b.box(-1.15, 0.5, -3.6, 1.15, 3.4, 0.4, 0xf2f0ea, null);
    for (const z of [-2.6, 1.9]) for (const x of [-1.0, 1.0]) b.cbox(x, z, 0.32, 1.0, 0, 0.8, dark);
    return;
  }
  if (kind === 'van') {
    b.box(-0.95, 0.3, -2.4, 0.95, 2.1, 2.2, color, null);
    b.box(-0.95, 0.3, 2.2, 0.95, 1.2, 2.6, color, null);
    b.face(-0.85, 2.21, 1, 0, 0, 1.7, 1.25, 1.95, 'carglass', WHITE);
    for (const s of [-1, 1]) b.face(s * 0.96, s > 0 ? 1.4 : 0.4, 0, -s, 0, 1.0, 1.3, 1.9, 'carglass', WHITE);
    for (const z of [-1.6, 1.6]) for (const x of [-0.9, 0.9]) b.cbox(x, z, 0.3, 0.8, 0, 0.66, dark);
    return;
  }
  // Sedans: taxi / police are color variants with roof extras.
  b.box(-0.9, 0.28, -2.1, 0.9, 0.85, 2.1, color, null);
  b.box(-0.78, 0.85, -1.15, 0.78, 1.42, 0.85, WHITE, 'carglass', { topColor: color });
  b.face(-0.7, 2.11, 1, 0, 0, 0.35, 0.55, 0.75, null, 0xfff4c8);
  b.face(-0.7, 2.11, 1, 0, 1.05, 1.4, 0.55, 0.75, null, 0xfff4c8);
  b.face(0.7, -2.11, -1, 0, 0, 0.35, 0.55, 0.75, null, 0xd8241c);
  b.face(0.7, -2.11, -1, 0, 1.05, 1.4, 0.55, 0.75, null, 0xd8241c);
  for (const z of [-1.35, 1.35]) for (const x of [-0.84, 0.84]) b.cbox(x, z, 0.26, 0.66, 0, 0.62, dark);
  if (kind === 'taxi') b.box(-0.35, 1.42, -0.25, 0.35, 1.7, 0.05, WHITE, 'taxi');
  if (kind === 'police') {
    b.box(-0.6, 1.42, -0.3, -0.05, 1.6, 0.0, 0xe2231a, null);
    b.box(0.05, 1.42, -0.3, 0.6, 1.6, 0.0, 0x1e5fbf, null);
    b.box(-0.91, 0.4, -0.9, 0.91, 0.7, 0.9, 0x1c1f26, null, { top: false });
  }
}

export function parkedCar(b, x, z, ry, rng, y = 0.3) {
  R(b, x, z, ry, y);
  const roll = rng.next();
  if (roll < 0.14) carShape(b, 'taxi', 0xffc21a);
  else if (roll < 0.22) carShape(b, 'van', rng.pick([0xe8e4da, 0x2e6b5a, 0x8e1b14]));
  else carShape(b, 'sedan', rng.pick(CAR_COLORS));
}

// --- street furniture ------------------------------------------------------------------------

// Cobra-head street light; the arm reaches toward local +z.
export function streetLamp(b, g, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  R(g, x, z, ry);
  b.cbox(0, 0, 0.42, 0.42, y, y + 0.6, POLE);
  b.cyl(0, 0, 0.1, y + 0.6, y + 6.4, 5, POLE, null, { r1: 0.07, cap: false });
  b.bar(0, y + 6.1, 0, 0, y + 6.75, 1.3, 0.1, POLE);
  b.bar(0, y + 6.75, 1.3, 0, y + 6.8, 2.3, 0.1, POLE);
  b.box(-0.24, y + 6.62, 2.0, 0.24, y + 6.86, 3.0, 0x6f7a73, null);
  g.flat(-0.18, 2.1, 0.18, 2.9, y + 6.6, null, 0xfff1c4, true);
}

// Old double-globe lamp for the waterfront and park paths.
export function parkLamp(b, g, x, z, y = GROUND) {
  R(b, x, z, 0);
  R(g, x, z, 0);
  b.cyl(0, 0, 0.16, y, y + 0.5, 6, 0x2a2d2a);
  b.cyl(0, 0, 0.07, y + 0.5, y + 3.6, 5, 0x2a2d2a, null, { cap: false });
  b.box(-0.7, y + 3.5, -0.04, 0.7, y + 3.58, 0.04, 0x2a2d2a, null);
  for (const s of [-0.62, 0.62]) g.cbox(s, 0, 0.36, 0.36, y + 3.58, y + 4.0, 0xfff3d6);
}

export function hydrant(b, x, z, y = GROUND) {
  R(b, x, z, 0);
  b.cyl(0, 0, 0.17, y, y + 0.55, 6, 0xd8342b, null, { capColor: 0xf2c12e });
  b.box(-0.27, y + 0.3, -0.06, 0.27, y + 0.4, 0.06, 0xd8342b, null);
}

export function mailbox(b, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  b.cbox(0, 0, 0.55, 0.5, y + 0.15, y + 1.1, 0x1f4fa8);
  b.cbox(0, 0, 0.6, 0.55, y + 1.1, y + 1.22, 0x1b4596);
  for (const s of [-0.22, 0.22]) b.cbox(s, 0, 0.06, 0.4, y, y + 0.15, IRON);
}

export function newsBoxes(b, x, z, ry, rng, y = GROUND) {
  R(b, x, z, ry);
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const c = rng.pick([0xd8342b, 0x1e5fbf, 0xf2c12e, 0xe8e4da, 0x2e8b57]);
    const ox = (i - (n - 1) / 2) * 0.55;
    b.cbox(ox, 0, 0.48, 0.42, y, y + 0.95, c);
    b.face(ox - 0.18, 0.211, 1, 0, 0, 0.36, y + 0.55, y + 0.85, 'poster', WHITE);
  }
}

export function trashCan(b, x, z, y = GROUND) {
  R(b, x, z, 0);
  b.cyl(0, 0, 0.27, y, y + 0.85, 7, 0x2f6b4a, null, { capColor: 0x1c1f1c });
}

export function bench(b, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  b.box(-0.9, y + 0.42, -0.25, 0.9, y + 0.5, 0.25, 0x8a5a3a, null);
  b.box(-0.9, y + 0.55, -0.3, 0.9, y + 0.95, -0.24, 0x8a5a3a, null);
  for (const s of [-0.75, 0.75]) b.box(s - 0.04, y, -0.25, s + 0.04, y + 0.42, 0.2, IRON, null, { top: false });
}

export function phoneBooth(b, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  b.cbox(0, 0, 0.12, 0.12, y, y + 1.3, 0x8a8f99);
  b.box(-0.4, y + 1.2, -0.15, 0.4, y + 2.2, 0.35, 0xc9ccd1, null);
  b.face(-0.3, 0.351, 1, 0, 0, 0.6, y + 1.3, y + 2.0, null, 0x2a3a4a);
  b.box(-0.45, y + 2.2, -0.2, 0.45, y + 2.4, 0.45, 0x1e5fbf, null);
}

export function busShelter(b, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  for (const px of [-2.2, 2.2]) for (const pz of [-0.6, 0.6]) b.cbox(px, pz, 0.1, 0.1, y, y + 2.6, 0x8a8f99);
  b.box(-2.4, y + 2.6, -0.8, 2.4, y + 2.75, 0.85, 0x8a8f99, null);
  b.face(2.15, -0.62, -1, 0, 0, 4.3, y + 0.3, y + 2.4, 'carglass', 0xd8e6ee);
  b.face(-2.15, -0.62, 1, 0, 0, 4.3, y + 0.3, y + 2.4, 'carglass', 0xd8e6ee);
  b.face(2.18, -0.6, 0, 1, 0, 1.2, y + 0.3, y + 2.4, 'poster', WHITE);
  b.face(2.22, 0.6, 0, -1, 0, 1.2, y + 0.3, y + 2.4, 'poster', WHITE);
  b.box(-1.6, y + 0.45, -0.55, 1.4, y + 0.52, -0.2, 0x8a8f99, null);
}

// Subway entrance: railings around the stair, green globes, the line sign.
export function subwayEntrance(b, g, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  R(g, x, z, ry);
  b.flat(-0.9, -1.8, 0.9, 1.8, y + 0.03, null, 0x2b2d33);
  const rail = 0x2f6b55;
  b.box(-1.0, y + 0.95, -1.9, -0.92, y + 1.05, 1.9, rail, null);
  b.box(0.92, y + 0.95, -1.9, 1.0, y + 1.05, 1.9, rail, null);
  b.box(-1.0, y + 0.95, -1.9, 1.0, y + 1.05, -1.82, rail, null);
  for (const zz of [-1.86, 0, 1.86]) for (const xx of [-0.96, 0.96]) b.cbox(xx, zz, 0.07, 0.07, y, y + 1.0, rail);
  b.face(-0.9, -1.8, 0, 1, 0.2, 3.4, y + 0.15, y + 0.95, null, rail);
  b.face(0.9, 1.8, 0, -1, 0.2, 3.4, y + 0.15, y + 0.95, null, rail);
  b.face(-0.9, -1.83, 1, 0, 0, 1.8, y + 0.15, y + 0.95, null, rail);
  for (const xx of [-0.96, 0.96]) {
    b.cyl(xx, 1.86, 0.06, y + 1.0, y + 2.4, 5, rail, null, { cap: false });
    g.cbox(xx, 1.86, 0.34, 0.34, y + 2.4, y + 2.74, 0x5dff9a);
  }
  b.box(-0.9, y + 1.05, 1.82, 0.9, y + 1.5, 1.9, 0x1c1f26, null);
  g.face(-0.85, 1.91, 1, 0, 0, 1.7, y + 1.08, y + 1.47, 'metro', WHITE);
}

// Big green overhead guide sign on two posts.
export function guideSign(b, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  for (const s of [-2.2, 2.2]) b.cyl(s, 0, 0.12, y, y + 5.4, 5, 0x8a8f99, null, { cap: false });
  b.box(-2.3, y + 4.6, -0.1, 2.3, y + 4.75, 0.1, 0x8a8f99, null);
  b.box(-2.1, y + 3.7, -0.06, 2.1, y + 5.8, 0.06, 0x1d6b3a, null);
  b.face(-2.0, 0.07, 1, 0, 0, 4.0, y + 3.8, y + 5.7, 'streetsign', WHITE);
}

// Signal head facing local +z with one lamp lit.
function signal(b, g, x, y, z, lit) {
  b.box(x - 0.24, y - 0.7, z - 0.2, x + 0.24, y + 0.7, z + 0.2, 0xd6a21e, null);
  const colors = [0xff3020, 0xffb020, 0x30ff70];
  for (let i = 0; i < 3; i++) {
    const yy = y + 0.42 - i * 0.42;
    const on = (lit === 'red' && i === 0) || (lit === 'green' && i === 2);
    (on ? g : b).face(x - 0.13, z + 0.21, 1, 0, 0, 0.26, yy - 0.13, yy + 0.13, null, on ? colors[i] : 0x2b2420);
    b.box(x - 0.17, yy + 0.14, z + 0.2, x + 0.17, yy + 0.18, z + 0.36, 0x1c1f1c, null);
  }
}

// Traffic light at a side street's mouth: mast arm over the street (red), heads for the loop (green).
// Local frame: +z points from the junction along the street (away from the loop).
// arm: +1 / -1, the side (local x) the mast arm reaches over.
export function trafficLight(b, g, x, z, ry, arm = 1, y = GROUND) {
  R(b, x, z, ry);
  R(g, x, z, ry);
  b.cbox(0, 0, 0.4, 0.4, y, y + 0.5, POLE);
  b.cyl(0, 0, 0.13, y + 0.5, y + 6.6, 6, POLE, null, { cap: false });
  b.bar(0, y + 6.2, 0, 3.2 * arm, y + 6.4, 0, 0.12, POLE);
  signal(b, g, 2.6 * arm, y + 5.4, 0.05, 'red');
  // Heads for the loop traffic on the pole, facing both ways along the loop.
  g.frame(x, 0, z, ry + Math.PI / 2);
  b.frame(x, 0, z, ry + Math.PI / 2);
  signal(b, g, 0, y + 3.6, 0.15, 'green');
  g.frame(x, 0, z, ry - Math.PI / 2);
  b.frame(x, 0, z, ry - Math.PI / 2);
  signal(b, g, 0, y + 3.6, 0.15, 'green');
}

export function hotdogCart(b, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  b.box(-0.8, y + 0.4, -0.45, 0.8, y + 1.2, 0.45, 0xd9dde2, null);
  b.box(-0.82, y + 0.75, 0.46, 0.82, y + 0.95, 0.48, 0xd8342b, null);
  for (const s of [-0.6, 0.6]) b.cyl(s, 0, 0.22, y, y + 0.44, 6, IRON);
  b.cyl(0, 0, 0.04, y + 1.2, y + 2.3, 4, 0x8a8f99, null, { cap: false });
  b.cyl(0, 0, 1.25, y + 2.0, y + 2.6, 8, WHITE, 'awn:9', { r1: 0.06, cap: false });
}

// Abstract red cube sculpture on its corner.
export function sculpture(b, x, z, y = GROUND) {
  R(b, x, z, 0.5);
  b.cbox(0, 0, 1.2, 1.2, y, y + 0.3, 0x5a5f68);
  b.rbox(0, 0, 2.2, 2.2, y + 0.9, y + 3.6, 0.785, 0xd8342b);
}

export function cones(b, x, z, ry, y = 0.3) {
  R(b, x, z, ry);
  for (let i = 0; i < 4; i++) {
    b.cbox(0, i * 1.4, 0.5, 0.5, y, y + 0.06, 0xf26a1b);
    b.cone(0, i * 1.4, 0.2, y + 0.06, y + 0.75, 6, 0xf26a1b);
    b.cyl(0, i * 1.4, 0.13, y + 0.38, y + 0.48, 6, WHITE, null, { cap: false });
  }
}

// --- open lots (local frame: front edge at z = 0 facing +z, lot in z ∈ [-d, 0]) ------------

export function parkingLot(b, g, rng, lot, trees, billboard = null) {
  const { w, d } = lot;
  R(b, lot.x, lot.z, lot.ry);
  const y = GROUND + 0.03;
  b.flat(-w / 2, -d, w / 2, 0, y, null, 0x3d3f45);
  const n = Math.floor((w - 1) / 2.7);
  const sx = -((n - 1) * 2.7) / 2;
  for (let i = 0; i <= n; i++) b.flat(sx - 1.35 + i * 2.7 - 0.06, -d + 0.3, sx - 1.35 + i * 2.7 + 0.06, -d + 5.2, y + 0.01, null, 0xe8e4da);
  // Chain fence along the front with a gap for the entrance.
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 2) {
    if (Math.abs(x) < 1.6) continue;
    b.cbox(x, -0.2, 0.08, 0.08, GROUND, GROUND + 1.8, 0x9aa0a8);
  }
  b.box(-w / 2, GROUND + 1.72, -0.24, -1.6, GROUND + 1.8, -0.16, 0x9aa0a8, null);
  b.box(1.6, GROUND + 1.72, -0.24, w / 2, GROUND + 1.8, -0.16, 0x9aa0a8, null);
  b.face(-w / 2, -0.2, 1, 0, 0, w / 2 - 1.6, GROUND, GROUND + 1.7, null, 0x7d838c);
  const local = (lx, lz) => ({ x: lot.x + lot.a.x * lx + lot.n.x * lz, z: lot.z + lot.a.z * lx + lot.n.z * lz });
  for (let i = 0; i < n; i++) {
    if (rng.chance(0.3)) continue;
    const p = local(sx + i * 2.7, -d + 2.6);
    parkedCar(b, p.x, p.z, lot.ry + Math.PI + rng.float(-0.05, 0.05), rng, y);
  }
  // Attendant booth + sign, billboard at the back.
  R(b, lot.x, lot.z, lot.ry);
  R(g, lot.x, lot.z, lot.ry);
  b.box(w / 2 - 2.2, GROUND, -2.4, w / 2 - 0.6, GROUND + 2.3, -1.0, 0xf2e8d6, null);
  b.box(w / 2 - 2.35, GROUND + 2.3, -2.55, w / 2 - 0.45, GROUND + 2.5, -0.85, 0xd8342b, null);
  if (billboard && w > 6) {
    const cell = billboard;
    const bw = Math.min(w - 1, 9), bh = bw * 0.42, z = -d + 0.6, y0 = GROUND + 3.2;
    for (const x of [-bw * 0.3, bw * 0.3]) b.box(x - 0.15, GROUND, z - 0.15, x + 0.15, y0 + bh, z + 0.15, IRON, null);
    b.box(-bw / 2 - 0.15, y0 - 0.15, z + 0.15, bw / 2 + 0.15, y0 + bh + 0.15, z + 0.3, 0x2b2d33, null);
    b.face(-bw / 2, z + 0.31, 1, 0, 0, bw, y0, y0 + bh, cell, WHITE);
  }
  if (rng.chance(0.5)) trees.push(local(-w / 2 + 1, -d + 1));
}

export function plazaLot(b, g, rng, lot, trees) {
  const { w, d } = lot;
  R(b, lot.x, lot.z, lot.ry);
  b.flat(-w / 2, -d, w / 2, 0, GROUND + 0.03, 'tile', 0xe6d6c4);
  const local = (lx, lz) => ({ x: lot.x + lot.a.x * lx + lot.n.x * lz, z: lot.z + lot.a.z * lx + lot.n.z * lz });
  for (const [lx, lz] of [[-w / 2 + 1.6, -1.6], [w / 2 - 1.6, -1.6], [-w / 2 + 1.6, -d + 1.6], [w / 2 - 1.6, -d + 1.6]]) {
    if (w < 5 && lx > 0) continue;
    const p = local(lx, lz);
    R(b, p.x, p.z, 0);
    b.cbox(0, 0, 1.6, 1.6, GROUND, GROUND + 0.5, 0xb9b2a6);
    trees.push({ x: p.x, z: p.z, y: GROUND + 0.5 });
  }
  const c = local(0, -d / 2);
  if (rng.chance(0.5)) sculpture(b, c.x, c.z);
  else hotdogCart(b, c.x, c.z, lot.ry + 0.3);
  const bp = local(0, -d + 0.8);
  bench(b, bp.x, bp.z, lot.ry);
}

export function gasStation(b, g, rng, x, z, ry, w, d) {
  R(b, x, z, ry);
  R(g, x, z, ry);
  const y = GROUND;
  b.flat(-w / 2, -d, w / 2, 0, y + 0.03, null, 0x55575e);
  // Canopy.
  const cw = Math.min(w - 1.5, 9), cz = -d * 0.45, cd = Math.min(d - 2, 6);
  for (const px of [-cw / 2 + 0.8, cw / 2 - 0.8]) for (const pz of [cz - cd / 2 + 0.8, cz + cd / 2 - 0.8]) b.cbox(px, pz, 0.35, 0.35, y, y + 4.4, 0xe8e4da);
  b.box(-cw / 2, y + 4.4, cz - cd / 2, cw / 2, y + 5.2, cz + cd / 2, WHITE, null);
  b.box(-cw / 2 - 0.02, y + 4.55, cz - cd / 2 - 0.02, cw / 2 + 0.02, y + 4.9, cz + cd / 2 + 0.02, 0xd8342b, null, { top: false });
  g.flat(-cw / 2 + 0.3, cz - cd / 2 + 0.3, cw / 2 - 0.3, cz + cd / 2 - 0.3, y + 4.39, null, 0xfff6dc, true);
  // Pump islands.
  for (const px of [-cw / 4, cw / 4]) {
    b.cbox(px, cz, 1.0, 3.2, y, y + 0.25, 0xd9d3c7);
    for (const pz of [cz - 0.8, cz + 0.8]) {
      b.cbox(px, pz, 0.6, 0.8, y + 0.25, y + 1.9, 0xd8342b);
      g.face(px - 0.25, pz + 0.41, 1, 0, 0, 0.5, y + 1.35, y + 1.75, null, 0xfff2b0);
      b.face(px + 0.25, pz - 0.41, -1, 0, 0, 0.5, y + 1.35, y + 1.75, null, 0x1c1f26);
    }
  }
  // Kiosk at the back.
  const kw = Math.min(w - 2, 6);
  b.box(-kw / 2, y, -d + 0.2, kw / 2, y + 3.2, -d + 2.8, 0xf2ede2, null);
  b.face(-kw / 2 + 0.4, -d + 2.81, 1, 0, 0, kw - 0.8, y, y + 2.6, 'store:goods', WHITE);
  b.box(-kw / 2 - 0.1, y + 3.2, -d + 0.1, kw / 2 + 0.1, y + 3.6, -d + 3.0, 0xd8342b, null);
  // Price sign on a tall pole at the corner.
  const sx = w / 2 - 0.8;
  b.cyl(sx, -0.8, 0.14, y, y + 8.5, 6, 0xd9dde2, null, { cap: false });
  b.box(sx - 1.3, y + 7.0, -0.95, sx + 1.3, y + 9.6, -0.65, 0x1c1f26, null);
  g.face(sx - 1.25, -0.64, 1, 0, 0, 2.5, y + 7.05, y + 9.55, 'sign:gas', WHITE);
  g.face(sx + 1.25, -0.96, -1, 0, 0, 2.5, y + 7.05, y + 9.55, 'sign:gas', WHITE);
  const p = { x: x + Math.cos(ry) * -cw / 4 + Math.sin(ry) * (cz + 1.5), z: z - Math.sin(ry) * -cw / 4 + Math.cos(ry) * (cz + 1.5) };
  if (rng.chance(0.8)) parkedCar(b, p.x, p.z, ry + 0.02, rng, y + 0.03);
}

export function courtLot(b, rng, x, z, ry, w, d, y = GROUND) {
  R(b, x, z, ry);
  b.flat(-w / 2, -d, w / 2, 0, y + 0.03, null, 0x2f7f62);
  const cw = Math.min(w - 1, 14), cd = Math.min(d - 1, 9);
  b.flat(-cw / 2, -d / 2 - cd / 2, cw / 2, -d / 2 + cd / 2, y + 0.06, 'court', WHITE);
  for (const s of [-1, 1]) {
    const hx = s * (cw / 2 - 0.3);
    b.cbox(hx + s * 0.6, -d / 2, 0.15, 0.15, y, y + 3.4, 0xd9dde2);
    b.box(Math.min(hx, hx + s * 0.6) - 0.02, y + 3.2, -d / 2 - 0.8, Math.max(hx, hx + s * 0.6) + 0.02, y + 4.2, -d / 2 + 0.8, WHITE, null);
    b.cyl(hx - s * 0.35, -d / 2, 0.24, y + 3.3, y + 3.36, 6, 0xf26a1b, null, { cap: false });
  }
  // Chain-link fence posts around it.
  for (let t = -w / 2; t <= w / 2 + 0.01; t += 2.5) {
    b.cbox(t, -0.15, 0.08, 0.08, y, y + 2.6, 0x9aa0a8);
    b.cbox(t, -d + 0.15, 0.08, 0.08, y, y + 2.6, 0x9aa0a8);
  }
  b.box(-w / 2, y + 2.5, -0.2, w / 2, y + 2.58, -0.1, 0x9aa0a8, null);
  b.box(-w / 2, y + 2.5, -d + 0.1, w / 2, y + 2.58, -d + 0.2, 0x9aa0a8, null);
}

// --- loop island ------------------------------------------------------------------------------

// Chrome railcar diner with a rooftop sign and a pole sign. Faces local +z.
export function diner(b, g, x, z, ry, len = 11) {
  R(b, x, z, ry);
  R(g, x, z, ry);
  const y = GROUND;
  const L = len / 2, D = 2.4;
  b.cbox(0, 0, len + 0.6, D * 2 + 0.6, y, y + 0.45, 0x2b2d33);
  b.box(-L, y + 0.45, -D, L, y + 1.6, D, WHITE, 'chrome', { top: false });
  b.box(-L, y + 1.6, -D, L, y + 1.72, D, 0xd8342b, null, { top: false });
  const n = Math.max(2, Math.round(len / 4.8));
  for (const [x0, z0, ux] of [[-L, D, 1], [L, -D, -1]]) {
    for (let i = 0; i < n; i++) b.face(x0, z0, ux, 0, (i * len) / n, ((i + 1) * len) / n, y + 1.72, y + 3.1, 'store:warm', WHITE);
  }
  b.box(-L, y + 1.72, -D, -L + 0.01, y + 3.1, D, WHITE, 'chrome', { top: false, skip: new Set(['pz', 'nz', 'px']) });
  b.box(L - 0.01, y + 1.72, -D, L, y + 3.1, D, WHITE, 'chrome', { top: false, skip: new Set(['pz', 'nz', 'nx']) });
  b.box(-L - 0.05, y + 3.1, -D - 0.05, L + 0.05, y + 3.4, D + 0.05, 0x1e88c8, null, { top: false });
  b.box(-L - 0.3, y + 3.4, -D - 0.3, L + 0.3, y + 3.7, D + 0.3, 0xf3ead8, null);
  b.box(-L + 0.4, y + 3.7, -D + 0.6, L - 0.4, y + 4.1, D - 0.6, 0xe6dccb, null);
  g.face(-L - 0.3, D + 0.31, 1, 0, 0, len + 0.6, y + 3.45, y + 3.6, null, 0xff3fa4);
  g.face(L + 0.3, -D - 0.31, -1, 0, 0, len + 0.6, y + 3.45, y + 3.6, null, 0xff3fa4);
  // Vestibule.
  b.box(-1.1, y + 0.45, D, 1.1, y + 3.0, D + 1.4, WHITE, 'chrome', { topColor: 0xf3ead8 });
  b.face(-0.6, D + 1.41, 1, 0, 0, 1.2, y + 0.45, y + 2.6, 'carglass', WHITE);
  // Rooftop sign, both faces.
  const sw = Math.min(len - 2, 7), sh = sw / 3.6;
  for (const sx of [-sw / 3, sw / 3]) b.box(sx - 0.07, y + 4.1, -0.1, sx + 0.07, y + 4.6, 0.1, IRON, null);
  b.box(-sw / 2, y + 4.6, -0.12, sw / 2, y + 4.6 + sh, 0.12, 0x1c1f26, null);
  g.face(-sw / 2 + 0.05, 0.13, 1, 0, 0, sw - 0.1, y + 4.65, y + 4.55 + sh, 'sign:diner', WHITE);
  g.face(sw / 2 - 0.05, -0.13, -1, 0, 0, sw - 0.1, y + 4.65, y + 4.55 + sh, 'sign:diner', WHITE);
}

export function dinerPoleSign(b, g, x, z, ry, y = GROUND) {
  R(b, x, z, ry);
  R(g, x, z, ry);
  b.cyl(0, 0, 0.18, y, y + 8.5, 6, 0xd9dde2, null, { cap: false });
  b.box(-2.2, y + 7.2, -0.25, 2.2, y + 8.6, 0.25, 0x1c1f26, null);
  g.face(-2.15, 0.26, 1, 0, 0, 4.3, y + 7.25, y + 8.55, 'sign:diner', WHITE);
  g.face(2.15, -0.26, -1, 0, 0, 4.3, y + 7.25, y + 8.55, 'sign:diner', WHITE);
  g.cone(0, 0, 0.5, y + 8.6, y + 9.6, 5, 0xffd23f);
}

export function palm(b, x, z, y = GROUND, h = 6) {
  R(b, x, z, 0);
  for (let i = 0; i < 6; i++) {
    const y0 = y + (h * i) / 6, y1 = y + (h * (i + 1)) / 6;
    b.cyl(Math.sin(i * 0.5) * 0.12, 0, 0.2 - i * 0.015, y0, y1, 5, i % 2 ? 0x8a6a45 : 0x7a5c3b, null, { r1: 0.19 - i * 0.015, cap: false });
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const ex = Math.cos(a) * 2.6, ez = Math.sin(a) * 2.6;
    b.bar(0, y + h, 0, ex * 0.55, y + h + 0.5, ez * 0.55, 0.32, 0x3f9e3a);
    b.bar(ex * 0.55, y + h + 0.5, ez * 0.55, ex, y + h - 0.6, ez, 0.26, 0x4caf50);
  }
}

export function playground(b, x, z, y = 0.5) {
  R(b, x, z, 0);
  b.flat(-5, -5, 5, 5, y + 0.04, null, 0xd9773b);
  // Slide.
  b.cbox(-2.5, -1.5, 1.6, 1.6, y + 1.6, y + 1.75, 0x1e5fbf);
  for (const [px, pz] of [[-3.2, -2.2], [-1.8, -2.2], [-3.2, -0.8], [-1.8, -0.8]]) b.cbox(px, pz, 0.12, 0.12, y, y + 2.6, 0xf2c12e);
  b.bar(-2.5, y + 1.7, -0.7, -2.5, y + 0.2, 2.6, 0.9, 0xd8342b);
  b.box(-3.3, y + 2.6, -2.3, -1.7, y + 3.0, -0.7, 0xd8342b, null);
  // Swings.
  for (const s of [-1, 1]) b.bar(2.5 + s * 1.6, y, -2.5, 2.5 + s * 1.6, y + 2.6, -1.5, 0.12, 0x1e5fbf);
  b.bar(0.9, y + 2.6, -1.5, 4.1, y + 2.6, -1.5, 0.12, 0x1e5fbf);
  for (const s of [1.8, 3.2]) {
    b.bar(s, y + 2.6, -1.5, s, y + 0.6, -1.5, 0.04, IRON);
    b.cbox(s, -1.5, 0.5, 0.25, y + 0.55, y + 0.62, 0x2b2d33);
  }
  // Climbing dome.
  b.cyl(1.5, 2.5, 1.6, y, y + 1.6, 8, 0x2e8b57, null, { r1: 0.3, cap: false });
  b.cbox(-2.5, 2.5, 2.2, 2.2, y, y + 0.3, 0xf2e1b0);
}

export function fountain(b, g, x, z, y = 0.5) {
  R(b, x, z, 0);
  R(g, x, z, 0);
  b.cyl(0, 0, 3.4, y, y + 0.6, 14, 0xc9c2b4);
  b.disc(0, 0, 3.0, y + 0.55, 14, 0x3b8fc4);
  b.cyl(0, 0, 0.5, y + 0.55, y + 1.8, 8, 0xc9c2b4);
  b.cyl(0, 0, 1.4, y + 1.8, y + 2.1, 10, 0xc9c2b4, null, { capColor: 0x5aa8d8 });
  g.cyl(0, 0, 0.25, y + 2.1, y + 3.4, 6, 0xd6f0ff, null, { r1: 0.08, cap: false });
  g.cyl(0, 0, 1.3, y + 2.1, y + 2.9, 10, 0xbfe6ff, null, { r1: 0.2, cap: false });
}

export function pond(b, x, z, y = 0.5) {
  R(b, x, z, 0);
  b.cyl(0, 0, 6.6, y - 0.1, y + 0.12, 16, 0xb9b2a6);
  b.disc(0, 0, 6.2, y + 0.1, 16, 0x4a9fd0);
  b.cbox(2, 1, 1.6, 0.8, y + 0.1, y + 0.4, 0xe8e4da);
}

export function ballfield(b, x, z, y = 0.5) {
  R(b, x, z, 0);
  const s = 7;
  b.quad([0, y + 0.03, s * 0.2], [s * 0.85, y + 0.03, -s * 0.65], [0, y + 0.03, -s * 1.5], [-s * 0.85, y + 0.03, -s * 0.65], null, 0xc8915a);
  b.disc(0, -s * 0.65, 1.6, y + 0.04, 10, 0x6fb84f);
  for (const [bx, bz] of [[0, s * 0.05], [s * 0.7, -s * 0.65], [0, -s * 1.35], [-s * 0.7, -s * 0.65]]) b.cbox(bx, bz, 0.5, 0.5, y + 0.04, y + 0.1, WHITE);
  for (let i = -2; i <= 2; i++) b.cbox(i * 1.2, s * 0.2 + 1.4 - Math.abs(i) * 0.4, 0.08, 0.08, y, y + 3, 0x9aa0a8);
  b.box(-2.4, y + 2.9, s * 0.2 + 0.4, 2.4, y + 3.0, s * 0.2 + 1.5, 0x9aa0a8, null);
}

// Tree crowns are instanced by City; this returns positions for the grove.
export function grove(rng, x0, z0, x1, z1, trees, y = 0.5) {
  const n = Math.round(((x1 - x0) * (z1 - z0)) / 22);
  for (let i = 0; i < n; i++) trees.push({ x: rng.float(x0, x1), z: rng.float(z0, z1), y, s: rng.float(0.9, 1.35) });
}
