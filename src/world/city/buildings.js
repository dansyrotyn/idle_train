import * as THREE from 'three';
import { BAY, STORE, WALLS, WINDOWS, SHOPS, SKY_TILE } from './atlas.js';
import { lin, mulColor } from './Builder.js';

// Building prefabs for the near city. Each draws into a lit builder `b` (atlas material)
// and a glow builder `g` (unlit signs) whose frame is already placed at the lot:
// front wall at local z = 0 facing +z, body in x ∈ [-w/2, w/2], z ∈ [-d, 0].
//
// spec: { type, w, d, floors, style, tint, shop, detail (0..2),
//         vis: { front, back, left, right } (can the camera ever see that face),
//         left / right: { street, cover }, back: { cover }, blade, billboard, mural, ghost }
// `cover` is the top of the neighbour on that side: the wall is only drawn above it.

export const GROUND = 0.56; // block sidewalk top, where buildings stand
export const FH = 3.0; // upper floor height
const SH = STORE.h; // storefront height
const GF = 4.2; // ground floor (storefront + sign band)
const IRON = 0x25272b;
const WHITE = 0xffffff;
const ROOF = [0x5d5a57, 0x6b6560, 0x55524f, 0x7a716a, 0x9a958e];
const FASCIA = [0x2a2c33, 0x1f3a2e, 0x3a2420, 0x23324a];
const STORE_FOR = ['warm', 'goods', 'goods', 'posters', 'neon', 'laundry', 'posters', 'goods', 'warm', 'dark', 'warm', 'dark', 'warm', 'goods', 'neon', 'dark'];

export const MIN_FLOORS = { walkup: 2, brownstone: 2, corner: 2, hotel: 5, deco: 10, theater: 2, warehouse: 3, firehouse: 3, shops1: 1 };

// Floor grid of a type: base of the first upper floor, number of upper floors, roof height.
export function floorGrid(type, floors) {
  const up = GROUND + GF;
  switch (type) {
    case 'brownstone':
      return { y1: GROUND + 1.4, n: floors, top: GROUND + 1.4 + floors * FH + 0.3 };
    case 'shops1':
      return { y1: up, n: 0, top: up + 0.5 };
    case 'corner':
      return { y1: up, n: floors - 1, top: up + (floors - 1) * FH + 0.4 };
    case 'theater':
      return { y1: up, n: floors - 1, top: up + (floors - 1) * FH + 0.6 };
    case 'firehouse':
      return { y1: up, n: floors - 1, top: up + (floors - 1) * FH + 0.5 };
    case 'deco':
      return { y1: up, n: Math.min(floors, 6) - 1, top: up + (Math.min(floors, 6) - 1) * FH };
    default:
      return { y1: up, n: floors - 1, top: up + (floors - 1) * FH };
  }
}

// Highest point (for sightlines); covers use floorGrid().top.
export function buildingTop(type, floors) {
  if (type === 'deco') return GROUND + GF + (floors - 1) * FH + 3.6;
  return floorGrid(type, floors).top;
}

export function floorsUnder(type, maxTop) {
  let f = 0;
  while (f < 20 && buildingTop(type, f + 1) <= maxTop) f++;
  return f;
}

function wallColor(style, tint) {
  const c = lin(parseInt(WALLS[style].base.slice(1), 16));
  const t = lin(tint ?? WHITE);
  return [c[0] * t[0] * 0.92, c[1] * t[1] * 0.92, c[2] * t[2] * 0.92];
}

// The lower part of a cell (keeps bricks at their scale on short strips).
function partCell(b, name, frac) {
  const r = b.rect(name);
  return { u0: r.u0, u1: r.u1, v0: r.v0, v1: r.v0 + (r.v1 - r.v0) * Math.min(1, frac) };
}

// The four sides of a lot in local coordinates: start point, direction, length.
function sides(w, d) {
  return {
    front: [-w / 2, 0, 1, 0, w],
    right: [w / 2, 0, 0, -1, d],
    back: [w / 2, -d, -1, 0, w],
    left: [-w / 2, -d, 0, 1, d],
  };
}

// A band of plain wall (no windows) between y0 and y1.
function strip(b, L, y0, y1, style, tint) {
  const [x0, z0, ux, uz, len] = L;
  if (y1 - y0 < 0.04 || len < 0.05) return;
  const n = Math.max(1, Math.round(len / BAY.w));
  const bw = len / n;
  const cell = `win:${style}:plain`;
  for (let y = y0; y < y1 - 0.01; y += FH) {
    const yb = Math.min(y1, y + FH);
    const uv = partCell(b, cell, (yb - y) / FH);
    for (let i = 0; i < n; i++) b.face(x0, z0, ux, uz, i * bw, (i + 1) * bw, y, yb, uv, tint ?? WHITE);
  }
}

// One floor of window bays.
function row(b, L, y, style, rng, mode, tint) {
  const [x0, z0, ux, uz, len] = L;
  const n = Math.max(1, Math.round(len / BAY.w));
  const bw = len / n;
  for (let i = 0; i < n; i++) {
    const cell = mode === 'ind' && WALLS[style].kind === 'brick' ? `ind:${style}` : mode === 'plain' ? `win:${style}:plain` : `win:${style}:${rng.pick(WINDOWS)}`;
    b.face(x0, z0, ux, uz, i * bw, (i + 1) * bw, y, y + FH, cell, tint ?? WHITE);
  }
}

// Fills a wall line from yFrom to the roof: ground band, window floors, top band.
// mode: 'win' | 'ind' | 'plain' | 'flat' (one colored quad, for faces the camera never sees).
function wall(b, L, yFrom, G, style, rng, mode, tint, groundMode = 'plain') {
  const [x0, z0, ux, uz, len] = L;
  if (G.top - yFrom < 0.05 || len < 0.05) return;
  if (mode === 'flat') {
    b.face(x0, z0, ux, uz, 0, len, yFrom, G.top, null, wallColor(style, tint));
    return;
  }
  if (yFrom < G.y1 - 0.04) {
    if (groundMode === 'win' && G.y1 - yFrom > FH - 0.1) {
      strip(b, L, yFrom, G.y1 - FH, style, tint);
      row(b, L, G.y1 - FH, style, rng, mode, tint);
    } else strip(b, L, yFrom, G.y1, style, tint);
  }
  let k = Math.max(0, Math.ceil((yFrom - G.y1) / FH - 0.02));
  if (k > 0) strip(b, L, Math.max(yFrom, G.y1), Math.min(G.top, G.y1 + k * FH), style, tint);
  for (; k < G.n; k++) row(b, L, G.y1 + k * FH, style, rng, mode, tint);
  const yr = G.y1 + G.n * FH;
  if (G.top - yr > 0.04) strip(b, L, Math.max(yr, yFrom), G.top, style, tint);
}

// Ground floor shops along a wall line: storefront cells, fascia, awning, sign board.
function storefront(b, g, rng, L, shop, { awning = true, sign = true, signCell = null, fascia = null, variant = null } = {}) {
  const [x0, z0, ux, uz, len] = L;
  const nx = -uz, nz = ux;
  const P = (t, y, out) => [x0 + ux * t + nx * out, y, z0 + uz * t + nz * out];
  const n = Math.max(1, Math.round(len / STORE.w));
  const cw = len / n;
  const base = variant ?? STORE_FOR[shop] ?? 'goods';
  for (let i = 0; i < n; i++) {
    const v = rng.chance(0.12) ? 'shutter' : i % 2 && rng.chance(0.4) ? 'posters' : base;
    b.face(x0, z0, ux, uz, i * cw, (i + 1) * cw, GROUND, GROUND + SH, `store:${v}`, WHITE);
  }
  b.face(x0, z0, ux, uz, 0, len, GROUND + SH, GROUND + GF, null, fascia ?? rng.pick(FASCIA));
  if (awning) {
    const yh = GROUND + SH - 0.05, yl = GROUND + SH - 0.85, out = 1.5;
    const segs = Math.max(1, Math.round(len / 1.6));
    const sw = len / segs;
    const cell = typeof awning === 'string' ? awning : `awn:${shop}`;
    for (let k = 0; k < segs; k++) {
      const ta = k * sw + 0.04, tb = (k + 1) * sw - 0.04;
      b.quad(P(ta, yl, out), P(tb, yl, out), P(tb, yh, 0.02), P(ta, yh, 0.02), cell, WHITE);
      b.quad(P(ta, yl - 0.3, out), P(tb, yl - 0.3, out), P(tb, yl, out), P(ta, yl, out), cell, 0xe2e2e2);
    }
  }
  if (sign) {
    const sw = Math.min(len - 0.5, 5.6);
    const t0 = (len - sw) / 2;
    const y0 = GROUND + SH + 0.04, y1 = y0 + 1.0;
    b.quad(P(t0, y1, 0.2), P(t0 + sw, y1, 0.2), P(t0 + sw, y1, 0), P(t0, y1, 0), null, 0x1c1f26);
    b.quad(P(t0, y0, 0.2), P(t0 + sw, y0, 0.2), P(t0 + sw, y1, 0.2), P(t0, y1, 0.2), null, 0x1c1f26);
    g.quad(P(t0 + 0.05, y0 + 0.05, 0.22), P(t0 + sw - 0.05, y0 + 0.05, 0.22), P(t0 + sw - 0.05, y1 - 0.05, 0.22), P(t0 + 0.05, y1 - 0.05, 0.22), signCell ?? `sign:${shop}`, WHITE);
  }
}

function cornice(b, w, d, top, color, left, right) {
  b.box(-w / 2 - 0.3, top - 0.45, -0.25, w / 2 + 0.3, top + 0.18, 0.42, color, null, { skip: new Set(['nz']) });
  b.box(-w / 2 - 0.08, top - 0.85, -0.1, w / 2 + 0.08, top - 0.45, 0.16, color, null, { top: false, skip: new Set(['nz']) });
  if (right) b.box(w / 2 - 0.25, top - 0.45, -d, w / 2 + 0.3, top + 0.18, -0.25, color, null, { skip: new Set(['nx']) });
  if (left) b.box(-w / 2 - 0.3, top - 0.45, -d, -w / 2 + 0.25, top + 0.18, -0.25, color, null, { skip: new Set(['px']) });
}

function roof(b, w, d, top, color, rng) {
  b.flat(-w / 2, -d, w / 2, 0, top, 'roof', rng.pick(ROOF));
  const t = 0.22, h = 0.5;
  b.box(-w / 2, top, -d, w / 2, top + h, -d + t, color, null, { skip: new Set(['nz']) });
  b.box(-w / 2, top, -d + t, -w / 2 + t, top + h, -0.2, color, null, { skip: new Set(['nx']) });
  b.box(w / 2 - t, top, -d + t, w / 2, top + h, -0.2, color, null, { skip: new Set(['px']) });
}

export function waterTower(b, x, z, y, s = 1) {
  const r = 1.15 * s;
  for (const [ox, oz] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
    b.box(x + ox * s - 0.07, y, z + oz * s - 0.07, x + ox * s + 0.07, y + 2.2 * s, z + oz * s + 0.07, 0x3a3236, null, { top: false });
  }
  b.bar(x - 0.75 * s, y + 0.3, z + 0.75 * s, x + 0.75 * s, y + 2.0 * s, z + 0.75 * s, 0.06, 0x3a3236);
  b.cbox(x, z, 2.0 * s, 2.0 * s, y + 2.2 * s, y + 2.32 * s, 0x3a3236);
  b.cyl(x, z, r, y + 2.32 * s, y + 4.6 * s, 9, WHITE, 'wood', { cap: false });
  for (const yy of [3.0, 4.1]) b.cyl(x, z, r + 0.04, y + yy * s, y + (yy + 0.09) * s, 9, 0x2d2a2c, null, { cap: false });
  b.cyl(x, z, r + 0.12, y + 4.6 * s, y + 5.5 * s, 9, 0x4b3a30, null, { r1: 0.08, cap: false });
}

function roofJunk(b, rng, w, d, top, style, detail) {
  const st = WALLS[style];
  const x = (m = 1.3) => rng.float(-w / 2 + m, w / 2 - m);
  const z = (m = 1.3) => -rng.float(m, d - m);
  if (w > 5 && rng.chance(0.7)) {
    const bx = x(), bz = z();
    b.cbox(bx, bz, 2.2, 2.4, top, top + 2.5, mulColor(st.cornice ?? 0x8a7d70, 0.85));
    b.face(bx - 0.5, bz + 1.205, 1, 0, 0, 1.0, top, top + 2.0, null, 0x3b2a20);
  }
  if (detail < 1) return;
  // Brick chimney stacks on a party wall.
  if (rng.chance(0.55)) {
    const cx = rng.chance(0.5) ? -w / 2 + 0.6 : w / 2 - 0.6, cz = z(), ch = rng.float(1.2, 2.2);
    b.cbox(cx, cz, 0.7, 1.0, top, top + ch, 0x8e4c3c);
    b.cbox(cx, cz, 0.85, 1.15, top + ch, top + ch + 0.18, 0x6e6a66);
  }
  if (w > 5 && rng.chance(0.4)) {
    // Skylight.
    const sx = x(2), sz = z(2);
    b.cbox(sx, sz, 2.0, 1.4, top, top + 0.4, 0xdcd8d0);
    b.flat(sx - 0.85, sz - 0.55, sx + 0.85, sz + 0.55, top + 0.41, 'carglass', WHITE);
  }
  for (let i = rng.int(1, detail >= 2 ? 3 : 2); i > 0; i--) {
    const ax = x(), az = z();
    b.cbox(ax, az, 1.3, 1.0, top, top + 0.85, 0xc9ccd1);
    b.flat(ax - 0.42, az - 0.32, ax + 0.42, az + 0.32, top + 0.86, null, 0x5a5e66);
  }
  if (detail < 2) return;
  if (rng.chance(0.4)) b.cyl(x(), z(), 0.22, top, top + 1.1, 6, 0x8a8f99);
  if (rng.chance(0.3)) {
    const ax = x(), az = z();
    b.box(ax - 0.04, top, az - 0.04, ax + 0.04, top + rng.float(3, 5), az + 0.04, 0x2d2f33, null, { top: false });
    b.box(ax - 0.7, top + 2.6, az - 0.03, ax + 0.7, top + 2.66, az + 0.03, 0x2d2f33, null, { top: false });
  }
  if (rng.chance(0.25)) {
    // 90s satellite dish.
    const ax = x(), az = z();
    b.geometry(new THREE.ConeGeometry(0.7, 0.35, 8, 1, true).rotateX(-1.0).translate(ax, top + 0.9, az), 0xe9ecef);
    b.box(ax - 0.05, top, az - 0.05, ax + 0.05, top + 0.8, az + 0.05, 0x8a8f99, null, { top: false });
  }
  if (w > 6 && d > 6 && rng.chance(0.2)) {
    // Tar beach: towels under a striped umbrella.
    const tx = x(2.2), tz = z(2.2);
    b.flat(tx - 1.6, tz - 0.4, tx - 0.4, tz + 1.4, top + 0.02, null, rng.pick([0xe94e77, 0x2aa7c9, 0xf2c14e]));
    b.flat(tx + 0.4, tz - 0.4, tx + 1.6, tz + 1.4, top + 0.02, null, rng.pick([0xf2f2f2, 0x7bc950, 0xff8c42]));
    b.box(tx - 0.04, top, tz - 0.04, tx + 0.04, top + 2.0, tz + 0.04, 0xd8d8d8, null, { top: false });
    b.cone(tx, tz, 1.4, top + 1.7, top + 2.3, 8, rng.pick([0xd8342b, 0x1e88e5, 0xf2a71b]));
  }
}

function fireEscape(b, x0, x1, floors, yFirst) {
  const len = x1 - x0;
  const noBack = new Set(['nz']);
  for (let f = 0; f < floors; f++) {
    const y = yFirst + f * FH + 0.02;
    b.box(x0, y - 0.08, 0.02, x1, y, 1.15, IRON, null, { skip: noBack });
    b.box(x0, y + 0.9, 1.08, x1, y + 0.96, 1.15, IRON, null, { top: false, skip: noBack });
    for (const xx of [x0, x0 + len / 2, x1 - 0.06]) b.box(xx, y, 1.08, xx + 0.06, y + 0.9, 1.14, IRON, null, { top: false, skip: noBack });
    if (f < floors - 1) {
      const dir = f % 2 ? -1 : 1;
      const sx = dir > 0 ? x0 + 0.5 : x1 - 0.5;
      b.bar(sx, y, 0.6, sx + dir * (len - 1.2), y + FH - 0.05, 0.6, 0.07, IRON);
    }
  }
  b.bar(x1 - 0.5, yFirst - 2.4, 0.95, x1 - 0.5, yFirst, 0.95, 0.05, IRON);
}

// Vertical blade sign sticking out of the facade (both faces lit).
const BLADE_H = { 'vsign:hotel': 7.2, 'vsign:rialto': 8, 'vsign:bar': 4, 'vsign:deli': 4.8, 'vsign:pizza': 6.4 };
function blade(b, g, x, y, cell) {
  const tall = BLADE_H[cell] ?? 6;
  const z0 = 0.25, z1 = 1.85;
  b.box(x - 0.08, y, z0 - 0.05, x + 0.08, y + tall, z1 + 0.05, 0x1c1f26, null);
  g.quad([x + 0.09, y + 0.08, z1], [x + 0.09, y + 0.08, z0], [x + 0.09, y + tall - 0.08, z0], [x + 0.09, y + tall - 0.08, z1], cell, WHITE);
  g.quad([x - 0.09, y + 0.08, z0], [x - 0.09, y + 0.08, z1], [x - 0.09, y + tall - 0.08, z1], [x - 0.09, y + tall - 0.08, z0], cell, WHITE);
  for (const k of [0.25, 0.75]) b.box(x - 0.05, y + tall * k, 0, x + 0.05, y + tall * k + 0.1, z0, IRON, null);
}

function rooftopBillboard(b, w, d, top, cell) {
  const bw = Math.min(w + 1, 10), bh = bw * 0.42;
  const z = -d * 0.45, y0 = top + 1.4;
  for (const x of [-bw * 0.35, bw * 0.35]) {
    b.box(x - 0.12, top, z - 0.12, x + 0.12, y0 + bh, z + 0.12, IRON, null, { top: false });
    b.bar(x, top, z - 1.6, x, y0 + bh * 0.5, z - 0.1, 0.1, IRON);
  }
  b.box(-bw / 2 - 0.15, y0 - 0.15, z + 0.12, bw / 2 + 0.15, y0 + bh + 0.15, z + 0.3, 0x2b2d33, null);
  b.face(-bw / 2, z + 0.31, 1, 0, 0, bw, y0, y0 + bh, cell, WHITE);
  b.box(-bw / 2, y0 - 0.25, z + 0.3, bw / 2, y0 - 0.15, z + 1.0, IRON, null);
}

// Shared shell: back and side walls (respecting neighbours and visibility), front if hidden.
function shell(b, rng, spec, G, { side = null, backMode = 'win', sideMode = 'win' } = {}) {
  const { w, d, style, tint } = spec;
  const S = sides(w, d);
  if (!spec.vis.front) wall(b, S.front, GROUND, G, style, rng, 'flat', tint);
  const bc = Math.max(GROUND, spec.back.cover ?? GROUND);
  if (bc < G.top - 0.05) wall(b, S.back, bc, G, style, rng, spec.vis.back && spec.detail > 0 ? backMode : 'flat', tint, 'win');
  for (const key of ['left', 'right']) {
    const s = spec[key];
    const L = S[key];
    if (s.street) {
      if (!spec.vis[key]) wall(b, L, GROUND, G, style, rng, 'flat', tint);
      else if (side) side(L, key);
      else wall(b, L, GROUND, G, style, rng, sideMode, tint, 'win');
      continue;
    }
    const from = Math.max(GROUND, s.cover ?? GROUND);
    if (from >= G.top - 0.05) continue;
    if (!spec.vis[key] || spec.detail === 0) {
      wall(b, L, from, G, style, rng, 'flat', tint);
      continue;
    }
    wall(b, L, from, G, style, rng, 'plain', tint);
    if (spec.mural === key && G.top - from > 7) {
      const [x0, z0, ux, uz, len] = L;
      const m = 0.05;
      const ya = from + 0.8, yb = Math.min(G.top - 0.6, ya + (len - 1.2) * 1.25);
      b.face(x0 - uz * m, z0 + ux * m, ux, uz, 0.6, len - 0.6, ya, yb, spec.muralCell, WHITE);
    }
  }
  return S;
}

// ---------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------

// Brick walk-up: shops on the ground floor, fire escape, cornice, water tower.
function walkup(b, g, rng, spec) {
  const { w, d, floors, style, tint } = spec;
  const st = WALLS[style];
  const G = floorGrid('walkup', floors);
  const S = shell(b, rng, spec, G);
  if (spec.vis.front) {
    storefront(b, g, rng, S.front, spec.shop, { awning: rng.chance(0.75) });
    wall(b, S.front, G.y1, G, style, rng, 'win', tint);
    b.box(-w / 2, G.y1 - 0.12, 0, w / 2, G.y1 + 0.05, 0.12, st.cornice, null);
    if (spec.detail >= 2 && w >= 6 && floors >= 3 && rng.chance(0.7)) {
      const fw = Math.min(4.8, w - 1.2);
      const fx = rng.chance(0.5) ? -w / 2 + 0.4 : w / 2 - 0.4 - fw;
      fireEscape(b, fx, fx + fw, floors - 1, G.y1);
    }
    if (spec.blade) blade(b, g, rng.chance(0.5) ? w / 2 - 0.5 : -w / 2 + 0.5, G.y1 + 0.6, spec.blade);
  }
  cornice(b, w, d, G.top, st.cornice, spec.left.street && spec.vis.left, spec.right.street && spec.vis.right);
  roof(b, w, d, G.top, st.cornice, rng);
  if (spec.billboard) rooftopBillboard(b, w, d, G.top, spec.billboard);
  else {
    if (spec.detail >= 1 && rng.chance(0.45)) waterTower(b, rng.float(-w / 2 + 1.6, w / 2 - 1.6), -d * rng.float(0.4, 0.6), G.top + 0.05);
    roofJunk(b, rng, w, d, G.top, style, spec.detail);
  }
  return G.top;
}

// Brownstone: raised parlor floor, stoop, heavy dark cornice, iron fence.
function brownstone(b, g, rng, spec) {
  const { w, d, floors } = spec;
  const style = 'brownstone';
  const st = WALLS[style];
  const G = floorGrid('brownstone', floors);
  const S = shell(b, rng, { ...spec, style }, G);
  if (spec.vis.front) {
    b.face(...S.front.slice(0, 4), 0, w, GROUND, G.y1, null, 0x4f3127);
    wall(b, S.front, G.y1, G, style, rng, 'win', spec.tint);
    const sx = rng.chance(0.5) ? -w / 2 + 1.3 : w / 2 - 1.3;
    for (let i = 0; i < 5; i++) b.box(sx - 0.85, GROUND, 0, sx + 0.85, GROUND + 0.28 * (i + 1), 2.3 - i * 0.42, 0x8a6a58, null, { skip: new Set(['nz']) });
    for (const e of [-0.9, 0.9]) b.bar(sx + e, GROUND + 0.9, 2.3, sx + e, G.y1 + 0.95, 0.4, 0.07, IRON);
    b.box(sx - 0.65, G.y1, 0, sx + 0.65, G.y1 + 2.5, 0.08, 0x3a2216, null);
    b.box(sx - 0.85, G.y1 + 2.5, 0, sx + 0.85, G.y1 + 2.75, 0.35, st.cornice, null);
    if (spec.detail >= 2) {
      b.box(-w / 2, GROUND + 0.9, 1.25, w / 2, GROUND + 0.96, 1.31, IRON, null, { top: false });
      for (let x = -w / 2; x <= w / 2; x += 1.2) b.box(x, GROUND, 1.25, x + 0.05, GROUND + 0.96, 1.31, IRON, null, { top: false });
    }
  }
  b.box(-w / 2 - 0.4, G.top - 0.1, -0.3, w / 2 + 0.4, G.top + 0.35, 0.7, st.cornice, null, { skip: new Set(['nz']) });
  b.box(-w / 2 - 0.15, G.top - 0.6, -0.1, w / 2 + 0.15, G.top - 0.1, 0.35, st.cornice, null, { top: false, skip: new Set(['nz']) });
  roof(b, w, d, G.top, st.cornice, rng);
  if (spec.detail >= 1 && rng.chance(0.6)) roofJunk(b, rng, w, d, G.top, style, spec.detail);
  return G.top;
}

// Corner bodega: stucco, colored stripes, shops wrapping both street faces.
function corner(b, g, rng, spec) {
  const { w, d, floors, style, tint } = spec;
  const st = WALLS[style];
  const G = floorGrid('corner', floors);
  const bodega = rng.chance(0.6);
  const awn = rng.pick(['awn:solid-green', 'awn:solid-red', true]);
  const S = shell(b, rng, spec, G, {
    side: (L) => {
      storefront(b, g, rng, L, spec.shop, { awning: awn, sign: L[4] > 4, variant: 'posters' });
      wall(b, L, G.y1, G, style, rng, 'win', tint);
    },
  });
  if (spec.vis.front) {
    storefront(b, g, rng, S.front, spec.shop, { awning: awn, signCell: bodega ? 'sign:bodega' : null });
    wall(b, S.front, G.y1, G, style, rng, 'win', tint);
  }
  const [c1, c2] = rng.pick([[0xe23b2a, 0xffd23f], [0x1e5fbf, 0xffffff], [0x2e8b57, 0xffffff], [0xf28c28, 0xd8342b]]);
  const L = spec.left.street && spec.vis.left, R = spec.right.street && spec.vis.right;
  const skip = new Set(['nz', ...(L ? [] : ['nx']), ...(R ? [] : ['px'])]);
  const z0 = L || R ? -d : -0.2;
  b.box(-w / 2 - 0.05, G.top - 0.75, z0, w / 2 + 0.05, G.top - 0.5, 0.06, c1, null, { top: false, skip });
  b.box(-w / 2 - 0.05, G.top - 0.5, z0, w / 2 + 0.05, G.top - 0.38, 0.06, c2, null, { top: false, skip });
  cornice(b, w, d, G.top, st.cornice, L, R);
  roof(b, w, d, G.top, st.cornice, rng);
  if (spec.billboard) rooftopBillboard(b, w, d, G.top, spec.billboard);
  else roofJunk(b, rng, w, d, G.top, style, spec.detail);
  return G.top;
}

// Old hotel: taller, vertical HOTEL blade, entrance canopy, rooftop sign.
function hotel(b, g, rng, spec) {
  const { w, d, floors, style, tint } = spec;
  const st = WALLS[style];
  const G = floorGrid('hotel', floors);
  const S = shell(b, rng, spec, G);
  if (spec.vis.front) {
    storefront(b, g, rng, S.front, 0, { awning: false, signCell: 'sign:hotel', fascia: 0x3a2420, variant: 'warm' });
    wall(b, S.front, G.y1, G, style, rng, 'win', tint);
    b.box(-w / 2, G.y1 - 0.12, 0, w / 2, G.y1 + 0.1, 0.2, st.cornice, null);
    b.box(-w / 2, G.y1 + 2 * FH - 0.1, 0, w / 2, G.y1 + 2 * FH + 0.1, 0.15, st.cornice, null);
    b.box(-1.6, GROUND + 3.0, 0, 1.6, GROUND + 3.3, 3.0, 0x7a1f1a, null);
    for (const x of [-1.5, 1.5]) b.box(x - 0.05, GROUND, 2.85, x + 0.05, GROUND + 3.0, 2.95, 0xd4b06a, null, { top: false });
    blade(b, g, w / 2 - 0.6, G.y1 + 1.0, 'vsign:hotel');
  }
  cornice(b, w, d, G.top, st.cornice, spec.left.street && spec.vis.left, spec.right.street && spec.vis.right);
  roof(b, w, d, G.top, st.cornice, rng);
  const sw = Math.min(w - 1, 8), sh = sw / 5;
  for (const x of [-sw / 3, sw / 3]) b.box(x - 0.08, G.top, -0.9, x + 0.08, G.top + 1.0 + sh, -0.75, IRON, null);
  b.box(-sw / 2, G.top + 1.0, -0.9, sw / 2, G.top + 1.0 + sh, -0.8, 0x1c1f26, null);
  g.face(-sw / 2 + 0.05, -0.79, 1, 0, 0, sw - 0.1, G.top + 1.05, G.top + 0.95 + sh, 'sign:hotel', WHITE);
  waterTower(b, -w / 4, -d * 0.6, G.top + 0.05);
  return G.top;
}

// Art deco office tower with setbacks, a crown and a spire.
function deco(b, g, rng, spec) {
  const { w, d, floors, style, tint } = spec;
  const st = WALLS[style];
  const G = floorGrid('deco', floors);
  const S = shell(b, rng, spec, G);
  if (spec.vis.front) {
    storefront(b, g, rng, S.front, rng.pick([9, 11, 13, 15]), { awning: false, variant: 'goods' });
    wall(b, S.front, G.y1, G, style, rng, 'win', tint);
  }
  let top = G.top;
  b.box(-w / 2 - 0.15, top - 0.3, -d - 0.15, w / 2 + 0.15, top + 0.25, 0.15, st.cornice, null);
  let rest = floors - (G.n + 1);
  let cw = w, cd = d;
  const cz = -d / 2;
  const mode = (v) => (v ? 'win' : 'flat');
  while (rest > 0 && cw > 4.5) {
    const n = Math.min(rest, 4);
    cw -= 2.2;
    cd = Math.max(3.2, cd - 2.2);
    const x0 = -cw / 2, x1 = cw / 2, z0 = cz - cd / 2, z1 = cz + cd / 2;
    const T = { y1: top, n, top: top + n * FH };
    wall(b, [x0, z1, 1, 0, cw], top, T, style, rng, mode(spec.vis.front), tint);
    wall(b, [x1, z0, -1, 0, cw], top, T, style, rng, mode(spec.vis.back), tint);
    wall(b, [x1, z1, 0, -1, cd], top, T, style, rng, mode(spec.vis.right), tint);
    wall(b, [x0, z0, 0, 1, cd], top, T, style, rng, mode(spec.vis.left), tint);
    top = T.top;
    b.box(x0 - 0.15, top - 0.25, z0 - 0.15, x1 + 0.15, top + 0.2, z1 + 0.15, st.cornice, null);
    rest -= n;
  }
  const cwid = Math.max(2, cw - 1.5);
  b.box(-cwid / 2, top, cz - cwid / 2, cwid / 2, top + 2.2, cz + cwid / 2, st.cornice, null);
  b.box(-cwid / 3, top + 2.2, cz - cwid / 3, cwid / 3, top + 3.6, cz + cwid / 3, 0xc9ced6, null);
  b.cyl(0, cz, 0.35, top + 3.6, top + 9, 6, 0xdfe4ea, null, { r1: 0.04, cap: false });
  return G.top;
}

// Movie theater: marquee with bulbs and a tall vertical RIALTO sign.
function theater(b, g, rng, spec) {
  const { w, d, floors, style, tint } = spec;
  const st = WALLS[style];
  const G = floorGrid('theater', floors);
  const S = shell(b, rng, spec, G);
  if (spec.vis.front) {
    const n = Math.max(2, Math.round(w / STORE.w));
    for (let i = 0; i < n; i++) b.face(-w / 2, 0, 1, 0, (i * w) / n, ((i + 1) * w) / n, GROUND, GROUND + SH, `store:${i % 2 ? 'posters' : 'dark'}`, WHITE);
    b.face(-w / 2, 0, 1, 0, 0, w, GROUND + SH, GROUND + GF, null, 0x7a1f1a);
    wall(b, S.front, G.y1, G, style, rng, 'win', tint);
    const mw = Math.min(w - 1, 8.5), my0 = GROUND + 3.3, my1 = GROUND + 4.5, mz = 2.4;
    b.box(-mw / 2, my0 - 0.1, 0, mw / 2, my1 + 0.1, mz, 0x7a1f1a, null);
    g.face(-mw / 2 + 0.05, mz + 0.01, 1, 0, 0, mw - 0.1, my0, my1, 'marquee', WHITE);
    g.face(mw / 2 + 0.01, mz - 0.05, 0, -1, 0, mz - 0.1, my0, my1, 'marquee', WHITE);
    g.face(-mw / 2 - 0.01, 0.05, 0, 1, 0, mz - 0.1, my0, my1, 'marquee', WHITE);
    blade(b, g, 0, G.y1 + 0.3, 'vsign:rialto');
  }
  b.box(-w / 2 - 0.3, G.top - 0.4, -0.3, w / 2 + 0.3, G.top + 0.2, 0.4, st.cornice, null, { skip: new Set(['nz']) });
  roof(b, w, d, G.top, st.cornice, rng);
  roofJunk(b, rng, w, d, G.top, style, spec.detail);
  return G.top;
}

// Brick warehouse: steel windows, loading doors, painted ghost sign, big water tower.
function warehouse(b, g, rng, spec) {
  const { w, d, style, tint } = spec;
  const G = floorGrid('warehouse', spec.floors);
  const S = shell(b, rng, spec, G, { backMode: 'ind', sideMode: 'ind' });
  if (spec.vis.front) {
    const n = Math.max(2, Math.round(w / 3.2));
    for (let i = 0; i < n; i++) {
      const a = (i * w) / n, c = ((i + 1) * w) / n;
      const L = [-w / 2 + a, 0, 1, 0, c - a];
      if (i % 2) strip(b, L, GROUND, G.y1, style, tint);
      else {
        b.face(-w / 2, 0, 1, 0, a, c, GROUND, GROUND + GF - 0.4, 'garage', WHITE);
        strip(b, L, GROUND + GF - 0.4, G.y1, style, tint);
      }
    }
    b.box(-w / 2, GROUND, 0, w / 2, GROUND + 0.9, 1.2, 0x9a958c, null, { skip: new Set(['nz']) });
    wall(b, S.front, G.y1, G, style, rng, 'ind', tint);
    if (spec.ghost && G.top - G.y1 > 7) {
      const gw = Math.min(w - 1.2, 8);
      const gh = Math.min(gw * 1.25, G.top - G.y1 - 1);
      b.face(-gw / 2, 0.05, 1, 0, 0, gw, G.top - 0.6 - gh, G.top - 0.6, 'mural:ghost', WHITE);
    }
  }
  cornice(b, w, d, G.top, 0x6b5a4e, spec.left.street && spec.vis.left, spec.right.street && spec.vis.right);
  roof(b, w, d, G.top, 0x6b5a4e, rng);
  if (spec.billboard) rooftopBillboard(b, w, d, G.top, spec.billboard);
  waterTower(b, rng.float(-w / 4, w / 4), -d * 0.5, G.top + 0.05, 1.25);
  return G.top;
}

// Firehouse with red garage doors.
function firehouse(b, g, rng, spec) {
  const { w, d, tint } = spec;
  const style = 'red';
  const G = floorGrid('firehouse', spec.floors);
  const S = shell(b, rng, { ...spec, style }, G);
  if (spec.vis.front) {
    const dw = (w - 1.2) / 2;
    const stone = 0xd8d0c0;
    b.face(-w / 2, 0, 1, 0, 0, 0.4, GROUND, GROUND + GF, null, stone);
    b.face(-w / 2, 0, 1, 0, 0.4, 0.4 + dw, GROUND, GROUND + 3.6, 'garage', WHITE);
    b.face(-w / 2, 0, 1, 0, 0.4 + dw, 0.8 + dw, GROUND, GROUND + GF, null, stone);
    b.face(-w / 2, 0, 1, 0, 0.8 + dw, 0.8 + 2 * dw, GROUND, GROUND + 3.6, 'garage', WHITE);
    b.face(-w / 2, 0, 1, 0, 0.8 + 2 * dw, w, GROUND, GROUND + GF, null, stone);
    b.face(-w / 2 + 0.4, 0, 1, 0, 0, w - 0.8, GROUND + 3.6, GROUND + GF, null, stone);
    g.face(-w / 2 + 1.0, 0.03, 1, 0, 0, w - 2, GROUND + 3.65, GROUND + 4.15, 'sign:engine', WHITE);
    wall(b, S.front, G.y1, G, style, rng, 'win', tint);
  }
  cornice(b, w, d, G.top, 0xf1ead9, spec.left.street && spec.vis.left, spec.right.street && spec.vis.right);
  roof(b, w, d, G.top, 0xf1ead9, rng);
  return G.top;
}

// One-story "taxpayer" shops (used where the view must stay open).
function shops1(b, g, rng, spec) {
  const { w, d, style, tint } = spec;
  const st = WALLS[style];
  const G = floorGrid('shops1', 1);
  const S = shell(b, rng, spec, G, {
    side: (L) => {
      storefront(b, g, rng, L, (spec.shop + 3) % SHOPS.length, { sign: L[4] > 4 });
      strip(b, L, GROUND + GF, G.top, style, tint);
    },
  });
  if (spec.vis.front) {
    const n = Math.max(1, Math.round(w / 5.5));
    for (let i = 0; i < n; i++) {
      const shop = (spec.shop + i * 5) % SHOPS.length;
      storefront(b, g, rng, [-w / 2 + (i * w) / n, 0, 1, 0, w / n], shop);
    }
    strip(b, S.front, GROUND + GF, G.top, style, tint);
  }
  b.box(-w / 2 - 0.1, G.top - 0.25, -d, w / 2 + 0.1, G.top + 0.15, 0.2, st.cornice, null, { skip: new Set(['nz']) });
  if (spec.billboard) rooftopBillboard(b, w, d, G.top + 0.15, spec.billboard);
  else roofJunk(b, rng, w, d, G.top + 0.15, style, spec.detail);
  return G.top;
}

const TYPES = { walkup, brownstone, corner, hotel, deco, theater, warehouse, firehouse, shops1 };

export function buildBuilding(b, g, rng, spec) {
  return TYPES[spec.type](b, g, rng, spec);
}

// Cheap distant building: a box with tiled windows (skyline material), flat roof.
export function farBox(b, x0, z0, x1, z1, y0, h, tint, roofColor = 0x6b6560) {
  b.box(x0, y0, z0, x1, y0 + h, z1, tint, { tw: SKY_TILE.w, th: SKY_TILE.h }, { top: null, topColor: roofColor });
}
