// Named build library backed by localStorage. Each entry is
// { id, name, map, at } where `map` is a { category: partId } object.
//
// The module is import-safe from Node (no localStorage) — calls degrade to
// in-memory no-ops so unit tests can import it without a DOM.

const KEY = 'forgepc-builds';
const MAX = 50;

const mem = { value: null };
const hasLS = () => typeof localStorage !== 'undefined';

function read() {
  if (mem.value) return mem.value;
  let list = [];
  try {
    if (hasLS()) list = JSON.parse(localStorage.getItem(KEY)) || [];
  } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  mem.value = list;
  return list;
}

function write(list) {
  mem.value = list;
  try { if (hasLS()) localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/** All saved builds, newest first. */
export function listBuilds() {
  return read().slice().sort((a, b) => (b.at || 0) - (a.at || 0));
}

/**
 * Save (or overwrite by name) a build.
 * @param {string} name
 * @param {object} map - { category: partId }
 * @returns {object} the saved entry
 */
export function saveBuild(name, map) {
  const list = read();
  const clean = String(name || '').trim() || 'Untitled build';
  const existing = list.find(b => b.name.toLowerCase() === clean.toLowerCase());
  const entry = {
    id: existing ? existing.id : `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: clean,
    map: { ...map },
    at: Date.now()
  };
  const next = existing ? list.map(b => (b.id === existing.id ? entry : b)) : [entry, ...list];
  write(next.slice(0, MAX));
  return entry;
}

/** Fetch a saved build by id, or null. */
export function getBuild(id) {
  return read().find(b => b.id === id) || null;
}

/** Remove a saved build by id. Returns the remaining list. */
export function deleteBuild(id) {
  const next = read().filter(b => b.id !== id);
  write(next);
  return listBuilds();
}

/** Remove every saved build. */
export function clearBuilds() {
  write([]);
}
