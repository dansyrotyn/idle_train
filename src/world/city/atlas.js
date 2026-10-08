import * as THREE from 'three';
import { RNG } from '../../utils/rng.js';

// One canvas texture for the whole near city: wall + window cells, storefronts, awnings,
// shop signs, murals, billboards and small details. Geometry picks cells by name, so every
// building, prop and parked car shares one material (two with the unlit sign material).

export const ATLAS_SIZE = 2048;
const PAD = 4;
const FONT = '"Lilita One", "Arial Black", Impact, sans-serif';
const BLOCKY = 'Impact, "Arial Black", "Lilita One", sans-serif';

// Cell sizes in pixels → world units (40 px per unit).
export const BAY = { w: 2.4, h: 3.0, pw: 96, ph: 120 };
export const STORE = { w: 4.8, h: 3.4, pw: 192, ph: 136 };

// Wall styles: brick / stone / stucco, with trim and window frame colors.
export const WALLS = {
  red: { kind: 'brick', base: '#a24a37', mortar: '#cdbcaa', trim: '#efe6d3', frame: '#f6f1e8', lintel: 'flat', cornice: 0xe9dfcc },
  darkred: { kind: 'brick', base: '#7a3327', mortar: '#a99a8c', trim: '#ded1ba', frame: '#24382f', lintel: 'arch', cornice: 0x3b2f2a },
  brown: { kind: 'brick', base: '#8b5b41', mortar: '#bea993', trim: '#eadcc4', frame: '#efe8da', lintel: 'flat', cornice: 0x5d4a3f },
  tan: { kind: 'brick', base: '#c79a66', mortar: '#e8d6b8', trim: '#f7f0e3', frame: '#34495e', lintel: 'flat', cornice: 0xf2e8d6 },
  brownstone: { kind: 'stone', base: '#6f4535', joint: '#5b382b', trim: '#8c5f4b', frame: '#ece0ca', lintel: 'hood', cornice: 0x3d2a22 },
  grey: { kind: 'stone', base: '#bdb6aa', joint: '#a59f94', trim: '#ddd7cb', frame: '#2d3640', lintel: 'flat', cornice: 0xd9d3c7 },
  cream: { kind: 'stucco', base: '#e8d9bb', trim: '#ffffff', frame: '#4f7a63', lintel: 'none', cornice: 0xfaf4e8 },
  mint: { kind: 'stucco', base: '#a7c9b5', trim: '#f2f2ea', frame: '#ffffff', lintel: 'flat', cornice: 0xf2f2ea },
};
export const WALL_NAMES = Object.keys(WALLS);
export const WINDOWS = ['glass', 'glass', 'curtain', 'blinds', 'ac', 'plant', 'dark', 'sheer', 'lit'];
const WINDOW_CELLS = ['glass', 'curtain', 'blinds', 'ac', 'plant', 'dark', 'sheer', 'lit', 'plain'];
export const STORES = ['goods', 'shutter', 'laundry', 'posters', 'warm', 'neon', 'dark'];

export const SHOPS = [
  { name: 'PIZZA', fg: '#e8322a', bg: '#fff6e6', awning: '#d8342b', board: true },
  { name: 'DELI', fg: '#e23028', bg: '#ffffff', awning: '#c62828', board: true },
  { name: 'GROCERY', fg: '#ffffff', bg: '#1f7a45', awning: '#1f7a45', board: true },
  { name: 'VIDEO', fg: '#2ee6ff', bg: '#1c1440', awning: '#3949ab' },
  { name: 'ARCADE', fg: '#ff3fa4', bg: '#14102a', awning: '#7b3fe4' },
  { name: 'LAUNDRY', fg: '#1e6fd0', bg: '#eef5fb', awning: '#1e88e5', board: true },
  { name: 'RECORDS', fg: '#ffb020', bg: '#22181a', awning: '#8d3b2a' },
  { name: '24 HR', fg: '#3dff6e', bg: '#0f1a13', awning: '#2e7d32' },
  { name: 'DONUTS', fg: '#ff5fb8', bg: '#fff0f7', awning: '#ec407a', board: true },
  { name: 'BARBER', fg: '#d8342b', bg: '#f4f1e6', awning: '#1e3a8a', board: true },
  { name: 'NOODLES', fg: '#ffe066', bg: '#b71c1c', awning: '#b71c1c', board: true },
  { name: 'PAWN', fg: '#ffd23f', bg: '#1c1f26', awning: '#37474f' },
  { name: 'BAGELS', fg: '#7a3b12', bg: '#ffd88a', awning: '#e08a1e', board: true },
  { name: 'SHOES', fg: '#ffffff', bg: '#273a8c', awning: '#273a8c', board: true },
  { name: 'LIQUORS', fg: '#ff4b3e', bg: '#18141a', awning: '#5d1f1a' },
  { name: 'TAILOR', fg: '#f3e2b3', bg: '#3b2a1e', awning: '#6d4c41', board: true },
];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) {
    r *= 1 + k; g *= 1 + k; b *= 1 + k;
  } else {
    r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

// Text that fits a box: shrinks the font until the string fits `maxW`.
function fitText(ctx, text, x, y, maxW, size, font = FONT) {
  let s = size;
  ctx.font = `${s}px ${font}`;
  while (ctx.measureText(text).width > maxW && s > 8) {
    s -= 2;
    ctx.font = `${s}px ${font}`;
  }
  ctx.fillText(text, x, y);
  return s;
}

class Packer {
  constructor(size) {
    this.size = size;
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
  }

  alloc(w, h) {
    if (this.x + w + PAD * 2 > this.size) {
      this.x = 0;
      this.y += this.rowH;
      this.rowH = 0;
    }
    const r = { x: this.x + PAD, y: this.y + PAD, w, h };
    this.x += w + PAD * 2;
    this.rowH = Math.max(this.rowH, h + PAD * 2);
    if (this.y + this.rowH > this.size) throw new Error('city atlas is full');
    return r;
  }
}

// ---------------------------------------------------------------------------------------
// Wall surfaces
// ---------------------------------------------------------------------------------------

function wallFill(ctx, w, h, st, rng) {
  if (st.kind === 'brick') {
    ctx.fillStyle = st.mortar;
    ctx.fillRect(0, 0, w, h);
    const bw = 16, bh = 6;
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
        const dark = rng.chance(0.06) ? -0.16 : 0;
        ctx.fillStyle = shade(st.base, rng.float(-0.08, 0.06) + dark);
        ctx.fillRect(x + 0.7, y + 0.7, bw - 1.4, bh - 1.3);
      }
    }
  } else if (st.kind === 'stone') {
    ctx.fillStyle = st.joint;
    ctx.fillRect(0, 0, w, h);
    const bw = 32, bh = 20;
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
        ctx.fillStyle = shade(st.base, rng.float(-0.04, 0.04));
        ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }
  } else {
    ctx.fillStyle = st.base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 40; i++) {
      ctx.fillStyle = shade(st.base, rng.float(-0.07, 0.05));
      ctx.fillRect(rng.float(0, w), rng.float(0, h), rng.float(1, 3), rng.float(1, 3));
    }
  }
  // Soot and weathering spots.
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(40,30,25,${rng.float(0.03, 0.07)})`;
    ctx.beginPath();
    ctx.arc(rng.float(0, w), rng.float(0, h), rng.float(3, 9), 0, Math.PI * 2);
    ctx.fill();
  }
}

function glassFill(ctx, x, y, w, h, variant) {
  if (variant === 'lit') {
    ctx.fillStyle = grad(ctx, 0, y, 0, y + h, ['#fff1c2', '#f7c167']);
  } else if (variant === 'dark') {
    ctx.fillStyle = grad(ctx, 0, y, 0, y + h, ['#52677c', '#1d2732']);
  } else {
    ctx.fillStyle = grad(ctx, 0, y, 0, y + h, ['#cfe9f7', '#7fa9c9', '#36597a']);
  }
  ctx.fillRect(x, y, w, h);
  // Sky reflection streak.
  ctx.fillStyle = variant === 'lit' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.32)';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.7);
  ctx.lineTo(x + w * 0.55, y);
  ctx.lineTo(x + w * 0.8, y);
  ctx.lineTo(x, y + h * 1.05);
  ctx.fill();
  ctx.restore();
}

const CURTAINS = ['#d84a3a', '#f2c14e', '#f4efe6', '#6a9fd8', '#8bc34a', '#e57fb0', '#b0773e'];

function windowCell(ctx, w, h, st, variant, rng) {
  wallFill(ctx, w, h, st, rng);
  if (variant === 'plain') return;
  const tall = st.lintel === 'hood';
  const wide = st.kind === 'stucco';
  const wx = wide ? 20 : 26, ww = wide ? 56 : 44;
  const wy = tall ? 16 : 24, wh = tall ? 80 : 68;

  // Lintel above the opening.
  if (st.lintel === 'flat') {
    ctx.fillStyle = st.trim;
    ctx.fillRect(wx - 5, wy - 9, ww + 10, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(wx - 5, wy - 1, ww + 10, 2);
  } else if (st.lintel === 'arch') {
    ctx.fillStyle = shade(st.base, -0.22);
    ctx.beginPath();
    ctx.ellipse(wx + ww / 2, wy + 6, ww / 2 + 6, 16, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#1e252e';
    ctx.beginPath();
    ctx.ellipse(wx + ww / 2, wy + 6, ww / 2, 10, 0, Math.PI, 0);
    ctx.fill();
  } else if (st.lintel === 'hood') {
    ctx.fillStyle = shade(st.base, 0.12);
    ctx.fillRect(wx - 7, wy - 11, ww + 14, 8);
    ctx.fillRect(wx - 9, wy - 13, ww + 18, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(wx - 7, wy - 3, ww + 14, 3);
  }

  // Recess, sash frame, panes.
  ctx.fillStyle = '#1b2129';
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = st.frame;
  ctx.fillRect(wx + 2, wy + 2, ww - 4, wh - 3);
  const gx = wx + 5, gw = ww - 10;
  const ph = (wh - 15) / 2;
  const gy1 = wy + 5, gy2 = wy + 10 + ph;
  glassFill(ctx, gx, gy1, gw, ph, variant);
  glassFill(ctx, gx, gy2, gw, ph, variant);

  if (variant === 'curtain') {
    const c = rng.pick(CURTAINS);
    for (const [x0, dir] of [[gx, 1], [gx + gw, -1]]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x0, gy1);
      ctx.lineTo(x0 + dir * gw * 0.42, gy1);
      ctx.quadraticCurveTo(x0 + dir * gw * 0.2, gy1 + ph * 0.8, x0 + dir * gw * 0.12, gy2 + ph);
      ctx.lineTo(x0, gy2 + ph);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x0 + dir * k * 4, gy1);
        ctx.lineTo(x0 + dir * k * 2.5, gy2 + ph);
        ctx.stroke();
      }
    }
  } else if (variant === 'sheer') {
    ctx.fillStyle = 'rgba(250,248,240,0.72)';
    ctx.fillRect(gx, gy1, gw, ph);
    ctx.fillRect(gx, gy2, gw, ph * 0.5);
  } else if (variant === 'blinds') {
    const c = rng.pick(['#efe4cc', '#e8eef2', '#d9c7a3']);
    ctx.fillStyle = c;
    ctx.fillRect(gx, gy1, gw, ph + 2 + ph * 0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = gy1 + 2; y < gy1 + ph * 1.45; y += 3) ctx.fillRect(gx, y, gw, 1);
  } else if (variant === 'plant') {
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(wx - 3, wy + wh - 7, ww + 6, 9);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = rng.pick(['#3f8f3a', '#56a645', '#2e7a33']);
      ctx.beginPath();
      ctx.arc(wx + 2 + (i / 8) * (ww - 4), wy + wh - 9 + rng.float(-2, 2), rng.float(3, 5), 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = rng.pick(['#ff5a6e', '#ffd23f', '#ff8ad0', '#ffffff']);
      ctx.beginPath();
      ctx.arc(wx + 4 + rng.float(0, ww - 8), wy + wh - 11 + rng.float(-2, 2), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Muntins: two over two.
  ctx.fillStyle = st.frame;
  ctx.fillRect(gx + gw / 2 - 1, gy1, 2, ph);
  ctx.fillRect(gx + gw / 2 - 1, gy2, 2, ph);
  // Recess shadow along the top.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(wx + 2, wy + 2, ww - 4, 3);

  // Sill + shadow.
  ctx.fillStyle = st.trim;
  ctx.fillRect(wx - 5, wy + wh, ww + 10, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(wx - 4, wy + wh + 5, ww + 8, 3);

  if (variant === 'ac') {
    const ax = wx + 6, aw = ww - 12, ay = gy2 + ph - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(ax + 2, ay + 18, aw, 8);
    ctx.fillStyle = '#c9ccd1';
    ctx.fillRect(ax, ay, aw, 20);
    ctx.fillStyle = '#9da2a9';
    for (let x = ax + 3; x < ax + aw - 2; x += 3) ctx.fillRect(x, ay + 4, 1, 12);
    ctx.fillStyle = '#e3e5e8';
    ctx.fillRect(ax, ay, aw, 3);
  }
}

function industrialCell(ctx, w, h, st, rng) {
  wallFill(ctx, w, h, st, rng);
  const wx = 10, ww = 76, wy = 16, wh = 84;
  ctx.fillStyle = '#4a4a48';
  ctx.fillRect(wx - 4, wy - 8, ww + 8, 7);
  ctx.fillStyle = '#26352d';
  ctx.fillRect(wx, wy, ww, wh);
  const cols = 4, rows = 5;
  const pw = (ww - 4) / cols, ph = (wh - 4) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const roll = rng.next();
      ctx.fillStyle = roll < 0.12 ? '#2a3440' : roll < 0.2 ? '#e9d9a6' : shade('#8fb0c4', rng.float(-0.15, 0.1));
      ctx.fillRect(wx + 3 + c * pw, wy + 3 + r * ph, pw - 3, ph - 3);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(wx + 3, wy + 3, ww - 6, 6);
  ctx.fillStyle = '#b8b2a6';
  ctx.fillRect(wx - 4, wy + wh, ww + 8, 5);
}

// ---------------------------------------------------------------------------------------
// Storefronts (ground floor), 4.8 x 3.4 units
// ---------------------------------------------------------------------------------------

function storeCell(ctx, w, h, variant, rng) {
  const frame = rng.pick(['#2a2c33', '#1f3a2e', '#4a1f1c', '#23324a']);
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, w, h);
  // Transom strip.
  for (let x = 8; x < w - 8; x += 31) {
    ctx.fillStyle = '#9fc3d8';
    ctx.fillRect(x, 5, 27, 12);
  }
  const dx = 8, dy = 22, dw = 128, dh = 88;
  const doorX = 142, doorW = 42;

  if (variant === 'shutter') {
    ctx.fillStyle = '#9ea4aa';
    ctx.fillRect(4, 20, w - 8, h - 20);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 22; y < h; y += 4) ctx.fillRect(4, y, w - 8, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 24; y < h; y += 4) ctx.fillRect(4, y, w - 8, 1);
    // Graffiti tags.
    const cols = ['#ff3fa4', '#2ee6ff', '#ffd23f', '#3dff6e', '#ff6a2a', '#ffffff', '#7b3fe4'];
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(rng.float(30, w - 40), rng.float(55, 115));
      ctx.rotate(rng.float(-0.25, 0.15));
      const word = rng.pick(['JOE', 'KRS', 'NYC', 'ZEPH', 'REVS', 'COST', 'SEEN', 'MIKE', 'DARE']);
      ctx.font = `${rng.int(26, 40)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#151515';
      ctx.strokeText(word, 0, 0);
      ctx.fillStyle = rng.pick(cols);
      ctx.fillText(word, 0, 0);
      ctx.restore();
    }
    ctx.strokeStyle = rng.pick(cols);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 120);
    for (let i = 0; i < 6; i++) ctx.quadraticCurveTo(rng.float(20, 170), rng.float(60, 130), rng.float(20, 170), rng.float(70, 130));
    ctx.stroke();
    return;
  }

  // Display window.
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  if (variant === 'goods') {
    ctx.fillStyle = '#f3ead2';
    ctx.fillRect(dx, dy, dw, dh);
    for (let s = 0; s < 4; s++) {
      const y = dy + 10 + s * 21;
      for (let x = dx + 2; x < dx + dw - 4; x += rng.int(5, 9)) {
        ctx.fillStyle = rng.pick(['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#ffffff', '#8e24aa', '#6d4c41']);
        const ph = rng.int(8, 15);
        ctx.fillRect(x, y + 15 - ph, rng.int(4, 7), ph);
      }
      ctx.fillStyle = '#b8a888';
      ctx.fillRect(dx, y + 15, dw, 3);
    }
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(dx + 26, dy + 26, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d32f2f';
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SALE', dx + 26, dy + 31);
  } else if (variant === 'laundry') {
    ctx.fillStyle = '#e9f1f7';
    ctx.fillRect(dx, dy, dw, dh);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) {
        const cx = dx + 18 + i * 31, cy = dy + 24 + row * 40;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 14, cy - 16, 28, 34);
        ctx.fillStyle = '#9aa6b2';
        ctx.beginPath();
        ctx.arc(cx, cy + 2, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a5068';
        ctx.beginPath();
        ctx.arc(cx, cy + 2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (variant === 'posters') {
    ctx.fillStyle = '#2a3542';
    ctx.fillRect(dx, dy, dw, dh);
    for (let i = 0; i < 3; i++) {
      const px = dx + 6 + i * 42, py = dy + 8;
      ctx.fillStyle = rng.pick(['#e53935', '#3949ab', '#fdd835', '#00897b', '#8e24aa']);
      ctx.fillRect(px, py, 34, 50);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(px + 4, py + 6, 26, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(px + 4, py + 20, 26, 22);
    }
  } else if (variant === 'warm') {
    ctx.fillStyle = grad(ctx, 0, dy, 0, dy + dh, ['#ffe2a6', '#e9a65a']);
    ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = '#5d3a22';
    ctx.fillRect(dx, dy + 52, dw, 36);
    ctx.fillStyle = '#c62828';
    for (let x = dx + 12; x < dx + dw; x += 22) {
      ctx.beginPath();
      ctx.arc(x, dy + 50, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff5dc';
    for (let x = dx + 10; x < dx + dw; x += 40) ctx.fillRect(x, dy + 6, 14, 6);
  } else if (variant === 'neon') {
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.font = `30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff3fa4';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ff7ac8';
    ctx.fillText('OPEN', dx + dw / 2, dy + 44);
    ctx.shadowColor = '#2ee6ff';
    ctx.strokeStyle = '#7ff3ff';
    ctx.lineWidth = 3;
    rr(ctx, dx + 20, dy + 14, dw - 40, 42, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = grad(ctx, 0, dy, 0, dy + dh, ['#8fb6cf', '#2f4b63']);
    ctx.fillRect(dx, dy, dw, dh);
  }
  // Reflections on the glass.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(dx + 30, dy);
  ctx.lineTo(dx + 60, dy);
  ctx.lineTo(dx + 10, dy + dh);
  ctx.lineTo(dx - 20, dy + dh);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(dx + 75, dy);
  ctx.lineTo(dx + 84, dy);
  ctx.lineTo(dx + 34, dy + dh);
  ctx.lineTo(dx + 25, dy + dh);
  ctx.fill();
  ctx.restore();
  // Mullion + bulkhead.
  ctx.fillStyle = frame;
  ctx.fillRect(dx + dw / 2 - 2, dy, 4, dh);
  ctx.fillStyle = shade(frame === '#2a2c33' ? '#2a2c33' : frame, 0.15);
  ctx.fillRect(dx, dy + dh + 3, dw, h - dy - dh - 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(dx + 6, dy + dh + 7, dw - 12, h - dy - dh - 14);

  // Door.
  ctx.fillStyle = '#15171c';
  ctx.fillRect(doorX, 20, doorW, h - 20);
  ctx.fillStyle = shade('#6b4a2f', rng.float(-0.1, 0.15));
  ctx.fillRect(doorX + 3, 23, doorW - 6, h - 23);
  ctx.fillStyle = grad(ctx, 0, 30, 0, 90, ['#bcd9ea', '#4c6d88']);
  ctx.fillRect(doorX + 9, 30, doorW - 18, 62);
  ctx.fillStyle = '#e8c35a';
  ctx.fillRect(doorX + doorW - 11, 98, 4, 10);
}

// ---------------------------------------------------------------------------------------
// Signs, murals, billboards
// ---------------------------------------------------------------------------------------

function shopSign(ctx, w, h, shop) {
  ctx.fillStyle = shop.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = shop.board ? shade(shop.fg, -0.1) : shade(shop.bg, 0.25);
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = shop.fg;
  if (!shop.board) {
    ctx.shadowColor = shop.fg;
    ctx.shadowBlur = 12;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 0;
  }
  fitText(ctx, shop.name, w / 2, h / 2 + 3, w - 30, 48, shop.board ? BLOCKY : FONT);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (!shop.board) fitText(ctx, shop.name, w / 2, h / 2 + 3, w - 30, 48, FONT);
}

function verticalSign(ctx, w, h, text, { fg, bg, bulbs = false, border = '#ffffff', font = BLOCKY }) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  if (bulbs) {
    ctx.fillStyle = '#fff3b0';
    for (let y = 10; y < h - 6; y += 12) {
      for (const x of [9, w - 9]) {
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const n = text.length;
  const step = (h - 20) / n;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.shadowColor = fg;
  ctx.shadowBlur = bg.startsWith('#f') ? 0 : 10;
  ctx.font = `${Math.min(step * 0.92, w * 0.85)}px ${font}`;
  for (let i = 0; i < n; i++) ctx.fillText(text[i], w / 2, 12 + step * (i + 0.55));
  ctx.shadowBlur = 0;
}

function crown(ctx, cx, cy, s, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.5);
  ctx.lineTo(cx - s, cy - s * 0.4);
  ctx.lineTo(cx - s * 0.5, cy);
  ctx.lineTo(cx, cy - s * 0.6);
  ctx.lineTo(cx + s * 0.5, cy);
  ctx.lineTo(cx + s, cy - s * 0.4);
  ctx.lineTo(cx + s, cy + s * 0.5);
  ctx.closePath();
  ctx.stroke();
}

function worn(ctx, w, h, rng, color, n = 500) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(rng.float(0, w), rng.float(0, h), rng.float(1, 3), rng.float(1, 2));
}

function muralEastSide(ctx, w, h, rng) {
  wallFill(ctx, w, h, { kind: 'brick', base: '#5a2e26', mortar: '#7a5c50' }, rng);
  ctx.fillStyle = 'rgba(28,20,24,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.07);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#efe3c8';
  ctx.font = `92px ${BLOCKY}`;
  ctx.fillText('EAST', 0, -62);
  ctx.fillText('SIDE', 0, 26);
  ctx.font = `66px ${BLOCKY}`;
  ctx.fillText('DRIVES', 0, 98);
  ctx.restore();
  crown(ctx, w / 2 + 30, h - 34, 20, '#efe3c8');
  worn(ctx, w, h, rng, 'rgba(70,40,34,0.55)', 900);
}

function muralIdle(ctx, w, h, rng) {
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, ['#2a1b5e', '#b0307a', '#ff7a3a', '#ffd06a']);
  ctx.fillRect(0, 0, w, h);
  // Striped sun.
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.52, 82, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = grad(ctx, 0, h * 0.52 - 82, 0, h * 0.52 + 82, ['#fff27a', '#ff8a3a', '#ff3f8a']);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b0307a';
  for (let i = 0; i < 6; i++) ctx.fillRect(0, h * 0.52 + 6 + i * 13, w, 3 + i);
  ctx.restore();
  // Grid floor.
  ctx.fillStyle = '#1a1036';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.strokeStyle = '#ff3fa4';
  ctx.lineWidth = 2;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + i * 8, h * 0.72);
    ctx.lineTo(w / 2 + i * 50, h);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const y = h * 0.72 + (i * i + 1) * 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Car silhouette.
  ctx.fillStyle = '#120a24';
  ctx.beginPath();
  ctx.moveTo(40, h * 0.77);
  ctx.lineTo(60, h * 0.7);
  ctx.lineTo(100, h * 0.68);
  ctx.lineTo(125, h * 0.62);
  ctx.lineTo(170, h * 0.62);
  ctx.lineTo(195, h * 0.68);
  ctx.lineTo(220, h * 0.7);
  ctx.lineTo(220, h * 0.77);
  ctx.fill();
  ctx.fillStyle = '#2ee6ff';
  ctx.fillRect(44, h * 0.77, 176, 3);
  for (const x of [80, 185]) {
    ctx.fillStyle = '#120a24';
    ctx.beginPath();
    ctx.arc(x, h * 0.775, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  // Chrome title.
  ctx.textAlign = 'center';
  ctx.font = `60px ${FONT}`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1a1036';
  ctx.strokeText('IDLE', w / 2, 70);
  ctx.strokeText('CARS', w / 2, 128);
  ctx.fillStyle = grad(ctx, 0, 20, 0, 130, ['#ffffff', '#9fe8ff', '#3a78ff', '#ffffff', '#ff9ad5']);
  ctx.fillText('IDLE', w / 2, 70);
  ctx.fillText('CARS', w / 2, 128);
}

function muralGraffiti(ctx, w, h, rng) {
  ctx.fillStyle = '#d9d4c7';
  ctx.fillRect(0, 0, w, h);
  worn(ctx, w, h, rng, 'rgba(0,0,0,0.05)', 400);
  const cols = ['#ff3fa4', '#2ee6ff', '#ffd23f', '#3dff6e', '#ff6a2a', '#7b3fe4'];
  // Background tags.
  for (let i = 0; i < 10; i++) {
    ctx.save();
    ctx.translate(rng.float(10, w - 10), rng.float(20, h - 10));
    ctx.rotate(rng.float(-0.3, 0.3));
    ctx.font = `${rng.int(16, 26)}px ${FONT}`;
    ctx.fillStyle = rng.pick(['#333', '#1e3a8a', '#b71c1c', '#222']);
    ctx.fillText(rng.pick(['TAKI', 'SEEN', 'REVS', 'JA', 'NOXE', 'ZEPHYR', 'KR']), 0, 0);
    ctx.restore();
  }
  // Main bubble piece.
  ctx.save();
  ctx.translate(w / 2, h / 2 + 30);
  ctx.rotate(-0.06);
  ctx.textAlign = 'center';
  ctx.font = `120px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 22;
  ctx.strokeStyle = '#1a1a1a';
  ctx.strokeText('NYC 95', 0, 0);
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('NYC 95', 0, 0);
  ctx.fillStyle = grad(ctx, -150, -90, 150, 10, [cols[0], cols[4], cols[2], cols[3], cols[1]]);
  ctx.fillText('NYC 95', 0, 0);
  ctx.restore();
  // Drips and stars.
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rng.pick(cols);
    const x = rng.float(40, w - 40);
    ctx.fillRect(x, h * 0.62, 3, rng.float(8, 30));
  }
  ctx.fillStyle = '#ffd23f';
  for (const [x, y] of [[30, 34], [w - 34, 40], [w - 60, h - 26]]) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 ? 6 : 15;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.fill();
  }
}

function ghostAd(ctx, w, h, rng) {
  wallFill(ctx, w, h, { kind: 'brick', base: '#8a4434', mortar: '#a07e6e' }, rng);
  ctx.fillStyle = 'rgba(30,22,20,0.35)';
  ctx.fillRect(14, 14, w - 28, h - 28);
  ctx.strokeStyle = 'rgba(240,226,190,0.7)';
  ctx.lineWidth = 5;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(244,232,200,0.82)';
  ctx.font = `30px ${BLOCKY}`;
  ctx.fillText('GOLDEN STAR', w / 2, 70);
  ctx.font = `72px ${BLOCKY}`;
  ctx.fillText('BREAD', w / 2, 150);
  ctx.fillStyle = 'rgba(255,214,120,0.78)';
  ctx.font = `44px ${BLOCKY}`;
  ctx.fillText('FRESH DAILY', w / 2, 208);
  ctx.fillStyle = 'rgba(244,232,200,0.82)';
  ctx.font = `64px ${BLOCKY}`;
  ctx.fillText('5¢', w / 2, 282);
  worn(ctx, w, h, rng, 'rgba(120,60,46,0.6)', 1400);
}

function billboard(ctx, w, h, kind, rng) {
  ctx.save();
  if (kind === 'city') {
    ctx.fillStyle = grad(ctx, 0, 0, 0, h, ['#ff9a4a', '#ffcf6e', '#ffe9b0']);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2d2a4a';
    let x = 0;
    while (x < w) {
      const bw = rng.int(14, 34), bh = rng.int(30, 110);
      ctx.fillRect(x, h - bh, bw, bh);
      if (rng.chance(0.3)) ctx.fillRect(x + bw / 2 - 2, h - bh - 18, 4, 18);
      x += bw - 2;
    }
    ctx.fillStyle = '#ffe9b0';
    for (let i = 0; i < 60; i++) ctx.fillRect(rng.float(0, w), rng.float(h - 90, h), 2, 3);
    ctx.textAlign = 'center';
    ctx.font = `66px ${BLOCKY}`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#2d2a4a';
    ctx.strokeText('IDLE CITY', w / 2, 74);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('IDLE CITY', w / 2, 74);
  } else if (kind === 'cola') {
    ctx.fillStyle = '#d81e2c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.95, w, h * 0.6);
    ctx.lineTo(w, h * 0.7);
    ctx.bezierCurveTo(w * 0.6, h * 1.05, w * 0.3, h * 0.62, 0, h * 0.84);
    ctx.fill();
    ctx.fillStyle = '#5a1a12';
    rr(ctx, w - 86, 18, 44, 124, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w - 86, 66, 44, 26);
    ctx.textAlign = 'left';
    ctx.font = `56px ${FONT}`;
    ctx.fillText('ROCKET', 22, 66);
    ctx.fillText('COLA', 22, 116);
    ctx.font = `20px ${FONT}`;
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('TASTE THE 90s!', 172, 112);
  } else if (kind === 'radio') {
    ctx.fillStyle = grad(ctx, 0, 0, w, h, ['#1b1446', '#3a1d7a', '#7b3fe4']);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2ee6ff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(70, h / 2, 20 + i * 14, -0.9, 0.9);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff3fa4';
    ctx.beginPath();
    ctx.arc(70, h / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.shadowColor = '#ff3fa4';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = `62px ${FONT}`;
    ctx.fillText('95.5 FM', 140, 86);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd23f';
    ctx.font = `26px ${FONT}`;
    ctx.fillText('ALL HITS · ALL DAY', 142, 124);
  } else {
    ctx.fillStyle = grad(ctx, 0, 0, 0, h, ['#4fb4ff', '#c7ecff']);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23f';
    rr(ctx, 30, 70, 150, 48, 16);
    ctx.fill();
    ctx.fillStyle = '#1c1f26';
    ctx.fillRect(68, 54, 70, 22);
    for (const x of [60, 150]) {
      ctx.beginPath();
      ctx.arc(x, 120, 15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.font = `46px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1f4e8c';
    ctx.strokeText('DRIVE', 206, 72);
    ctx.strokeText('THE CITY', 206, 124);
    ctx.fillText('DRIVE', 206, 72);
    ctx.fillText('THE CITY', 206, 124);
  }
  ctx.restore();
  ctx.strokeStyle = '#f4f1e6';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
}

// ---------------------------------------------------------------------------------------

function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  const packer = new Packer(ATLAS_SIZE);
  const rects = {};
  const rng = new RNG(4242);

  const add = (name, w, h, draw) => {
    const r = packer.alloc(w, h);
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    draw(ctx, w, h);
    ctx.restore();
    // Bleed the edges into the padding so mipmaps don't pick up neighbours.
    ctx.drawImage(canvas, r.x, r.y, 1, h, r.x - PAD, r.y, PAD, h);
    ctx.drawImage(canvas, r.x + w - 1, r.y, 1, h, r.x + w, r.y, PAD, h);
    ctx.drawImage(canvas, r.x - PAD, r.y, w + PAD * 2, 1, r.x - PAD, r.y - PAD, w + PAD * 2, PAD);
    ctx.drawImage(canvas, r.x - PAD, r.y + h - 1, w + PAD * 2, 1, r.x - PAD, r.y + h, w + PAD * 2, PAD);
    const S = ATLAS_SIZE;
    rects[name] = { u0: (r.x + 0.5) / S, u1: (r.x + w - 0.5) / S, v0: 1 - (r.y + h - 0.5) / S, v1: 1 - (r.y + 0.5) / S };
  };

  add('white', 12, 12, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
  });

  for (const name of WALL_NAMES) {
    const st = WALLS[name];
    for (const v of WINDOW_CELLS) add(`win:${name}:${v}`, BAY.pw, BAY.ph, (c, w, h) => windowCell(c, w, h, st, v, rng));
    if (st.kind === 'brick') add(`ind:${name}`, BAY.pw, BAY.ph, (c, w, h) => industrialCell(c, w, h, st, rng));
  }
  for (const v of STORES) add(`store:${v}`, STORE.pw, STORE.ph, (c, w, h) => storeCell(c, w, h, v, rng));

  SHOPS.forEach((shop, i) => {
    add(`sign:${i}`, 320, 64, (c, w, h) => shopSign(c, w, h, shop));
    add(`awn:${i}`, 64, 48, (c, w, h) => {
      for (let k = 0; k < 8; k++) {
        c.fillStyle = k % 2 ? '#f6f2ea' : shop.awning;
        c.fillRect(k * 8, 0, 8, h);
      }
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(0, h - 10, w, 10);
    });
  });
  add('awn:solid-green', 64, 48, (c, w, h) => {
    c.fillStyle = '#1f6b3e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(0, 0, w, 4);
  });
  add('awn:solid-red', 64, 48, (c, w, h) => {
    c.fillStyle = '#b3261e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(0, 0, w, 4);
  });

  add('vsign:hotel', 64, 288, (c, w, h) => verticalSign(c, w, h, 'HOTEL', { fg: '#ff4b3e', bg: '#1c1f26', bulbs: true, border: '#ff4b3e' }));
  add('vsign:pizza', 64, 256, (c, w, h) => verticalSign(c, w, h, 'PIZZA', { fg: '#e23028', bg: '#fff8ec', border: '#e23028' }));
  add('vsign:rialto', 72, 320, (c, w, h) => verticalSign(c, w, h, 'RIALTO', { fg: '#ffd23f', bg: '#b3261e', bulbs: true, border: '#ffd23f' }));
  add('vsign:bar', 64, 160, (c, w, h) => verticalSign(c, w, h, 'BAR', { fg: '#2ee6ff', bg: '#141a2b', border: '#ff3fa4', font: FONT }));
  add('vsign:deli', 64, 192, (c, w, h) => verticalSign(c, w, h, 'DELI', { fg: '#ffd23f', bg: '#1b5e3a', border: '#ffd23f' }));
  add('sign:diner', 288, 80, (c, w, h) => {
    c.fillStyle = grad(c, 0, 0, 0, h, ['#f4f6f8', '#b9c0c8', '#eef1f4']);
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e23b5a';
    c.lineWidth = 5;
    c.strokeRect(5, 5, w - 10, h - 10);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#ff3f6a';
    c.shadowBlur = 10;
    c.fillStyle = '#e23b5a';
    fitText(c, 'DINER', w / 2, h / 2 + 3, w - 40, 62);
    c.shadowBlur = 0;
  });
  add('sign:hotel', 320, 64, (c, w, h) => shopSign(c, w, h, { name: 'HOTEL ASTOR', fg: '#ff4b3e', bg: '#1c1f26' }));
  add('sign:bodega', 384, 64, (c, w, h) => shopSign(c, w, h, { name: 'DELI · GROCERY', fg: '#ffffff', bg: '#c62828', board: true }));
  add('sign:engine', 256, 48, (c, w, h) => shopSign(c, w, h, { name: 'ENGINE 95', fg: '#ffd23f', bg: '#8e1b14', board: true }));
  add('sign:gas', 128, 128, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#d81e2c';
    c.fillRect(0, 0, w, 52);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.font = `40px ${BLOCKY}`;
    c.fillText('GAS', w / 2, 42);
    c.fillStyle = '#1c1f26';
    c.fillRect(10, 62, w - 20, 54);
    c.fillStyle = '#ff6a2a';
    c.font = `34px ${BLOCKY}`;
    c.fillText('1.09', w / 2, 102);
  });
  add('marquee', 384, 96, (c, w, h) => {
    c.fillStyle = '#fff8e8';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#b3261e';
    c.fillRect(0, 0, w, 14);
    c.fillRect(0, h - 14, w, 14);
    c.fillStyle = '#fff3b0';
    for (let x = 8; x < w; x += 14) {
      c.beginPath();
      c.arc(x, 7, 3, 0, Math.PI * 2);
      c.arc(x, h - 7, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#1c1f26';
    c.textAlign = 'center';
    c.font = `22px ${BLOCKY}`;
    c.fillText('NOW SHOWING', w / 2, 40);
    c.font = `34px ${BLOCKY}`;
    c.fillText('CAR WARS II', w / 2, 76);
  });
  add('streetsign', 192, 96, (c, w, h) => {
    c.fillStyle = '#16704a';
    rr(c, 0, 0, w, h, 10);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    rr(c, 5, 5, w - 10, h - 10, 8);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.textAlign = 'left';
    c.font = `30px ${FONT}`;
    c.fillText('Downtown', 16, 40);
    c.fillText('Harbor', 16, 80);
    c.font = `34px ${FONT}`;
    c.fillText('↑', 160, 40);
    c.fillText('→', 152, 80);
  });
  add('metro', 192, 48, (c, w, h) => {
    c.fillStyle = '#1d3b2c';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = `30px ${FONT}`;
    c.fillText('Metro', 12, h / 2 + 2);
    for (const [x, t] of [[130, 'A'], [166, 'C']]) {
      c.fillStyle = '#2850ad';
      c.beginPath();
      c.arc(x, h / 2, 15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.font = `22px ${FONT}`;
      c.fillText(t, x, h / 2 + 1);
    }
  });

  add('mural:eastside', 256, 320, (c, w, h) => muralEastSide(c, w, h, rng));
  add('mural:idle', 256, 320, (c, w, h) => muralIdle(c, w, h, rng));
  add('mural:ghost', 256, 320, (c, w, h) => ghostAd(c, w, h, rng));
  add('mural:graffiti', 384, 192, (c, w, h) => muralGraffiti(c, w, h, rng));
  for (const k of ['city', 'cola', 'radio', 'drive']) add(`bb:${k}`, 384, 160, (c, w, h) => billboard(c, w, h, k, rng));

  add('wood', 64, 64, (c, w, h) => {
    c.fillStyle = '#7d5232';
    c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      c.fillStyle = shade('#7d5232', rng.float(-0.12, 0.1));
      c.fillRect(x + 1, 0, 6, h);
    }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < w; x += 8) c.fillRect(x, 0, 1, h);
  });
  add('chrome', 64, 64, (c, w, h) => {
    for (let y = 0; y < h; y += 8) {
      c.fillStyle = grad(c, 0, y, 0, y + 8, ['#ffffff', '#b8c0c9', '#7d8792', '#dfe4ea']);
      c.fillRect(0, y, w, 8);
    }
  });
  add('checker', 64, 32, (c, w, h) => {
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 8) {
        c.fillStyle = (x + y) % 16 ? '#111111' : '#f6f6f6';
        c.fillRect(x, y, 8, 8);
      }
    }
  });
  add('roof', 128, 128, (c, w, h) => {
    c.fillStyle = '#e6e2dc';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)';
      c.fillRect(rng.float(0, w), rng.float(0, h), 1.5, 1.5);
    }
    for (let i = 0; i < 5; i++) {
      c.fillStyle = rng.chance(0.5) ? 'rgba(30,28,26,0.16)' : 'rgba(255,255,255,0.14)';
      c.fillRect(rng.float(0, w - 40), rng.float(0, h - 30), rng.float(16, 44), rng.float(10, 30));
    }
    // Tar seams between the roll strips.
    c.fillStyle = 'rgba(40,36,34,0.28)';
    for (let y = 14; y < h; y += rng.float(20, 30)) c.fillRect(0, y, w, 2);
  });
  add('girder', 128, 32, (c, w, h) => {
    c.fillStyle = '#2f6b55';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#265a47';
    for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 3, h);
    c.fillStyle = '#3d8269';
    c.fillRect(0, 0, w, 4);
    c.fillStyle = '#1f4a3a';
    for (let x = 4; x < w; x += 8) {
      c.fillRect(x, 7, 2, 2);
      c.fillRect(x, h - 8, 2, 2);
    }
  });
  add('garage', 128, 128, (c, w, h) => {
    c.fillStyle = '#b3261e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 2);
    c.fillStyle = '#cfe6f2';
    for (let x = 12; x < w - 12; x += 27) c.fillRect(x, 20, 20, 14);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, 4);
  });
  add('bus', 256, 64, (c, w, h) => {
    c.fillStyle = '#f2f3f5';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2b3a4c';
    for (let x = 8; x < w - 30; x += 34) c.fillRect(x, 8, 30, 26);
    c.fillStyle = '#2b3a4c';
    c.fillRect(w - 24, 8, 18, 50);
    c.fillStyle = '#1e5fbf';
    c.fillRect(0, 40, w - 28, 8);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    for (let x = 10; x < w - 30; x += 34) c.fillRect(x, 10, 10, 4);
  });
  add('busdest', 128, 24, (c, w, h) => {
    c.fillStyle = '#0d0d0d';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffb020';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `18px ${BLOCKY}`;
    c.fillText('RIVERSIDE', w / 2, h / 2 + 1);
  });
  add('carglass', 32, 32, (c, w, h) => {
    c.fillStyle = grad(c, 0, 0, 0, h, ['#a9cde3', '#2e4458']);
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(4, 3, 10, 3);
  });
  add('taxi', 64, 24, (c, w, h) => {
    c.fillStyle = '#fff6c9';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1c1f26';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `18px ${BLOCKY}`;
    c.fillText('TAXI', w / 2, h / 2 + 1);
  });
  add('court', 128, 96, (c, w, h) => {
    c.fillStyle = '#2f7f62';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#d9773b';
    c.fillRect(8, 8, w - 16, h - 16);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.beginPath();
    c.moveTo(w / 2, 8);
    c.lineTo(w / 2, h - 8);
    c.stroke();
    c.beginPath();
    c.arc(w / 2, h / 2, 12, 0, Math.PI * 2);
    c.stroke();
    for (const x of [8, w - 8]) {
      c.strokeRect(x === 8 ? 8 : w - 30, h / 2 - 12, 22, 24);
      c.beginPath();
      c.arc(x, h / 2, 32, x === 8 ? -1.2 : Math.PI - 1.94, x === 8 ? 1.2 : Math.PI + 1.94);
      c.stroke();
    }
  });
  add('grass', 64, 64, (c, w, h) => {
    c.fillStyle = '#6fb84f';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      c.fillStyle = rng.chance(0.5) ? '#62a845' : '#7cc45a';
      c.fillRect(rng.float(0, w), rng.float(0, h), 2, 3);
    }
  });
  add('tile', 64, 64, (c, w, h) => {
    c.fillStyle = '#d9b48f';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        c.fillStyle = (x + y) % 32 ? '#c98f6a' : '#e6c39c';
        c.fillRect(x + 1, y + 1, 14, 14);
      }
    }
  });
  add('poster', 96, 128, (c, w, h) => {
    c.fillStyle = grad(c, 0, 0, 0, h, ['#ff3fa4', '#7b3fe4']);
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.font = `22px ${FONT}`;
    c.fillText('CAR', w / 2, 40);
    c.fillText('WARS II', w / 2, 66);
    c.fillStyle = '#ffd23f';
    c.font = `14px ${FONT}`;
    c.fillText('IN THEATERS', w / 2, 110);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture: tex, rects, canvas };
}

let atlas = null;
export function getAtlas() {
  atlas ??= buildAtlas();
  return atlas;
}

// Tileable textures (repeat wrapping, world-scaled UVs).

function tileTexture(size, draw, repeat = true) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Distant towers: 8 x 8 window grid, light wall (tinted by vertex color).
export const SKY_TILE = { w: 24, h: 28.8 };
export function skylineTexture() {
  const rng = new RNG(31);
  return tileTexture(256, (c, s) => {
    c.fillStyle = '#ecebe6';
    c.fillRect(0, 0, s, s);
    for (let r = 0; r < 8; r++) {
      for (let k = 0; k < 8; k++) {
        const roll = rng.next();
        c.fillStyle = roll < 0.06 ? '#f6e3a8' : shade('#55687c', rng.float(-0.15, 0.12));
        c.fillRect(k * 32 + 7, r * 32 + 6, 18, 20);
      }
      c.fillStyle = 'rgba(0,0,0,0.06)';
      c.fillRect(0, r * 32 + 28, s, 3);
    }
  });
}

// Distant glass towers: ribbon windows between light spandrels, same tile size as above.
export function skylineGlassTexture() {
  const rng = new RNG(37);
  return tileTexture(256, (c, s) => {
    for (let r = 0; r < 8; r++) {
      const y = r * 32;
      const g = c.createLinearGradient(0, y, 0, y + 25);
      g.addColorStop(0, '#355d7a');
      g.addColorStop(1, '#6894b0');
      c.fillStyle = g;
      c.fillRect(0, y, s, 25);
      for (let k = 0; k < 16; k++) {
        if (rng.chance(0.14)) {
          c.fillStyle = rng.chance(0.3) ? 'rgba(255,236,170,0.55)' : 'rgba(255,255,255,0.22)';
          c.fillRect(k * 16 + 2, y, 14, 25);
        }
        c.fillStyle = 'rgba(24,34,44,0.55)';
        c.fillRect(k * 16, y, 2, 25);
      }
      c.fillStyle = '#d6dadf';
      c.fillRect(0, y + 25, s, 7);
    }
    // A soft diagonal sheen.
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.beginPath();
    c.moveTo(60, 0); c.lineTo(130, 0); c.lineTo(70, s); c.lineTo(0, s);
    c.fill();
  });
}

// Distant prewar towers: stone piers and pairs of narrow windows, same tile size as above.
export function skylineDecoTexture() {
  const rng = new RNG(41);
  return tileTexture(256, (c, s) => {
    c.fillStyle = '#e6dac4';
    c.fillRect(0, 0, s, s);
    for (let r = 0; r < 8; r++) {
      const y = r * 32;
      c.fillStyle = 'rgba(90,70,50,0.12)';
      c.fillRect(0, y + 26, s, 6);
      for (let k = 0; k < 8; k++) {
        for (const dx of [8, 18]) {
          c.fillStyle = rng.chance(0.07) ? '#f6e3a8' : shade('#4c5866', rng.float(-0.15, 0.1));
          c.fillRect(k * 32 + dx, y + 5, 7, 19);
        }
      }
    }
    // Piers between the window pairs.
    c.fillStyle = 'rgba(255,255,255,0.28)';
    for (let k = 0; k < 8; k++) c.fillRect(k * 32 + 1, 0, 4, s);
  });
}

// Asphalt, 8 x 8 units per tile.
export function asphaltTexture() {
  const rng = new RNG(5);
  return tileTexture(256, (c, s) => {
    c.fillStyle = '#4a4c53';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      c.fillRect(rng.float(0, s), rng.float(0, s), rng.float(1, 3), rng.float(1, 3));
    }
    c.strokeStyle = 'rgba(20,20,24,0.35)';
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      let x = rng.float(0, s), y = rng.float(0, s);
      c.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += rng.float(-30, 30);
        y += rng.float(-30, 30);
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(rng.float(0, s - 60), rng.float(0, s - 40), 60, 40);
  });
}

// Sidewalk flags, 4 x 4 units per tile (2 x 2 slabs).
export function sidewalkTexture() {
  const rng = new RNG(9);
  return tileTexture(256, (c, s) => {
    c.fillStyle = '#9b968c';
    c.fillRect(0, 0, s, s);
    const n = 2, cell = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        c.fillStyle = shade('#d3cec4', rng.float(-0.05, 0.03));
        c.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      }
    }
    for (let i = 0; i < 40; i++) {
      c.fillStyle = 'rgba(60,60,60,0.18)';
      c.beginPath();
      c.arc(rng.float(0, s), rng.float(0, s), rng.float(1.5, 3.5), 0, Math.PI * 2);
      c.fill();
    }
  });
}

// Water with soft ripples.
export function waterTexture() {
  const rng = new RNG(12);
  return tileTexture(256, (c, s) => {
    c.fillStyle = '#3b8fc4';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) {
      c.fillStyle = rng.chance(0.6) ? 'rgba(255,255,255,0.16)' : 'rgba(20,60,110,0.18)';
      const x = rng.float(0, s), y = rng.float(0, s);
      c.fillRect(x, y, rng.float(8, 26), 2);
    }
  });
}

// Park lawn with mowing stripes, 6 x 6 units per tile.
export function grassTexture() {
  const rng = new RNG(21);
  return tileTexture(256, (c, s) => {
    c.fillStyle = '#6fae4c';
    c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(255,255,220,0.06)';
    for (let k = 0; k < 4; k++) c.fillRect(0, k * 64, s, 32);
    for (let i = 0; i < 2200; i++) {
      c.fillStyle = rng.chance(0.5) ? 'rgba(255,255,200,0.07)' : 'rgba(20,60,10,0.1)';
      c.fillRect(rng.float(0, s), rng.float(0, s), rng.float(1, 3), rng.float(2, 5));
    }
  });
}
