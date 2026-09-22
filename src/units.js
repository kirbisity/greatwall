/**
 * Raider formations built from small solids rather than sprites.
 *
 * Each type compiles once into figures in unit-local space, where +y is the
 * way the formation faces and +z is up. The renderer rotates, offsets and
 * projects those every frame, so the geometry here is built one time only.
 *
 * Every figure carries three builds: `detail` when a formation is large on
 * screen, `plain` at play zoom, and `speck` — a single quad — once a figure is
 * down to a pixel or two and a box would be five faces of wasted fill.
 */

/** Everything here is scaled by this, so companies can be resized in one place. */
const SCALE = 1.28;
const at = (value) => value * SCALE;

const MATERIALS = {
  imperialMail: [212, 220, 230],
  imperialTrim: [214, 178, 96],
  brightSteel: [238, 242, 246],
  tanCloth: [186, 158, 112],
  tanSkin: [201, 172, 137],
  darkMail: [92, 96, 104],
  darkSteel: [138, 146, 156],
  horseHide: [124, 88, 58],
  horseDark: [98, 68, 44],
  rider: [150, 118, 82],
  shaft: [148, 120, 84],
  blade: [186, 192, 198],
};

// --- solids ---------------------------------------------------------------

/** Side walls plus a lid, wound so outward normals face away from the solid. */
function prism(footprint, bottom, top, material) {
  const base = footprint.map((point) => ({ x: point.x, y: point.y, z: bottom }));
  const lid = footprint.map((point) => ({ x: point.x, y: point.y, z: top }));
  const faces = [{ points: lid, material }];
  for (let i = 0; i < footprint.length; i += 1) {
    const j = (i + 1) % footprint.length;
    faces.push({ points: [base[i], base[j], lid[j], lid[i]], material });
  }
  return faces;
}

function box(centre, size, material) {
  const halfX = size.x / 2;
  const halfY = size.y / 2;
  return prism([
    { x: centre.x - halfX, y: centre.y - halfY },
    { x: centre.x + halfX, y: centre.y - halfY },
    { x: centre.x + halfX, y: centre.y + halfY },
    { x: centre.x - halfX, y: centre.y + halfY },
  ], centre.z, centre.z + size.z, material);
}

function ring(centre, radius, sides, turn = 0) {
  return Array.from({ length: sides }, (unused, i) => {
    const angle = turn + (i / sides) * 2 * Math.PI;
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
}

/** An upright n-sided column, standing in for a cylinder at this scale. */
function cylinder(centre, radius, height, material, sides = 5) {
  return prism(ring(centre, radius, sides), centre.z, centre.z + height, material);
}

/**
 * A head: two stacked bands narrowing at both ends. Five sides is enough to
 * read as a sphere once a figure is only a few pixels tall.
 */
function ball(centre, radius, material, sides = 5) {
  const low = ring(centre, radius * 0.6, sides);
  const middle = ring(centre, radius, sides);
  const high = ring(centre, radius * 0.6, sides);
  const at = (points, z) => points.map((point) => ({ ...point, z }));
  const bands = [
    [at(low, centre.z), at(middle, centre.z + radius * 0.7)],
    [at(middle, centre.z + radius * 0.7), at(high, centre.z + radius * 1.4)],
  ];
  const faces = [{ points: at(high, centre.z + radius * 1.4), material }];
  for (const [lower, upper] of bands) {
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      faces.push({ points: [lower[i], lower[j], upper[j], upper[i]], material });
    }
  }
  return faces;
}

/** A shaft leaning `pitch` radians back from vertical, in the facing plane. */
function shaft(foot, length, thickness, pitch, material) {
  const lean = Math.sin(pitch) * length;
  const rise = Math.cos(pitch) * length;
  const half = thickness / 2;
  const tip = { x: foot.x, y: foot.y + lean, z: foot.z + rise };
  return [
    {
      points: [
        { x: foot.x - half, y: foot.y, z: foot.z },
        { x: foot.x + half, y: foot.y, z: foot.z },
        { x: tip.x + half, y: tip.y, z: tip.z },
        { x: tip.x - half, y: tip.y, z: tip.z },
      ],
      material,
    },
    {
      points: [
        { x: foot.x, y: foot.y - half, z: foot.z },
        { x: foot.x, y: foot.y + half, z: foot.z },
        { x: tip.x, y: tip.y + half, z: tip.z },
        { x: tip.x, y: tip.y - half, z: tip.z },
      ],
      material,
    },
  ];
}

function shift(faces, offset) {
  return faces.map((face) => ({
    material: face.material,
    points: face.points.map((point) => ({
      x: point.x + offset.x,
      y: point.y + offset.y,
      z: point.z,
    })),
  }));
}

// --- figures --------------------------------------------------------------

const FOOT_BODY = { x: at(0.62), y: at(0.46), z: at(1.0) };
const HEAD_RADIUS = at(0.3);

function footSoldier({ cloth, skin, weapon }) {
  const body = box({ x: 0, y: 0, z: 0 }, FOOT_BODY, cloth);
  const head = ball({ x: 0, y: 0, z: FOOT_BODY.z }, HEAD_RADIUS, skin);
  const stout = box({ x: 0, y: 0, z: 0 }, { ...FOOT_BODY, z: FOOT_BODY.z + HEAD_RADIUS }, cloth);
  return {
    detail: [...body, ...head, ...weapon],
    plain: stout,
    speck: [stout[0]],
  };
}

/** A spear held forward, angled over the shoulder. */
function spearArm(length) {
  return shaft({ x: at(0.34), y: at(-0.1), z: at(0.35) }, at(length), at(0.09), -0.62, MATERIALS.shaft);
}

/** A short sword, near vertical. */
function swordArm(material = MATERIALS.blade) {
  return shaft({ x: at(0.36), y: at(0.05), z: at(0.5) }, at(0.62), at(0.11), 0.18, material);
}

/** A sabre: two segments, the upper one kicked over to suggest a curve. */
function sabreArm() {
  const lower = shaft({ x: at(0.34), y: at(0.02), z: at(0.9) }, at(0.4), at(0.1), 0.25, MATERIALS.blade);
  const upper = shaft({ x: at(0.34), y: at(0.12), z: at(1.28) }, at(0.36), at(0.09), 0.75, MATERIALS.blade);
  return [...lower, ...upper];
}

const HORSE_BODY = { x: at(0.62), y: at(1.7), z: at(0.6) };
const LEG_HEIGHT = at(0.62);

function horseman({ weapon }) {
  const legs = [[-0.24, -0.6], [0.24, -0.6], [-0.24, 0.6], [0.24, 0.6]]
    .flatMap(([x, y]) => cylinder({ x: at(x), y: at(y), z: 0 }, at(0.12), LEG_HEIGHT, MATERIALS.horseDark, 4));
  const body = box({ x: 0, y: 0, z: LEG_HEIGHT }, HORSE_BODY, MATERIALS.horseHide);
  const seat = LEG_HEIGHT + HORSE_BODY.z;
  const rider = box({ x: 0, y: at(-0.12), z: seat }, { x: at(0.46), y: at(0.42), z: at(0.62) }, MATERIALS.rider);
  const head = ball({ x: 0, y: at(-0.12), z: seat + at(0.62) }, at(0.26), MATERIALS.tanSkin);
  const armed = shift(weapon, { x: 0, y: at(-0.12) }).map((face) => ({
    material: face.material,
    points: face.points.map((point) => ({ ...point, z: point.z + seat })),
  }));
  const mount = box({ x: 0, y: 0, z: LEG_HEIGHT * 0.5 }, { ...HORSE_BODY, z: HORSE_BODY.z + LEG_HEIGHT * 0.5 }, MATERIALS.horseHide);
  return {
    detail: [...legs, ...body, ...rider, ...head, ...armed],
    plain: [
      ...mount,
      ...box({ x: 0, y: at(-0.12), z: seat }, { x: at(0.46), y: at(0.42), z: at(0.86) }, MATERIALS.rider),
    ],
    speck: [mount[0]],
  };
}

// --- formations -----------------------------------------------------------

/** Loose ranks with the spacing jittered, so the block reads as a rabble. */
function swarm(count, spread, random) {
  return Array.from({ length: count }, (unused, i) => {
    const row = Math.floor(i / 4);
    const column = i % 4;
    return {
      x: (column - 1.5) * spread + (random() - 0.5) * spread * 1.1,
      y: (row - 1.2) * spread + (random() - 0.5) * spread * 1.1,
    };
  });
}

function grid(columns, rows, spread) {
  const places = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      places.push({
        x: (column - (columns - 1) / 2) * spread,
        y: (row - (rows - 1) / 2) * spread,
      });
    }
  }
  return places;
}

/** Ranks abreast, each rank set back from the last. */
function ranks(perRank, rankCount, spread, depth) {
  const places = [];
  for (let rank = 0; rank < rankCount; rank += 1) {
    for (let file = 0; file < perRank; file += 1) {
      places.push({
        x: (file - (perRank - 1) / 2) * spread,
        y: (rank - (rankCount - 1) / 2) * depth,
      });
    }
  }
  return places;
}

/** A wedge: one at the point, widening towards the back. */
function wedge(rows, spread, depth) {
  const places = [];
  for (let row = 0; row < rows; row += 1) {
    const width = row + 1;
    for (let file = 0; file < width; file += 1) {
      places.push({
        x: (file - (width - 1) / 2) * spread,
        y: -row * depth,
      });
    }
  }
  return places;
}

/** Deterministic jitter, so a formation looks the same every time it spawns. */
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const FORMATIONS = {
  IR0: () => ({
    places: swarm(14, at(1.9), seededRandom(7)),
    figure: footSoldier({
      cloth: MATERIALS.tanCloth,
      skin: MATERIALS.tanSkin,
      weapon: spearArm(2.1),
    }),
  }),
  IR1: () => ({
    places: grid(4, 4, at(1.45)),
    figure: footSoldier({
      cloth: MATERIALS.darkMail,
      skin: MATERIALS.darkSteel,
      weapon: swordArm(),
    }),
  }),
  CR0: () => ({
    places: ranks(5, 2, at(1.7), at(2.4)),
    figure: horseman({ weapon: sabreArm() }),
  }),
  CR1: () => ({
    places: wedge(4, 1.8 * SCALE, 2.3 * SCALE),
    figure: horseman({ weapon: shaft({ x: at(0.34), y: 0, z: at(0.4) }, at(2.4), at(0.09), 0.05, MATERIALS.shaft) }),
  }),
  IG0: () => ({
    places: grid(5, 4, at(1.4)),
    figure: footSoldier({
      cloth: MATERIALS.imperialMail,
      skin: MATERIALS.brightSteel,
      weapon: swordArm(MATERIALS.imperialTrim),
    }),
  }),
};

/**
 * Build a type's formation. Each figure gets its own phase so the company
 * shifts out of step, which is what stops it looking like one rigid object.
 */
export function compileUnit(typeId) {
  const build = FORMATIONS[typeId];
  if (!build) {
    return null;
  }
  const { places, figure } = build();
  const jitter = seededRandom(typeId.charCodeAt(2) * 37 + 11);
  let radius = 0;

  const figures = places.map((place) => {
    radius = Math.max(radius, Math.hypot(place.x, place.y));
    return {
      phase: jitter() * Math.PI * 2,
      detail: shift(figure.detail, place),
      plain: shift(figure.plain, place),
      speck: shift(figure.speck, place),
    };
  });
  return { figures, radius: radius + 1.5 };
}
