import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RNG } from '../utils/rng.js';

const HORIZON = new THREE.Color(0xd9f0ff);
const ZENITH = new THREE.Color(0x4fa8f0);
const SUN_DIR = new THREE.Vector3(-0.45, 0.82, 0.36).normalize();

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

// Lights, sky dome, haze and drifting clouds. The sun's shadow box follows the camera target.
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    scene.fog = new THREE.Fog(HORIZON.clone(), 150, 750);

    this.hemi = new THREE.HemisphereLight(0xd6ecff, 0xb7a68c, 1.55);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 600;
    this.shadowHalf = 0;
    this.setShadowHalf(60);
    scene.add(this.sun, this.sun.target);

    this.sky = this.createSky();
    scene.add(this.sky);
    this.clouds = this.createClouds();
    scene.add(this.clouds);
  }

  createSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        horizon: { value: HORIZON },
        zenith: { value: ZENITH },
        sunDir: { value: SUN_DIR },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 horizon;
        uniform vec3 zenith;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 400.0) * 1.5 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    return sky;
  }

  createClouds() {
    const group = new THREE.Group();
    const rng = new RNG(77);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.45, fog: false });
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const n = rng.int(4, 7);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(puff, mat);
        const s = rng.float(14, 26);
        m.scale.set(s * 1.3, s * 0.8, s);
        m.position.set((k - n / 2) * rng.float(12, 18), rng.float(-4, 6), rng.float(-8, 8));
        cloud.add(m);
      }
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(520, 820);
      cloud.position.set(Math.cos(a) * r, rng.float(140, 260), Math.sin(a) * r);
      cloud.userData.speed = rng.float(1.5, 4);
      group.add(cloud);
    }
    return group;
  }

  setShadowHalf(half) {
    if (Math.abs(half - this.shadowHalf) < 2) return;
    this.shadowHalf = half;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -half;
    cam.right = cam.top = half;
    cam.updateProjectionMatrix();
  }

  update(dt, camera, target, viewDistance) {
    this.sky.position.copy(camera.position);
    this.setShadowHalf(Math.min(170, Math.max(28, viewDistance * 0.95 + 10)));
    // Snap the shadow box to texels so shadows don't shimmer while following the train.
    const texel = (this.shadowHalf * 2) / this.sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel;
    const tz = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + SUN_DIR.x * 300, SUN_DIR.y * 300, tz + SUN_DIR.z * 300);
    this.scene.fog.near = viewDistance + 90;
    this.scene.fog.far = viewDistance + 700;
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 900) c.position.x = -900;
    }
  }
}
