# IdleTrain: brief for rebuilding it in Unity

A three.js prototype already exists (web, `/Users/dansyrotyn/Aworking/Claude/IdleTrain`, no build step, run with `python3 -m http.server 5173`). The task is to rebuild the same game in Unity. This document is the whole spec: mechanics, economy, numbers, camera, visuals and the architecture to reproduce.

## 1. Concept
- **Genre:** idle / merge. It reskins the team's earlier "ball track" game, which had good playtime but a poor CPI. The goal is a more appealing fantasy on top of the same sticky loop.
- **Fantasy:** a single metro train runs in a closed loop on an elevated concrete viaduct with two rails, above a living toy city: car traffic, traffic lights, pedestrians.
- **Style:** bright and toy-like, similar to Subway Surfers.
  - The train is a silver metro with a red stripe.
  - Reward gates are neon green arches with a coin.
  - The station has a blue roof.
- **Platform:** mobile, **portrait**.

## 2. Core loop: 4 buttons
| Button | What it does |
| --- | --- |
| **Add Car** | Adds a car at level `1 + trackLevel`. The number of cars is capped by `maxCars` of the current track. |
| **Merge Train** | Takes the **lowest** level that has at least 2 cars and turns those 2 cars into 1 car of the next level (white → red → green → …). |
| **Add Reward Line** | Adds a neon gate on the track. The first "gate" is the station, which you own from the start. Capped by `maxGates`. |
| **Upgrade Track** | Moves to the next of 6 track levels: a bigger loop, a faster train, more car and gate slots, ×1.5 to all income, and new cars arrive one level higher. |

**Income:** every time **any car** passes **any gate** (including the station), the player gets `carValue(level)` coins. A floating `+N` and a coin flying to the counter play as feedback.

**Train order:** cars are kept sorted by level, high to low, with the highest at the head. A new car is inserted at its sorted position. When two cars merge, the pair is adjacent; the first one levels up and the second is removed, and the cars behind it pull up with an animation.

## 3. Formulas (all from `config.js`)
```
carValue(L)     = round(10 * 3^(L-1) * 1.5^trackLevel)
carPrice        = round(20 * 1.07^carsBought)          // carsBought = all cars ever bought
mergePrice(L)   = round(15 * 2.5^(L-1))                 // L = level of the pair being merged
gatePrice       = [150, 1500, 15e3, 150e3, 1.5e6, 15e6, 150e6][gates-1]
newCarLevel     = 1 + trackLevel
incomeRate/sec  = (Σ carValue(cars) * gates) / (trackLength / speed)
stage reward    = 30 seconds of incomeRate
start: coins = 20, cars = [1, 1], gates = 1 (station), trackLevel = 0
```

## 4. Track levels
The polygon points are (x, z) on a city grid with a 30-unit step. The straights run through the **middle of blocks** (±15, ±45, ±75), so the viaduct crosses streets instead of running along them. The corners are filleted with `radius`.

| lvl | polygon | radius | speed | maxCars | maxGates | upgrade price |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | (-15,-15)(15,-15)(15,15)(-15,15) | 8 | 12 | 8 | 2 | – |
| 1 | (-45,-15)(15,-15)(15,15)(-45,15) | 9 | 14 | 12 | 3 | 500 |
| 2 | (-45,-45)(15,-45)(15,15)(-45,15) | 10 | 16 | 16 | 4 | 6 000 |
| 3 | (-45,-45)(45,-45)(45,-15)(15,-15)(15,15)(-45,15) | 10 | 18 | 20 | 5 | 80 000 |
| 4 | (-45,-45)(45,-45)(45,45)(-15,45)(-15,15)(-45,15) | 10 | 20 | 24 | 6 | 1 000 000 |
| 5 | (-75,-45)(45,-45)(45,45)(-75,45)(-75,15)(-15,15)(-15,-15)(-75,-15) | 10 | 23 | 32 | 8 | 15 000 000 |

**Geometry:**
- Deck height: `TRACK_HEIGHT = 10`.
- Cars: `CAR_LENGTH = 5.2`, `CAR_GAP = 0.35`, so the pitch is 5.55.
- The path is sampled by arc length, and cars follow each other along it at a fixed distance.
- Gate slots are spread evenly along the loop.
- Pillars are placed away from the streets.
- On an upgrade, the city is rebuilt around the new track.

Unity: a **Spline** package or your own polyline with arc-length lookup works for the track.

## 5. Car liveries by level
| L | body | stripe | extra |
| --- | --- | --- | --- |
| 1 | #EEF1F5 white | #E53935 | |
| 2 | #E53935 red | #FFFFFF | |
| 3 | #37C25A green | #FFF176 | |
| 4 | #2F7FF0 blue | #FFFFFF | |
| 5 | #9B51E0 purple | #FFD54F | |
| 6 | #FF8A1F orange | #37474F | |
| 7 | #18C6D8 cyan | #FFFFFF | |
| 8 | #FF5FA2 pink | #FFFFFF | |
| 9 | #F5C518 gold | #8D5A00 | metallic 0.65 |
| 10 | #2B2F38 black | #2EE6FF | neon/emissive |
| 11 | #D5DDE8 chrome | #7C4DFF | metallic 0.85 |
| 12 | #B3122F ruby | #FFD700 | metallic 0.4 |

Levels above 12 get generated colors.

## 6. Stages and onboarding
Each stage has 3 goals, completed **one after another**. Only the active goal is shown.
- `only` limits which buttons are visible while that goal is active (onboarding).
- `unlock` reveals a button permanently.
- `tutorial` shows a one-time hint, such as a hand pointing at the button.

Each goal counts progress **from the moment it activates** (a base snapshot of the stats).

| Stage | Goal 1 | Goal 2 | Goal 3 |
| --- | --- | --- | --- |
| 1 | buyCars 3 (only add, tutorial) | merges 2 (only merge, unlock merge, tutorial) | collect 300 coins |
| 2 | gates 1 (unlock gate, tutorial) | merges 6 | carLevel 4 |
| 3 | track 1 (unlock track, tutorial) | buyCars 8 | income 100/s |
| 4 | carLevel 5 | gates 1 | collect 5 000 |
| 5 | track 1 | merges 15 | income 1 000/s |
| 6 | carLevel 6 | gates 1 | collect 100 000 |
| 7 | track 1 | income 5 000/s | buyCars 20 |

Goal types:
- `buyCars`, `merges`, `gates`, `track`, `collect`: increments since the goal activated.
- `carLevel`: maximum car level ≥ N.
- `income`: incomeRate ≥ N.

Completing a stage pays a reward of 30 seconds of income and shows a popup.

## 7. Camera
An orbit camera that follows the train:
- One-finger drag rotates (azimuth and elevation, with inertia).
- Pinch or scroll zooms.
- Double-tap resets the view.

Parameters:
- Default: distance 36, elevation 0.52 rad, azimuth = train heading + π + 0.75.
- Distance ranges from 6 up to `maxDist = clamp(trackRadius*2.4+55, 90, 230)`.
- Elevation ranges from 0.07 to 1.42 rad.

Behavior:
- **Close up**, the camera turns with the train like a chase cam. The heading is smoothed with damp(2.5). Follow strength is `1 - smoothstep(28, 75, distance)`.
- **Zoomed out**, the target slides from the train to the loop's center, using `smoothstep(40, maxDist*0.9, distance)`, and stays still. This lets the player watch the whole loop.
- Distance is smoothed with damp(9). Inertia decays as `exp(-4·dt)`.

In Unity this can be built with Cinemachine or with a hand-written script. The hand-written script is simpler and gives more control.

## 8. City (procedural)
- 30-unit grid: streets plus blocks with low-poly buildings in bright colors.
- Cars drive the streets and stop at traffic lights.
- Pedestrians walk the sidewalks.
- Sky, fog and clouds. The shadow box follows the camera.

Mobile optimization:
- Use GPU instancing for buildings and cars.
- Keep the shadow distance small.

## 9. UI / UX
- **HUD:** coins at the top, income per second, and the goal panel with a progress bar.
- **Bottom row:** 4 large buttons. Each shows an icon (a render of the real model), a price, and a disabled state when the player can't afford it or the item is maxed.
- **Feedback:**
  - Sparkles and a ring when a car is added or merged.
  - Floating `+N` above the gates.
  - Coins fly into the counter.
- **Settings:**
  - Reset progress.
  - Test menu with: +coins, game speed ×1/×3/×10, add a car of any level, complete goal, skip stage, free track upgrade, free gate, FPS counter.

## 10. Save
Autosave the whole state as JSON (PlayerPrefs, or a file in `Application.persistentDataPath`). The fields are:
```
v, coins, totalEarned, cars[] (levels), gates, trackLevel,
stats{carsBought, merges, gatesBought, trackUpgrades},
stage, goalIndex, goal{...base}, unlocked{add,merge,gate,track},
tutorialsSeen{}, playTime, savedAt
```
On load, clamp the values: sort the cars and cap them at the current track's maxCars, and cap gates at maxGates.

## 11. Architecture (what worked in the prototype)
- **GameState:** a pure model with no rendering. It owns coins, cars, prices and actions (`AddCar`, `Merge`, `AddGate`, `UpgradeTrack`, which return bool). It raises events: `carAdded`, `merged`, `gateAdded`, `trackUpgraded`, `changed`.
- **Goals:** stages and goals that listen to GameState.
- **Config:** every balance number lives in one place. In Unity this maps to a ScriptableObject.
- **World:** subscribes to the events and handles TrackPath, Viaduct, Train (movement plus add/merge animations), Gates, City, Traffic and Environment.
- **FollowCamera**, **Effects**, **UI** (HUD, modals, test menu).

The art is a separate layer, so primitives can be swapped for real models (FBX/prefabs) without touching the logic.

## 12. Recommended Unity stack
- Unity 6 with URP and a mobile profile. Portrait orientation.
- Use the new Input System for touch.
- Use DOTween (or your own tweens) for animations.
- Economy values belong in ScriptableObjects so designers can tune them without a build.
