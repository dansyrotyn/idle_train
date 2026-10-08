// Gameplay, economy and world tuning. Everything balance-related lives here.

export const TRACK_HEIGHT = 0.33; // road surface above the street (the loop is a ground-level city street)
export const CAR_SPACING = 7.4; // distance between car centers in the convoy

// Economy ported 1:1 from BallMerge3D (Assets/_Project/_Data/*.asset + scene values).
// Car price / merge price use its ProgressivePriceBalance: quadratic up to a soft cap, then linear,
// capped, rounded to 5. Indices are lifetime counters (cars ever bought, merges ever done).
export const ECONOMY = {
  startCoins: 250,
  startCars: [1],
  // Coins per reward-line crossing by car level (BallProgressionConfig). Its length is the max level.
  carIncome: [20, 52, 132, 320, 750, 1720, 3800, 7700, 15300],
  carPrice: { base: 100, step: 45, quad: 4, softCap: 100, linearAfter: 800, max: 250000 },
  mergePrice: { base: 150, step: 60, quad: 4, softCap: 100, linearAfter: 850, max: 275000 },
  // Price of the Nth bought reward line (#0 is the first one after the station), then +extraStep, capped.
  gatePrices: [1000, 3500, 14000, 35000, 80000, 160000, 280000, 460000, 700000, 1000000, 1300000, 1650000, 1900000],
  gateExtraStep: 200000,
  gateMaxPrice: 2000000,
  // Offline earnings: 7% of income/sec, at most 1 hour, only after 30 s away. Off on stage 1.
  offline: { minSeconds: 30, maxSeconds: 3600, efficiency: 0.07 },
};

// Road levels. Polygons are (x, z) on the 30-unit street grid: the loop runs along real
// city streets (multiples of 30), so buildings and sidewalks line it on both sides.
// `price` is the cost of upgrading TO this level (BallMerge3D TrackUpgradeConfig).
// `lapTime` (seconds) sets the train speed: BallMerge3D tracks are 75–170 units at speed 10, so
// laps take 7.5–17 s, and income/sec depends only on lap time. Caps match its track prefabs.
export const TRACKS = [
  {
    points: [[0, 0], [30, 0], [30, 30], [0, 30]],
    radius: 14, lapTime: 8, maxCars: 10, maxGates: 8, price: 0,
  },
  {
    points: [[-30, 0], [30, 0], [30, 30], [-30, 30]],
    radius: 14, lapTime: 9, maxCars: 12, maxGates: 10, price: 220e3,
  },
  {
    points: [[-30, -30], [30, -30], [30, 30], [-30, 30]],
    radius: 13, lapTime: 10, maxCars: 14, maxGates: 10, price: 1.95e6,
  },
  {
    points: [[-30, -30], [60, -30], [60, 0], [30, 0], [30, 30], [-30, 30]],
    radius: 10, lapTime: 12, maxCars: 16, maxGates: 12, price: 2.8e6,
  },
  {
    points: [[-30, -30], [60, -30], [60, 60], [0, 60], [0, 30], [-30, 30]],
    radius: 10, lapTime: 14, maxCars: 18, maxGates: 14, price: 4e6,
  },
  {
    points: [[-60, -30], [60, -30], [60, 60], [-60, 60], [-60, 30], [0, 30], [0, 0], [-60, 0]],
    radius: 10, lapTime: 16, maxCars: 18, maxGates: 16, price: 6.5e6,
  },
];

// Cars by level, from a rusty beater to a supercar. Every level is a new model and color,
// so the level reads from the silhouette as well as the paint.
export const CAR_LEVELS = [
  { model: 'beater', body: 0xb89a6c, stripe: 0x8a6f4a, metal: 0.05 }, // 1 rusty beater
  { model: 'sedan', body: 0x6f93bf, stripe: 0xffffff }, // 2 family sedan
  { model: 'taxi', body: 0xffc21a, stripe: 0x111111 }, // 3 yellow cab
  { model: 'hothatch', body: 0xe53935, stripe: 0xffffff }, // 4 hot hatch
  { model: 'muscle', body: 0xff7a1a, stripe: 0xffffff }, // 5 muscle car
  { model: 'jdm', body: 0x2f6ff0, stripe: 0xffffff, metal: 0.45 }, // 6 90s sports coupe
  { model: 'tuned', body: 0x9b51e0, stripe: 0x2ee6ff, glow: 0x2ee6ff, metal: 0.5 }, // 7 tuned, neon underglow
  { model: 'limo', body: 0x1c1f26, stripe: 0xe6ebf2, metal: 0.7 }, // 8 limo
  { model: 'supercar', body: 0xf5c518, stripe: 0x1c1f26, metal: 0.65 }, // 9 supercar
];

// Stages = BallMerge3D Level_01..Level_25 goals. After the last stage, the last 5 loop.
// `only` limits visible buttons during onboarding, `unlock` reveals a button for good,
// `tutorial` shows a one-time hint. `incomePct` = raise income/sec by this % from the goal start.
const G = (type, target, extra) => ({ type, target, ...extra });
export const STAGES = [
  [G('buyCars', 4, { only: ['add'], tutorial: 'add' }), G('merges', 2, { only: ['merge'], unlock: 'merge', tutorial: 'merge' }), G('collect', 400)],
  [G('merges', 6), G('buyCars', 5), G('collect', 30e3)],
  [G('gates', 1, { unlock: 'gate', tutorial: 'gate' }), G('incomePct', 20), G('merges', 6), G('collect', 90e3)],
  [G('buyCars', 5), G('merges', 4), G('track', 1, { unlock: 'track', tutorial: 'track' }), G('merges', 7)],
  [G('merges', 6), G('buyCars', 5), G('merges', 6), G('collect', 240e3)],
  [G('buyCars', 6), G('merges', 9), G('incomePct', 12), G('collect', 300e3)],
  [G('incomePct', 25), G('collect', 1.5e6)],
  [G('gates', 1), G('track', 1), G('merges', 8), G('buyCars', 5)],
  [G('merges', 10), G('collect', 600e3), G('buyCars', 6)],
  [G('buyCars', 6), G('incomePct', 15), G('collect', 800e3)],
  [G('merges', 10), G('collect', 950e3), G('buyCars', 6)],
  [G('merges', 6), G('track', 1), G('buyCars', 5), G('merges', 8)],
  [G('buyCars', 10), G('merges', 14), G('incomePct', 8), G('collect', 1.3e6)],
  [G('merges', 12), G('gates', 1), G('collect', 1.5e6)],
  [G('buyCars', 8), G('merges', 12), G('collect', 1.8e6)],
  [G('buyCars', 8), G('track', 1), G('gates', 1), G('merges', 12)],
  [G('incomePct', 8), G('collect', 4e6)],
  [G('merges', 14), G('buyCars', 8), G('collect', 3e6)],
  [G('gates', 1), G('collect', 3e6), G('merges', 14)],
  [G('merges', 10), G('buyCars', 8), G('track', 1), G('merges', 14)],
  [G('merges', 14), G('incomePct', 3), G('collect', 3.6e6)],
  [G('buyCars', 8), G('collect', 4e6), G('merges', 14)],
  [G('gates', 1), G('merges', 14), G('buyCars', 8), G('collect', 4.2e6)],
  [G('merges', 16), G('collect', 7e6)],
  [G('track', 1), G('merges', 14), G('incomePct', 3), G('collect', 5.5e6)],
];
export const LOOPED_STAGES = 5;
