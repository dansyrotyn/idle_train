// Gameplay, economy and world tuning. Everything balance-related lives here.

export const TRACK_HEIGHT = 10; // deck top above the street
export const CAR_LENGTH = 5.2;
export const CAR_GAP = 0.35;
export const CAR_PITCH = CAR_LENGTH + CAR_GAP;

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

// Track levels. Polygons are (x, z) on the 30-unit street grid; long straights run
// through block middles (±15, ±45, ±75) so the viaduct crosses streets, never runs along them.
// `price` is the cost of upgrading TO this level (BallMerge3D TrackUpgradeConfig).
// `lapTime` (seconds) sets the train speed: BallMerge3D tracks are 75–170 units at speed 10, so
// laps take 7.5–17 s, and income/sec depends only on lap time. Caps match its track prefabs.
export const TRACKS = [
  {
    points: [[-15, -15], [15, -15], [15, 15], [-15, 15]],
    radius: 8, lapTime: 8, maxCars: 10, maxGates: 8, price: 0,
  },
  {
    points: [[-45, -15], [15, -15], [15, 15], [-45, 15]],
    radius: 9, lapTime: 9, maxCars: 12, maxGates: 10, price: 220e3,
  },
  {
    points: [[-45, -45], [15, -45], [15, 15], [-45, 15]],
    radius: 10, lapTime: 10, maxCars: 14, maxGates: 10, price: 1.95e6,
  },
  {
    points: [[-45, -45], [45, -45], [45, -15], [15, -15], [15, 15], [-45, 15]],
    radius: 10, lapTime: 12, maxCars: 16, maxGates: 12, price: 2.8e6,
  },
  {
    points: [[-45, -45], [45, -45], [45, 45], [-15, 45], [-15, 15], [-45, 15]],
    radius: 10, lapTime: 14, maxCars: 18, maxGates: 14, price: 4e6,
  },
  {
    points: [[-75, -45], [45, -45], [45, 45], [-75, 45], [-75, 15], [-15, 15], [-15, -15], [-75, -15]],
    radius: 10, lapTime: 16, maxCars: 18, maxGates: 16, price: 6.5e6,
  },
];

// Car liveries by level: 2 white → red, 2 red → green, and so on.
// Levels past the end of this list get generated colors.
export const CAR_LEVELS = [
  { body: 0xeef1f5, stripe: 0xe53935 }, // 1 classic white
  { body: 0xe53935, stripe: 0xffffff }, // 2 red
  { body: 0x37c25a, stripe: 0xfff176 }, // 3 green
  { body: 0x2f7ff0, stripe: 0xffffff }, // 4 blue
  { body: 0x9b51e0, stripe: 0xffd54f }, // 5 purple
  { body: 0xff8a1f, stripe: 0x37474f }, // 6 orange
  { body: 0x18c6d8, stripe: 0xffffff }, // 7 cyan
  { body: 0xff5fa2, stripe: 0xffffff }, // 8 pink
  { body: 0xf5c518, stripe: 0x8d5a00, metal: 0.65 }, // 9 gold
  { body: 0x2b2f38, stripe: 0x2ee6ff, neon: true }, // 10 black neon
  { body: 0xd5dde8, stripe: 0x7c4dff, metal: 0.85 }, // 11 chrome
  { body: 0xb3122f, stripe: 0xffd700, metal: 0.4 }, // 12 ruby
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
