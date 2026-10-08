import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Renders 3D models into PNG data URLs for the HUD buttons, so the icons
// always match the in-game cars, gates and track.
export class IconRenderer {
  constructor(size = 192) {
    this.size = size;
    this.cache = new Map();
    this.canvas = document.createElement('canvas');
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch (err) {
      console.warn('Icon renderer unavailable', err);
      this.renderer = null;
      return;
    }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x8c7a66, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-3, 6, 4);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 500);
  }

  render(key, object, { yaw = 0.95, pitch = 0.38, pad = 1.04 } = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (!this.renderer) return '';
    this.scene.add(object);
    const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius * pad) / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const c = sphere.center;
    this.camera.position.set(
      c.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      c.y + Math.sin(pitch) * dist,
      c.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(c);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    this.scene.remove(object);
    this.cache.set(key, url);
    return url;
  }
}
