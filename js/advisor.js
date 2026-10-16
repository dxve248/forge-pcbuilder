// Build advisor: assembles the best-value compatible PC within a budget.
//
// Strategy: start from the cheapest fully-compatible skeleton, then greedily
// apply single-part upgrades by "score gained per dirham spent" (GPU-heavy),
// re-sizing the PSU whenever power draw grows. Deterministic.

import { PARTS } from './data/parts.js';
import { evaluateCompatibility, estimatePower } from './data/rules.js';

const byPrice = (a, b) => a.price - b.price;

const METRIC = {
  cpu: p => p.cores * 10 + Math.round(parseFloat(p.clock) * 4),
  gpu: p => p.vram * 12 + Math.round(p.power / 8),
  ram: p => p.capacity + p.speed / 1000,
  storage: p => p.capacity / 1000 + (p.interface === 'NVMe' ? 8 : 0),
  motherboard: p => p.m2Slots + (p.formFactor === 'ATX' ? 1 : 0),
  case: () => 0,
  cooler: () => 0,
  psu: () => 0
};

// How much each category's performance matters to the total score.
const WEIGHT = { gpu: 6, cpu: 4, ram: 2, storage: 1, motherboard: 0.3, case: 0, cooler: 0, psu: 0 };

const score = (cat, part) => (METRIC[cat] ? METRIC[cat](part) * (WEIGHT[cat] || 0) : 0);
const scoreBuild = build =>
  Object.entries(build).reduce((sum, [cat, part]) => sum + (part ? score(cat, part) : 0), 0);

const totalOf = build =>
  Object.values(build).reduce((sum, part) => sum + (part ? part.price : 0), 0);

const hasErrors = build => evaluateCompatibility(build).some(c => c.level === 'error');

/** Cheapest PSU that safely powers the build (headroom + GPU connector). */
function cheapestValidPsu(build) {
  const draw = estimatePower(build);
  const min = Math.ceil((draw * 1.25) / 50) * 50;
  const need12 = !!(build.gpu && build.gpu.connector === '12VHPWR');
  const ok = PARTS.psu
    .filter(p => p.wattage >= min && (!need12 || p.pcie12vhpwr))
    .sort(byPrice);
  return ok[0] || [...PARTS.psu].sort((a, b) => b.wattage - a.wattage)[0] || null;
}

const airFits = (cooler, pcCase) =>
  cooler.type === 'Air' ? cooler.height <= pcCase.maxCoolerHeight : cooler.radiator <= pcCase.maxRadiator;
const coolsCpu = (cooler, cpu) => (cooler.tdp ?? Infinity) >= cpu.power;

/** Cheapest fully-compatible skeleton for a given motherboard. */
function assemble(board) {
  const pcCase = PARTS.case.filter(c => c.formFactors.includes(board.formFactor)).sort(byPrice)[0];
  if (!pcCase) return null;
  const cpu = PARTS.cpu.filter(c => c.socket === board.socket).sort(byPrice)[0];
  if (!cpu) return null;
  const ram = PARTS.ram
    .filter(r => r.ramType === board.ramType && r.sticks <= board.ramSlots)
    .sort(byPrice)[0];
  const cooler = PARTS.cooler
    .filter(cl => cl.sockets.includes(cpu.socket) && airFits(cl, pcCase) && coolsCpu(cl, cpu))
    .sort(byPrice)[0];
  if (!ram || !cooler) return null;
  const gpu = PARTS.gpu.filter(g => g.length <= pcCase.maxGpuLength).sort(byPrice)[0] || null;
  const storage = PARTS.storage.slice().sort(byPrice)[0] || null;
  const b = { case: pcCase, motherboard: board, cpu, cooler, ram, gpu, storage, psu: null };
  b.psu = cheapestValidPsu(b);
  return b.psu ? b : null;
}

/**
 * Choose the best-value compatible build within `budgetAed`.
 * @param {number} budgetAed
 * @returns {{build: object, total: number, score: number, withinBudget: boolean}|null}
 */
export function planBudgetBuild(budgetAed) {
  const budget = Number(budgetAed);
  if (!Number.isFinite(budget) || budget <= 0) return null;

  // cheapest feasible skeleton across the cheapest few boards
  let build = null;
  let bestTotal = Infinity;
  for (const board of PARTS.motherboard.slice().sort(byPrice)) {
    const candidate = assemble(board);
    if (!candidate) continue;
    const total = totalOf(candidate);
    if (total < bestTotal) { build = candidate; bestTotal = total; }
    if (build && bestTotal <= budget && board.price > PARTS.motherboard.slice().sort(byPrice)[0].price + 900) break;
  }
  if (!build) return null;

  // greedy single-part upgrades by value (score per dirham), capped for safety
  for (let step = 0; step < 400; step++) {
    let best = null;
    for (const cat of Object.keys(build)) {
      const current = build[cat];
      for (const cand of PARTS[cat]) {
        if (current && cand.id === current.id) continue;
        const trial = { ...build, [cat]: cand };
        if (cat !== 'psu') trial.psu = cheapestValidPsu(trial);
        if (!trial.psu || hasErrors(trial)) continue;
        const gain = score(cat, cand) - (current ? score(cat, current) : 0);
        if (gain <= 0) continue;
        const cost = totalOf(trial) - totalOf(build);
        const total = totalOf(trial);
        if (total > budget) continue;
        const value = gain / Math.max(1, cost);
        if (!best || value > best.value) best = { value, trial };
      }
    }
    if (!best) break;
    build = best.trial;
  }

  // reclaim budget: drop the PSU to the cheapest still-valid one
  const lean = cheapestValidPsu(build);
  if (lean && lean.price < build.psu.price) build = { ...build, psu: lean };

  const total = totalOf(build);
  return { build, total, score: scoreBuild(build), withinBudget: total <= budget };
}
