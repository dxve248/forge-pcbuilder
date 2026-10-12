#!/usr/bin/env node
// ForgePC price sync — refill price-cache.json with today's AED prices.
//
// Retailer search pages are fetched best-effort; each part keeps its first
// match, otherwise the previous cached price is kept, otherwise the catalog
// estimate in js/data/parts.js is used (the app then shows the estimate).
// The script never crashes on a blocked/down store.
//
// Usage:
//   node js/update-prices.mjs                      fetch from providers + merge cache
//   node js/update-prices.mjs --import file.json   apply manually-verified prices
//   node js/update-prices.mjs --dry-run            show the plan, change nothing
//   node js/update-prices.mjs --offline            only merge cache/--import, no network
//
// --import file.json format (JSON object keyed by "category:id"):
//   { "gpu:rtx4090": 7499, "ram:d5-32-6000": { "price": 599, "source": "manual" } }
// A key with value null removes that entry from the cache.
//
// Tip: schedule a daily run (e.g. Windows Task Scheduler) so prices are
// always "as of today":
//   node C:\<path>\forge-pcbuilder\js\update-prices.mjs --import C:\<path>\prices-today.json

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARTS } from './data/parts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_FILE = join(ROOT, 'price-cache.json');

// Per-category sanity bounds so a stray "AED 2" or mis-scraped "AED 90000"
// can never be cached as a real price.
const DAYS_OLD_MAX = 370; // don't keep caching a price older than ~a year

const BOUNDS = {
  case: [80, 5000],
  motherboard: [100, 8000],
  cpu: [150, 20000],
  cooler: [50, 5000],
  ram: [80, 8000],
  gpu: [300, 50000],
  storage: [40, 15000],
  psu: [80, 5000]
};

const args = process.argv.slice(2);
const flags = (name) => args.includes(name);
const importArg = args.indexOf('--import');
const importFile = importArg === -1 ? null : args[importArg + 1];
const DRY_RUN = flags('--dry-run');
const OFFLINE = flags('--offline');
const VERBOSE = flags('--verbose');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const NONE = Symbol('none');
function parseJsonFile(file) {
  return readFile(file, 'utf8').then(raw => JSON.parse(raw.replace(/^\uFEFF/, '')));
}

async function loadCache() {
  try { return await parseJsonFile(CACHE_FILE); } catch { return { prices: {} }; }
}

// ---------------------------------------------------------------------------
// Best-effort providers. Each returns an AED price or null.
// ---------------------------------------------------------------------------

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function inBounds(category, price) {
  const [lo, hi] = BOUNDS[category] || [30, 150000];
  return Number.isInteger(price) && price >= lo && price <= hi;
}

function firstPrice(html, patterns) {
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const n = Number(m[1].replace(/[^\d]/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

const q = (part) => encodeURIComponent(`${part.brand || ''} ${part.name} U.A.E price`);

// Amazon.ae search page — AED prices in .a-price-whole spans.
async function amazonAePrice(part) {
  const html = await fetchText(`https://www.amazon.ae/s?k=${q(part)}`, 9000);
  return firstPrice(html, [
    /class="a-price-whole"[^>]*>([\d.,]+)</g,
    /"priceAmount":\s*([\d.]+)/g,
    /AED[\s\u00a0]*([\d][\d.,]*)/g
  ]);
}

// Microless search page.
async function microlessPrice(part) {
  const html = await fetchText(`https://www.microless.com/search/?query=${encodeURIComponent(`${part.brand || ''} ${part.name}`)}`, 9000);
  return firstPrice(html, [
    /AED[\s\u00a0]*([\d][\d.,]*)/g,
    /data-price="([\d.]+)"/g,
    /"price"\s*:\s*"([\d.]+)"/g
  ]);
}

// Google Shopping — often blocked, but sometimes reachable from home ISPs.
async function googleShoppingPrice(part) {
  const html = await fetchText(`https://www.google.com/search?tbm=shop&q=${q(part)}`, 9000);
  return firstPrice(html, [
    /data-price="([\d.]+)"/g,
    /AED[\s\u00a0]*([\d][\d.,]*)/g,
    /"price"\s*:\s*"?([\d][\d.,]*)"?/g
  ]);
}

const PROVIDERS = [
  ['amazon.ae', amazonAePrice],
  ['microless', microlessPrice],
  ['google-shopping', googleShoppingPrice]
];

// ---------------------------------------------------------------------------

const log = (...a) => { if (VERBOSE) console.log(...a); };

async function main() {
  const cache = await loadCache();
  const prices = cache.prices || {};
  const todayStr = today();

  // 1. Load manually-verified prices from --import.
  let manual = null;
  if (importFile) {
    try {
      manual = await parseJsonFile(importFile);
      log(`Loaded ${Object.keys(manual).length} entries from ${importFile}`);
    } catch (err) {
      console.error(`--import failed to read ${importFile}:`, err.message);
      process.exitCode = 1;
      return;
    }
  }

  // 2. Build a fetch plan.
  const tasks = [];
  for (const category of Object.keys(PARTS)) {
    for (const part of PARTS[category]) {
      const key = `${category}:${part.id}`;
      tasks.push({ key, part, category, manualEntry: manual && key in manual ? manual[key] : NONE });
    }
  }

  const known = new Set(Object.keys(prices));
  const results = { fresh: 0, manual: 0, kept: 0, estimate: 0, removed: 0 };

  const applyEntry = (key, category, price, source) => {
    if (!inBounds(category, price)) return false;
    prices[key] = { price, source, updatedAt: todayStr };
    results[source === 'manual' ? 'manual' : 'fresh']++;
    return true;
  };

  const handle = async ({ key, part, category, manualEntry }) => {
    // Manual prices win; null removes the cached entry.
    if (manualEntry !== NONE) {
      if (manualEntry === null) {
        delete prices[key];
        results.removed++;
        log(`- ${key}: removed`);
        return;
      }
      const p = typeof manualEntry === 'object' ? manualEntry.price : manualEntry;
      if (applyEntry(key, category, Number(p), 'manual')) {
        console.log(`✓ ${key}: ${p} (manual)`);
        return;
      }
      console.warn(`! ${key}: manual price ${p} out of bounds, ignored`);
      results.estimate++;
      return;
    }

    if (OFFLINE || DRY_RUN) {
      if (DRY_RUN) console.log(`· ${key}: would fetch from [${PROVIDERS.map(p => p[0]).join(', ')}]`);
      results.estimate++;
      return;
    }

    for (const [name, fn] of PROVIDERS) {
      try {
        const price = await fn(part);
        if (price !== null && applyEntry(key, category, price, name)) {
          console.log(`✓ ${key}: ${prices[key].price} (${name})`);
          return;
        }
      } catch (err) {
        log(`  ${key}: ${name} failed (${err.message})`);
      }
    }

    // Nothing worked: keep an existing cache entry, unless it is very stale —
    // then drop it so the app shows the live estimate instead of dead data.
    const prev = prices[key];
    const age = prev && prev.updatedAt ? (Date.now() - Date.parse(prev.updatedAt)) / 86400000 : Infinity;
    if (prev && age <= DAYS_OLD_MAX) {
      results.kept++;
      console.log(`≈ ${key}: kept cached ${prev.price} from ${prev.updatedAt}`);
    } else {
      if (prev) { delete prices[key]; log(`  ${key}: dropped stale cached price`); }
      results.estimate++;
      console.log(`· ${key}: no live price, estimate stays`);
    }
  };

  // Run with a small concurrency pool so slow/blocked requests overlap.
  const POOL = 4;
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const t = tasks[i++];
      try { await handle(t); } catch (err) { console.warn(`  ${t.key}: ${err.message}`); results.estimate++; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, tasks.length) }, worker));

  if (DRY_RUN) {
    console.log(`\nDry run over ${tasks.length} parts — nothing written.`);
    return;
  }

  // Drop entries for parts that no longer exist in the catalog.
  for (const key of known) {
    if (!tasks.some(t => t.key === key)) delete prices[key];
  }

  const out = { checkedAt: todayStr, prices };
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  const tmp = CACHE_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(out, null, 2) + '\n', 'utf8');
  await rename(tmp, CACHE_FILE);

  console.log(`\nWrote price-cache.json (${Object.keys(prices).length} parts) — ${todayStr}`);
  console.log(`  fresh ${results.fresh} · manual ${results.manual} · kept ${results.kept} · estimate ${results.estimate} · removed ${results.removed}`);
  console.log('Restart/serve the app: it now reports "Prices as of ' + todayStr + '".');
}

main().catch(err => { console.error('Unhandled:', err); process.exitCode = 1; });