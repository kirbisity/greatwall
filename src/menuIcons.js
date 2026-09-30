/**
 * Small line icons for the menus, as data URIs so they need no files of their
 * own and load with the page. Drawn light-on-dark to sit on the game's panels.
 */
const STROKE = 'fill="none" stroke="#f3e6c4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const ICON_PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>',
  heat: '<circle cx="12" cy="8" r="3.4"/><path d="M12 1.5v1.4M5.6 4.1l1 1M18.4 4.1l-1 1M3 8h1.4M19.6 8H21M3 15c2-1.6 3-1.6 4.5 0s2.5 1.6 4.5 0 3-1.6 4.5 0 2.5 1.6 4.5 0M3 20c2-1.6 3-1.6 4.5 0s2.5 1.6 4.5 0 3-1.6 4.5 0 2.5 1.6 4.5 0"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a3.75 3.75 0 0 1-.5 7.5z"/>',
  fog: '<path d="M4 8h12M2 12h16M6 16h14M4 20h9"/>',
  wind: '<path d="M3 9h11.5a2.5 2.5 0 1 0-2.5-2.5M3 14h16a2.5 2.5 0 1 1-2.5 2.5M3 19h8"/>',
  snow: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4.5L12 6.5l2.5-2M9.5 19.5L12 17.5l2.5 2"/>',
  rain: '<path d="M7 14a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 6.5a3.75 3.75 0 0 1-.5 7.5z"/><path d="M8 17.5l-1.2 3M12.5 17.5l-1.2 3M17 17.5l-1.2 3"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 10-9"/>',
};

const cache = new Map();

/** A data-URI `src` for a named icon, or null for a name with no drawing. */
export function iconSource(name) {
  const paths = ICON_PATHS[name];
  if (!paths) {
    return null;
  }
  if (!cache.has(name)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${STROKE}>${paths}</svg>`;
    cache.set(name, `data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
  return cache.get(name);
}
