import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_LEVELS } from '../config.js';
import { badgeTexture } from './textures.js';

// Toy 90s cars, one model per level: side profiles extruded across the car width,
// a glass greenhouse, wheels that spin, lights and per-model extras.
// Local frame: +z forward, +x right, y = 0 on the road.

export function carStyle(level) {
  return CAR_LEVELS[Math.min(Math.max(level, 1), CAR_LEVELS.length) - 1];
}

// Model shapes. Lengths in world units; profile points are (forward, up).
// body: lower shell outline, cabin: greenhouse [rearBase, frontBase, frontRoof, rearRoof] + roof height.
const MODELS = {
  // 1 — rusty bug: round body, round roof, steel wheels, rust patches.
  beater: {
    len: 3.6, width: 1.8, wheelR: 0.42, wheelbase: 2.3, clearance: 0.24, rim: 'steel',
    body: [[-1.8, 0.25], [1.8, 0.25], [1.8, 0.55], [1.6, 0.8], [1.1, 0.95], [-1.3, 0.98], [-1.7, 0.85], [-1.8, 0.6]],
    cabin: { base: 0.95, roof: 1.75, x: [-1.35, 0.85, 0.15, -0.85] },
    extras: ['bumpers', 'mirrors', 'rust', 'roofRack'],
  },
  // 2 — 80s family wagon with wood panels and a roof rack.
  sedan: {
    len: 4.6, width: 1.95, wheelR: 0.42, wheelbase: 2.8, clearance: 0.22, rim: 'hub',
    body: [[-2.3, 0.25], [2.3, 0.25], [2.3, 0.7], [1.95, 0.92], [-2.25, 0.95], [-2.3, 0.72]],
    cabin: { base: 0.92, roof: 1.65, x: [-2.2, 1.0, 0.45, -2.15] },
    extras: ['bumpers', 'mirrors', 'wood', 'roofRack'],
  },
  // 3 — Checker-style yellow cab.
  taxi: {
    len: 4.7, width: 1.95, wheelR: 0.42, wheelbase: 2.8, clearance: 0.22, rim: 'hub',
    body: [[-2.35, 0.25], [2.35, 0.25], [2.35, 0.72], [2.0, 0.94], [-2.25, 0.96], [-2.35, 0.74]],
    cabin: { base: 0.94, roof: 1.68, x: [-1.45, 1.0, 0.5, -1.05] },
    extras: ['taxiSign', 'checker', 'chromeBumpers', 'mirrors'],
  },
  // 4 — boxy hot hatch: fog lights, roof spoiler, rally stripes.
  hothatch: {
    len: 3.9, width: 1.95, wheelR: 0.44, wheelbase: 2.45, clearance: 0.2, rim: 'white',
    body: [[-1.95, 0.22], [1.95, 0.22], [1.95, 0.68], [1.6, 0.9], [-1.9, 0.95], [-1.95, 0.72]],
    cabin: { base: 0.9, roof: 1.6, x: [-1.9, 0.85, 0.2, -1.75] },
    extras: ['roofSpoiler', 'stripes', 'fogLights', 'bumpers', 'mirrors', 'flares'],
  },
  // 5 — muscle car: hood scoop, side pipes, fat rear tires.
  muscle: {
    len: 4.9, width: 2.05, wheelR: 0.46, wheelbase: 2.9, clearance: 0.2, rim: 'chrome', fatRear: true,
    body: [[-2.45, 0.22], [2.45, 0.22], [2.45, 0.7], [2.3, 0.88], [-2.3, 0.92], [-2.45, 0.82]],
    cabin: { base: 0.9, roof: 1.45, x: [-1.55, 0.55, -0.05, -1.2] },
    extras: ['stripes', 'duckTail', 'scoop', 'sidePipes', 'chromeBumpers'],
  },
  // 6 — 90s Japanese coupe: pop-up headlights, wing.
  jdm: {
    len: 4.5, width: 2.0, wheelR: 0.44, wheelbase: 2.6, clearance: 0.14, rim: 'gold',
    body: [[-2.25, 0.18], [2.25, 0.18], [2.25, 0.48], [1.7, 0.76], [-2.2, 0.85], [-2.25, 0.62]],
    cabin: { base: 0.8, roof: 1.32, x: [-1.35, 0.7, 0.05, -0.85] },
    extras: ['wing', 'popups', 'mirrors', 'skirts'],
  },
  // 7 — street tuner: neon underglow, huge wing, flares, big exhaust.
  tuned: {
    len: 4.6, width: 2.15, wheelR: 0.46, wheelbase: 2.6, clearance: 0.1, rim: 'neon',
    body: [[-2.3, 0.14], [2.3, 0.14], [2.3, 0.48], [1.7, 0.76], [-2.25, 0.84], [-2.3, 0.6]],
    cabin: { base: 0.78, roof: 1.28, x: [-1.35, 0.7, 0.05, -0.85] },
    extras: ['bigWing', 'underglow', 'stripes', 'flares', 'skirts', 'exhaust', 'scoop'],
  },
  // 8 — stretch limo with chrome and fender flags.
  limo: {
    len: 6.8, width: 2.05, wheelR: 0.42, wheelbase: 4.8, clearance: 0.22, rim: 'chrome',
    body: [[-3.4, 0.25], [3.4, 0.25], [3.4, 0.72], [3.05, 0.92], [-3.3, 0.95], [-3.4, 0.74]],
    cabin: { base: 0.92, roof: 1.62, x: [-2.5, 2.05, 1.5, -2.1] },
    extras: ['chrome', 'chromeBumpers', 'flags', 'antenna', 'mirrors'],
  },
  // 9 — wedge supercar: side intakes, louvers, giant wing.
  supercar: {
    len: 4.7, width: 2.2, wheelR: 0.46, wheelbase: 2.75, clearance: 0.12, rim: 'gold', fatRear: true,
    body: [[-2.35, 0.16], [2.35, 0.16], [2.35, 0.34], [0.5, 0.76], [-2.3, 0.9], [-2.35, 0.6]],
    cabin: { base: 0.74, roof: 1.16, x: [-1.2, 1.05, 0.1, -0.65] },
    extras: ['bigWing', 'stripes', 'intakes', 'louvers', 'popups', 'exhaust'],
  },
};

function shapeFrom(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

// Extrude a side profile across the car; shape x → forward (+z).
function extrudeSide(points, width, bevel = 0.08) {
  const depth = Math.max(0.05, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shapeFrom(points), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2);
  return toCreasedNormals(geo, Math.PI / 5);
}

function boxGeo(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export class CarModelFactory {
  constructor() {
    this.mats = {
      glass: new THREE.MeshStandardMaterial({ color: 0x1d2a3a, metalness: 0.5, roughness: 0.15 }),
      tire: new THREE.MeshLambertMaterial({ color: 0x1e1f23 }),
      hub: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8, roughness: 0.3 }),
      head: new THREE.MeshBasicMaterial({ color: 0xfff4cf }),
      tail: new THREE.MeshBasicMaterial({ color: 0xff3030 }),
      dark: new THREE.MeshLambertMaterial({ color: 0x23262d }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xe6ebf2, metalness: 0.95, roughness: 0.15 }),
      taxiSign: new THREE.MeshBasicMaterial({ color: 0xfff6c4 }),
      checker: new THREE.MeshBasicMaterial({ map: checkerTexture() }),
      rust: new THREE.MeshLambertMaterial({ color: 0x8a4b2a }),
      primer: new THREE.MeshLambertMaterial({ color: 0x8f969c }),
      luggage: new THREE.MeshLambertMaterial({ color: 0x6e4a2f }),
      wood: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
      fog: new THREE.MeshBasicMaterial({ color: 0xfff27a }),
      flagBlue: new THREE.MeshBasicMaterial({ color: 0x2f5bb7 }),
    };
    this.rims = {
      steel: new THREE.MeshLambertMaterial({ color: 0xe9e4d8 }),
      hub: new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8, roughness: 0.3 }),
      white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xe6ebf2, metalness: 0.95, roughness: 0.15 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.85, roughness: 0.25 }),
      neon: new THREE.MeshBasicMaterial({ color: 0x2ee6ff }),
    };
    this.wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
    this.wheelGeo.rotateZ(Math.PI / 2);
    this.hubGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.04, 10);
    this.hubGeo.rotateZ(Math.PI / 2);
    this.badgeGeo = new THREE.PlaneGeometry(0.85, 0.85);
    this.badgeGeo.rotateX(-Math.PI / 2);
    this.cache = new Map(); // level → { geos, mats, model }
  }

  parts(level) {
    if (this.cache.has(level)) return this.cache.get(level);
    const style = carStyle(level);
    const m = MODELS[style.model];
    const W = m.width;
    const paint = new THREE.MeshStandardMaterial({ color: style.body, metalness: style.metal ?? 0.3, roughness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color: style.stripe, metalness: 0.2, roughness: 0.4 });
    const glow = style.glow ? new THREE.MeshBasicMaterial({ color: style.glow, transparent: true, opacity: 0.85 }) : null;
    const badge = new THREE.MeshBasicMaterial({ map: badgeTexture(level, style), transparent: true, depthWrite: false });

    const y0 = m.clearance;
    const lift = (pts) => pts.map(([x, y]) => [x, y + y0]);
    const body = extrudeSide(lift(m.body), W);
    const c = m.cabin;
    const [r0, f0, f1, r1] = c.x;
    const cabinPts = lift([[r0, c.base], [f0, c.base], [f1, c.roof], [r1, c.roof]]);
    const glass = extrudeSide(cabinPts, W - 0.22, 0.05);
    const roof = extrudeSide(lift([[r1 - 0.04, c.roof - 0.02], [f1 + 0.04, c.roof - 0.02], [f1, c.roof + 0.08], [r1, c.roof + 0.08]]), W - 0.3, 0.04);

    const L = m.len;
    const frontY = y0 + (m.body[2][1] + m.body[1][1]) / 2 + 0.08;
    const rearY = y0 + (m.body[5][1] + m.body[0][1]) / 2 + 0.12;
    const lights = {
      head: [boxGeo(0.42, 0.14, 0.06, -W / 2 + 0.38, frontY, L / 2 + 0.06), boxGeo(0.42, 0.14, 0.06, W / 2 - 0.38, frontY, L / 2 + 0.06)],
      tail: [boxGeo(0.42, 0.14, 0.06, -W / 2 + 0.38, rearY, -L / 2 - 0.06), boxGeo(0.42, 0.14, 0.06, W / 2 - 0.38, rearY, -L / 2 - 0.06)],
    };

    const extras = [];
    const add = (geo, mat) => extras.push({ geo, mat });
    const roofTop = y0 + c.roof + 0.08;
    const roofMid = (f1 + r1) / 2;
    for (const e of m.extras ?? []) {
      if (e === 'taxiSign') add(boxGeo(0.9, 0.26, 0.32, 0, roofTop + 0.13, roofMid), this.mats.taxiSign);
      if (e === 'checker') {
        const beltY = y0 + c.base - 0.16;
        add(boxGeo(0.02, 0.16, L * 0.62, W / 2 + 0.07, beltY, 0), this.mats.checker);
        add(boxGeo(0.02, 0.16, L * 0.62, -W / 2 - 0.07, beltY, 0), this.mats.checker);
      }
      if (e === 'stripes') {
        const hoodY = y0 + m.body[3][1] + 0.09;
        add(boxGeo(0.22, 0.02, L * 0.42, -0.2, hoodY, L * 0.27), accent);
        add(boxGeo(0.22, 0.02, L * 0.42, 0.2, hoodY, L * 0.27), accent);
        add(boxGeo(0.22, 0.02, (f1 - r1) + 0.1, -0.2, roofTop + 0.01, roofMid), accent);
        add(boxGeo(0.22, 0.02, (f1 - r1) + 0.1, 0.2, roofTop + 0.01, roofMid), accent);
      }
      if (e === 'roofSpoiler') add(boxGeo(W - 0.4, 0.08, 0.4, 0, roofTop + 0.04, r1 - 0.1), paint);
      if (e === 'duckTail') add(boxGeo(W - 0.2, 0.12, 0.3, 0, y0 + m.body[4][1] + 0.1, -L / 2 + 0.2), paint);
      if (e === 'scoop') add(boxGeo(0.6, 0.16, 0.9, 0, y0 + m.body[3][1] + 0.12, L * 0.22), this.mats.dark);
      if (e === 'wing' || e === 'bigWing') {
        const big = e === 'bigWing';
        const h = big ? 0.55 : 0.32;
        const deckY = y0 + m.body[4][1] + 0.05;
        add(boxGeo(W - 0.1, 0.07, big ? 0.55 : 0.42, 0, deckY + h, -L / 2 + 0.35), big ? accent : paint);
        add(boxGeo(0.08, h, 0.25, -W / 2 + 0.35, deckY + h / 2, -L / 2 + 0.35), this.mats.dark);
        add(boxGeo(0.08, h, 0.25, W / 2 - 0.35, deckY + h / 2, -L / 2 + 0.35), this.mats.dark);
      }
      if (e === 'underglow' && glow) add(boxGeo(W + 0.3, 0.04, L - 0.2, 0, 0.04, 0), glow);
      if (e === 'bumpers' || e === 'chromeBumpers') {
        const mat = e === 'bumpers' ? this.mats.dark : this.mats.chrome;
        add(boxGeo(W + 0.1, 0.2, 0.22, 0, y0 + 0.32, L / 2 + 0.04), mat);
        add(boxGeo(W + 0.1, 0.2, 0.22, 0, y0 + 0.32, -L / 2 - 0.04), mat);
      }
      if (e === 'mirrors') {
        for (const sx of [-1, 1]) add(boxGeo(0.22, 0.16, 0.12, sx * (W / 2 + 0.08), y0 + c.base + 0.12, f0 - 0.1), paint);
      }
      if (e === 'rust') {
        add(boxGeo(0.02, 0.3, 0.6, W / 2 + 0.07, y0 + 0.55, -0.9), this.mats.rust);
        add(boxGeo(0.02, 0.22, 0.4, -W / 2 - 0.07, y0 + 0.45, 1.1), this.mats.rust);
        add(boxGeo(0.02, 0.5, 0.9, -W / 2 - 0.07, y0 + 0.6, -0.2), this.mats.primer); // mismatched door
        add(boxGeo(0.5, 0.02, 0.4, 0.3, y0 + m.body[4][1] + 0.08, 1.35), this.mats.rust);
      }
      if (e === 'roofRack') {
        for (const sx of [-1, 1]) add(boxGeo(0.08, 0.08, (f1 - r1) * 0.95, sx * (W / 2 - 0.3), roofTop + 0.12, roofMid), this.mats.dark);
        for (const z of [-0.35, 0.35]) add(boxGeo(W - 0.5, 0.06, 0.08, 0, roofTop + 0.12, roofMid + z * (f1 - r1)), this.mats.dark);
        if (m === MODELS.beater) add(boxGeo(0.9, 0.35, 0.7, 0, roofTop + 0.33, roofMid), this.mats.luggage);
      }
      if (e === 'wood') {
        for (const sx of [-1, 1]) add(boxGeo(0.02, 0.32, L * 0.78, sx * (W / 2 + 0.07), y0 + 0.62, -0.05), this.mats.wood);
      }
      if (e === 'fogLights') {
        for (const sx of [-1, 1]) add(boxGeo(0.26, 0.2, 0.08, sx * 0.4, y0 + 0.36, L / 2 + 0.17), this.mats.fog);
      }
      if (e === 'flares') {
        for (const sx of [-1, 1]) {
          for (const z of [m.wheelbase / 2, -m.wheelbase / 2]) add(boxGeo(0.22, 0.14, m.wheelR * 2.6, sx * (W / 2 + 0.06), y0 + m.wheelR * 1.55, z), paint);
        }
      }
      if (e === 'skirts') {
        for (const sx of [-1, 1]) add(boxGeo(0.12, 0.14, m.wheelbase - m.wheelR * 2.4, sx * (W / 2 + 0.02), y0 + 0.2, 0), accent);
      }
      if (e === 'sidePipes') {
        for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.09, 0.09, m.wheelbase - 1, 8).rotateX(Math.PI / 2).translate(sx * (W / 2 + 0.12), y0 + 0.16, 0), this.mats.chrome);
      }
      if (e === 'exhaust') {
        for (const sx of [-0.35, 0.35]) add(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10).rotateX(Math.PI / 2).translate(sx, y0 + 0.3, -L / 2 - 0.1), this.mats.chrome);
      }
      if (e === 'popups') {
        for (const sx of [-1, 1]) {
          const z = L / 2 - 0.55;
          const y = y0 + m.body[3][1] * 0.7 + 0.22;
          add(boxGeo(0.5, 0.24, 0.32, sx * (W / 2 - 0.42), y, z), paint);
          add(boxGeo(0.42, 0.18, 0.02, sx * (W / 2 - 0.42), y, z + 0.17), this.mats.head);
        }
      }
      if (e === 'intakes') {
        for (const sx of [-1, 1]) add(boxGeo(0.03, 0.3, 0.9, sx * (W / 2 + 0.06), y0 + 0.5, -0.75), this.mats.dark);
      }
      if (e === 'louvers') {
        for (let k = 0; k < 4; k++) add(boxGeo(W - 0.6, 0.04, 0.08, 0, y0 + m.body[4][1] - 0.05 - k * 0.02, r1 - 0.25 - k * 0.22), this.mats.dark);
      }
      if (e === 'flags') {
        for (const sx of [-1, 1]) {
          add(boxGeo(0.03, 0.4, 0.03, sx * (W / 2 - 0.2), y0 + m.body[3][1] + 0.25, L / 2 - 0.4), this.mats.chrome);
          add(boxGeo(0.02, 0.18, 0.28, sx * (W / 2 - 0.2), y0 + m.body[3][1] + 0.38, L / 2 - 0.55), sx < 0 ? this.mats.tail : this.mats.flagBlue);
        }
      }
      if (e === 'antenna') add(boxGeo(0.03, 0.8, 0.03, 0.4, roofTop + 0.4, r1 + 0.2), this.mats.dark);
      if (e === 'chrome') {
        add(boxGeo(W + 0.04, 0.12, 0.12, 0, y0 + 0.32, L / 2 + 0.04), this.mats.chrome);
        add(boxGeo(W + 0.04, 0.12, 0.12, 0, y0 + 0.32, -L / 2 - 0.04), this.mats.chrome);
        add(boxGeo(0.04, 0.06, L * 0.9, W / 2 + 0.06, y0 + 0.62, 0), this.mats.chrome);
        add(boxGeo(0.04, 0.06, L * 0.9, -W / 2 - 0.06, y0 + 0.62, 0), this.mats.chrome);
      }
    }

    const wheels = [];
    for (const z of [m.wheelbase / 2, -m.wheelbase / 2]) {
      const fat = m.fatRear && z < 0;
      for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) wheels.push({ x: x + Math.sign(x) * (fat ? 0.06 : 0), z, w: fat ? 0.55 : 0.42 });
    }
    const p = { m, body, glass, roof, lights, extras, wheels, paint, badge, roofTop };
    this.cache.set(level, p);
    return p;
  }

  // Builds a car. Returns { group, wheels: Object3D[], wheelR, length, width }.
  create(level) {
    const p = this.parts(level);
    const g = new THREE.Group();
    const mesh = (geo, mat, shadow = true) => {
      const o = new THREE.Mesh(geo, mat);
      o.castShadow = shadow;
      g.add(o);
      return o;
    };
    mesh(p.body, p.paint).receiveShadow = true;
    mesh(p.glass, this.mats.glass);
    mesh(p.roof, p.paint);
    for (const geo of p.lights.head) mesh(geo, this.mats.head, false);
    for (const geo of p.lights.tail) mesh(geo, this.mats.tail, false);
    for (const e of p.extras) mesh(e.geo, e.mat, e.mat.transparent !== true);
    const wheels = p.wheels.map(({ x, z, w: tw }) => {
      const w = new THREE.Group();
      w.position.set(x, p.m.wheelR, z);
      w.scale.set(tw, p.m.wheelR, p.m.wheelR);
      const tire = new THREE.Mesh(this.wheelGeo, this.mats.tire);
      tire.castShadow = true;
      w.add(tire, new THREE.Mesh(this.hubGeo, this.rims[p.m.rim] ?? this.mats.hub));
      g.add(w);
      return w;
    });
    const badge = new THREE.Mesh(this.badgeGeo, p.badge);
    badge.position.y = p.roofTop + 0.09 + (p.m.extras?.includes('taxiSign') ? 0.28 : 0);
    badge.position.z = (p.m.cabin.x[2] + p.m.cabin.x[3]) / 2;
    badge.renderOrder = 2;
    g.add(badge);
    return { group: g, wheels, wheelR: p.m.wheelR, length: p.m.len, width: p.m.width };
  }

  // A standalone car for UI icons (no badge).
  createDisplayCar(level) {
    const car = this.create(level);
    car.group.children.filter((o) => o.material === this.parts(level).badge).forEach((o) => car.group.remove(o));
    return car.group;
  }
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      ctx.fillRect(i * 4, j * 4, 4, 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  t.magFilter = THREE.NearestFilter;
  return t;
}
