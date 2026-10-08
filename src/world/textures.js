import * as THREE from 'three';
import { RNG } from '../utils/rng.js';

const UI_FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, { repeat = false, srgb = true, anisotropy = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function shade(color, amount) {
  const c = new THREE.Color(color);
  const hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)), THREE.SRGBColorSpace);
  return '#' + c.getHexString(THREE.SRGBColorSpace);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Building facades. One texture = 4 bays x 4 floors; UVs are in world units / FACADE_TILE.
// ---------------------------------------------------------------------------

export const FACADE_CELL = { w: 2.8, h: 3.2 };
export const FACADE_TILE = { w: FACADE_CELL.w * 4, h: FACADE_CELL.h * 4 };

export const FACADE_STYLES = {
  brownstone: { wall: '#7a4b38', trim: '#e9dcc8', glassTop: '#a6c8de', glassBottom: '#3f5f80', roof: '#4e3a33', kind: 'punched', brick: true },
  brick: { wall: '#a8463a', trim: '#f4e9dc', glassTop: '#a6d8f3', glassBottom: '#4a7aa6', roof: '#7a6a62', kind: 'punched', brick: true },
  beige: { wall: '#ead7b0', trim: '#ffffff', glassTop: '#b0e0f7', glassBottom: '#4f86b3', roof: '#bcae92', kind: 'punched' },
  terracotta: { wall: '#d9804f', trim: '#fde8d4', glassTop: '#a9dcf4', glassBottom: '#45769f', roof: '#9e6a50', kind: 'punched' },
  teal: { wall: '#69bdb3', trim: '#f4fbfa', glassTop: '#c5ecfb', glassBottom: '#4b84ad', roof: '#5a8f88', kind: 'punched' },
  pink: { wall: '#eaa7a2', trim: '#fff6f2', glassTop: '#b9e3f7', glassBottom: '#507fa8', roof: '#b7837f', kind: 'punched' },
  white: { wall: '#eef0f3', trim: '#9aa6b2', glassTop: '#a7dcf7', glassBottom: '#3f78ad', roof: '#b0b8c2', kind: 'band' },
  glass: { wall: '#86bde0', trim: '#e6f1f8', glassTop: '#c4e9ff', glassBottom: '#3c78b4', roof: '#8d9caa', kind: 'curtain' },
};

const facadeCache = new Map();

export function facadeTexture(styleName) {
  if (facadeCache.has(styleName)) return facadeCache.get(styleName);
  const st = FACADE_STYLES[styleName];
  const size = 512;
  const cell = size / 4;
  const [c, ctx] = makeCanvas(size, size);
  const rng = new RNG(styleName.length * 977 + 13);

  ctx.fillStyle = st.wall;
  ctx.fillRect(0, 0, size, size);

  if (st.brick) {
    ctx.strokeStyle = shade(st.wall, -0.08);
    ctx.lineWidth = 1.5;
    for (let y = 0; y < size; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      const off = (y / 8) % 2 ? 0 : 8;
      for (let x = off; x < size; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 8);
        ctx.stroke();
      }
    }
  }

  const glassGrad = (y0, y1) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, st.glassTop);
    g.addColorStop(1, st.glassBottom);
    return g;
  };

  if (st.kind === 'punched') {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * cell;
        const y = row * cell;
        const wx = x + 30, wy = y + 24, ww = cell - 60, wh = cell - 46;
        ctx.fillStyle = st.trim;
        ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
        ctx.fillRect(wx - 10, wy + wh + 4, ww + 20, 9); // sill
        const r = rng.next();
        ctx.fillStyle = r < 0.06 ? '#ffd98a' : glassGrad(wy, wy + wh);
        ctx.fillRect(wx, wy, ww, wh);
        if (r > 0.75) {
          ctx.fillStyle = 'rgba(255,248,235,0.75)'; // curtains
          ctx.fillRect(wx, wy, ww, wh * 0.35);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh * 0.55);
        ctx.lineTo(wx + ww * 0.55, wy);
        ctx.lineTo(wx + ww * 0.8, wy);
        ctx.lineTo(wx, wy + wh * 0.9);
        ctx.fill();
        ctx.fillStyle = st.trim;
        ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh); // mullion
      }
    }
  } else if (st.kind === 'band') {
    for (let row = 0; row < 4; row++) {
      const y = row * cell;
      ctx.fillStyle = glassGrad(y + 30, y + cell - 22);
      ctx.fillRect(0, y + 30, size, cell - 52);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, y + 34, size, 10);
      ctx.fillStyle = st.trim;
      for (let x = 0; x < size; x += 32) ctx.fillRect(x, y + 30, 3, cell - 52);
      ctx.fillStyle = shade(st.wall, -0.06);
      ctx.fillRect(0, y + cell - 22, size, 4);
    }
  } else {
    for (let col = 0; col < 8; col++) {
      const x = col * (size / 8);
      const g = ctx.createLinearGradient(x, 0, x + size / 8, size);
      g.addColorStop(0, shade(st.glassTop, rng.float(-0.05, 0.06)));
      g.addColorStop(1, shade(st.glassBottom, rng.float(-0.05, 0.08)));
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, size / 8, size);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, size * 0.75);
    ctx.lineTo(size * 0.75, 0);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.fill();
    ctx.fillStyle = st.trim;
    for (let x = 0; x < size; x += size / 8) ctx.fillRect(x, 0, 3, size);
    for (let y = 0; y < size; y += cell) ctx.fillRect(0, y, size, 6);
  }

  const tex = toTexture(c, { repeat: true, anisotropy: 8 });
  facadeCache.set(styleName, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Train car sides. Mapped onto the extrusion caps; x runs rear → front.
// ---------------------------------------------------------------------------

export function carSideTextures(style, kind, layout) {
  const W = 512, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const [ec, ectx] = makeCanvas(W, H);
  const { x0, x1, y0, y1 } = layout;
  const X = (x) => ((x - x0) / (x1 - x0)) * W;
  const Y = (y) => (1 - (y - y0) / (y1 - y0)) * H;

  const body = hex(style.body);
  const stripe = hex(style.stripe);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);

  // Skirt, stripe and a thin roof line.
  ctx.fillStyle = '#2f3542';
  ctx.fillRect(0, Y(0.42), W, H - Y(0.42));
  ctx.fillStyle = stripe;
  ctx.fillRect(0, Y(0.9), W, Y(0.64) - Y(0.9));
  ctx.fillStyle = shade(body, 0.12);
  ctx.fillRect(0, Y(2.24), W, 4);
  if (style.neon) {
    ectx.fillStyle = stripe;
    ectx.fillRect(0, Y(0.9), W, Y(0.64) - Y(0.9));
  }

  const lit = (x, y, w, h) => {
    const g = ctx.createLinearGradient(0, Y(y + h), 0, Y(y));
    g.addColorStop(0, '#fff2c4');
    g.addColorStop(1, '#ffb347');
    ctx.fillStyle = '#28303d';
    roundRect(ctx, X(x) - 4, Y(y + h) - 4, X(x + w) - X(x) + 8, Y(y) - Y(y + h) + 8, 9);
    ctx.fill();
    ctx.fillStyle = g;
    roundRect(ctx, X(x), Y(y + h), X(x + w) - X(x), Y(y) - Y(y + h), 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(X(x) + 4, Y(y + h) + 4, (X(x + w) - X(x)) * 0.35, 5);
    ectx.fillStyle = '#7a5a26';
    roundRect(ectx, X(x), Y(y + h), X(x + w) - X(x), Y(y) - Y(y + h), 6);
    ectx.fill();
  };

  const door = (cx) => {
    const w = 0.66;
    ctx.fillStyle = shade(body, -0.07);
    ctx.fillRect(X(cx - w / 2), Y(2.12), X(cx + w / 2) - X(cx - w / 2), Y(0.46) - Y(2.12));
    ctx.strokeStyle = 'rgba(30,36,48,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(X(cx - w / 2), Y(2.12), X(cx + w / 2) - X(cx - w / 2), Y(0.46) - Y(2.12));
    ctx.beginPath();
    ctx.moveTo(X(cx), Y(2.12));
    ctx.lineTo(X(cx), Y(0.46));
    ctx.stroke();
    lit(cx - 0.27, 1.2, 0.2, 0.75);
    lit(cx + 0.07, 1.2, 0.2, 0.75);
  };

  const winY = 1.18, winH = 0.84;
  if (kind === 'head') {
    for (const x of [-2.2, -0.42, 0.22]) lit(x, winY, 0.5, winH);
    door(-1.2);
    door(1.2);
    // Cab side window (dark, not lit).
    ctx.fillStyle = '#1e2733';
    roundRect(ctx, X(1.85), Y(2.06), X(2.36) - X(1.85), Y(1.22) - Y(2.06), 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,255,0.35)';
    ctx.fillRect(X(1.9), Y(2.0), 20, 6);
  } else {
    for (const x of [-2.25, -0.55, 0.05, 1.75]) lit(x, winY, 0.5, winH);
    door(-1.15);
    door(1.15);
  }

  const map = toTexture(c, { anisotropy: 8 });
  const emissiveMap = toTexture(ec, { anisotropy: 8 });
  for (const t of [map, emissiveMap]) {
    t.repeat.set(1 / (x1 - x0), 1 / (y1 - y0));
    t.offset.set(-x0 / (x1 - x0), -y0 / (y1 - y0));
  }
  return { map, emissiveMap };
}

export function badgeTexture(level, style) {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(64, 68, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = hex(style.body === 0xeef1f5 ? style.stripe : style.body);
  ctx.beginPath();
  ctx.arc(64, 64, 49, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#26306b';
  ctx.font = `${level >= 10 ? 54 : 64}px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), 64, 68);
  return toTexture(c);
}

// ---------------------------------------------------------------------------
// Misc sprites
// ---------------------------------------------------------------------------

function drawStar(ctx, cx, cy, r, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

let coinFace = null;
export function coinFaceTexture() {
  if (coinFace) return coinFace;
  const [c, ctx] = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(100, 90, 20, 128, 128, 128);
  g.addColorStop(0, '#fff3a6');
  g.addColorStop(0.6, '#ffc93c');
  g.addColorStop(1, '#e89a10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#d98a0b';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffe066';
  drawStar(ctx, 128, 132, 70, 0.48);
  ctx.fill();
  ctx.strokeStyle = '#d98a0b';
  ctx.lineWidth = 8;
  ctx.stroke();
  coinFace = toTexture(c);
  return coinFace;
}

let sparkle = null;
export function sparkleTexture() {
  if (sparkle) return sparkle;
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(30, 4, 4, 56);
  ctx.fillRect(4, 30, 56, 4);
  sparkle = toTexture(c, { srgb: false });
  return sparkle;
}

// "TOLL" sign for the toll plaza canopy.
export function signTexture() {
  const [c, ctx] = makeCanvas(512, 128);
  ctx.fillStyle = '#ffd23f';
  roundRect(ctx, 0, 0, 512, 128, 18);
  ctx.fill();
  ctx.fillStyle = '#1c1f26';
  roundRect(ctx, 10, 10, 492, 108, 12);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.font = `84px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOLL', 256, 70);
  return toTexture(c);
}

// Billboard posters.
export function posterTextures() {
  const posters = [];
  const make = (draw) => {
    const [c, ctx] = makeCanvas(512, 256);
    draw(ctx);
    posters.push(toTexture(c, { anisotropy: 8 }));
  };
  make((ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#3aa0ff');
    g.addColorStop(1, '#1f5fd1');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#ffffff';
    ctx.font = `76px ${UI_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('IDLE', 40, 120);
    ctx.fillStyle = '#ffd34d';
    ctx.fillText('CARS', 40, 200);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 300, 70, 170, 110, 40);
    ctx.fill();
    ctx.fillStyle = '#e53935';
    ctx.fillRect(300, 140, 170, 14);
    ctx.fillStyle = '#ffcf6b';
    for (let i = 0; i < 3; i++) ctx.fillRect(320 + i * 48, 90, 34, 36);
  });
  make((ctx) => {
    ctx.fillStyle = '#ff7a3d';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(400, 90, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2f48';
    for (let i = 0; i < 9; i++) {
      const h = 60 + ((i * 53) % 110);
      ctx.fillRect(20 + i * 54, 256 - h, 44, h);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `54px ${UI_FONT}`;
    ctx.fillText('VIDEO RENTAL', 30, 70);
  });
  make((ctx) => {
    ctx.fillStyle = '#7b3fe4';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(110, 128, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffef9a';
    drawStar(ctx, 110, 132, 52, 0.48);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `64px ${UI_FONT}`;
    ctx.fillText('EAST SIDE', 220, 118);
    ctx.fillText('DRIVES', 220, 190);
  });
  return posters;
}

// 90s shop signs: neon lettering on a dark board.
export const SHOPS = [
  { name: 'PIZZA', fg: '#ff4b3e', bg: '#fff3e0', awning: 0xd8342b },
  { name: 'DELI', fg: '#ffd23f', bg: '#1b5e3a', awning: 0x2e7d4f },
  { name: 'VIDEO', fg: '#2ee6ff', bg: '#1c1440', awning: 0x3949ab },
  { name: 'ARCADE', fg: '#ff3fa4', bg: '#14102a', awning: 0x7b3fe4 },
  { name: 'LAUNDRY', fg: '#7fd6ff', bg: '#f4f7fb', awning: 0x1e88e5 },
  { name: 'RECORDS', fg: '#ffb020', bg: '#22181a', awning: 0x8d3b2a },
  { name: '24 HR', fg: '#3dff6e', bg: '#101b14', awning: 0x2e7d32 },
  { name: 'DONUTS', fg: '#ff7ac8', bg: '#fff0f7', awning: 0xec407a },
  { name: 'BARBER', fg: '#ff4b3e', bg: '#f4f1e6', awning: 0x1e3a8a },
  { name: 'GROCERY', fg: '#ffffff', bg: '#c62828', awning: 0xf9a825 },
  { name: 'NOODLES', fg: '#ffe066', bg: '#b71c1c', awning: 0xb71c1c },
  { name: 'PAWN', fg: '#ffd23f', bg: '#1c1f26', awning: 0x37474f },
];

export function shopSignTexture(shop) {
  const [c, ctx] = makeCanvas(512, 128);
  ctx.fillStyle = shop.bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = shade(shop.bg, -0.35);
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.font = `80px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = shop.fg;
  ctx.shadowBlur = 18;
  ctx.fillStyle = shop.fg;
  ctx.fillText(shop.name, 256, 70);
  ctx.shadowBlur = 0;
  ctx.fillText(shop.name, 256, 70);
  return toTexture(c, { anisotropy: 8 });
}
