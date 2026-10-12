import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, PARTS_BY_ID, CATEGORIES } from '../js/data/parts.js';
import { evaluateCompatibility, estimatePower } from '../js/data/rules.js';

const ALL = Object.values(PARTS).flat();

test('parts: every part is priceable and has a unique id', () => {
  const ids = ALL.map(p => p.id);
  assert.equal(ids.length, new Set(ids).size, 'duplicate part ids');
  for (const p of ALL) {
    assert.equal(typeof p.id, 'string', `${p.name} id`);
    assert.equal(typeof p.name, 'string', `${p.id} name`);
    assert.ok(p.price > 0, `${p.id} has a positive price`);
    assert.ok(Number.isFinite(p.price), `${p.id} price is finite`);
  }
});

test('parts: PARTS_BY_ID resolves every part', () => {
  for (const p of ALL) assert.equal(PARTS_BY_ID[p.id], p, `PARTS_BY_ID[${p.id}]`);
});

test('categories: metadata is complete per category', () => {
  assert.equal(CATEGORIES.length, Object.keys(PARTS).length);
  for (const c of CATEGORIES) {
    assert.equal(c.id, c.id.toLowerCase(), `${c.id} is lowercase`);
    assert.ok(c.label, `${c.id} has an English label`);
    assert.ok(c.labelAr, `${c.id} has an Arabic label`);
    assert.ok(c.icon, `${c.id} has an icon`);
    assert.ok(Array.isArray(PARTS[c.id]) && PARTS[c.id].length > 0, `${c.id} has parts`);
  }
});

test('builds: random-build helper parts exist for the rules', () => {
  const psu = PARTS.psu;
  assert.ok(psu.some(p => typeof p.wattage === 'number'), 'psu wattage');
  assert.ok(psu.some(p => typeof p.efficiency === 'string' && /80\+/.test(p.efficiency)), 'psu efficiency exists');
});