import { BuildStore, decodeBuild } from './build.js';
import { Viewer } from './scene.js';
import { UI } from './ui.js';
import { loadLivePrices } from './prices.js';
import { applyDocumentLang } from './i18n.js';

applyDocumentLang();

const store = new BuildStore();
const viewer = new Viewer(document.getElementById('canvas-wrap'));
const ui = new UI(store, viewer);

// Keep the 3D scene in sync with the build whenever it changes.
store.subscribe(s => {
  for (const category of s.categories) {
    const part = s.build[category];
    const current = viewer.parts.get(category);
    const currentId = current ? current.userData.partId : null;
    const nextId = part ? part.id : null;
    if (currentId !== nextId) viewer.setPart(category, part);
  }
});

// Restoration order: a ?build= share link wins, then the locally saved build,
// otherwise the seeded random showcase build.
const params = new URLSearchParams(location.search);
const SAVE_KEY = 'forgepc-build';
const saveBuild = map => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
};
const readLocalBuild = () => {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; }
};

const shared = params.get('build');
if (shared) {
  const map = decodeBuild(shared);
  if (map && Object.keys(map).length) store.load(map);
  else store.random(params.get('seed') === null ? undefined : params.get('seed'));
} else {
  const local = readLocalBuild();
  if (local && Object.keys(local).length) {
    store.load(local);
  } else {
    const seed = params.get('seed');
    store.random(seed === null ? undefined : seed);
  }
}

// Autosave after the restore, so the initial emit keeps the restored build.
store.subscribe(s => saveBuild(s.toObject()));

// Live prices (from the cache updated by `npm run sync-prices`) overlay the
// catalog estimates as soon as they load.
loadLivePrices().then(() => ui.render());

// Offline/installable shell (PWA) on localhost + HTTPS.
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' ||
     location.hostname === 'localhost' ||
     location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// Expose for quick console tinkering.
window.pcBuilder = { store, viewer, ui };