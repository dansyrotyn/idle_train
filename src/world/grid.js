// The street grid shared by the city, traffic and pillar placement.
// Roads run along x = k * PERIOD and z = k * PERIOD for k in [ROAD_MIN, ROAD_MAX];
// blocks sit between them.

export const PERIOD = 30;
export const ROAD_W = 8;
export const HALF_ROAD = ROAD_W / 2;
export const SIDEWALK = 2.5;
export const BLOCK = PERIOD - ROAD_W; // 22
export const ROAD_MIN = -5;
export const ROAD_MAX = 5;
export const CITY_EXTENT = ROAD_MAX * PERIOD; // 150
export const LANE_OFFSET = 2; // lane center from road center (right-hand traffic)

export function nearestRoad(v) {
  return Math.round(v / PERIOD) * PERIOD;
}

export function isOnRoad(x, z, margin = 0) {
  const lim = CITY_EXTENT + HALF_ROAD + margin;
  if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
  return Math.abs(x - nearestRoad(x)) < HALF_ROAD + margin || Math.abs(z - nearestRoad(z)) < HALF_ROAD + margin;
}

// Block (i, j) spans [i*PERIOD + HALF_ROAD, (i+1)*PERIOD - HALF_ROAD] on x (same for z).
export function blockBounds(i, j) {
  const x0 = i * PERIOD + HALF_ROAD;
  const z0 = j * PERIOD + HALF_ROAD;
  return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK, cx: x0 + BLOCK / 2, cz: z0 + BLOCK / 2 };
}
