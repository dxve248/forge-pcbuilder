// Build state, totals and change notifications.

import { PARTS, PARTS_BY_ID } from './data/parts.js';
import { evaluateCompatibility, estimatePower } from './data/rules.js';

const CATEGORY_IDS = Object.keys(PARTS);

// Tiny seeded PRNG so a given seed always yields the same random build.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BuildStore {
  constructor() {
    this.build = Object.fromEntries(CATEGORY_IDS.map(id => [id, null]));
    this.listeners = new Set();
    this._undo = [];
    this._redo = [];
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this); // fire immediately with current state
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this);
  }

  /** Record the current build so it can be restored with undo(). */
  _pushHistory() {
    this._undo.push(this.toObject());
    if (this._undo.length > 50) this._undo.shift();
    this._redo.length = 0;
  }

  /** Apply a { category: partId } map without touching history. */
  _apply(map) {
    for (const id of CATEGORY_IDS) {
      const pid = map && map[id];
      this.build[id] = (pid && PARTS_BY_ID[pid]) || null;
    }
    this._emit();
  }

  /** Install (or toggle off) a part by id. */
  select(category, partId) {
    if (!PARTS[category]) return;
    this._pushHistory();
    if (partId === null) {
      this.build[category] = null;
    } else {
      const current = this.build[category];
      this.build[category] = current && current.id === partId ? null : PARTS_BY_ID[partId] || null;
    }
    this._emit();
  }

  clear(category) {
    this._pushHistory();
    this.build[category] = null;
    this._emit();
  }

  reset() {
    this._pushHistory();
    for (const id of CATEGORY_IDS) this.build[id] = null;
    this._emit();
  }

  /** Restore the previous build state. Returns false when history is empty. */
  undo() {
    if (!this._undo.length) return false;
    this._redo.push(this.toObject());
    this._apply(this._undo.pop());
    return true;
  }

  /** Re-apply the most recently undone build state. */
  redo() {
    if (!this._redo.length) return false;
    this._undo.push(this.toObject());
    this._apply(this._redo.pop());
    return true;
  }

  get canUndo() { return this._undo.length > 0; }
  get canRedo() { return this._redo.length > 0; }

  /** Plain { category: partId } for the installed parts only (for storage/URLs). */
  toObject() {
    const out = {};
    for (const id of CATEGORY_IDS) {
      if (this.build[id]) out[id] = this.build[id].id;
    }
    return out;
  }

  /** Install a saved build from a { category: partId } map (ignores unknown ids). */
  load(map, { history = true } = {}) {
    if (history) this._pushHistory();
    this._apply(map);
  }

  /** Build a sensible, fully-compatible system in one click. */
  random(seed) {
    this._pushHistory();
    const rnd = seed === undefined || seed === null || seed === '' ? Math.random : mulberry32(Number(seed) >>> 0);
    const pick = (list, filter) => {
      const pool = filter ? list.filter(filter) : list;
      return pool[Math.floor(rnd() * pool.length)] || list[0];
    };

    const pcCase = pick(PARTS.case);
    const motherboard = pick(PARTS.motherboard, m => pcCase.formFactors.includes(m.formFactor));
    const cpu = pick(PARTS.cpu, c => c.socket === motherboard.socket);
    const cooler = pick(PARTS.cooler, cl =>
      cl.sockets.includes(cpu.socket) &&
      cl.tdp >= cpu.power &&
      (cl.type === 'Air' ? cl.height <= pcCase.maxCoolerHeight : cl.radiator <= pcCase.maxRadiator));
    const ram = pick(PARTS.ram, r =>
      r.ramType === motherboard.ramType && r.sticks <= motherboard.ramSlots);
    const gpu = pick(PARTS.gpu, g => g.length <= pcCase.maxGpuLength);
    const storage = pick(PARTS.storage);

    Object.assign(this.build, { case: pcCase, motherboard, cpu, cooler, ram, gpu, storage, psu: null });

    // size the PSU from the real estimated draw (~30% headroom), honouring the
    // GPU's power connector when it needs 12VHPWR
    const recommended = Math.ceil((this.power * 1.3) / 50) * 50;
    const need12 = gpu.connector === '12VHPWR';
    const eligible = PARTS.psu.filter(p =>
      p.wattage >= recommended && (!need12 || p.pcie12vhpwr));
    const pool = eligible.length ? eligible : PARTS.psu.filter(p => !need12 || p.pcie12vhpwr);
    this.build.psu = pool.length
      ? pool[Math.floor(rnd() * pool.length)]
      : PARTS.psu.reduce((a, b) => (b.wattage > a.wattage ? b : a));

    this._emit();
  }

  get totalPrice() {
    return CATEGORY_IDS.reduce((sum, id) => sum + (this.build[id] ? this.build[id].price : 0), 0);
  }

  get power() {
    return estimatePower(this.build);
  }

  get psuCapacity() {
    return this.build.psu ? this.build.psu.wattage : 0;
  }

  get compatibility() {
    return evaluateCompatibility(this.build);
  }

  get isComplete() {
    return CATEGORY_IDS.every(id => this.build[id]);
  }

  get categories() {
    return CATEGORY_IDS;
  }
}

// --- build serialization (shareable URLs) -----------------------------------

const _b64 = typeof btoa === 'function'
  ? s => btoa(s)
  : s => Buffer.from(s, 'utf8').toString('base64');
const _a64 = typeof atob === 'function'
  ? s => atob(s)
  : s => Buffer.from(s, 'base64').toString('utf8');

/** Encode a { category: partId } build into a compact base64url string. */
export function encodeBuild(map) {
  const json = JSON.stringify(map || {});
  const utf8 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)));
  return _b64(utf8)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Decode a base64url build string; returns null when malformed. */
export function decodeBuild(str) {
  try {
    const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const latin = _a64(b64);
    const escaped = Array.from(latin, c => {
      const code = c.charCodeAt(0);
      return code < 128 ? c : '%' + code.toString(16).toUpperCase().padStart(2, '0');
    }).join('');
    return JSON.parse(decodeURIComponent(escaped));
  } catch {
    return null;
  }
}
