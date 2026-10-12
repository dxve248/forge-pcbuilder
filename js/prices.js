// Live-price overlay.
//
// The server exposes a cached, date-stamped AED price list at /api/prices
// (refilled by js/update-prices.mjs). When a cache is available these prices
// override the catalog estimates in js/data/parts.js; otherwise the app runs
// entirely on the hand-set AED estimates and reports that in the UI badge.

import { PARTS_BY_ID } from './data/parts.js';

export const priceMeta = {
  mode: 'estimate', // 'estimate' | 'live'
  checkedAt: null,  // 'YYYY-MM-DD' of the last successful sync (cache)
  applied: 0        // how many parts got a live price
};

/**
 * Fetch the server price cache and overlay it onto the catalog.
 * Never throws: on any failure the estimates are left untouched.
 * Resolves with `priceMeta`.
 */
export async function loadLivePrices() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    let res;
    try {
      res = await fetch('/api/prices', {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`/api/prices -> ${res.status}`);

    const data = await res.json();
    let applied = 0;
    for (const [key, entry] of Object.entries(data.prices || {})) {
      const part = PARTS_BY_ID[key.split(':').pop()];
      if (!part) continue;
      const price = Number(entry.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!('basePrice' in part)) part.basePrice = part.price;
      part.livePrice = price;
      part.price = price;
      applied++;
    }

    priceMeta.mode = data.mode === 'live' && applied > 0 ? 'live' : 'estimate';
    priceMeta.checkedAt = data.checkedAt || null;
    priceMeta.applied = applied;
  } catch {
    priceMeta.mode = 'estimate';
    priceMeta.checkedAt = null;
    priceMeta.applied = 0;
  }
  return priceMeta;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short human-readable badge text, e.g. "Prices as of 12 Oct 2026". */
export function priceMetaText() {
  if (priceMeta.mode === 'live' && priceMeta.checkedAt) {
    const d = new Date(priceMeta.checkedAt + 'T12:00:00');
    if (!Number.isNaN(d.getTime())) {
      return `Prices as of ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
    return 'Prices from latest sync';
  }
  return 'Prices: AED estimates';
}