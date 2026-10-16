// Lightweight persisted settings (language, currency, VAT) shared by the
// UI helpers. Falls back to defaults in non-browser contexts so that the
// modules stay importable from Node tests.

const DEFAULTS = { lang: 'en', currency: 'AED', vat: true, autoRotate: true, sidePanels: true, view: null };
const KEY = 'forgepc-settings';

let settings = { ...DEFAULTS };

function load() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(KEY);
      if (raw) settings = { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch { /* private mode / unavailable */ }
}
load();

/** Current persisted settings ({ lang, currency, vat }), auto-loaded on import. */
export function getSettings() {
  return settings;
}

/** Merge a patch into settings and persist it. */
export function updateSettings(patch) {
  Object.assign(settings, patch);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(settings));
    }
  } catch { /* ignore */ }
}