import * as THREE from 'three';
import { RNG } from '../utils/rng.js';

// Street furniture along the player's loop: lamp posts, a subway entrance and
// sidewalk props (hydrants, mailboxes, newspaper boxes, phone booths, benches).
export class Frontage {
  constructor({ slabH, floorH }) {
    this.slabH = slabH;
    this.floorH = floorH;
  }

  // Old green cast-iron lamp posts with glowing globes on both curbs.
  lamps(path, excluded, props) {
    const y = this.slabH;
    const globes = [new THREE.SphereGeometry(0.01)];
    const p = { x: 0, z: 0 };
    const t = { x: 0, z: 0 };
    let subway = false;
    for (let s = 0; s < path.length; s += 11) {
      path.pointAt(s, p);
      path.tangentAt(s, t);
      for (const side of [1, -1]) {
        const x = p.x - t.z * side * 4.8;
        const z = p.z + t.x * side * 4.8;
        if (excluded(x, z, 0.5)) continue;
        props.addGeometry(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 8).translate(x, y + 0.25, z), 0x1f4d3d);
        props.addGeometry(new THREE.CylinderGeometry(0.08, 0.11, 3.6, 8).translate(x, y + 2.1, z), 0x1f4d3d);
        props.addGeometry(new THREE.CylinderGeometry(0.26, 0.14, 0.25, 8).translate(x, y + 3.95, z), 0x1f4d3d);
        globes.push(new THREE.SphereGeometry(0.34, 10, 8).translate(x, y + 4.35, z));
      }
      // One subway entrance on the outer sidewalk.
      if (!subway && s > path.length * 0.3) {
        const side = path.outwardSide(s);
        const x = p.x - t.z * side * 9.5;
        const z = p.z + t.x * side * 9.5;
        if (excluded(x, z, 2) || path.distanceTo(x, z) < 8) continue;
        subway = true;
        const ry = Math.atan2(t.x, t.z);
        const at = (u, v) => [x + Math.cos(ry) * u + Math.sin(ry) * v, z - Math.sin(ry) * u + Math.cos(ry) * v];
        for (const u of [-1.3, 1.3]) {
          const [rx, rz] = at(u, 0);
          props.add(0.12, 1.1, 4, rx, y + 0.55, rz, 0x1f4d3d, ry);
          const [gx, gz] = at(u, 1.9);
          props.add(0.25, 2.2, 0.25, gx, y + 1.1, gz, 0x1f4d3d, ry);
          globes.push(new THREE.SphereGeometry(0.3, 10, 8).translate(gx, y + 2.45, gz));
        }
        const [bx, bz] = at(0, -1.9);
        props.add(2.7, 1.1, 0.12, bx, y + 0.55, bz, 0x1f4d3d, ry);
        const [sx, sz] = at(0, 0);
        props.add(2.4, 0.1, 3.6, sx, y + 0.02, sz, 0x2a2a30, ry); // stair hole
        const [hx, hz] = at(0, 1.9);
        props.add(2.0, 0.6, 0.15, hx, y + 1.7, hz, 0x1c1f26, ry);
      }
    }
    return globes;
  }

  sidewalk(path, excluded, props) {
    const y = this.slabH;
    const rng = new RNG(777);
    const p = { x: 0, z: 0 };
    const t = { x: 0, z: 0 };
    const kinds = ['hydrant', 'mailbox', 'news', 'trash', 'booth', 'bench', 'hydrant', 'trash'];
    for (let s = 3; s < path.length; s += 6.5) {
      path.pointAt(s, p);
      path.tangentAt(s, t);
      for (const side of [1, -1]) {
        if (rng.chance(0.35)) continue;
        const x = p.x - t.z * side * 6.2;
        const z = p.z + t.x * side * 6.2;
        if (excluded(x, z, 1) || path.distanceTo(x, z) < 5.5) continue;
        const ry = Math.atan2(t.z * side, -t.x * side); // local +z faces the road
        const add = (w, h, d, ox, oy, color) => props.add(w, h, d, x + ox * Math.cos(ry), y + oy, z - ox * Math.sin(ry), color, ry);
        switch (rng.pick(kinds)) {
          case 'hydrant':
            props.addGeometry(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 8).translate(x, y + 0.4, z), 0xd8342b);
            props.addGeometry(new THREE.SphereGeometry(0.24, 8, 4).translate(x, y + 0.82, z), 0xd8342b);
            add(0.7, 0.14, 0.14, 0, 0.55, 0xb82a22);
            break;
          case 'mailbox':
            add(0.7, 1.0, 0.6, 0, 0.75, 0x2f5bb7);
            add(0.72, 0.25, 0.62, 0, 1.3, 0x2a50a3);
            add(0.6, 0.25, 0.5, 0, 0.12, 0x23262c);
            break;
          case 'news':
            add(0.75, 1.1, 0.6, -0.42, 0.55, 0xf2c14e);
            add(0.75, 1.1, 0.6, 0.42, 0.55, 0xd8342b);
            break;
          case 'trash':
            props.addGeometry(new THREE.CylinderGeometry(0.35, 0.3, 0.95, 10).translate(x, y + 0.48, z), 0x3d7a46);
            break;
          case 'booth':
            add(1.1, 2.4, 1.1, 0, 1.2, 0xb9c0c8);
            add(0.95, 1.5, 1.14, 0, 1.25, 0x3c6fa8);
            add(1.2, 0.35, 1.2, 0, 2.55, 0x2f5bb7);
            break;
          case 'bench':
            add(2.2, 0.12, 0.6, 0, 0.5, 0x8b5a2b);
            add(2.2, 0.5, 0.1, 0, 0.8, 0x8b5a2b);
            add(0.1, 0.5, 0.5, -1, 0.25, 0x30343c);
            add(0.1, 0.5, 0.5, 1, 0.25, 0x30343c);
            break;
        }
      }
    }
  }
}
