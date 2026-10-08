import * as THREE from 'three';
import { GameState } from './state/GameState.js';
import { Goals } from './state/Goals.js';
import { clearSave, loadGame, saveGame } from './state/save.js';
import { ECONOMY } from './config.js';
import { Audio } from './audio/Audio.js';
import { createRenderer, Environment } from './world/Environment.js';
import { City } from './world/City.js';
import { Viaduct } from './world/Viaduct.js';
import { Gates } from './world/Gates.js';
import { BonusCoin } from './world/BonusCoin.js';
import { Cars } from './world/Cars.js';
import { CarModelFactory, carStyle } from './world/CarModels.js';
import { getTrackPath } from './world/TrackPath.js';
import { FollowCamera, VIEW } from './camera/FollowCamera.js';
import { Effects } from './fx/Effects.js';
import { UI } from './ui/UI.js';
import { IconRenderer } from './ui/IconRenderer.js';
import { formatCompact } from './utils/format.js';

const _v = new THREE.Vector3();

export class Game {
  constructor(root) {
    this.root = root;
    this.state = new GameState();
    const loaded = loadGame(this.state);
    const lastExit = loaded ? this.state.lastExit : 0;
    this.goals = new Goals(this.state);
    this.timeScale = 1;
    this.busy = false;
    this.showFps = false;
    this.audio = new Audio();

    const canvas = document.createElement('canvas');
    root.prepend(canvas);
    this.renderer = createRenderer(canvas);
    this.maxPixelRatio = this.renderer.getPixelRatio();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.5, 2500);

    this.env = new Environment(this.scene, this.renderer);
    this.city = new City(this.scene);
    this.viaduct = new Viaduct(this.scene);
    this.gates = new Gates(this.scene);
    this.factory = new CarModelFactory();
    this.ui = new UI(this, root);
    this.fx = new Effects(this.scene, this.camera, this.ui.fxLayer, () => this.ui.coinTarget());
    this.fx.onCoinArrive = () => this.ui.bumpCoins();
    this.train = new Cars(this.scene, this.factory, {
      onMergeComplete: (car) => this.mergeFx(car),
      onCarAppear: (car) => this.appearFx(car),
    });
    this.cam = new FollowCamera(this.camera, canvas);
    this.bonus = new BonusCoin(this.scene, this.camera, canvas, (pos) => this.collectBonus(pos));

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
    const leave = () => {
      this.state.lastExit = Date.now();
      save();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) leave();
      else this.collectOffline(this.state.lastExit);
    });
    window.addEventListener('pagehide', leave);
    this.ui.update();
    this.collectOffline(lastExit);
  }

  // BallMerge3D OfflineIncomeManager: a share of 1x income/sec for the time away (capped).
  // Paid straight to the balance, so it doesn't count toward "collect" goals.
  collectOffline(since) {
    const s = this.state;
    const { minSeconds, maxSeconds, efficiency } = ECONOMY.offline;
    const seconds = (Date.now() - since) / 1000;
    s.lastExit = 0;
    if (!since || s.stage === 0 || seconds < minSeconds) return;
    const reward = Math.floor(s.incomeRate() * Math.min(seconds, maxSeconds) * efficiency);
    if (reward <= 0) return;
    this.audio.play('popup');
    this.ui.showOfflineIncome(reward, () => {
      s.coins += reward;
      this.audio.play('coinScatter');
      this.audio.play('coinFly');
      setTimeout(() => this.audio.play('coinCollect'), 600);
      this.fx.flyCoin(this.train.headPos);
      this.ui.update();
      saveGame(s);
    });
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
    const plan = this.city.plan(path, level);
    this.viaduct.build(path, plan.gapAt);
    this.gates.build(path, this.state.gates);
    this.city.buildDynamic(path, plan, this.gates.exclusions());
    this.train.setPath(path);
    this.cam.setTrack(path, (x, z) => this.city.heightAt(x, z));
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
    s.on('carAdded', ({ index, level }) => {
      this.audio.play('carAdd');
      this.train.addCar(index, level);
    });
    s.on('merged', ({ index, level }) => {
      this.audio.play('merge');
      if (!this.train.merge(index, level)) this.train.rebuild(s.cars);
    });
    s.on('gateAdded', ({ index }) => {
      this.audio.play('gateAdd');
      const it = this.gates.add(index);
      this.gatePositions = this.gates.positions();
      it.group.getWorldPosition(_v);
      this.fx.ring(_v.setY(_v.y + 0.3), { color: 0x7dff6a, size: 7 });
      this.fx.sparkle(_v.setY(_v.y + 3), { count: 50, color: 0x9dff8a, speed: 8 });
    });
    s.on('trackUpgraded', () => {
      this.audio.play('trackUpgrade');
      this.trackTransition();
    });
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
      this.audio.play('goalComplete');
      this.ui.toast('GOAL COMPLETE!');
      return;
    }
    this.audio.play('stageComplete');
    this.ui.showStageComplete(stageBefore + 1);
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
    this.audio.play('reward');
    this.gates.pulse(gateIndex);
    this.gates.coinWorldPosition(gateIndex, _v);
    this.fx.coinBurst(_v, 1);
    this.fx.flyCoin(_v);
    _v.y += 2.6;
    this.fx.floatText(_v, `+${formatCompact(value)}`);
  }

  // Tapped bonus coin: 10–30 seconds of income.
  collectBonus(pos) {
    const value = Math.max(20, Math.round(this.state.incomeRate() * (10 + Math.random() * 20)));
    this.state.earn(value);
    this.audio.play('coinScatter');
    this.audio.play('coinFly');
    this.fx.sparkle(pos, { count: 50, color: 0xffe27a, speed: 9, up: 5 });
    this.fx.coinBurst(pos, 6);
    for (let i = 0; i < 4; i++) setTimeout(() => this.fx.flyCoin(pos), i * 90);
    _v.copy(pos).setY(pos.y + 2);
    this.fx.floatText(_v, `+${formatCompact(value)}`);
    this.ui.update();
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

    this.train.update(dt, this.state.trainSpeed);
    this.train.forEachCrossing(this.gatePositions, (car, g, n) => this.onCrossing(car, g, n));
    this.gates.update(dt);
    this.bonus.enabled = this.state.stage > 0; // not during the tutorial stage
    this.bonus.update(dt, this.path, this.train.headS);
    this.city.update(dt);
    this.cam.update(raw, this.train.headPos);
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
