import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../utils/math.js';

// Default view: low and from the south, so facades, the street walls and the skyline show.
export const VIEW = { fov: 55, pitch: 0.42, az: 0.22, cap: 125 };
const AZ_RANGE = 0.6;
const PITCH_MIN = 0.2;
const PITCH_MAX = 1.05;

// How much the camera chases the lead car at distance D when the whole loop needs fitD.
export function followFactor(fitD, D) {
  return smoothstep(0, 1, clamp((fitD - D) / (fitD * 0.55), 0, 1));
}

// Smallest camera distance (and target) that frames the whole road loop inside the safe
// part of a portrait screen (between the HUD and the buttons).
export function fitView(path, aspect, { az = VIEW.az, pitch = VIEW.pitch, fov = VIEW.fov } = {}) {
  const pts = [];
  const p = { x: 0, z: 0 }, t = { x: 0, z: 0 };
  for (let s = 0; s < path.length; s += 2) {
    path.pointAt(s, p);
    path.tangentAt(s, t);
    for (const o of [-4.4, 4.4]) pts.push(p.x - t.z * o, p.z + t.x * o);
  }
  const sa = Math.sin(az), ca = Math.cos(az), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const tanY = Math.tan((fov * Math.PI) / 360), tanX = tanY * aspect;
  const Y = 0.6;
  const fits = (tx, tz, D) => {
    const cx = tx + sa * cp * D, cy = Y + sp * D, cz = tz + ca * cp * D;
    for (let i = 0; i < pts.length; i += 2) {
      const vx = pts[i] - cx, vy = Y - cy, vz = pts[i + 1] - cz;
      const zc = -(vx * sa * cp + vy * sp + vz * ca * cp);
      if (zc < 1) return false;
      const xc = (vx * ca - vz * sa) / (zc * tanX);
      if (xc < -0.92 || xc > 0.92) return false;
      const yc = (-vx * sa * sp + vy * cp - vz * ca * sp) / (zc * tanY);
      if (yc < -0.42 || yc > 0.45) return false;
    }
    return true;
  };
  let best = null;
  const R = path.radius;
  for (let fi = -4; fi <= 4; fi++) {
    for (let li = -2; li <= 2; li++) {
      const f = fi * R * 0.08, l = li * R * 0.06;
      const tx = path.center.x - sa * f + ca * l, tz = path.center.z - ca * f - sa * l;
      let lo = 5, hi = 3000;
      if (!fits(tx, tz, hi)) continue;
      for (let it = 0; it < 22; it++) {
        const mid = (lo + hi) / 2;
        if (fits(tx, tz, mid)) hi = mid;
        else lo = mid;
      }
      if (!best || hi < best.distance) best = { target: { x: tx, y: Y, z: tz }, distance: hi };
    }
  }
  best ??= { target: { x: path.center.x, y: Y, z: path.center.z }, distance: 3000 };
  best.az = az;
  best.pitch = pitch;
  return best;
}

// Orbit camera over the loop. By default it frames the whole loop from the south; zoomed
// in (or on loops too wide for the screen) it chases the lead car. Drag orbits a little,
// pinch / wheel zooms, double tap resets.
export class FollowCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.az = VIEW.az;
    this.pitch = VIEW.pitch;
    this.distance = 80;
    this.targetDistance = 80;
    this.minDist = 14;
    this.maxDist = 300;
    this.velAz = 0;
    this.velEl = 0;
    this.pointers = new Map();
    this.pinch = null;
    this.lastMove = 0;
    this.target = new THREE.Vector3();
    this.path = null;
    this.fit = null;
    this.aspect = 0;
    this.heightAt = null;
    this.initialized = false;
    this.bind();
  }

  setTrack(path, heightAt = null) {
    const keep = this.fit ? this.targetDistance / this.defaultDist : 1;
    this.path = path;
    this.heightAt = heightAt;
    this.refit();
    this.targetDistance = clamp(this.defaultDist * keep, this.minDist, this.maxDist);
  }

  refit() {
    this.aspect = this.camera.aspect;
    this.fit = fitView(this.path, this.aspect);
    this.defaultDist = Math.min(this.fit.distance, VIEW.cap);
    this.maxDist = Math.max(this.defaultDist, this.fit.distance * 1.1);
  }

  reset() {
    this.targetDistance = this.defaultDist;
    this.az = VIEW.az;
    this.pitch = VIEW.pitch;
    this.velAz = this.velEl = 0;
  }

  bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
      this.velAz = this.velEl = 0;
      this.lastMove = performance.now();
      if (this.pointers.size === 2) this.startPinch();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        const dAz = (-dx * 2.4) / Math.max(320, el.clientWidth);
        const dEl = (dy * 1.6) / Math.max(480, el.clientHeight);
        this.az = clamp(this.az + dAz, VIEW.az - AZ_RANGE, VIEW.az + AZ_RANGE);
        this.pitch = clamp(this.pitch + dEl, PITCH_MIN, PITCH_MAX);
        const now = performance.now();
        const dt = Math.max(8, now - this.lastMove) / 1000;
        this.lastMove = now;
        this.velAz = lerp(this.velAz, dAz / dt, 0.5);
        this.velEl = lerp(this.velEl, dEl / dt, 0.5);
      } else if (this.pointers.size === 2) {
        this.updatePinch();
      }
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (e.type === 'pointerup') this.detectDoubleTap(p);
      if (this.pointers.size < 2) this.pinch = null;
      if (performance.now() - this.lastMove > 90) this.velAz = this.velEl = 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const k = e.ctrlKey ? 0.01 : 0.0012; // trackpad pinch arrives as ctrl+wheel
        this.targetDistance = clamp(this.targetDistance * Math.exp(e.deltaY * k), this.minDist, this.maxDist);
      },
      { passive: false },
    );
  }

  // Mobile browsers don't reliably fire dblclick, so detect double taps by hand.
  detectDoubleTap(p) {
    const now = performance.now();
    const isTap = now - p.t0 < 250 && Math.hypot(p.x - p.x0, p.y - p.y0) < 10;
    if (!isTap) return;
    if (this.lastTap && now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 40) {
      this.reset();
      this.lastTap = null;
      return;
    }
    this.lastTap = { t: now, x: p.x, y: p.y };
  }

  pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  startPinch() {
    this.pinch = { start: this.pinchDistance(), dist: this.targetDistance };
  }

  updatePinch() {
    if (!this.pinch) this.startPinch();
    const ratio = this.pinch.start / this.pinchDistance();
    this.targetDistance = clamp(this.pinch.dist * ratio, this.minDist, this.maxDist);
  }

  // trainPos: lead car position.
  update(dt, trainPos) {
    if (!this.path) return;
    if (Math.abs(this.camera.aspect - this.aspect) > 0.005) {
      const keep = this.targetDistance / this.defaultDist;
      this.refit();
      this.targetDistance = clamp(this.defaultDist * keep, this.minDist, this.maxDist);
    }

    if (this.pointers.size === 0) {
      this.az = clamp(this.az + this.velAz * dt, VIEW.az - AZ_RANGE, VIEW.az + AZ_RANGE);
      this.pitch = clamp(this.pitch + this.velEl * dt, PITCH_MIN, PITCH_MAX);
      const decay = Math.exp(-dt * 4);
      this.velAz *= decay;
      this.velEl *= decay;
    }

    this.distance = damp(this.distance, this.targetDistance, 9, dt);

    // Chase the lead car when zoomed in past the whole-loop view.
    const fit = this.fit;
    const f = followFactor(fit.distance, this.distance);
    const tx = lerp(fit.target.x, trainPos.x, f);
    const ty = lerp(fit.target.y, trainPos.y + 1.2, f);
    const tz = lerp(fit.target.z, trainPos.z, f);
    if (!this.initialized) {
      this.initialized = true;
      this.distance = this.targetDistance;
      this.target.set(tx, ty, tz);
    } else {
      const k = 1 - Math.exp(-dt * 5);
      this.target.x += (tx - this.target.x) * k;
      this.target.y += (ty - this.target.y) * k;
      this.target.z += (tz - this.target.z) * k;
    }

    const pitch = this.pitch + f * 0.12;
    const cp = Math.cos(pitch);
    const cam = this.camera;
    cam.position.set(
      this.target.x + Math.sin(this.az) * cp * this.distance,
      this.target.y + Math.sin(pitch) * this.distance,
      this.target.z + Math.cos(this.az) * cp * this.distance,
    );
    if (this.heightAt) cam.position.y = Math.max(cam.position.y, this.heightAt(cam.position.x, cam.position.z) + 2.5);
    cam.position.y = Math.max(cam.position.y, 1.5);
    cam.lookAt(this.target);
  }
}
