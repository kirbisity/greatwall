import { CASTLE_TYPES, RAIDER_TYPES } from './config.js';

/** Start loading every sprite once; drawing a not-yet-loaded image is a no-op. */
export function loadSprites() {
  const paths = Object.values(CASTLE_TYPES).map((type) => type.sprite);
  for (const type of Object.values(RAIDER_TYPES)) {
    paths.push(...type.sprites);
  }

  const sprites = new Map();
  for (const path of paths) {
    const image = new Image();
    image.src = path;
    sprites.set(path, image);
  }
  return sprites;
}
