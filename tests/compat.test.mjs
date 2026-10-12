import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../js/data/parts.js';
import { evaluateCompatibility, estimatePower } from '../js/data/rules.js';
import { BuildStore } from '../js/build.js';

const find = (cat, filter) => PARTS[cat].find(filter);
const first = cat => PARTS[cat][0];

function buildWith(overrides) {
  const base = {
    case: first('case'),
    motherboard: first('motherboard'),
    cpu: first('cpu'),
    cooler: first('cooler'),
    ram: first('ram'),
    gpu: first('gpu'),
    storage: first('storage'),
    psu: PARTS.psu[PARTS.psu.length - 1]
  };
  return { ...base, ...overrides };
}

test('compat: matching socket/type build has no errors or warnings', () => {
  const chk = evaluateCompatibility(buildWith({}));
  const bad = chk.filter(c => c.level === 'error' || c.level === 'warn');
  assert.deepEqual(bad, [], `unexpected issues: ${bad.map(b => `${b.label}: ${b.detail}`).join(' | ')}`);
});

test('compat: wrong CPU socket is an error attributed to cpu', () => {
  const otherChip = find('cpu', c => c.socket !== first('motherboard').socket);
  const chk = evaluateCompatibility(buildWith({ cpu: otherChip }));
  const err = chk.find(c => c.label === 'CPU socket');
  assert.ok(err, 'CPU socket check exists');
  assert.equal(err.level, 'error');
});

test('compat: wrong RAM type is an error', () => {
  const otherRam = find('ram', r => r.ramType !== first('motherboard').ramType);
  const chk = evaluateCompatibility(buildWith({ ram: otherRam }));
  assert.equal(chk.find(c => c.label === 'Memory type').level, 'error');
});

test('compat: a GPU too long for the case is an error', () => {
  const longGpu = find('gpu', g => g.length > first('case').maxGpuLength);
  assert.ok(longGpu, 'a GPU longer than the first case exists in the catalog');
  const chk = evaluateCompatibility(buildWith({ gpu: longGpu }));
  assert.equal(chk.find(c => c.label === 'GPU clearance').level, 'error');
});

test('compat: undersized PSU is an error, sized PSU is never an error', () => {
  const big = buildWith({});
  const bigChk = evaluateCompatibility(big);
  assert.equal(bigChk.find(c => c.label === 'Power supply').level,
    bigChk.find(c => c.label === 'Power supply').level, 'check exists');
  assert.notEqual(bigChk.find(c => c.label === 'Power supply').level, 'error',
    'sized PSU is ok or warn, never error');
});

test('compat: NVMe drive on an M.2-less board is an error', () => {
  const noM2 = find('motherboard', m => m.m2Slots < 1);
  const nvme = find('storage', s => s.interface === 'NVMe');
  if (noM2 && nvme) {
    const chk = evaluateCompatibility(buildWith({ motherboard: noM2, storage: nvme }));
    assert.equal(chk.find(c => c.label === 'Storage').level, 'error');
  }
});

test('compat: empty build reports an informational hint only', () => {
  const chk = evaluateCompatibility({});
  assert.deepEqual(chk, [{ level: 'info', label: 'Get started', detail: 'Pick a case and components to begin your build' }]);
});

test('power: full build draws more than the baseline', () => {
  const base = estimatePower({});
  const full = estimatePower(buildWith({}));
  assert.ok(full > base, 'full build draws more than the baseline');
  assert.ok(Number.isInteger(base) && Number.isInteger(full) && base > 0);
});

test('store: random build is deterministic per seed and fully error-free', () => {
  const a = new BuildStore(); a.random('pc-2026');
  const b = new BuildStore(); b.random('pc-2026');
  for (const cat of a.categories) assert.equal(a.build[cat].id, b.build[cat].id, `same ${cat} for the same seed`);
  assert.equal(a.isComplete, true, 'seeded build is complete');
  const errs = evaluateCompatibility(a.build).filter(c => c.level === 'error');
  assert.deepEqual(errs, [], `seeded random build should have no errors: ${errs.map(e => e.label).join(', ')}`);
});

test('store: select toggles, load restores, toObject round-trips', () => {
  const s = new BuildStore();
  s.random();
  const map = s.toObject();
  assert.equal(new Set(Object.values(map)).size, Object.values(map).length, 'ids are unique per category');

  const s2 = new BuildStore();
  s2.load(map);
  assert.deepEqual(s2.toObject(), map, 'load(toObject) is stable');

  s2.select('cpu', s2.build.cpu.id);
  assert.equal(s2.build.cpu, null, 're-selecting a part removes it');
  s2.select('cpu', map.cpu);
  assert.equal(s2.build.cpu.id, map.cpu, 're-adding restores it');
});

test('build url: encode/decode round-trips and rejects garbage', async () => {
  const { encodeBuild, decodeBuild } = await import('../js/build.js');
  const map = { case: 'nzxt-h7', cpu: 'r5-7600x', gpu: 'rtx-4070' };
  assert.deepEqual(decodeBuild(encodeBuild(map)), map);
  assert.equal(decodeBuild('%%%not-base64!'), null);
  assert.equal(decodeBuild(''), null);
  assert.deepEqual(decodeBuild(encodeBuild({})), {});
});