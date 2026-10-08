import { ECONOMY, TRACKS } from '../config.js';
import { Emitter } from '../utils/Emitter.js';
import { getTrackPath } from '../world/TrackPath.js';

const SAVE_VERSION = 1;

// Pure game model: coins, the train composition, purchases and prices.
// The 3D world listens to its events; nothing here knows about rendering.
export class GameState extends Emitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.coins = ECONOMY.startCoins;
    this.totalEarned = 0;
    this.cars = [...ECONOMY.startCars]; // levels, sorted high → low, head first
    this.gates = 1; // reward lines; #1 is the station
    this.trackLevel = 0;
    this.stats = { carsBought: 0, merges: 0, gatesBought: 0, trackUpgrades: 0 };
    this.stage = 0;
    this.goalIndex = 0;
    this.goal = null; // active goal: { type, target, only?, ... , base: {...} }
    this.unlocked = { add: true, merge: false, gate: false, track: false };
    this.tutorialsSeen = {};
    this.playTime = 0;
  }

  get track() {
    return TRACKS[this.trackLevel];
  }

  get maxTrackLevel() {
    return TRACKS.length - 1;
  }

  get maxLevel() {
    return this.cars.length ? Math.max(...this.cars) : 0;
  }

  get newCarLevel() {
    return 1 + this.trackLevel;
  }

  carValue(level) {
    return Math.round(
      ECONOMY.carValueBase *
        Math.pow(ECONOMY.carValueMult, level - 1) *
        Math.pow(ECONOMY.trackIncomeMult, this.trackLevel),
    );
  }

  // Steady-state average income: every car crosses every reward line once per lap.
  incomeRate() {
    let perLap = 0;
    for (const lvl of this.cars) perLap += this.carValue(lvl);
    const lapTime = getTrackPath(this.trackLevel).length / this.track.speed;
    return (perLap * this.gates) / lapTime;
  }

  // --- prices -------------------------------------------------------------

  carPrice() {
    return Math.round(ECONOMY.carPriceBase * Math.pow(ECONOMY.carPriceGrowth, this.stats.carsBought));
  }

  mergeIndex() {
    // Lowest level with at least two cars. Cars are sorted, so the pair is adjacent
    // and merging the first two keeps the order.
    for (let i = this.cars.length - 1; i > 0; i--) {
      if (this.cars[i] === this.cars[i - 1]) {
        let j = i - 1;
        while (j > 0 && this.cars[j - 1] === this.cars[i]) j--;
        return j;
      }
    }
    return -1;
  }

  mergePrice() {
    const i = this.mergeIndex();
    if (i < 0) return null;
    return Math.round(ECONOMY.mergePriceBase * Math.pow(ECONOMY.mergePriceLevelMult, this.cars[i] - 1));
  }

  gatePrice() {
    return ECONOMY.gatePrices[this.gates - 1] ?? Infinity;
  }

  trackPrice() {
    return TRACKS[this.trackLevel + 1]?.price ?? null;
  }

  // --- availability ------------------------------------------------------

  isCarsFull() {
    return this.cars.length >= this.track.maxCars;
  }

  isGatesFull() {
    return this.gates >= this.track.maxGates;
  }

  isTrackMax() {
    return this.trackLevel >= this.maxTrackLevel;
  }

  // --- actions (return true on success) -----------------------------------

  addCar() {
    if (this.isCarsFull()) return false;
    const price = this.carPrice();
    if (this.coins < price) return false;
    this.coins -= price;
    this.stats.carsBought++;
    const index = this.insertCar(this.newCarLevel);
    this.emit('carAdded', { index, level: this.cars[index] });
    this.emit('changed');
    return true;
  }

  merge() {
    const i = this.mergeIndex();
    if (i < 0) return false;
    const price = this.mergePrice();
    if (this.coins < price) return false;
    this.coins -= price;
    this.stats.merges++;
    const level = this.cars[i] + 1;
    this.cars[i] = level;
    this.cars.splice(i + 1, 1);
    this.emit('merged', { index: i, level });
    this.emit('changed');
    return true;
  }

  addGate() {
    if (this.isGatesFull()) return false;
    const price = this.gatePrice();
    if (this.coins < price) return false;
    this.coins -= price;
    this.gates++;
    this.stats.gatesBought++;
    this.emit('gateAdded', { index: this.gates - 1 });
    this.emit('changed');
    return true;
  }

  upgradeTrack() {
    if (this.isTrackMax()) return false;
    const price = this.trackPrice();
    if (this.coins < price) return false;
    this.coins -= price;
    this.trackLevel++;
    this.stats.trackUpgrades++;
    this.emit('trackUpgraded', { level: this.trackLevel });
    this.emit('changed');
    return true;
  }

  earn(amount) {
    this.coins += amount;
    this.totalEarned += amount;
  }

  // Inserts keeping the high → low order; returns the index.
  insertCar(level) {
    let idx = this.cars.findIndex((l) => l < level);
    if (idx < 0) idx = this.cars.length;
    this.cars.splice(idx, 0, level);
    return idx;
  }

  // --- debug helpers -------------------------------------------------------

  debugAddCar(level) {
    if (this.isCarsFull()) return -1;
    const index = this.insertCar(level);
    this.emit('carsRebuilt');
    this.emit('changed');
    return index;
  }

  // --- persistence -----------------------------------------------------------

  toJSON() {
    return {
      v: SAVE_VERSION,
      coins: this.coins,
      totalEarned: this.totalEarned,
      cars: this.cars,
      gates: this.gates,
      trackLevel: this.trackLevel,
      stats: this.stats,
      stage: this.stage,
      goalIndex: this.goalIndex,
      goal: this.goal,
      unlocked: this.unlocked,
      tutorialsSeen: this.tutorialsSeen,
      playTime: this.playTime,
      savedAt: Date.now(),
    };
  }

  fromJSON(d) {
    if (!d || d.v !== SAVE_VERSION) return false;
    const num = (v, def) => (Number.isFinite(v) ? v : def);
    this.coins = Math.max(0, num(d.coins, this.coins));
    this.totalEarned = Math.max(0, num(d.totalEarned, 0));
    this.trackLevel = Math.min(Math.max(0, num(d.trackLevel, 0) | 0), this.maxTrackLevel);
    if (Array.isArray(d.cars) && d.cars.length) {
      this.cars = d.cars
        .map((l) => Math.max(1, l | 0))
        .sort((a, b) => b - a)
        .slice(0, this.track.maxCars);
    }
    this.gates = Math.min(Math.max(1, num(d.gates, 1) | 0), this.track.maxGates);
    Object.assign(this.stats, d.stats || {});
    this.stage = Math.max(0, num(d.stage, 0) | 0);
    this.goalIndex = Math.min(Math.max(0, num(d.goalIndex, 0) | 0), 2);
    this.goal = d.goal && typeof d.goal === 'object' ? d.goal : null;
    Object.assign(this.unlocked, d.unlocked || {});
    this.tutorialsSeen = d.tutorialsSeen || {};
    this.playTime = num(d.playTime, 0);
    return true;
  }
}
