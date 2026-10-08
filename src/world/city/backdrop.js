import { RNG } from '../../utils/rng.js';
import { clamp, lerp } from '../../utils/math.js';
import { VIEW } from '../../camera/FollowCamera.js';
import { SKY_TILE } from './atlas.js';
import { GROUND, waterTower } from './buildings.js';
import { GRID, ROAD, ROAD_Y } from './layout.js';
import { bench, parkLamp } from './props.js';

// Everything north of the city blocks: the elevated train over its street, the waterfront
// promenade, the river with a stone suspension bridge, a container ship at the cranes of the
// far shore and the downtown skyline behind it.
//
// ctx: { plan, at(x, z) → chunk builders { lit, glow }, far: { lit, glow, sky, walk, water },
//        lines: [] (x, y, z pairs for cables), trees: [] }

const WHITE = 0xffffff;
const IRON = 0x2a2d2a;
const EL_GREEN = 0x3f6f5c;
const EL_DARK = 0x2c4a3f;
const STONE = 0xc9b99c;
const STONE_D = 0xa99a7f;
const TILE4 = { tw: 4, th: 4 };
const SKY = { tw: SKY_TILE.w, th: SKY_TILE.h };

export const EL = { deck: 8.4, rail: 8.58, tracks: [-1.6, 1.6] };
export const RIVER = { south: 14, north: 104, y: -0.6 };

export function buildBackdrop(ctx) {
  const { plan } = ctx;
  const { zW, zE, X0, X1 } = plan;
  const XA = X0 - 420, XB = X1 + 420;
  const zS = zW - RIVER.south, zN = zW - RIVER.north;
  const fit = plan.fit;
  // x of the default view's center line at depth z (the camera looks a bit to the west).
  const xLine = (z) => fit.target.x - Math.tan(VIEW.az) * (fit.target.z - z);
  const rng = new RNG(4242 + plan.level * 17);

  waterfront(ctx, { XA, XB, zS, zN, zW, X0, X1 });
  elevated(ctx, { zE, X0, X1 });
  const bridge = suspensionBridge(ctx, xLine(zS - 9) - 42, zS - 9, zN + 9);
  const cranes = [xLine(zN) - 56, xLine(zN) - 33];
  for (const x of cranes) crane(ctx.far, x, zN - 5);
  ship(ctx.far, rng, xLine(zN) - 44, zN + 8.5);
  skyline(ctx, rng, { XA, XB, zN, xLine, avoid: [{ x: bridge.end.x, z: bridge.end.z, r: 16 }, ...cranes.map((x) => ({ x, z: zN - 5, r: 12 }))] });

  return {
    bridge,
    el: { z: zE, y: EL.rail, x0: X0 - 60, x1: X1 + 60 },
    ferry: { z: zW - 50, x0: XA + 300, x1: XB - 300, y: RIVER.y },
    promenade: { z: zW - 8.5, x0: X0, x1: X1 },
  };
}

// --- waterfront ----------------------------------------------------------------------------

function waterfront(ctx, { XA, XB, zS, zN, zW, X0, X1 }) {
  const { far, trees } = ctx;
  far.water.frame(0, 0, 0, 0);
  far.water.flat(XA, zN, XB, zS, RIVER.y, { tw: 18, th: 18 }, WHITE);

  // Promenade slab with the river wall, and the far shore.
  far.walk.frame(0, 0, 0, 0);
  far.walk.box(XA, -1.2, zS, XB, GROUND, zW - ROAD, WHITE, TILE4, { top: TILE4, skip: new Set(['nz', 'px', 'nx']) });
  const L = far.lit.frame(0, 0, 0, 0);
  L.box(XA, -1.2, zN - 700, XB, GROUND, zN, 0x8a8273, null, { topColor: 0xb0a898, skip: new Set(['nz', 'px', 'nx']) });
  L.box(XA, GROUND, zN - 1.2, XB, GROUND + 0.5, zN, 0x6f5a46, null, { skip: new Set(['nz', 'px', 'nx']) });

  // Railing, lamps, benches, trees.
  const xa = X0 - 150, xb = X1 + 150;
  L.box(xa, GROUND + 1.0, zS + 0.22, xb, GROUND + 1.1, zS + 0.36, IRON, null, { skip: new Set(['px', 'nx']) });
  L.box(xa, GROUND + 0.5, zS + 0.25, xb, GROUND + 0.56, zS + 0.33, IRON, null, { skip: new Set(['px', 'nx']) });
  for (let x = xa; x <= xb; x += 2.5) {
    L.frame(0, 0, 0, 0);
    L.cbox(x, zS + 0.29, 0.1, 0.1, GROUND, GROUND + 1.0, IRON, null, { top: false });
  }
  for (let x = Math.ceil(xa / 16) * 16; x <= xb; x += 16) {
    parkLamp(far.lit, far.glow, x, zS + 1.4);
    bench(far.lit, x + 8, zS + 1.5, Math.PI);
  }
  for (let x = Math.ceil(X0 / 12) * 12 + 6; x <= X1; x += 12) {
    L.frame(0, 0, 0, 0);
    L.flat(x - 0.8, zW - ROAD - 2.9, x + 0.8, zW - ROAD - 1.3, GROUND + 0.01, null, 0x5b4a3a);
    trees.push({ x, z: zW - ROAD - 2.1, y: GROUND, s: 1.05 });
  }
}

// --- elevated train ---------------------------------------------------------------------------

function elevated(ctx, { zE, X0, X1 }) {
  const { at } = ctx;
  for (let x = X0 + 6; x < X1; x += 12) {
    if (Math.abs(x - Math.round(x / GRID) * GRID) < 4.8) continue; // crossing street
    const b = at(x, zE).lit.frame(0, 0, 0, 0);
    for (const s of [-1, 1]) {
      const z = zE + s * 3.0;
      b.cbox(x, z, 1.0, 1.0, ROAD_Y, ROAD_Y + 0.8, EL_DARK);
      b.cbox(x, z, 0.62, 0.62, ROAD_Y + 0.8, 7.4, EL_GREEN, null, { top: false });
      b.bar(x, 5.9, z, x, 7.35, z - s * 1.4, 0.24, EL_GREEN);
    }
    b.box(x - 0.42, 7.1, zE - 3.75, x + 0.42, 7.45, zE + 3.75, EL_DARK);
  }
  const S = 6.4;
  for (let x = X0 - 60; x < X1 + 60; x += S) {
    const b = at(x + S / 2, zE).lit.frame(0, 0, 0, 0);
    b.face(x, zE + 3.75, 1, 0, 0, S, 7.4, 9.0, 'girder', 0xc4d6c9);
    b.face(x + S, zE - 3.75, -1, 0, 0, S, 7.4, 9.0, 'girder', 0xc4d6c9);
    b.face(x, zE - 3.45, 1, 0, 0, S, EL.deck, 9.0, null, EL_DARK);
    b.face(x + S, zE + 3.45, -1, 0, 0, S, EL.deck, 9.0, null, EL_DARK);
    b.flat(x, zE + 3.45, x + S, zE + 3.75, 9.0, null, EL_DARK);
    b.flat(x, zE - 3.75, x + S, zE - 3.45, 9.0, null, EL_DARK);
    b.flat(x, zE - 3.45, x + S, zE + 3.45, EL.deck, null, 0x57524b);
    b.flat(x, zE - 3.75, x + S, zE + 3.75, 7.4, null, EL_DARK, true);
    for (const tz of EL.tracks) {
      for (let k = 0; k < 8; k++) b.flat(x + k * 0.8 + 0.2, zE + tz - 1.05, x + k * 0.8 + 0.55, zE + tz + 1.05, EL.deck + 0.01, null, 0x4a3a2e);
      for (const r of [-0.72, 0.72]) b.box(x, EL.deck, zE + tz + r - 0.06, x + S, EL.rail, zE + tz + r + 0.06, 0x8f877d, null, { skip: new Set(['px', 'nx']) });
    }
  }
}

// --- suspension bridge --------------------------------------------------------------------------

// Stone towers with pointed arches, main cables, suspenders and diagonal stays. Built in a
// local frame: s along the bridge (local z), x across it. Anchorages stand in the river near
// each shore (the approaches are hidden behind the warehouses).
function suspensionBridge(ctx, bx, bz, zFar) {
  const { far, lines } = ctx;
  const theta = 0.85;
  const ux = Math.sin(theta), uz = -Math.cos(theta);
  const L = (bz - zFar) / -uz;
  const ry = Math.atan2(ux, uz);
  const ax = Math.cos(ry), az = -Math.sin(ry); // local +x in world
  const b = far.lit;
  const g = far.glow;
  const F = () => {
    b.frame(bx, 0, bz, ry);
    g.frame(bx, 0, bz, ry);
  };
  F();
  const sA = L * 0.22, sB = L * 0.78;
  const DECK = 11.0, TOP = 34.6;

  // Anchorages.
  for (const s0 of [0, L]) {
    b.box(-10, RIVER.y - 0.4, s0 - 7, 10, 13.2, s0 + 7, STONE, null, { topColor: STONE_D });
    b.box(-10.4, 13.2, s0 - 7.4, 10.4, 14.2, s0 + 7.4, STONE_D);
    for (const x of [-10.01, 10.01]) {
      const ux2 = x < 0 ? 1 : -1;
      b.face(x, s0 - 5 * ux2, 0, ux2, 0, 10, 2, 10, null, 0xb3a487);
    }
  }

  // Towers.
  for (const sT of [sA, sB]) {
    b.box(-11, RIVER.y - 0.4, sT - 5, 11, 1.5, sT + 5, STONE_D);
    b.box(-10, 1.5, sT - 3.6, 10, DECK - 1.6, sT + 3.6, STONE);
    for (const [x0, x1] of [[-10, -7.4], [-1.3, 1.3], [7.4, 10]]) b.box(x0, DECK - 1.6, sT - 3.6, x1, 26, sT + 3.6, STONE, null, { top: false });
    b.box(-10, 26, sT - 3.6, 10, 33, sT + 3.6, STONE, null, { top: false });
    b.box(-10.6, 33, sT - 4.2, 10.6, 34.2, sT + 4.2, STONE_D);
    b.box(-9.4, 34.2, sT - 3.0, 9.4, 35.0, sT + 3.0, STONE);
    // Pointed arch tops on both faces of both openings, and the arch soffits.
    for (const [x0, x1] of [[-7.4, -1.3], [1.3, 7.4]]) {
      const xm = (x0 + x1) / 2;
      for (const [s, dir] of [[sT + 3.6, 1], [sT - 3.6, -1]]) {
        const P = (x, y) => [x, y, s];
        const tri = (A, B, C) => (dir > 0 ? b.quad(A, B, C, C, null, STONE) : b.quad(A, C, B, B, null, STONE));
        tri(P(x0, 21.5), P(xm, 26), P(x0, 26));
        tri(P(x1, 21.5), P(x1, 26), P(xm, 26));
      }
      b.quad([x0, 21.5, sT + 3.6], [x0, 21.5, sT - 3.6], [xm, 26, sT - 3.6], [xm, 26, sT + 3.6], null, 0x9c8e74);
      b.quad([xm, 26, sT + 3.6], [xm, 26, sT - 3.6], [x1, 21.5, sT - 3.6], [x1, 21.5, sT + 3.6], null, 0x9c8e74);
    }
  }

  // Deck with a stiffening truss.
  const s0 = 7, s1 = L - 7;
  b.box(-7, DECK - 0.4, s0, 7, DECK, s1, 0x6d6a66, null, { topColor: 0x56585e, skip: new Set(['pz', 'nz']) });
  b.flat(-7, s0, 7, s1, DECK - 1.6, null, 0x4a4743, true);
  const n = Math.max(4, Math.round((s1 - s0) / 6.4));
  for (let i = 0; i < n; i++) {
    const a = s0 + ((s1 - s0) * i) / n, c = s0 + ((s1 - s0) * (i + 1)) / n;
    b.face(-7.05, c, 0, -1, 0, c - a, DECK - 1.6, DECK + 0.6, 'girder', 0xd8c9b0);
    b.face(7.05, a, 0, 1, 0, c - a, DECK - 1.6, DECK + 0.6, 'girder', 0xd8c9b0);
  }
  for (let s = s0; s < s1; s += 4) g.flat(-0.12, s, 0.12, s + 2, DECK + 0.01, null, 0xffe08a);

  // Main cables, suspenders, stays.
  const yC = (s) => {
    if (s <= sA) {
      const t = clamp((s - 4) / (sA - 4), 0, 1);
      return lerp(13.4, TOP, t) - 1.6 * 4 * t * (1 - t);
    }
    if (s >= sB) {
      const t = clamp((L - 4 - s) / (L - 4 - sB), 0, 1);
      return lerp(13.4, TOP, t) - 1.6 * 4 * t * (1 - t);
    }
    const t = (s - sA) / (sB - sA);
    return TOP - (TOP - DECK - 1.6) * 4 * t * (1 - t);
  };
  const W = (x, y, s) => lines.push(bx + ax * x + ux * s, y, bz + az * x + uz * s);
  for (const x of [-7.4, 7.4]) {
    let prev = 4;
    for (let s = 4 + 3; s <= L - 4 + 0.01; s += 3) {
      const s2 = Math.min(s, L - 4);
      b.bar(x, yC(prev), prev, x, yC(s2), s2, 0.5, 0x5e5a52);
      prev = s2;
    }
    for (let s = s0 + 1; s < s1; s += 2.2) {
      if (Math.abs(s - sA) < 4.5 || Math.abs(s - sB) < 4.5) continue;
      W(x, yC(s), s);
      W(x, DECK + 0.6, s);
    }
    for (const sT of [sA, sB]) {
      for (let k = 1; k <= 6; k++) {
        for (const dir of [-1, 1]) {
          const sd = sT + dir * (4 + k * 3.6);
          if (sd < s0 || sd > s1) continue;
          W(x, TOP - 2.5, sT + dir * 3.6);
          W(x, DECK + 0.6, sd);
        }
      }
    }
  }

  return {
    ox: bx, oz: bz, ux, uz, ax, az, s0, s1, y: DECK,
    end: { x: bx + ux * L, z: bz + uz * L },
  };
}

// --- harbour ----------------------------------------------------------------------------------

// Red container crane on the far shore, boom reaching south over the water.
function crane(far, x, z) {
  const b = far.lit.frame(x, 0, z, 0);
  const RED = 0xc8372d, Y = GROUND;
  for (const lx of [-5, 5]) {
    for (const lz of [-4, 4]) b.cbox(lx, lz, 0.9, 0.9, Y, Y + 24, RED, null, { top: false });
    b.box(lx - 0.5, Y + 0.8, -4.5, lx + 0.5, Y + 1.8, 4.5, RED);
    b.box(lx - 0.5, Y + 22.5, -4.5, lx + 0.5, Y + 24, 4.5, RED);
    b.bar(lx, Y + 2, -4, lx, Y + 22, 4, 0.35, RED);
  }
  b.box(-5.5, Y + 22.5, -4.5, 5.5, Y + 24, -3.5, RED);
  b.box(-5.5, Y + 22.5, 3.5, 5.5, Y + 24, 4.5, RED);
  b.box(-1.3, Y + 24, -14, 1.3, Y + 26.4, 30, RED);
  b.box(-2.6, Y + 26.4, -13, 2.6, Y + 29.6, -6.5, 0xe8e4da);
  for (const lx of [-1.2, 1.2]) {
    b.bar(lx, Y + 26.4, -5, 0, Y + 37, -0.5, 0.45, RED);
    b.bar(lx, Y + 26.4, 4, 0, Y + 37, -0.5, 0.45, RED);
  }
  b.bar(0, Y + 37, -0.5, 0, Y + 26.4, 28, 0.2, 0x3a3a3a);
  b.bar(0, Y + 37, -0.5, 0, Y + 26.4, -13, 0.2, 0x3a3a3a);
  b.box(-1.6, Y + 22.8, 14, 1.6, Y + 24, 17, 0x3a3a3a);
  b.bar(0, Y + 22.8, 15.5, 0, Y + 12, 15.5, 0.12, 0x2a2a2a);
  b.box(-1.4, Y + 11.4, 12.5, 1.4, Y + 12, 18.5, 0xf2c12e);
}

// Container ship moored along the far shore, bow to the east.
function ship(far, rng, x, z) {
  const b = far.lit.frame(x, 0, z, 0);
  const Y = RIVER.y;
  b.box(-34, Y - 0.6, -5.5, 30, Y + 4.4, 5.5, 0x24324a, null, { topColor: 0x8a3a2e });
  b.box(-34.05, Y - 0.6, -5.55, 30.05, Y + 0.6, 5.55, 0x9c2f24, null, { top: false });
  // Bow wedge.
  const bow = [[30, -5.5], [38, 0], [30, 5.5]];
  b.quad([30, Y + 4.4, 5.5], [38, Y + 4.4, 0], [30, Y + 4.4, -5.5], [30, Y + 4.4, -5.5], null, 0x8a3a2e);
  b.quad([bow[2][0], Y - 0.6, bow[2][1]], [bow[1][0], Y - 0.6, bow[1][1]], [bow[1][0], Y + 4.4, bow[1][1]], [bow[2][0], Y + 4.4, bow[2][1]], null, 0x24324a);
  b.quad([bow[1][0], Y - 0.6, bow[1][1]], [bow[0][0], Y - 0.6, bow[0][1]], [bow[0][0], Y + 4.4, bow[0][1]], [bow[1][0], Y + 4.4, bow[1][1]], null, 0x24324a);
  // Containers.
  const C = [0xc0392b, 0x2e6da4, 0xe08e2b, 0x3d8b5a, 0x8e44ad, 0xd8d3c4, 0x7f8c8d, 0x1f5f8b];
  for (let bay = 0; bay < 8; bay++) {
    const x0 = -24 + bay * 6.6;
    for (let k = 0; k < 4; k++) {
      const tiers = rng.int(1, 3);
      for (let t = 0; t < tiers; t++) {
        b.box(x0, Y + 4.4 + t * 2.5, -5 + k * 2.55, x0 + 6.2, Y + 6.8 + t * 2.5, -2.55 + k * 2.55, rng.pick(C));
      }
    }
  }
  // Bridge house at the stern.
  b.box(-33, Y + 4.4, -4.6, -26, Y + 13.5, 4.6, 0xf2efe6);
  for (let y = Y + 6.2; y < Y + 13; y += 2.2) {
    b.face(-33, 4.62, 1, 0, 0, 7, y, y + 0.7, null, 0x27313d);
    b.face(-25.98, 4.6, 0, -1, 0, 9.2, y, y + 0.7, null, 0x27313d);
  }
  b.box(-34, Y + 13.5, -5.5, -25, Y + 14.1, 5.5, 0xf2efe6);
  b.cbox(-30, 0, 2.2, 2.6, Y + 14.1, Y + 17.5, 0xd8342b);
}

// --- skyline ----------------------------------------------------------------------------------

function skyline(ctx, rng, { XA, XB, zN, xLine, avoid }) {
  const { far } = ctx;
  far.sky.frame(0, 0, 0, 0);
  far.glass.frame(0, 0, 0, 0);
  far.deco.frame(0, 0, 0, 0);
  // Three facade kinds, each with its own tints: punched-window offices, glass and prewar stone.
  const STYLES = [
    { b: far.sky, w: 4, tints: [[[0.8, 0.84, 0.93], 3], [[0.93, 0.89, 0.8], 3], [[0.74, 0.77, 0.83], 2], [[0.97, 0.96, 0.93], 2]] },
    { b: far.glass, w: 3, tints: [[[1, 1, 1], 3], [[0.82, 0.96, 0.92], 2], [[0.98, 0.86, 0.72], 1], [[0.7, 0.76, 0.86], 1]] },
    { b: far.deco, w: 3, tints: [[[1, 1, 1], 3], [[0.95, 0.85, 0.74], 2], [[0.86, 0.66, 0.56], 2], [[0.82, 0.82, 0.84], 1]] },
  ];
  const ROOFS = [0x6b6560, 0x5d5a57, 0x7a716a, 0x8a8580];
  const cDown = xLine(zN - 160);
  const marks = [{ x: cDown - 46, z: zN - 150, r: 24 }, { x: cDown + 42, z: zN - 196, r: 18 }];
  const blocked = (x, z, r) => [...avoid, ...marks].some((a) => Math.hypot(a.x - x, a.z - z) < a.r + r);

  for (let z = zN - 8; z > zN - 430; z -= 26) {
    const shore = z > zN - 30;
    for (let x = cDown - 460 + rng.float(0, 10); x < cDown + 460; x += rng.float(19, 27)) {
      const w = rng.float(11, 19), d = rng.float(11, 19);
      const cx = x + w / 2, cz = z - d / 2 - rng.float(0, 4);
      if (blocked(cx, cz, Math.max(w, d) / 2)) continue;
      const dc = Math.exp(-(((cx - cDown) / 230) ** 2 + ((cz - (zN - 170)) / 150) ** 2));
      let h;
      if (shore) h = rng.float(6, 13);
      else h = lerp(12, 24, clamp((zN - cz) / 120, 0, 1)) + dc * rng.float(25, 85) + rng.float(0, 12);
      // Glass mostly among the tall downtown towers, stone mostly low and on the shore.
      const st = shore ? STYLES[2] : rng.weighted(STYLES.map((s, i) => [s, s.w * (i === 1 ? 0.3 + dc * 2 : i === 2 ? 1.4 - dc : 1)]));
      const tint = shore ? [0.84, 0.62, 0.52] : rng.weighted(st.tints);
      const roof = rng.pick(ROOFS);
      st.b.box(cx - w / 2, GROUND, cz - d / 2, cx + w / 2, GROUND + h, cz + d / 2, tint, SKY, { topColor: roof, skip: new Set(['nz']) });
      if (h > 42 && rng.chance(0.55)) {
        const i = rng.float(1.5, 3), h2 = h * rng.float(0.12, 0.3);
        st.b.box(cx - w / 2 + i, GROUND + h, cz - d / 2 + i, cx + w / 2 - i, GROUND + h + h2, cz + d / 2 - i, tint, SKY, { topColor: roof, skip: new Set(['nz']) });
        if (rng.chance(0.4)) {
          far.lit.frame(0, 0, 0, 0);
          far.lit.cbox(cx, cz, 0.5, 0.5, GROUND + h + h2, GROUND + h + h2 + rng.float(6, 14), 0x9aa0a8, null, { top: false });
        }
      } else if (st.b === far.glass && h > 30 && rng.chance(0.5)) {
        // Light parapet band on a glass tower.
        far.lit.frame(cx, 0, cz, 0);
        far.lit.box(-w / 2, GROUND + h, -d / 2, w / 2, GROUND + h + 1.2, d / 2, 0xd6dadf, null);
      } else if (h < 26 && rng.chance(0.3)) {
        waterTower(far.lit.frame(cx + rng.float(-w / 4, w / 4), 0, cz, 0), 0, 0, GROUND + h, 0.9);
      }
    }
  }

  // Landmarks: a stepped limestone tower with a mast, and a steel crown with a spire.
  const [E, C] = marks;
  const lime = [0.93, 0.9, 0.84];
  const tiers = [[34, 26, 0, 16], [22, 16, 16, 78], [16, 12, 78, 90], [12, 9, 90, 98], [7, 7, 98, 104]];
  for (const [w, d, y0, y1] of tiers) far.deco.box(E.x - w / 2, GROUND + y0, E.z - d / 2, E.x + w / 2, GROUND + y1, E.z + d / 2, lime, SKY, { topColor: 0x9a948a, skip: new Set(['nz']) });
  far.lit.frame(E.x, 0, E.z, 0);
  far.lit.cyl(0, 0, 2.2, GROUND + 104, GROUND + 112, 8, 0xd9d6cf, null, { r1: 1.2 });
  far.lit.cyl(0, 0, 0.5, GROUND + 112, GROUND + 126, 5, 0xb9bcc2, null, { r1: 0.15, cap: false });

  const steel = [0.86, 0.88, 0.9];
  far.deco.box(C.x - 9, GROUND, C.z - 9, C.x + 9, GROUND + 74, C.z + 9, steel, SKY, { topColor: 0x8a8580, skip: new Set(['nz']) });
  far.lit.frame(C.x, 0, C.z, 0);
  far.glow.frame(C.x, 0, C.z, 0);
  let y = GROUND + 74;
  for (const [hw, hh] of [[7.5, 5], [6, 5], [4.6, 4.5], [3.3, 4], [2.2, 3.5]]) {
    far.lit.cbox(0, 0, hw * 2, hw * 2, y, y + hh, 0xdfe3e8);
    for (let k = 0; k < 3; k++) {
      const yy = y + 1 + k * (hh / 3.4);
      far.glow.face(-hw + 0.6, hw + 0.02, 1, 0, 0, hw * 2 - 1.2, yy, yy + 0.35, null, 0xfff1c4);
      far.glow.face(hw + 0.02, hw - 0.6, 0, -1, 0, hw * 2 - 1.2, yy, yy + 0.35, null, 0xfff1c4);
    }
    y += hh;
  }
  far.lit.cone(0, 0, 1.4, y, y + 16, 6, 0xe8ebef);
}
