# Spike: semi-3D walls

A throwaway prototype, kept as a reference artifact. **No production code depends on it**
and nothing in `src/` was changed.

It answers one question: *can plain canvas 2D render walls as extruded blocks whose sides
appear as the view pans, or does that need a 3D engine?*

## Running it

```sh
python3 -m http.server 8932
```

then open <http://localhost:8932/spike/3d-walls/index.html> from the repository root.

Drag to pan · wheel to zoom · `[` and `]` to tilt.

`window.spike` exposes `camera`, `basis()`, `project()`, `toGround()`, `collectFaces()`,
`setWalls()` and `drawFaces()` so the measurements below can be reproduced from the console.

## What it does

~200 lines of canvas 2D: a perspective camera, wall segments extruded into boxes,
back-face culling, painter's-algorithm depth sorting and Lambert shading. No dependencies.

## Findings

**Yes, natively — for walls.** Buildings as real 3D models are a different question, and
the answer there is three.js.

### Panning reveals the sides

This was the claim worth testing. Under a true orthographic top-down camera, panning
reveals nothing — orthographic projection is position-independent. The requested effect
only exists under perspective.

One east-west wall, three camera positions, tilt 55°:

| Wall's position on screen | Visible flank | Roof area | Flank area | Flank share |
|---|---|---|---|---|
| Centre of screen | South | 6128 | 6197 | 50.3% |
| Toward the horizon | South | 2463 | 5189 | 67.8% |
| In the foreground | **North** | 22833 | 515 | 2.2% |

The flank share swings from 2% to 68% purely from panning, and the visible face flips
south→north as the wall crosses the camera's eyeline.

### Picking inverts exactly

Every tool needs a cursor pixel turned back into a ground position, which under
perspective is a ray/plane intersection. Round-tripping 121 ground points through
project → unproject gave a **worst error of 0.000000**. A 26-unit-tall wall top lands
21.9 px from its own footprint — the parallax that sells the effect.

### Performance has a ceiling

Full frame: cull, project, sort, fill.

| Walls | Visible faces | ms/frame | fps |
|---|---|---|---|
| 50 | 149 | 3.7 | 272 |
| 150 | 445 | 2.9 | 349 |
| 300 | 892 | 10.8 | 93 |
| 600 | 1785 | 28.7 | 35 |
| 1200 | 3566 | 62.3 | 16 |
| 2400 | 7129 | 145.6 | 7 |

**60 fps runs out around 400–450 walls**, and a long game lands in that range. Assume a
weaker machine is 2–3x slower. Raise the ceiling by frustum-culling off-screen walls
first, then merging collinear neighbours, then dropping side faces when zoomed out.

### A bug worth remembering

The first version culled every roof, because the wall footprint was wound clockwise seen
from above, so all face normals pointed inward. Symptom: walls rendered as thin strips of
side face with no top. Winding order is the thing to get right first in any hand-rolled
renderer.

## If this becomes real

The blast radius in the game is six call sites — `toScreen` three times in
`src/renderer.js`, `toWorld` three times in `src/input.js`. `src/game.js` never touches
screen space, so the rules, combat, economy and pathfinding are untouched and the existing
tests keep passing.

The shape of the work: a new `projection.js` (pure, testable), `camera.js` gains elevation
and distance, `renderer.js` draws boxes, `input.js` swaps `toWorld` for `toGround`.
**Keep height a rendering property and never a simulation one** — that decision is what
keeps the change small.

One risk is not technical: every castle and unit sprite is drawn top-down orthographic,
and a flat sprite lying on a tilted ground plane reads as a sticker. Going 3D makes
regenerating that art required rather than optional.
