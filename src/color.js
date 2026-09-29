/**
 * A hex colour's channels, as `[r, g, b]` -- the numeric form anything doing
 * colour math wants, whether that is blending a level's own palette or
 * shading a face. Shared rather than copied, since the parse itself is
 * three lines that had drifted into three different modules independently.
 */
export function hexChannels(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
