# Dungeon Crawler — Wilson Maze + A*

A DOOM-inspired, Wolfenstein-style browser raycaster built with plain HTML,
CSS, and JavaScript. No framework, package installation, or build step is required.

[Play the game](https://xbmm1.github.io/2048/Project_Root/doom-crawler/doom2/index.html)

For local play, open [doom2/index.html](doom2/index.html) in a modern desktop
browser. Keep the `css`, `js`, and `assets` folders alongside it. The layout fills
the browser window, but controls currently require a keyboard and mouse; there
are no touch controls or saved runs.

## Goal and floor progression

Collect every required key, approach the arched wooden exit, and descend to the
next floor. The HUD shows floor, health, kills, and collected/required keys.

- Floors start at 1. The maze has `(5 + floor)` cells per side, expanded to
  `(2 × (5 + floor) + 1)` tiles per side.
- Required keys are `min(4, 1 + floor(floorNumber / 2))`. Keys reset each floor.
- The exit occupies a farthest reachable tile from spawn, found with one
  breadth-first search over the walkable grid.
- The door stays closed without all keys. Approaching it shows a subtle reminder
  with the number still missing. Once unlocked, it animates open over 0.6 seconds
  when within 1.5 tiles and visible; moving away closes it again.
- Entering the fully open door fades out over 0.22 seconds, builds the next floor
  at black, then fades in over 0.22 seconds. Movement and attacks are suspended
  during the transition.
- Health packs restore 30 HP, capped at 100. Health, kills, stored power-ups, and
  remaining active effects carry between floors; starting a new run resets them.
- Enemy count is `max(1, round((2 + floor) × countMultiplier))`. Base enemy speed
  is `1.25 + floor × 0.08`, adjusted by the speed setting. Enemy health starts at
  `30 × healthMultiplier`.

## Controls

| Action | Control |
| --- | --- |
| Move / strafe | `W` `A` `S` `D` |
| Turn | Mouse or `←` / `→` |
| Shoot | Click or `Space` |
| Knife attack | `F` |
| Select stored speed / damage / shield | `1` / `2` / `3` |
| Use selected power-up | `E` |
| Toggle enemy paths on minimap | `M` |
| Pause / resume and settings | `P` |
| Release captured mouse | `Esc` (losing pointer lock pauses an active run) |

Starting or resuming requests mouse capture. The pause menu also offers restart,
main menu, and settings reset. Held movement keys are cleared on focus loss,
tab hiding, pause, resume, and restart to prevent stuck movement.

## Combat and enemies

The pistol is hitscan: it damages the nearest living enemy inside its aiming cone,
within 8 tiles, with a clear line of sight. Base damage is 20. The animated knife
swipe lasts 0.5 seconds and hits once at 0.2 seconds, targeting the nearest visible
enemy within 1.1 tiles and 45 degrees either side of the aim direction. Its base
damage is also 20. Shooting is blocked during a knife swing. Neither attack
currently applies knockback.

All ghosts reuse the same pixel-art atlas with floating, attack, hurt, and dissolve
animations. Hits flash red; death uses a darker crimson tint throughout the
0.6-second dissolve. Color variants are prepared once and cached.

| Ghost | Behavior | Minimap marker |
| --- | --- | --- |
| Pale / cyan | Chases the player and deals 8 melee damage with a 1-second cooldown | Red |
| Violet | Chases and fires bolts with clear sight, between 0.6 and 6 tiles away; bolts deal 12 damage | Violet |
| Amber / gold | Patrols a fixed route, briefly chases nearby players, then returns | Orange (`#ff923f`) |

### Amber patrol ghost

- Appears from floor 1, replacing `max(1, round(totalEnemies × 0.25))` enemies,
  without increasing the total. Remaining enemies retain their usual melee/ranged
  selection.
- Each route is generated once per floor by exploring within six path steps of
  a sampled spawn. A closed circuit is preferred; if none is found, the ghost
  walks a fixed route back and forth.
- Detects the player within 2.5 tiles with clear sight. It gives up beyond 4 tiles
  or after losing sight for 2 seconds, then navigates to the nearest patrol
  waypoint and resumes its original route.
- Can reacquire the player while returning. Shooting it from beyond detection
  range does not trigger a chase.
- Uses visible, close-range melee attacks: 8 damage with a 1-second cooldown.
  It never fires projectiles. Shield protection applies normally.
- Patrol movement reaches tile centers and clamps each step to the remaining
  distance to avoid overshooting waypoints. Detection timers freeze while paused.

## Stored power-ups

Pickups go into the compact vertical hotbar on the left rather than activating
immediately. A slot appears only while that type has charges; the entire bar
hides when empty. Using the last charge selects another available slot.

| Slot | Power-up | World and minimap icon | Effect per charge |
| --- | --- | --- | --- |
| `1` | Speed | Cyan pixel lightning bolt | 1.5× movement speed for 8 seconds |
| `2` | Damage | Orange pixel sword | 2× pistol and knife damage for 10 seconds |
| `3` | Shield | Green pixel shield | Prevents enemy damage for 10 seconds |

Repeated uses add duration to the current effect. Active badges show remaining
seconds. The code calls shield protection `invincible` internally.

Icons use hard-edged pixel patterns, dark outlines, and highlights to match the
key artwork. Separate simplified patterns keep the minimap versions readable.
They are drawn into cached canvases once at startup, with no external icon files
or repeated pixel-pattern generation during gameplay.

## Visuals, minimap, and settings

- Full-window game layout with a responsive internal render size, textured walls,
  a pixel-art yellow key, animated arched door, and bottom-aligned pistol/knife.
- A seamless procedural panorama with mountains and pine silhouettes transitions
  from brighter dusk/sunset on floor 1 to night by floor 10. The sun sinks and
  fades, the moon appears, and stars brighten as floors progress.
- The sky is repainted when a floor is built, not every frame. An optional
  `doom2/assets/sky.jpg` overrides the procedural panorama; custom skies receive
  a floor-based dark tint. Wall textures also darken with depth, reaching a 35%
  brightness reduction by floor 10 before distance/side shading.
- The minimap shows the player, enemies, projectiles, keys, a brown door arch,
  green health crosses, and the three power-up icons. Optional fog reveals tiles
  around the player. `M` displays pursuit/return paths and repeating patrol routes;
  patrol markers and paths are orange.
- A small top-left FPS counter updates approximately twice per second.

The pause menu saves settings in browser local storage under
`dungeonCrawlerSettings`. It stores settings only, not game progress. Invalid
saved types, non-finite numbers, and out-of-range values fall back to defaults;
unknown fields are ignored. Storage being unavailable does not prevent play.

| Setting | Default | Range / choices |
| --- | --- | --- |
| Mouse sensitivity | 1.00× = 0.0015 radians per mouse movement unit | 0.25×–4.00× |
| Keyboard turn speed | 2.6 radians/second | 1.8–4.6 |
| Enemy speed multiplier | 1.00× | 0.70×–1.60× |
| Enemy count multiplier | 1.0× | 0.5×–2.5× |
| Enemy health multiplier | 1.0× | 0.5×–2.5× |
| Minimap / crosshair | On | On / off |
| Enemy paths / fog of war / inverted horizontal look | Off | On / off |

Enemy count and health settings apply when the next floor or new run is built.
Speed and view settings apply to the current game. Saved sensitivity remains in
its underlying numeric units; the UI displays a multiplier.

## FPS and general performance

The improvements reduce rendering and search work without adding dependencies.
They are not a promise of a particular FPS on every browser or device.

| Area | Current optimization | Benefit / tradeoff |
| --- | --- | --- |
| Render resolution | Preserve viewport aspect ratio with an internal canvas no larger than 960×600 | Larger windows do not increase the internal pixel budget; output is intentionally pixelated |
| Wall rays | One ray per two columns when internal width is at least 640; one per column below that | At width 960, 480 wall rays instead of 960; the depth buffer still covers every column |
| Ghost rendering | Cache normal, violet, amber, hit, and death palettes; clip adjacent visible columns and draw each visible ghost once | Avoids per-frame color filtering and repeated image draws for each sprite column |
| Pickup rendering | Reuse image clipping for keys and cached power-up icons | Preserves wall occlusion and crisp nearest-neighbor pixels |
| Idle scenes | Redraw paused, title, and game-over scenes only when needed, including asset loads, settings, and resize | Avoids repeating the full raycaster/minimap draw for an unchanged scene |
| Minimap | Cache the terrain image; rebuild on floor/size/fog changes or newly revealed terrain | Each ordinary frame copies the terrain once, then draws dynamic markers and optional paths |
| Exit placement | One breadth-first search instead of 40 sampled A* searches | Finds an actual farthest reachable tile with one traversal |
| Enemy pathfinding | Round-robin scheduling, at most two A* searches per update | Spreads initial and overdue searches across frames; large groups may wait longer for a fresh path |
| Patrol paths | Build once; skip recurring searches while patrolling | Only chase/return navigation uses the shared A* budget |
| UI updates | Avoid rewriting unchanged HUD text, hotbar markup, and active-effect badges | Reduces unnecessary DOM work |
| Background and math | Cache the panorama; compare squared distances when only proximity matters | Avoids per-frame scenery generation and unnecessary square roots |

### What the FPS counter measures

The counter averages `requestAnimationFrame` intervals over about 500 ms, before
clamping the gameplay time step, and resets its sampling when tab visibility
changes. It measures animation-frame callbacks, not just rendered scenes. Because
the lightweight frame loop still runs while paused, its paused reading does not
mean the world is being redrawn that often.

Gameplay uses elapsed seconds with a maximum step of 0.05 seconds, rather than
assuming 60 FPS. This prevents a long delay from producing one enormous movement
step; it is not a fixed-step simulation and does not fully catch up after a long
stall. Browser refresh rate, hardware, floor size, enemy count, visible sprites,
and optional path overlays still affect performance. Very large floors can still
cost more to generate, search, and render; limiting searches per frame does not
make an individual A* search constant-time.

### Verification performed during development

Targeted browser and renderer checks established the following:

- Floor 10 has 31×31 tiles: the initial cached terrain draw used 962 fills
  (961 tiles plus the background). Subsequent unchanged terrain draws used zero
  tile fills, copying the cache instead. Fog pixels matched an independently
  drawn reference, and repeated reveals did not rebuild unchanged terrain.
- Stable paused/title scenes performed no repeated world renders. Settings,
  asset loading, and resizing triggered refreshes; active play continued drawing.
- Exit placement made zero A* calls and matched the maximum reachable path
  distance in the checked maze.
- Thirty simultaneously due enemies received paths in fifteen batches of two.
  Mixed groups including chasing patrol ghosts obeyed the same limit, while
  idle patrol ghosts used no A* searches.
- Flat-wall depth stayed consistent across tested viewing angles and canvas
  sizes; sprites near screen edges stayed hidden behind closer walls.
- Tests also covered settings recovery, held-key clearing, pickup storage, icon
  transparency, patrol routes, detection, return, combat, and pause/reset behavior.

These are work-count and correctness checks, not an end-to-end before/after FPS
benchmark. Extended gameplay performance and balance across physical devices have
not been quantified. Development check scripts and screenshots were kept outside
this repository; no bundled automated test runner is currently provided.

## How it works

### Maze generation

[maze.js](doom2/js/maze.js) uses Wilson's loop-erased random walks to create a
uniform spanning tree of cells. A subsequent braiding pass opens additional
connections, so the final maze can contain loops and multiple routes; it is not
restricted to a perfect maze. Setting the braiding chance to zero retains the
tree layout. The expanded wall/floor tile grid is shared by movement, rendering,
visibility checks, exit placement, and pathfinding.

### Wall and sprite rendering

[raycaster.js](doom2/js/raycaster.js) uses DDA (Digital Differential Analysis) to
step through grid boundaries until a ray reaches a wall. Camera-plane rays are
left unnormalized, so the resulting wall depth is perpendicular to the camera
and comparable with sprite depth. This fixes the previous fisheye distortion and
edge-of-screen sprite occlusion mismatch. The base field of view is 60 degrees
at a 960:600 aspect ratio; the camera plane adapts to the viewport aspect.

Wall slices scale with `H / depth`, with a close-wall height cap, distance shading,
and darker side faces. A stable tile-coordinate hash selects among six wall
textures. Sprites are billboards projected into camera space and sorted far to
near. The per-column depth buffer clips them behind nearer walls. Procedural
fallbacks remain available for unloaded ghost, key, and door artwork.

### Pathfinding and movement

[astar.js](doom2/js/astar.js) searches four-directional tile neighbors with
`f(n) = g(n) + h(n)`, where `g` is path length and `h` is Manhattan distance to
the target. A binary min-heap gives logarithmic insertion/removal for the open
set instead of scanning every candidate for the lowest score.

Chasing enemies become eligible to re-plan after roughly 350–600 ms, subject to
the shared two-search budget. They follow their current waypoints between
searches. Amber ghosts use their stored route when patrolling, A* toward the
player when chasing, and a path to their selected route waypoint when returning.
Player movement checks each axis independently to allow sliding along walls.

The game uses native `Math.hypot` where actual lengths are required and squared
distance comparisons where they are not. There is no custom fast-inverse-square-root
implementation or documented cross-device speed claim for one; the verified
improvements above focus on avoiding repeated work.

## Files and artwork

```text
doom-crawler/
  README.md
  doom2/
    index.html             # Game markup, HUD, menus, controls, and legend
    css/style.css          # Full-window layout, overlays, hotbar, weapon effects
    js/maze.js             # Wilson generation, braiding, and tile expansion
    js/astar.js            # A* and binary min-heap
    js/raycaster.js        # Walls, depth buffer, sprite clipping, cached palettes
    js/powerup-icons.js    # Cached world/minimap pixel patterns for three boosts
    js/game.js             # Input, settings, levels, combat, AI, sky, UI, game loop
    assets/                # Texture PNGs, sprite sheets, and artwork notes
```

Runtime artwork includes `wraith-v1.png`, `door-v1.png`, `key-v1.png`,
`pistol-fire.png`, `knife-slash-v2.png`, and `tile065.png` through `tile070.png`.
The optional `sky.jpg` is not required. Sprite generation and preparation notes
are stored beside the relevant assets as Markdown files. The older knife sheet
remains in the assets folder; the game uses version 2. Power-up icons are defined
in JavaScript rather than loaded from PNGs.
