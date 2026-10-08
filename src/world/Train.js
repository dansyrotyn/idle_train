import * as THREE from 'three';
import { CAR_LENGTH, CAR_PITCH, TRACK_HEIGHT } from '../config.js';
import { easeOutElastic } from '../utils/math.js';

const BOGIE = 1.65; // bogie distance from car center
const _f = { x: 0, z: 0 };
const _r = { x: 0, z: 0 };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

class Car {
  constructor(factory, level) {
    this.factory = factory;
    this.level = level;
    this.kind = null;
    this.pendingLevel = null; // level after an in-flight merge
    this.mergeInto = null; // set while this car slides into its partner

    this.group = new THREE.Group();
    this.pivot = new THREE.Group();
    this.group.add(this.pivot);
    this.body = new THREE.Mesh(factory.bodyGeo.mid);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.glass = new THREE.Mesh(factory.glassGeo, factory.glassMat);
    this.lights = new THREE.Mesh(factory.lightsGeo, factory.headLightMat);
    this.under = new THREE.Mesh(factory.underGeo, factory.underMat);
    this.under.castShadow = true;
    this.roof = new THREE.Mesh(factory.roofGeo.mid, factory.roofMat);
    this.roof.castShadow = true;
    this.badge = new THREE.Mesh(factory.badgeGeo);
    this.badge.position.y = factory.badgeY;
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flash = new THREE.Mesh(factory.bodyGeo.mid, this.flashMat);
    this.flash.scale.setScalar(1.04);
    this.flash.visible = false;
    this.pivot.add(this.body, this.glass, this.lights, this.under, this.roof, this.flash);
    this.group.add(this.badge);

    this.offset = 0; // distance behind the head car
    this.targetOffset = 0;
    this.s = 0; // unwrapped path position of the car center
    this.prevS = 0;
    this.sInit = false;

    this.popT = 1;
    this.popFrom = 1;
    this.flashT = 0;
  }

  setLook(level, kind) {
    if (this.level === level && this.kind === kind) return;
    this.level = level;
    this.kind = kind;
    const base = kind === 'mid' ? 'mid' : 'head';
    const f = this.factory;
    const mats = f.materials(level, base);
    this.body.geometry = f.bodyGeo[base];
    this.body.material = mats.body;
    this.flash.geometry = f.bodyGeo[base];
    this.roof.geometry = f.roofGeo[base];
    this.glass.visible = base === 'head';
    this.lights.visible = base === 'head';
    this.lights.material = kind === 'tail' ? f.tailLightMat : f.headLightMat;
    this.pivot.rotation.y = kind === 'tail' ? Math.PI : 0;
    this.badge.material = mats.badge;
    this.badge.position.z = base === 'head' ? (kind === 'tail' ? -0.35 : 0.35) : 0.5;
  }

  pop(from) {
    this.popFrom = from;
    this.popT = 0;
  }

  dispose() {
    this.flashMat.dispose();
  }
}

// The single train: a list of cars following the head along the track.
export class Train {
  constructor(scene, factory, hooks = {}) {
    this.factory = factory;
    this.hooks = hooks; // { onMergeComplete(car), onCarAppear(car) }
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cars = [];
    this.sliding = [];
    this.headS = 0; // unwrapped distance travelled by the head car's center
    this.path = null;

    this.gangways = new THREE.InstancedMesh(factory.gangwayGeo, factory.gangwayMat, 64);
    this.gangways.count = 0;
    this.gangways.frustumCulled = false;
    this.group.add(this.gangways);

    this.headPos = new THREE.Vector3();
    this.heading = 0; // unwrapped yaw of the head car
    this._lastYaw = null;
  }

  setPath(path) {
    if (this.path) this.headS = (this.path.wrap(this.headS) / this.path.length) * path.length;
    this.path = path;
    for (const c of this.cars) c.sInit = false;
    for (const c of this.sliding) c.sInit = false;
    if (this.cars.length) this.poseAll();
  }

  rebuild(levels) {
    this.finishPending(false);
    for (const c of this.cars) this.disposeCar(c);
    this.cars = levels.map((lvl, i) => {
      const c = this.createCar(lvl);
      c.offset = c.targetOffset = i * CAR_PITCH;
      return c;
    });
    this.refreshKinds();
    if (this.path) this.poseAll();
  }

  levels() {
    return this.cars.map((c) => c.pendingLevel ?? c.level);
  }

  addCar(index, level) {
    this.finishPending(true);
    const car = this.createCar(level);
    this.cars.splice(index, 0, car);
    this.cars.forEach((c, i) => (c.targetOffset = i * CAR_PITCH));
    car.offset = car.targetOffset;
    this.refreshKinds();
    this.poseCar(car);
    car.pop(0);
    car.flashT = 1;
    this.hooks.onCarAppear?.(car);
  }

  merge(index, newLevel) {
    this.finishPending(true);
    const a = this.cars[index];
    const b = this.cars[index + 1];
    if (!a || !b) return false;
    this.cars.splice(index + 1, 1);
    b.mergeInto = a;
    a.pendingLevel = newLevel;
    a.flashT = 1;
    b.flashT = 1;
    this.sliding.push(b);
    this.cars.forEach((c, i) => (c.targetOffset = i * CAR_PITCH));
    this.refreshKinds();
    return true;
  }

  // Completes in-flight merges immediately (used before the next action).
  finishPending(withFx) {
    for (const b of this.sliding) this.completeMerge(b, withFx);
    this.sliding.length = 0;
  }

  completeMerge(b, withFx) {
    const a = b.mergeInto;
    this.disposeCar(b);
    if (a && a.pendingLevel != null) {
      a.setLook(a.pendingLevel, a.kind);
      a.pendingLevel = null;
      a.pop(1.35);
      a.flashT = 1;
      if (withFx) this.hooks.onMergeComplete?.(a);
    }
  }

  createCar(level) {
    const c = new Car(this.factory, level);
    this.group.add(c.group);
    return c;
  }

  disposeCar(c) {
    this.group.remove(c.group);
    c.dispose();
  }

  refreshKinds() {
    const n = this.cars.length;
    this.cars.forEach((c, i) => {
      const kind = i === 0 ? 'head' : i === n - 1 ? 'tail' : 'mid';
      c.setLook(c.level, kind);
    });
  }

  update(dt, speed) {
    if (!this.path) return;
    this.headS += speed * dt;

    const k = 1 - Math.exp(-dt * 5);
    for (const c of this.cars) {
      const d = (c.targetOffset - c.offset) * k;
      const lim = 9 * dt;
      c.offset += d > lim ? lim : d < -lim ? -lim : d;
    }

    for (let i = this.sliding.length - 1; i >= 0; i--) {
      const b = this.sliding[i];
      const target = b.mergeInto.offset;
      const step = 14 * dt;
      b.offset = b.offset - target > step ? b.offset - step : target;
      if (b.offset - target < 0.2) {
        this.completeMerge(b, true);
        this.sliding.splice(i, 1);
      }
    }

    this.poseAll();

    for (const c of this.cars) this.animateCar(c, dt);
    for (const c of this.sliding) this.animateCar(c, dt);

    this.updateGangways();

    const head = this.cars[0];
    if (head) {
      this.headPos.copy(head.group.position);
      const yaw = head.group.rotation.y;
      if (this._lastYaw === null) {
        this.heading = yaw;
      } else {
        let d = yaw - this._lastYaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        this.heading += d;
      }
      this._lastYaw = yaw;
    }
  }

  poseAll() {
    for (const c of this.cars) this.poseCar(c);
    for (const c of this.sliding) this.poseCar(c);
  }

  poseCar(c) {
    const s = this.headS - c.offset;
    c.prevS = c.sInit ? c.s : s;
    c.sInit = true;
    c.s = s;
    const f = this.path.pointAt(s + BOGIE, _f);
    const r = this.path.pointAt(s - BOGIE, _r);
    c.group.position.set((f.x + r.x) / 2, TRACK_HEIGHT, (f.z + r.z) / 2);
    c.group.rotation.y = Math.atan2(f.x - r.x, f.z - r.z);
  }

  animateCar(c, dt) {
    if (c.popT < 1) {
      c.popT = Math.min(1, c.popT + dt / 0.6);
      const e = easeOutElastic(c.popT);
      c.group.scale.setScalar(Math.max(0.001, c.popFrom + (1 - c.popFrom) * e));
    } else if (c.group.scale.x !== 1) {
      c.group.scale.setScalar(1);
    }
    if (c.flashT > 0) {
      c.flashT = Math.max(0, c.flashT - dt * 2.2);
      c.flashMat.opacity = c.flashT * 0.85;
      c.flash.visible = c.flashT > 0.01;
    }
  }

  updateGangways() {
    const cars = this.cars;
    let n = 0;
    for (let i = 0; i < cars.length - 1 && n < 64; i++) {
      const a = cars[i].group;
      const b = cars[i + 1].group;
      const ax = a.position.x - Math.sin(a.rotation.y) * (CAR_LENGTH / 2);
      const az = a.position.z - Math.cos(a.rotation.y) * (CAR_LENGTH / 2);
      const bx = b.position.x + Math.sin(b.rotation.y) * (CAR_LENGTH / 2);
      const bz = b.position.z + Math.cos(b.rotation.y) * (CAR_LENGTH / 2);
      const dist = Math.hypot(ax - bx, az - bz);
      if (dist > 1.2 || a.scale.x < 0.95 || b.scale.x < 0.95) continue;
      _v.set((ax + bx) / 2, TRACK_HEIGHT, (az + bz) / 2);
      _q.setFromAxisAngle(_up, Math.atan2(ax - bx, az - bz));
      _s.set(1, 1, dist + 0.7);
      _m.compose(_v, _q, _s);
      this.gangways.setMatrixAt(n++, _m);
    }
    this.gangways.count = n;
    this.gangways.instanceMatrix.needsUpdate = true;
  }

  // Calls cb(car, gateIndex, times) for every reward line a car passed this frame.
  forEachCrossing(gateS, cb) {
    if (!this.path) return;
    const L = this.path.length;
    for (const c of this.cars) {
      if (c.s <= c.prevS) continue;
      for (let g = 0; g < gateS.length; g++) {
        const sg = gateS[g];
        const times = Math.floor((c.s - sg) / L) - Math.floor((c.prevS - sg) / L);
        if (times > 0) cb(c, g, times);
      }
    }
  }
}
