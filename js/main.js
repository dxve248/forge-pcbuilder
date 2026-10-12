import { BuildStore } from './build.js';
import { Viewer } from './scene.js';
import { UI } from './ui.js';
import { loadLivePrices } from './prices.js';

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

// Start with a compatible showcase build. A ?seed= URL param makes the
// random build reproducible (handy for testing/screenshots).
const seed = new URLSearchParams(location.search).get('seed');
store.random(seed === null ? undefined : seed);

// Optional real models & prices: swap parts once configured.
// Live prices (from the cache updated by `npm run sync-prices`) overlay the
// catalog estimates as soon as they load.
loadLivePrices().then(() => ui.render());

// Expose for quick console tinkering.
window.pcBuilder = { store, viewer, ui };
