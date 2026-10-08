import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_LENGTH, CAR_LEVELS } from '../config.js';
import { carSideTextures, badgeTexture } from './textures.js';

export const CAR_W = 2.5;
export const CAR_H = 2.55;
export const CAR_FLOOR = 0.5; // body bottom above the rail top
const BEVEL = 0.2;

// Side profile extents before the bevel grows them by BEVEL on every side.
const LAYOUT = {
  x0: -CAR_LENGTH / 2 + BEVEL,
  x1: CAR_LENGTH / 2 - BEVEL,
  y0: BEVEL,
  y1: CAR_H - BEVEL,
};

export function carStyle(level) {
  if (level <= CAR_LEVELS.length) return CAR_LEVELS[level - 1];
  const c = new THREE.Color().setHSL(((level - 1) * 0.161) % 1, 0.78, 0.5, THREE.SRGBColorSpace);
  return { body: c.getHex(), stripe: 0xffffff, neon: true, metal: 0.55 };
}

function quadTo(out, p0, c, p1, n) {
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(new THREE.Vector2(u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, u * u * p0.y + 2 * u * t * c.y + t * t * p1.y));
  }
}

// Front of the cab: a soft slanted nose that rolls into the roof.
const NOSE = (() => {
  const { x1, y0, y1 } = LAYOUT;
  const pts = [];
  const n0 = new THREE.Vector2(x1, y0 + 0.7);
  const n1 = new THREE.Vector2(x1 - 0.42, y1 - 0.42);
  const n2 = new THREE.Vector2(x1 - 1.45, y1);
  quadTo(pts, n0, new THREE.Vector2(x1 - 0.04, y0 + 1.3), n1, 8);
  quadTo(pts, n1, new THREE.Vector2(x1 - 0.8, y1), n2, 8);
  return pts;
})();

function bodyShape(kind) {
  const { x0, x1, y0, y1 } = LAYOUT;
  const rt = 0.42;
  const rb = 0.16;
  const s = new THREE.Shape();
  s.moveTo(x0 + rb, y0);
  if (kind === 'head') {
    s.lineTo(x1 - 0.28, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + 0.28);
    s.lineTo(x1, y0 + 0.7);
    for (const p of NOSE) s.lineTo(p.x, p.y);
  } else {
    s.lineTo(x1 - rb, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + rb);
    s.lineTo(x1, y1 - rt);
    s.quadraticCurveTo(x1, y1, x1 - rt, y1);
  }
  s.lineTo(x0 + rt, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - rt);
  s.lineTo(x0, y0 + rb);
  s.quadraticCurveTo(x0, y0, x0 + rb, y0);
  return s;
}

// Windshield: follows the nose outline but extrudes with a slightly larger bevel,
// so it sits a hair outside the painted shell and wraps over the front.
function glassShape() {
  const { x1, y0, y1 } = LAYOUT;
  const s = new THREE.Shape();
  const start = NOSE[2];
  s.moveTo(start.x, start.y);
  for (let i = 3; i < NOSE.length; i++) s.lineTo(NOSE[i].x, NOSE[i].y);
  s.lineTo(x1 - 1.75, y1);
  s.lineTo(x1 - 1.75, y1 - 0.55);
  s.lineTo(x1 - 0.55, y0 + 1.05);
  s.closePath();
  return s;
}

function extrudeSide(shape, width, bevelThickness, bevelSize, curveSegments = 6) {
  const depth = width - 2 * bevelThickness;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelSegments: 3,
    curveSegments,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2); // shape x → car forward (+z), extrusion → lateral
  geo.translate(0, CAR_FLOOR, 0);
  // Extrusions come out faceted; smooth the bevels and nose but keep hard edges.
  return toCreasedNormals(geo, Math.PI / 4.5);
}

export class TrainModelFactory {
  constructor() {
    this.bodyGeo = {
      head: extrudeSide(bodyShape('head'), CAR_W, BEVEL, BEVEL),
      mid: extrudeSide(bodyShape('mid'), CAR_W, BEVEL, BEVEL),
    };
    this.glassGeo = extrudeSide(glassShape(), CAR_W - 0.34, 0.14, BEVEL + 0.03, 4);

    const lights = [];
    for (const x of [-0.68, 0.68]) {
      const b = new THREE.BoxGeometry(0.46, 0.2, 0.06);
      b.translate(x, CAR_FLOOR + 0.66, CAR_LENGTH / 2 + 0.01);
      lights.push(b);
    }
    this.lightsGeo = mergeGeometries(lights);

    const under = [];
    for (const z of [-1.65, 1.65]) {
      const bogie = new THREE.BoxGeometry(1.6, 0.42, 1.8);
      bogie.translate(0, 0.32, z);
      under.push(bogie);
      for (const dz of [-0.5, 0.5]) {
        for (const x of [-0.78, 0.78]) {
          const w = new THREE.CylinderGeometry(0.27, 0.27, 0.16, 12);
          w.rotateZ(Math.PI / 2);
          w.translate(x, 0.27, z + dz);
          under.push(w);
        }
      }
    }
    const skirt = new THREE.BoxGeometry(2.2, 0.2, 4.6);
    skirt.translate(0, 0.48, 0);
    under.push(skirt);
    this.underGeo = mergeGeometries(under);

    const roofY = CAR_FLOOR + CAR_H;
    const roofHead = new THREE.BoxGeometry(1.5, 0.3, 1.6);
    roofHead.translate(0, roofY + 0.13, -0.95);
    const roofMidA = new THREE.BoxGeometry(1.5, 0.3, 1.6);
    roofMidA.translate(0, roofY + 0.13, -0.85);
    const roofMidB = new THREE.BoxGeometry(1.1, 0.2, 0.9);
    roofMidB.translate(0, roofY + 0.08, 1.45);
    this.roofGeo = { head: roofHead, mid: mergeGeometries([roofMidA, roofMidB]) };

    this.badgeGeo = new THREE.PlaneGeometry(1.0, 1.0);
    this.badgeGeo.rotateX(-Math.PI / 2);
    this.badgeY = roofY + 0.02;

    this.gangwayGeo = new THREE.BoxGeometry(2.0, 2.15, 1);
    this.gangwayGeo.translate(0, CAR_FLOOR + 1.2, 0);

    this.glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2533, metalness: 0.6, roughness: 0.12 });
    this.headLightMat = new THREE.MeshBasicMaterial({ color: 0xfff4cf });
    this.tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
    this.underMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x5b6370, metalness: 0.3, roughness: 0.5 });
    this.gangwayMat = new THREE.MeshLambertMaterial({ color: 0x272b33 });

    this.levelMats = new Map();
  }

  // Materials for a level and cab kind ('head' | 'mid'), created on first use.
  materials(level, kind) {
    const key = `${level}:${kind}`;
    if (this.levelMats.has(key)) return this.levelMats.get(key);
    const style = carStyle(level);
    const metalness = style.metal ?? 0.25;
    const paint = this.paintMaterial(level);
    const { map, emissiveMap } = carSideTextures(style, kind, LAYOUT);
    const side = new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1,
      metalness,
      roughness: 0.32,
    });
    const badge = this.badgeMaterial(level);
    const mats = { side, paint, badge, body: [side, paint] };
    this.levelMats.set(key, mats);
    return mats;
  }

  paintMaterial(level) {
    const key = `paint:${level}`;
    if (!this.levelMats.has(key)) {
      const style = carStyle(level);
      this.levelMats.set(
        key,
        new THREE.MeshStandardMaterial({ color: style.body, metalness: style.metal ?? 0.25, roughness: 0.32 }),
      );
    }
    return this.levelMats.get(key);
  }

  badgeMaterial(level) {
    const key = `badge:${level}`;
    if (!this.levelMats.has(key)) {
      this.levelMats.set(
        key,
        new THREE.MeshBasicMaterial({ map: badgeTexture(level, carStyle(level)), transparent: true, depthWrite: false }),
      );
    }
    return this.levelMats.get(key);
  }

  // A standalone car (used for UI icons).
  createDisplayCar(level, kind = 'head') {
    const g = new THREE.Group();
    const mats = this.materials(level, kind);
    g.add(new THREE.Mesh(this.bodyGeo[kind], mats.body));
    if (kind === 'head') {
      g.add(new THREE.Mesh(this.glassGeo, this.glassMat));
      g.add(new THREE.Mesh(this.lightsGeo, this.headLightMat));
    }
    g.add(new THREE.Mesh(this.underGeo, this.underMat));
    g.add(new THREE.Mesh(this.roofGeo[kind], this.roofMat));
    return g;
  }
}
