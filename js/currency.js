// Currency formatting + AED conversion. Catalog prices are hand-set UAE
// retail estimates in dirhams (AED) and already include 5% UAE VAT. The
// active currency/VAT choice lives in settings.js so it persists.

import { getSettings } from './settings.js';

/** AED → display-rate multiplier for supported currencies. */
export const RATES = { AED: 1, USD: 0.2723, EUR: 0.2522 };

/** UAE VAT rate the AED catalog prices are inclusive of. */
export const VAT_RATE = 0.05;

/** List of [code, native label] pairs for the currency picker. */
export const CURRENCY_OPTIONS = [
  ['AED', 'AED'],
  ['USD', 'USD'],
  ['EUR', 'EUR']
];

function fmt(code, value) {
  const rounded = Math.round(value);
  const locale = getSettings().lang === 'ar' ? 'ar-AE' : 'en-US';
  const grouped = rounded.toLocaleString(locale);
  if (code === 'USD') return `$${grouped}`;
  if (code === 'EUR') return `€${grouped}`;
  return `AED ${grouped}`;
}

/**
 * Format an AED amount for the active currency/VAT setting.
 * @param {number} amountAed - price in AED including VAT.
 */
export function formatPrice(amountAed) {
  const { currency, vat } = getSettings();
  const rate = RATES[currency] ?? 1;
  let value = amountAed * rate;
  if (!vat) value = value / (1 + VAT_RATE);
  return fmt(currency, value);
}

/** Human marker text for the disclaimer, e.g. "incl. VAT". */
export function vatLabel() {
  return getSettings().vat ? 'incl. VAT' : 'excl. VAT';
}

/** Raw converted value (no rounding) — used by interactive displays. */
export function convert(amountAed) {
  const { currency, vat } = getSettings();
  const rate = RATES[currency] ?? 1;
  let value = amountAed * rate;
  if (!vat) value /= 1 + VAT_RATE;
  return value;
}