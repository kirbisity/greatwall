const STORAGE_KEY = 'greatwall.settings';

/** Player preferences that survive a reload. Atmosphere is the costly one. */
export const settings = {
  atmosphere: true,
  showRoutes: false,
};

export function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      Object.assign(settings, JSON.parse(stored));
    }
  } catch (error) {
    // Private windows and blocked storage are fine; the defaults stand.
    console.warn('Could not read saved settings:', error.message);
  }
  return settings;
}

export function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Could not save settings:', error.message);
  }
}
