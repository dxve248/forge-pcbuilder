import { BuildStore, decodeBuild } from './build.js';
import { createViewer } from './scene.js';
import { UI } from './ui.js';
import { loadLivePrices } from './prices.js';
import { applyDocumentLang, t } from './i18n.js';

applyDocumentLang();

const store = new BuildStore();
const viewer = createViewer(document.getElementById('canvas-wrap'), {
  message: t('webglUnavailable')
});
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
// otherwise the seeded random showcase build. Initial loads skip history so
// the very first Ctrl+Z doesn't wipe the restored build.
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
  if (map && Object.keys(map).length) store.load(map, { history: false });
  else store.random(params.get('seed') === null ? undefined : params.get('seed'));
} else {
  const local = readLocalBuild();
  if (local && Object.keys(local).length) {
    store.load(local, { history: false });
  } else {
    const seed = params.get('seed');
    store.random(seed === null ? undefined : seed);
  }
}

// Autosave after the restore, so the initial emit keeps the restored build.
store.subscribe(s => saveBuild(s.toObject()));

// Undo / redo shortcuts (Ctrl/Cmd+Z, Ctrl+Y or Shift+Z).
window.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) {
    if (store.undo()) e.preventDefault();
  } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
    if (store.redo()) e.preventDefault();
  }
});

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