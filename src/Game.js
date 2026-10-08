import * as THREE from 'three';
import { GameState } from './state/GameState.js';
import { Goals } from './state/Goals.js';
import { clearSave, loadGame, saveGame } from './state/save.js';
import { createRenderer, Environment } from './world/Environment.js';
import { City } from './world/City.js';
import { Traffic } from './world/Traffic.js';
import { Viaduct } from './world/Viaduct.js';
import { Gates } from './world/Gates.js';
import { Train } from './world/Train.js';
import { TrainModelFactory, carStyle } from './world/TrainModels.js';
import { getTrackPath } from './world/TrackPath.js';
import { FollowCamera } from './camera/FollowCamera.js';
import { Effects } from './fx/Effects.js';
import { UI } from './ui/UI.js';
import { IconRenderer } from './ui/IconRenderer.js';
import { formatCompact } from './utils/format.js';

const _v = new THREE.Vector3();

export class Game {
  constructor(root) {
    this.root = root;
    this.state = new GameState();
    loadGame(this.state);
    this.goals = new Goals(this.state);
    this.timeScale = 1;
    this.busy = false;
    this.showFps = false;

    const canvas = document.createElement('canvas');
    root.prepend(canvas);
    this.renderer = createRenderer(canvas);
    this.maxPixelRatio = this.renderer.getPixelRatio();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2500);

    this.env = new Environment(this.scene, this.renderer);
    this.city = new City(this.scene);
    this.traffic = new Traffic(this.scene);
    this.viaduct = new Viaduct(this.scene);
    this.gates = new Gates(this.scene);
    this.factory = new TrainModelFactory();
    this.ui = new UI(this, root);
    this.fx = new Effects(this.scene, this.camera, this.ui.fxLayer, () => this.ui.coinTarget());
    this.fx.onCoinArrive = () => this.ui.bumpCoins();
    this.train = new Train(this.scene, this.factory, {
      onMergeComplete: (car) => this.mergeFx(car),
      onCarAppear: (car) => this.appearFx(car),
    });
    this.cam = new FollowCamera(this.camera, canvas);

    this.buildTrack(this.state.trackLevel);
    this.train.rebuild(this.state.cars);
    this.bindState();
    this.debug = this.createDebug();
    this.renderIcons();

    this.resize();
    new ResizeObserver(() => this.resize()).observe(root);
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') this.ui.modal ? this.ui.closeModal() : this.ui.openDebug();
    });

    this.saveTimer = 0;
    this.uiTimer = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.fps = 60;
    this.slowSeconds = 0;
    const save = () => saveGame(this.state);
    document.addEventListener('visibilitychange', () => document.hidden && save());
    window.addEventListener('pagehide', save);
    this.ui.update();
  }

  start() {
    this.timer = new THREE.Timer();
    this.timer.connect(document); // resets the delta after the tab was hidden
    this.renderer.setAnimationLoop((now) => {
      this.timer.update(now);
      this.tick(this.timer.getDelta());
    });
  }

  // --- world -------------------------------------------------------------------------

  buildTrack(level) {
    const path = getTrackPath(level);
    this.path = path;
    this.viaduct.build(path);
    this.gates.build(path, this.state.gates);
    this.city.buildDynamic(path, this.viaduct.pillars, this.gates.exclusions());
    this.train.setPath(path);
    this.cam.setTrackSize(path.radius);
    this.gatePositions = this.gates.positions();
  }

  renderIcons() {
    this.icons ??= new IconRenderer(192);
    const lvl = this.state.newCarLevel;
    const car = (l) => this.icons.render(`car-${l}`, this.factory.createDisplayCar(l, 'head'));
    this.ui.setIcons({
      carA: car(lvl),
      carB: car(lvl + 1),
      addCar: car(lvl),
      gate: this.icons.render('gate', this.gates.createIconModel(), { yaw: 0.6, pitch: 0.28, pad: 0.95 }),
      track: this.icons.render('track', this.viaduct.createIconModel(), { yaw: 0.78, pitch: 0.7, pad: 0.92 }),
    });
  }

  bindState() {
    const s = this.state;
    s.on('carAdded', ({ index, level }) => this.train.addCar(index, level));
    s.on('merged', ({ index, level }) => {
      if (!this.train.merge(index, level)) this.train.rebuild(s.cars);
    });
    s.on('gateAdded', ({ index }) => {
      const it = this.gates.add(index);
      this.gatePositions = this.gates.positions();
      it.group.getWorldPosition(_v);
      this.fx.ring(_v.setY(_v.y + 0.3), { color: 0x7dff6a, size: 7 });
      this.fx.sparkle(_v.setY(_v.y + 3), { count: 50, color: 0x9dff8a, speed: 8 });
    });
    s.on('trackUpgraded', () => this.trackTransition());
  }

  async trackTransition() {
    this.busy = true;
    const fadeOut = await this.ui.flash();
    this.train.finishPending(false);
    this.buildTrack(this.state.trackLevel);
    this.renderIcons();
    fadeOut();
    this.ui.toast('TRACK UPGRADED!');
    for (let i = 0; i < this.gates.items.length; i++) {
      this.gates.coinWorldPosition(i, _v);
      this.fx.sparkle(_v, { count: 40, color: 0xffe27a, speed: 7 });
    }
    this.busy = false;
    saveGame(this.state);
  }

  // --- actions -------------------------------------------------------------------------

  doAction(name) {
    if (this.busy) return false;
    const s = this.state;
    let ok = false;
    if (name === 'add') ok = s.addCar();
    else if (name === 'merge') ok = s.merge();
    else if (name === 'gate') ok = s.addGate();
    else if (name === 'track') ok = s.upgradeTrack();
    if (ok) this.afterChange();
    return ok;
  }

  afterChange() {
    this.checkGoals();
    this.ui.update();
    saveGame(this.state);
  }

  checkGoals() {
    for (let guard = 0; guard < 6; guard++) {
      const stageBefore = this.state.stage;
      const res = this.goals.check();
      if (!res) break;
      this.onGoalResult(res, stageBefore);
    }
  }

  onGoalResult(res, stageBefore) {
    if (res === 'goal') {
      this.ui.toast('GOAL COMPLETE!');
      return;
    }
    // Stage rewards go straight to the balance so they don't count toward "collect" goals.
    const reward = this.goals.stageReward();
    this.state.coins += reward;
    this.ui.showStageComplete(stageBefore + 1, reward);
    this.celebrate();
    saveGame(this.state);
  }

  celebrate() {
    for (const car of this.train.cars) {
      _v.copy(car.group.position).setY(car.group.position.y + 3);
      this.fx.sparkle(_v, { count: 18, color: 0xffe27a, speed: 7, up: 5 });
    }
  }

  onCrossing(car, gateIndex, times) {
    const value = this.state.carValue(car.level) * times;
    this.state.earn(value);
    this.gates.pulse(gateIndex);
    this.gates.coinWorldPosition(gateIndex, _v);
    this.fx.coinBurst(_v, 1);
    this.fx.flyCoin(_v);
    _v.y += 2.6;
    this.fx.floatText(_v, `+${formatCompact(value)}`);
  }

  mergeFx(car) {
    const color = carStyle(car.level).body;
    _v.copy(car.group.position);
    this.fx.ring(_v.setY(_v.y + 0.4), { color, size: 7 });
    this.fx.sparkle(_v.setY(_v.y + 1.8), { count: 60, color: 0xffffff, speed: 9 });
    this.fx.sparkle(_v, { count: 30, color, speed: 6 });
  }

  appearFx(car) {
    _v.copy(car.group.position).setY(car.group.position.y + 1.6);
    this.fx.sparkle(_v, { count: 40, color: 0x9fdcff, speed: 7 });
    this.fx.ring(_v.setY(_v.y - 1.2), { color: 0x7fd0ff, size: 5 });
  }

  resetProgress() {
    clearSave();
    location.reload();
  }

  createDebug() {
    const s = this.state;
    return {
      carLevel: 1,
      addCoins: (n) => {
        s.coins += n;
        this.ui.update();
      },
      setSpeed: (x) => {
        this.timeScale = x;
      },
      addCar: (level) => {
        if (s.isCarsFull()) return false;
        const index = s.insertCar(level);
        s.emit('carAdded', { index, level });
        this.afterChange();
        return true;
      },
      completeGoal: () => {
        const before = s.stage;
        this.onGoalResult(this.goals.advance(), before);
        this.afterChange();
      },
      skipStage: () => {
        const before = s.stage;
        while (s.stage === before) this.goals.advance();
        this.onGoalResult('stage', before);
        this.afterChange();
      },
      upgradeTrack: () => {
        if (s.isTrackMax()) return false;
        s.coins += s.trackPrice();
        return this.doAction('track');
      },
      addGate: () => {
        if (s.isGatesFull()) return false;
        s.coins += s.gatePrice();
        return this.doAction('gate');
      },
      toggleFps: () => {
        this.showFps = !this.showFps;
        this.ui.setFps(this.showFps ? this.fps : null);
      },
    };
  }

  // --- loop ------------------------------------------------------------------------------

  resize() {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.ui.resize();
  }

  // One frame. `delta` is real seconds since the previous frame.
  tick(delta) {
    const raw = Math.min(delta, 0.1);
    const dt = raw * this.timeScale;
    this.state.playTime += dt;

    this.train.update(dt, this.state.track.speed);
    this.train.forEachCrossing(this.gatePositions, (car, g, n) => this.onCrossing(car, g, n));
    this.gates.update(dt);
    this.traffic.update(dt);
    this.city.update(dt);
    this.cam.update(raw, this.train.headPos, this.train.heading, this.path.center);
    this.env.update(raw, this.camera, this.cam.target, this.cam.distance);
    this.fx.update(raw);

    this.uiTimer += raw;
    if (this.uiTimer >= 0.1) {
      this.uiTimer = 0;
      this.checkGoals();
      this.ui.update();
    }
    this.saveTimer += raw;
    if (this.saveTimer >= 5) {
      this.saveTimer = 0;
      saveGame(this.state);
    }
    this.measure(delta);

    this.renderer.render(this.scene, this.camera);
  }

  // FPS meter + drop the resolution a notch on slow phones. Frames slower than
  // 1/12 s are the browser throttling us (background, unfocused), not GPU load.
  measure(delta) {
    this.fpsFrames++;
    this.fpsTime += delta;
    if (delta > 1 / 12) this.throttled = true;
    if (this.fpsTime < 1) return;
    this.fps = this.fpsFrames / this.fpsTime;
    if (this.showFps) this.ui.setFps(this.fps);
    const slow = this.fps < 40 && !this.throttled;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.throttled = false;
    this.slowSeconds = slow ? this.slowSeconds + 1 : 0;
    const pr = this.renderer.getPixelRatio();
    if (this.slowSeconds >= 3 && pr > 1) {
      this.renderer.setPixelRatio(Math.max(1, pr - 0.25));
      this.resize();
      this.slowSeconds = 0;
    }
  }
}
