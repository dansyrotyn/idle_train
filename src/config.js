// Gameplay, economy and world tuning. Everything balance-related lives here.

export const TRACK_HEIGHT = 10; // deck top above the street
export const CAR_LENGTH = 5.2;
export const CAR_GAP = 0.35;
export const CAR_PITCH = CAR_LENGTH + CAR_GAP;

export const ECONOMY = {
  startCoins: 20,
  startCars: [1, 1],
  carValueBase: 10, // coins per reward-line crossing for a level-1 car
  carValueMult: 3, // value multiplier per car level
  trackIncomeMult: 1.5, // every track level multiplies all car values (upgrades never lower income)
  carPriceBase: 20,
  carPriceGrowth: 1.07, // per car ever bought
  mergePriceBase: 15,
  mergePriceLevelMult: 2.5, // merging two level-L cars costs base * mult^(L-1)
  // Price of reward line #2, #3, ... (#1 is the station you start with).
  gatePrices: [150, 1500, 15e3, 150e3, 1.5e6, 15e6, 150e6],
  stageRewardSeconds: 30, // stage-complete bonus = this many seconds of income
};

// Track levels. Polygons are (x, z) on the 30-unit street grid; long straights run
// through block middles (±15, ±45, ±75) so the viaduct crosses streets, never runs along them.
// `price` is the cost of upgrading TO this level. New cars arrive at level 1 + track level.
export const TRACKS = [
  {
    points: [[-15, -15], [15, -15], [15, 15], [-15, 15]],
    radius: 8, speed: 12, maxCars: 8, maxGates: 2, price: 0,
  },
  {
    points: [[-45, -15], [15, -15], [15, 15], [-45, 15]],
    radius: 9, speed: 14, maxCars: 12, maxGates: 3, price: 500,
  },
  {
    points: [[-45, -45], [15, -45], [15, 15], [-45, 15]],
    radius: 10, speed: 16, maxCars: 16, maxGates: 4, price: 6000,
  },
  {
    points: [[-45, -45], [45, -45], [45, -15], [15, -15], [15, 15], [-45, 15]],
    radius: 10, speed: 18, maxCars: 20, maxGates: 5, price: 80e3,
  },
  {
    points: [[-45, -45], [45, -45], [45, 45], [-15, 45], [-15, 15], [-45, 15]],
    radius: 10, speed: 20, maxCars: 24, maxGates: 6, price: 1e6,
  },
  {
    points: [[-75, -45], [45, -45], [45, 45], [-75, 45], [-75, 15], [-15, 15], [-15, -15], [-75, -15]],
    radius: 10, speed: 23, maxCars: 32, maxGates: 8, price: 15e6,
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

// Stages: three goals each. `only` limits visible buttons during onboarding,
// `unlock` reveals a button for good, `tutorial` shows a one-time hint.
export const STAGES = [
  [
    { type: 'buyCars', target: 3, only: ['add'], tutorial: 'add' },
    { type: 'merges', target: 2, only: ['merge'], unlock: 'merge', tutorial: 'merge' },
    { type: 'collect', target: 300 },
  ],
  [
    { type: 'gates', target: 1, unlock: 'gate', tutorial: 'gate' },
    { type: 'merges', target: 6 },
    { type: 'carLevel', target: 4 },
  ],
  [
    { type: 'track', target: 1, unlock: 'track', tutorial: 'track' },
    { type: 'buyCars', target: 8 },
    { type: 'income', target: 100 },
  ],
  [
    { type: 'carLevel', target: 5 },
    { type: 'gates', target: 1 },
    { type: 'collect', target: 5000 },
  ],
  [
    { type: 'track', target: 1 },
    { type: 'merges', target: 15 },
    { type: 'income', target: 1000 },
  ],
  [
    { type: 'carLevel', target: 6 },
    { type: 'gates', target: 1 },
    { type: 'collect', target: 100e3 },
  ],
  [
    { type: 'track', target: 1 },
    { type: 'income', target: 5000 },
    { type: 'buyCars', target: 20 },
  ],
];
