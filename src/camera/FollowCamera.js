import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../utils/math.js';

const DEFAULT = { distance: 36, elevation: 0.52, azOffset: Math.PI + 0.75 };

// Orbit camera that follows the train. Drag rotates, pinch / wheel zooms.
// Close up it turns with the train (chase cam); zoomed out it eases toward the
// loop's center and stays still, so the whole track is easy to watch.
export class FollowCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.azimuth = 0;
    this.elevation = DEFAULT.elevation;
    this.distance = DEFAULT.distance;
    this.targetDistance = DEFAULT.distance;
    this.minDist = 6;
    this.maxDist = 120;
    this.minEl = 0.07;
    this.maxEl = 1.42;
    this.velAz = 0;
    this.velEl = 0;
    this.pointers = new Map();
    this.pinch = null;
    this.lastMove = 0;
    this.target = new THREE.Vector3();
    this.prevHeading = null;
    this.smoothHeading = 0;
    this.initialized = false;
    this.bind();
  }

  setTrackSize(radius) {
    this.maxDist = clamp(radius * 2.4 + 55, 90, 230);
    this.targetDistance = Math.min(this.targetDistance, this.maxDist);
  }

  reset(heading) {
    this.targetDistance = DEFAULT.distance;
    this.elevation = DEFAULT.elevation;
    this.azimuth = heading + DEFAULT.azOffset;
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
        const dAz = (-dx * 3.4) / Math.max(320, el.clientWidth);
        const dEl = (dy * 2.2) / Math.max(480, el.clientHeight);
        this.azimuth += dAz;
        this.elevation = clamp(this.elevation + dEl, this.minEl, this.maxEl);
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
      this.reset(this.smoothHeading);
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

  // trainPos: head car position; heading: unwrapped yaw of the head car.
  update(dt, trainPos, heading, loopCenter) {
    if (!this.initialized) {
      this.initialized = true;
      this.smoothHeading = heading;
      this.prevHeading = heading;
      this.azimuth = heading + DEFAULT.azOffset;
    }

    // Soften corners, then rotate along with the train when zoomed in.
    const prev = this.smoothHeading;
    this.smoothHeading = damp(this.smoothHeading, heading, 2.5, dt);
    const follow = 1 - smoothstep(28, 75, this.distance);
    this.azimuth += (this.smoothHeading - prev) * follow;

    if (this.pointers.size === 0) {
      this.azimuth += this.velAz * dt;
      this.elevation = clamp(this.elevation + this.velEl * dt, this.minEl, this.maxEl);
      const decay = Math.exp(-dt * 4);
      this.velAz *= decay;
      this.velEl *= decay;
    }

    this.distance = damp(this.distance, this.targetDistance, 9, dt);

    const f = smoothstep(40, this.maxDist * 0.9, this.distance);
    this.target.set(
      lerp(trainPos.x, loopCenter.x, f),
      lerp(trainPos.y + 1.8, 4, f),
      lerp(trainPos.z, loopCenter.z, f),
    );

    const ce = Math.cos(this.elevation);
    const cam = this.camera;
    cam.position.set(
      this.target.x + Math.sin(this.azimuth) * ce * this.distance,
      Math.max(1.5, this.target.y + Math.sin(this.elevation) * this.distance),
      this.target.z + Math.cos(this.azimuth) * ce * this.distance,
    );
    cam.lookAt(this.target);
  }
}
