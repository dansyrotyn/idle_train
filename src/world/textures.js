import * as THREE from 'three';

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
