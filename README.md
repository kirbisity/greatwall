# Greatwall

A browser tower-defense game. Build walls to defend your city from raiders, and
see how long your civilization lasts.

## Running it

The game must be served over HTTP. Opening `greatwall.html` by double-clicking it
will hang on the loading spinner — browsers block ES module imports on `file://`.

```sh
cd greatwall
python3 -m http.server 8931
```

Then open **http://localhost:8931/greatwall.html**. Press Ctrl+C to stop the server.

Any static server works — `npx serve`, `php -S localhost:8931`, or whatever you
already have.

## Playing

| Control | Action |
|---|---|
| Drag | Pan the map |
| Scroll wheel | Zoom in and out |
| Bottom-left buttons | Build wall, remove wall, repair (unimplemented), upgrade castle |
| Ctrl+Z | Undo the last wall section |
| `[` and `]` | Tilt the camera |

Settings has an **Atmosphere** toggle (distance haze and drifting cloud layers), on by
default, and a **Show Routes** toggle that draws the gateways raiders navigate by. Both
choices are remembered.
| Esc | Menu |

Drag with the build tool to lay wall sections. Ends snap to other wall ends and to the
edge of a city, so a wall can be anchored flush against the settlement. Redrawing over an
existing section repairs it rather than stacking a second wall, charging only for the
damage made good. Nothing may be built across a city, and upgrading to a larger city
demolishes and refunds any wall its new footprint covers. Removing a section refunds half
its price, less its damage. Castles pay income and regenerate every two seconds, and can
be upgraded twice. Seasons turn every 60 seconds: winter multiplies build costs,
autumn doubles income, and later seasons bring tougher raiders.

Cavalry die against walls. Infantry walk through them.

## Tests

```sh
npm test
```

No dependencies — `node --test` against the modules directly. Requires Node 18+.

## Layout

```
greatwall.html      Page markup
greatwall.css       Styles
src/                Game source (ES modules)
  config.js           Tuning tables: castles, raiders, seasons, costs
  geometry.js         Vector and segment maths
  entities.js         Wall, Castle, Raider
  game.js             Rules and state — no DOM
  camera.js           World/screen transforms, pan and zoom
  renderer.js         Canvas drawing
  sprites.js          Image loading
  hud.js              Menus, modals, HUD, audio
  input.js            Mouse and keyboard
  main.js             Wiring and the frame loop
  projection.js       Perspective camera maths
  structures.js       Turns a building definition into 3D faces
  buildings/          Building layouts, one data module per castle tier
  atmosphere.js       Distance haze and cloud layers
  navigation.js       Gateway graph raiders route by
  pathfinding.js      Waypoint choice and steering
  settings.js         Player preferences, persisted
test/               Tests
images/  sounds/    Assets
```

`src/config.js` through `src/game.js` have no DOM dependency, which is what lets the
tests run the simulation headlessly.
