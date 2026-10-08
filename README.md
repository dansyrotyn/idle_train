# Idle Cars

Idle merge game prototype: 90s cars driving an elevated freeway loop over a toy 90s city (beater → sedan → taxi → hot hatch → muscle → JDM → tuned → limo → supercar).
Same core loop as our ball game (add → merge → reward lines → upgrade track), new fantasy.
Mobile web, portrait. three.js r186, plain ES modules: no build step and no npm.

## Run

```bash
python3 -m http.server 5173
```

Open http://localhost:5173. To test on a phone on the same Wi‑Fi, open `http://<your-mac-ip>:5173`
(the `.claude/launch.json` config binds to `0.0.0.0`).

## Controls

- Drag: rotate the camera. Pinch or scroll: zoom from the whole loop down to a single car.
- Double-tap (double-click): reset the view.
- Close up, the camera turns with the train; zoomed out, it settles over the loop's center.

## Gameplay

The economy is ported 1:1 from BallMerge3D (`Assets/_Project/_Data`). All numbers live in `src/config.js`.

| Button | Effect |
| --- | --- |
| **Add Car** | Adds a level-1 car. Price `100 + 45n + 4n²` (n = cars ever bought), soft cap at n = 100, max 250K. |
| **Merge Train** | Merges two cars of the lowest level that has a pair into one car of the next level (max level 9). Price `150 + 60m + 4m²` (m = merges ever done), max 275K. |
| **Add Reward Line** | Adds another neon gate: 1K, 3.5K, 14K, 35K, … up to 2M. Every car passing a gate (or the station) earns 20 / 52 / 132 / 320 / 750 / 1.7K / 3.8K / 7.7K / 15.3K coins by level. |
| **Upgrade Track** | Bigger loop (6 levels, 220K → 6.5M): more car and gate slots. Lap time 8 → 16 s. |

Offline income: 7% of income/sec for up to 1 hour away (at least 30 s; not on stage 1), with a Collect popup.
Stages are BallMerge3D's 25 levels (2–4 goals each); after them, the last 5 loop. The first stages unlock buttons one by one, with one-time tutorial hints.
Progress autosaves to `localStorage`. **Settings → Reset progress** wipes it.

**Test menu:** Settings → 🛠 Test menu, or press `` ` `` on desktop.
It can add coins, set game speed ×1/×3/×10, add a car of any level, complete a goal, skip a stage,
upgrade the track or add a reward line for free, and show an FPS counter.
`window.game` is exposed in the console for poking at state.

## Where things live

| Path | What |
| --- | --- |
| `src/config.js` | **All balance numbers**: prices, values, track shapes/speeds/caps, liveries, stage goals |
| `src/state/` | `GameState` (coins, cars, actions, prices), `Goals` (stages), `save.js` (localStorage) |
| `src/world/TrackPath.js` | Loop geometry: filleted polygon, arc-length sampling, reward-line slots |
| `src/world/Viaduct.js` | Deck, rails, sleepers, neon strip, pillars (kept out of the streets) |
| `src/world/Cars.js`, `CarModels.js` | Car convoy movement, add/merge animations, the 9 car models |
| `src/world/Gates.js` | Station and neon reward gates |
| `src/world/City.js`, `Traffic.js` | Procedural city (rebuilt around the track on upgrade), cars with traffic lights, pedestrians |
| `src/world/Environment.js` | Renderer, lights, sky, fog, clouds, shadow box following the camera |
| `src/camera/FollowCamera.js` | Orbit/follow camera with touch and mouse input |
| `src/fx/Effects.js` | Sparkles, coins, rings, floating `+N`, coins flying into the counter |
| `src/ui/` | HUD, modals, test menu; button icons are rendered from the real 3D models |

Everything is built from primitives and canvas textures. There are no external art assets yet,
so swapping in GLTF models later only touches `TrainModels.js`, `Gates.js` and `City.js`.
