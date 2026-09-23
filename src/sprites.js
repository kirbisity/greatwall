import { RAIDER_TYPES } from './config.js';

/** Unit sprites only; castles are generated geometry. Drawing an unloaded image is a no-op. */
export function loadSprites() {
  const paths = Object.values(RAIDER_TYPES).flatMap((type) => type.sprites);

  const sprites = new Map();
  for (const path of paths) {
    const image = new Image();
    image.src = path;
    sprites.set(path, image);
  }
  return sprites;
}
