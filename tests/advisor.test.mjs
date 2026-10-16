import test from 'node:test';
import assert from 'node:assert/strict';
import { planBudgetBuild } from '../js/advisor.js';
import { evaluateCompatibility } from '../js/data/rules.js';

const CATS = ['case', 'motherboard', 'cpu', 'cooler', 'ram', 'gpu', 'storage', 'psu'];

test('advisor: a generous budget yields a complete, error-free build within budget', () => {
  const plan = planBudgetBuild(12000);
  assert.ok(plan, 'a plan is produced');
  assert.equal(plan.withinBudget, true, `total ${plan && plan.total} should fit 12000`);
  for (const cat of CATS) assert.ok(plan.build[cat], `plan installs a ${cat}`);
  const errs = evaluateCompatibility(plan.build).filter(c => c.level === 'error');
  assert.deepEqual(errs, [], `no compatibility errors: ${errs.map(e => e.label).join(', ')}`);
  assert.ok(plan.total <= 12000);
});

test('advisor: more budget never lowers the performance score', () => {
  const low = planBudgetBuild(6500);
  const high = planBudgetBuild(15000);
  assert.ok(low && high);
  assert.ok(high.score >= low.score, `${high.score} >= ${low.score}`);
});

test('advisor: an impossibly small budget returns null', () => {
  assert.equal(planBudgetBuild(0), null);
  assert.equal(planBudgetBuild(-100), null);
  assert.equal(planBudgetBuild('nope'), null);
  assert.equal(planBudgetBuild(NaN), null);
});

test('advisor: a tight budget still returns a coherent plan (withinBudget flag set)', () => {
  const plan = planBudgetBuild(5000);
  assert.ok(plan);
  assert.equal(typeof plan.withinBudget, 'boolean');
  for (const cat of CATS) assert.ok(plan.build[cat], `plan installs a ${cat}`);
  assert.ok(plan.total > 0);
});
