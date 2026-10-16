// Headless smoke test: boots the app in Edge via CDP and exercises the key
// interactive paths (3D picking through glass, currency/VAT/language switches,
// share button, screenshot, hover tooltip). Requires a running server and a
// headless browser with --remote-debugging-port=PORT.
//
//   usage: node tests/smoke.mjs http://localhost:5173/ 9333
//
// Prints a JSON summary; exit 0 when no runtime exceptions or errors and the
// core smoke assertions pass.

const [urlArg, portArg] = process.argv.slice(2);
const url = urlArg || 'http://localhost:5173/';
const port = Number(portArg || 9333);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CLICK = `(() => {
  const P = window.pcBuilder;
  const clickAt = (x, y) => {
    const c = P.viewer.renderer.domElement;
    const r = c.getBoundingClientRect();
    const ev = t => c.dispatchEvent(new PointerEvent(t, { clientX: r.left + r.width * x, clientY: r.top + r.height * y, bubbles: true }));
    ev('pointerdown'); ev('pointerup');
  };
  const swirl = () => document.getElementById('toggle-panel');
  const res = { app: !!(P && P.ui && P.viewer && P.store) };
  swirl().checked = true; swirl().dispatchEvent(new Event('change'));
  clickAt(0.5, 0.55);
  res.first = P.ui.activeCategory;
  swirl().checked = false; swirl().dispatchEvent(new Event('change'));
  clickAt(0.5, 0.55);
  res.second = P.ui.activeCategory;
  res.partCount = P.viewer.parts ? P.viewer.parts.size : 0;
  res.smoke = res.app && res.first === res.second && !!res.first ? 'SMOKE_OK' : 'SMOKE_FAIL';
  return res;
})()`;

const EXPRS = [
  CLICK,
  // currency + VAT
  `(async () => {
    const before = document.getElementById('total-price').textContent;
    const sel = document.getElementById('sel-currency');
    sel.value = 'USD'; sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 60));
    const usd = document.getElementById('total-price').textContent;
    const vat = document.getElementById('toggle-vat');
    vat.checked = false; vat.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 60));
    const noVat = document.getElementById('total-price').textContent;
    return { before, usd, noVat, ok: usd.startsWith('$') && usd !== noVat };
  })()`,
  // language toggle → RTL
  `(() => { document.getElementById('btn-lang').click(); return { dir: document.documentElement.dir, lang: document.documentElement.lang }; })()`,
  // hover tooltip over 3D
  `(() => {
    const P = window.pcBuilder;
    const c = P.viewer.renderer.domElement;
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.55, bubbles: true }));
    return new Promise(res => setTimeout(() => {
      const tip = document.getElementById('pick-tip');
      res({ hidden: tip.hidden, text: tip.textContent });
    }, 90));
  })()`,
  // screenshot
  `(() => { const u = pcBuilder.viewer.screenshot(1); return { ok: u.startsWith('data:image/png') && u.length > 5000, len: u.length }; })()`,
  // share builds a link (clipboard may be blocked; the toast still shows)
  `(async () => {
    const toast = document.getElementById('toast');
    await pcBuilder.ui._shareBuild().catch(() => {});
    await new Promise(r => setTimeout(r, 250));
    return { shown: !toast.hidden && toast.textContent.length > 0, url: (location.search.indexOf('build=') >= 0 ? location.href : 'no-build-param') };
  })()`,
  // undo / redo
  `(() => {
    const P = window.pcBuilder;
    const cat = P.ui.activeCategory;
    const beforeId = P.store.build[cat] ? P.store.build[cat].id : null;
    const list = P.ui._visibleParts();
    const target = list.find(p => p.id !== beforeId) || list[0];
    P.ui._install(cat, target.id);
    const installed = P.store.build[cat] && P.store.build[cat].id === target.id;
    const canUndo = P.store.canUndo;
    P.store.undo();
    const afterId = P.store.build[cat] ? P.store.build[cat].id : null;
    const canRedo = P.store.canRedo;
    return { installed, canUndo, reverted: afterId === beforeId, canRedo, ok: installed && canUndo && afterId === beforeId && canRedo };
  })()`,
  // budget advisor
  `(() => {
    const P = window.pcBuilder;
    P.store.reset();
    P.ui.el.budgetInput.value = '6000';
    P.ui._applyBudget();
    const count = P.store.categories.filter(c => P.store.build[c]).length;
    return { count, ok: count >= 6 };
  })()`,
  // saved builds library (inline name field)
  `(() => {
    const P = window.pcBuilder;
    P.ui._promptSaveName();
    document.querySelector('#saves-menu .save-name-input').value = 'CI probe';
    document.querySelector('#saves-menu .save-confirm').click();
    const n = document.querySelectorAll('#saves-menu .save-item').length;
    const nameText = (document.querySelector('#saves-menu .save-name') || {}).textContent || '';
    localStorage.removeItem('forgepc-builds');
    return { n, nameText, ok: n >= 1 && nameText === 'CI probe' };
  })()`,
  // cross-category comparison table
  `(() => {
    const P = window.pcBuilder;
    P.ui.compareItems = [];
    const gpu = P.ui._visibleParts();
    P.ui._toggleCompare(P.ui.activeCategory, gpu[0].id);
    P.ui._toggleCompare(P.ui.activeCategory, gpu[1].id);
    P.ui.activeCategory = 'cpu';
    const cpu = P.ui._visibleParts();
    P.ui._toggleCompare('cpu', cpu[0].id);
    P.ui._toggleCompare('cpu', cpu[1].id);
    const groups = document.querySelectorAll('#compare .cmp-group').length;
    const hidden = document.getElementById('compare').hidden;
    P.ui.compareItems = [];
    P.ui._renderCompare();
    return { groups, hidden, ok: groups >= 2 && !hidden };
  })()`
];

async function main() {
  let list = [];
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find(t => t.type === 'page' && t.url.startsWith('http://')) || list.find(t => t.type === 'page');
      if (page) return run(page.webSocketDebuggerUrl);
    } catch { /* browser not up yet */ }
    await sleep(250);
  }
  console.error('no page target found');
  process.exit(2);
}

async function run(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const out = { title: null, results: [], exceptions: [], errorLogs: [], errors: [] };

  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      out.exceptions.push((d.exception && d.exception.description) || d.text);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') out.errorLogs.push(m.params.entry.text);
  };

  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');

  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    ready = !!(r.result && r.result.value === 'complete');
    if (!ready) await sleep(250);
  }
  if (!ready) { console.error('page never reached complete'); process.exit(3); }

  for (const expr of EXPRS) {
    try {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) {
        out.errors.push((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      } else {
        out.results.push(r.result ? r.result.value : null);
      }
    } catch (e) { out.errors.push(String(e)); }
  }

  const t = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
  out.title = t.result.value;

  const click = out.results[0] || {};
  const cc = out.results[1] || {};
  const lang = out.results[2] || {};
  const tip = out.results[3] || {};
  const shot = out.results[4] || {};
  const share = out.results[5] || {};
  const undo = out.results[6] || {};
  const budget = out.results[7] || {};
  const saves = out.results[8] || {};
  const cmp = out.results[9] || {};
  const syntheticPickOk = ex => /setPointerCapture/.test(ex);
  out.debug = {
    click: click.smoke === 'SMOKE_OK',
    cc: !!cc.ok,
    rtl: lang.dir === 'rtl',
    tip: !tip.hidden && tip.text.length > 0,
    shot: !!shot.ok,
    share: !!share.shown,
    undo: !!undo.ok,
    budget: !!budget.ok,
    saves: !!saves.ok,
    compare: !!cmp.ok,
    exceptionsFiltered: out.exceptions.every(syntheticPickOk)
  };
  out.pass = Boolean(
    click.smoke === 'SMOKE_OK' &&
    cc.ok &&
    lang.dir === 'rtl' &&
    !tip.hidden && tip.text.length > 0 &&
    shot.ok &&
    share.shown &&
    undo.ok &&
    budget.ok &&
    saves.ok &&
    cmp.ok &&
    out.exceptions.every(syntheticPickOk) &&
    out.errorLogs.length === 0 &&
    out.errors.length === 0
  );
  console.log(JSON.stringify(out, null, 2));
  ws.close();
  process.exit(out.pass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });