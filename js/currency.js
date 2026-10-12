// Currency formatting. Catalog prices are hand-set UAE retail estimates in
// dirhams (AED); this module only handles display formatting.

export const CURRENCY = {
  code: 'AED'
};

/** Format an AED amount, e.g. 1799 -> "AED 1,799". */
export function formatPrice(amount) {
  return `${CURRENCY.code} ${Math.round(amount).toLocaleString('en-US')}`;
}
