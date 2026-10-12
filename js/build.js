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
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this); // fire immediately with current state
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this);
  }

  /** Install (or toggle off) a part by id. */
  select(category, partId) {
    if (!PARTS[category]) return;
    if (partId === null) {
      this.build[category] = null;
    } else {
      const current = this.build[category];
      this.build[category] = current && current.id === partId ? null : PARTS_BY_ID[partId] || null;
    }
    this._emit();
  }

  clear(category) {
    this.build[category] = null;
    this._emit();
  }

  reset() {
    for (const id of CATEGORY_IDS) this.build[id] = null;
    this._emit();
  }

  /** Build a sensible, fully-compatible system in one click. */
  random(seed) {
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
      (cl.type === 'Air' ? cl.height <= pcCase.maxCoolerHeight : cl.radiator <= pcCase.maxRadiator));
    const ram = pick(PARTS.ram, r => r.ramType === motherboard.ramType);
    const gpu = pick(PARTS.gpu, g => g.length <= pcCase.maxGpuLength);
    const storage = pick(PARTS.storage);

    Object.assign(this.build, { case: pcCase, motherboard, cpu, cooler, ram, gpu, storage, psu: null });

    // size the PSU from the real estimated draw (~30% headroom)
    const recommended = Math.ceil((this.power * 1.3) / 50) * 50;
    const eligible = PARTS.psu.filter(p => p.wattage >= recommended);
    this.build.psu = eligible.length
      ? eligible[Math.floor(rnd() * eligible.length)]
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
