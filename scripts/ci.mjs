// One-shot CI pipeline: syntax lint every module, run the unit tests, then —
// when a Chromium-based browser is available — boot the server and run the
// headless CDP smoke test. Exits non-zero on the first failure.
//
//   npm run ci
//
// Environment overrides:
//   CHROME_PATH / BROWSER_PATH  path to a Chromium/Edge/Chrome binary
//   CI_PORT      server port      (default 5188)
//   CI_DEBUG     CDP debug port   (default 9345)

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LINT_FILES = [
  'js/main.js', 'js/ui.js', 'js/scene.js', 'js/models.js', 'js/build.js',
  'js/currency.js', 'js/settings.js', 'js/i18n.js', 'js/prices.js',
  'js/retailers.js', 'js/saved.js', 'js/advisor.js',
  'js/data/parts.js', 'js/data/rules.js',
  'server.mjs', 'service-worker.js'
];

function step(name) { console.log(`\n=== ${name} ===`); }

function runSync(args) {
  return spawnSync(node, args, { cwd: ROOT, stdio: 'inherit' });
}

// 1. syntax check every module ------------------------------------------------
function lint() {
  step('lint');
  for (const f of LINT_FILES) {
    const r = spawnSync(node, ['--check', f], { cwd: ROOT });
    if (r.status !== 0) {
      console.error(`syntax error in ${f}`);
      process.exit(1);
    }
  }
  console.log(`ok — ${LINT_FILES.length} files parsed`);
}

// 2. unit tests ---------------------------------------------------------------
function unitTests() {
  step('unit tests');
  const r = runSync(['--test']);
  if (r.status !== 0) process.exit(r.status || 1);
}

// browser discovery -----------------------------------------------------------
function findBrowser() {
  if (process.env.CHROME_PATH || process.env.BROWSER_PATH) {
    const p = process.env.CHROME_PATH || process.env.BROWSER_PATH;
    if (existsSync(p)) return p;
  }
  const win = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ];
  for (const p of win) if (existsSync(p)) return p;
  for (const bin of ['google-chrome', 'chromium', 'chromium-browser']) {
    const r = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    if (!r.error) return bin;
  }
  return null;
}

async function waitFor(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try { await fetch(url); return true; } catch { /* not up yet */ }
    await sleep(250);
  }
  return false;
}

// 3. headless smoke -----------------------------------------------------------
async function smoke() {
  step('smoke (headless)');
  const browser = findBrowser();
  if (!browser) {
    console.log('no Chromium/Edge/Chrome found — skipping smoke test (set CHROME_PATH to enable)');
    return;
  }

  const port = Number(process.env.CI_PORT || 5188);
  const debugPort = Number(process.env.CI_DEBUG || 9345);
  const profile = join(process.env.TEMP || process.env.TMPDIR || ROOT, `forgepc-ci-${Date.now()}`);

  const server = spawn(node, ['server.mjs', String(port)], { cwd: ROOT, stdio: 'ignore' });
  const child = spawn(browser, [
    '--headless=old', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    `http://127.0.0.1:${port}/`
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { child.kill(); } catch { /* already gone */ }
    try { server.kill(); } catch { /* already gone */ }
  };

  try {
    if (!await waitFor(`http://127.0.0.1:${port}/`)) throw new Error('server did not start');
    if (!await waitFor(`http://127.0.0.1:${debugPort}/json/version`)) throw new Error('browser debugger did not start');

    const r = runSync(['tests/smoke.mjs', `http://127.0.0.1:${port}/`, String(debugPort)]);
    if (r.status !== 0) { cleanup(); process.exit(r.status || 1); }
  } catch (e) {
    console.error(String(e && e.message || e));
    cleanup();
    process.exit(1);
  } finally {
    cleanup();
  }
}

async function main() {
  lint();
  unitTests();
  await smoke();
  console.log('\nAll checks passed.');
}

main().catch(e => { console.error(e); process.exit(1); });
