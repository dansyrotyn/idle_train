import * as THREE from 'three';
import { CAR_SPACING, TRACK_HEIGHT } from '../config.js';
import { easeOutElastic } from '../utils/math.js';

const AXLE = 1.3;
const LANE = 1.9; // lateral offset of the convoy's lane from the road centerline // sample distance in front of / behind the car center for heading
const _f = { x: 0, z: 0 };
const _r = { x: 0, z: 0 };

class Car {
  constructor(factory, level) {
    this.factory = factory;
    this.group = new THREE.Group();
    this.model = null;
    this.level = 0;
    this.pendingLevel = null; // level after an in-flight merge
    this.mergeInto = null; // set while this car drives into its partner

    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flash = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.flashMat);
    this.flash.visible = false;
    this.group.add(this.flash);
    this.setLevel(level);

    this.offset = 0; // distance behind the lead car
    this.targetOffset = 0;
    this.s = 0; // unwrapped path position of the car center
    this.prevS = 0;
    this.sInit = false;
    this.popT = 1;
    this.popFrom = 1;
    this.flashT = 0;
  }

  setLevel(level) {
    if (this.level === level) return;
    this.level = level;
    if (this.model) this.group.remove(this.model.group);
    this.model = this.factory.create(level);
    this.group.add(this.model.group);
    this.flash.scale.set(this.model.width + 0.3, 1.9, this.model.length + 0.3);
    this.flash.position.y = 0.95;
  }

  pop(from) {
    this.popFrom = from;
    this.popT = 0;
  }

  dispose() {
    this.flashMat.dispose();
    this.flash.geometry.dispose();
  }
}

// The player's cars: a convoy driving the road loop, evenly spaced behind the lead car.
// Same interface the game used for the train (add / merge / crossings / headPos / heading).
export class Cars {
  constructor(scene, factory, hooks = {}) {
    this.factory = factory;
    this.hooks = hooks; // { onMergeComplete(car), onCarAppear(car) }
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cars = [];
    this.sliding = [];
    this.headS = 0;
    this.path = null;
    this.headPos = new THREE.Vector3();
    this.heading = 0; // unwrapped yaw of the lead car
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
      c.offset = c.targetOffset = i * CAR_SPACING;
      return c;
    });
    if (this.path) this.poseAll();
  }

  addCar(index, level) {
    this.finishPending(true);
    const car = this.createCar(level);
    this.cars.splice(index, 0, car);
    this.cars.forEach((c, i) => (c.targetOffset = i * CAR_SPACING));
    car.offset = car.targetOffset;
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
    this.cars.forEach((c, i) => (c.targetOffset = i * CAR_SPACING));
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
      a.setLevel(a.pendingLevel);
      a.pendingLevel = null;
      a.pop(1.4);
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

  update(dt, speed) {
    if (!this.path) return;
    this.headS += speed * dt;

    const k = 1 - Math.exp(-dt * 4);
    for (const c of this.cars) {
      const d = (c.targetOffset - c.offset) * k;
      const lim = 12 * dt;
      c.offset += d > lim ? lim : d < -lim ? -lim : d;
    }

    // The merging car speeds up and drives into its partner.
    for (let i = this.sliding.length - 1; i >= 0; i--) {
      const b = this.sliding[i];
      const target = b.mergeInto.offset;
      const step = 16 * dt;
      b.offset = b.offset - target > step ? b.offset - step : target;
      if (b.offset - target < 0.3) {
        this.completeMerge(b, true);
        this.sliding.splice(i, 1);
      }
    }

    this.poseAll();
    for (const c of this.cars) this.animateCar(c, dt);
    for (const c of this.sliding) this.animateCar(c, dt);

    const head = this.cars[0];
    if (head) {
      this.headPos.copy(head.group.position);
      const yaw = head.group.rotation.y;
      if (this._lastYaw === null) this.heading = yaw;
      else {
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
    const f = this.path.pointAt(s + AXLE, _f);
    const r = this.path.pointAt(s - AXLE, _r);
    // Right-hand lane: offset to the right of travel (the inside of the loop).
    const dx = f.x - r.x, dz = f.z - r.z;
    const k = LANE / (Math.hypot(dx, dz) || 1);
    c.group.position.set((f.x + r.x) / 2 - dz * k, TRACK_HEIGHT, (f.z + r.z) / 2 + dx * k);
    c.group.rotation.y = Math.atan2(f.x - r.x, f.z - r.z);
    const spin = (c.s - c.prevS) / c.model.wheelR;
    for (const w of c.model.wheels) w.rotation.x += spin;
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
      c.flashMat.opacity = c.flashT * 0.6;
      c.flash.visible = c.flashT > 0.01;
    }
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
