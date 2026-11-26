# MERIDIAN RUN — Sky Ring Rally

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/azkia13/best-flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/azkia13/best-flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

An original arcade flight rally over a tropical archipelago, built with pure
Canvas 2D and synthesised WebAudio — no libraries, no network, no assets.

## How to play

Serve `game/` with any static server and open `game/index.html` in desktop
Chrome. Fly the campaign — three sorties, one pilot score:

1. **Ring Rally** — thread 8 glowing sky rings before the clock runs out.
   Each ring is +100 points and +6 seconds.
2. **Island Hop** — take off from Meridian Field, cross the islands and land
   on the Coral Bay runway. Throttle is fuel: fly greedy and you glide home.
3. **Storm Run** — 10 rings through a squall line. Crosswinds shove the
   plane sideways and terrain strikes damage the airframe (3 strikes ends it).

Landings are judged: descent rate and speed decide Perfect / Good / Hard,
with a bonus for each. A stall (too slow) drops the nose; running out of
fuel means an emergency glide.

## Controls

| Input | Action |
| --- | --- |
| Arrow Up / Down | Pitch nose up / down |
| Arrow Left / Right | Bank and turn |
| W / S or Shift / Ctrl | Throttle up / down |
| Space | Airbrake |
| P | Pause |
| R | Restart mission |
| M | Mute sound |
| Mouse | Click menu buttons |

The HUD shows altitude, speed, heading (compass + needle), throttle, fuel,
mission timer, score, ring progress and warnings (STALL / LOW FUEL / TERRAIN /
WIND SHEAR). Instruments are lit gauges with needles.

## Screenshot poses

`?shot=menu` — main menu · `?shot=rally` — mid-rally with rings ahead ·
`?shot=runway` — final approach with runway lights · `?shot=storm` — the
squall line. Each pose is deterministic.

## Build / hand-in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22 standard library only) copies `game/` and `screenshots/`
into the output directory and writes `dossier.json` with `buildDossier`
from `vendor/makefun-game.ts`. Running it twice produces byte-identical
output.

## Layout

- `game/index.html` — shell + canvas + module loader
- `game/src/config.js` — all tuning constants
- `game/src/audio.js` — WebAudio synth (engine hum, ring chime, alarm, wind)
- `game/src/input.js` — keyboard + mouse hit-testing
- `game/src/world.js` — seeded procedural archipelago, runways, ring courses
- `game/src/physics.js` — flight model (stall, fuel, damage, landing)
- `game/src/missions.js` — the three sorties, scoring and pilot ranks
- `game/src/render.js` — pseudo-3D renderer, HUD, menus and end screens
- `game/src/main.js` — game loop + state machine
- `game/src/shots.js` — deterministic `?shot=` poses
- `main.ts` — copies `game/` + `screenshots/` to `/output` and writes the dossier
