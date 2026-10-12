// Where to buy — UAE storefronts. Each retailer turns a part name into a
// search URL so links keep working as listings and stock change.

const enc = encodeURIComponent;

export const RETAILERS = [
  {
    id: 'microless', name: 'Microless', region: 'UAE',
    search: name => `https://www.microless.com/search/?query=${enc(name)}`
  },
  {
    id: 'amazon', name: 'Amazon.ae', region: 'UAE',
    search: name => `https://www.amazon.ae/s?k=${enc(name)}`
  },
  {
    id: 'noon', name: 'noon', region: 'UAE',
    search: name => `https://www.noon.com/uae-en/search/?q=${enc(name)}`
  },
  {
    id: 'google', name: 'Google Shopping', region: 'Compare',
    search: name => `https://www.google.com/search?tbm=shop&q=${enc(name)}`
  }
];

/** Retailer search links for a single part. */
export function buyLinks(part) {
  const name = part.name.trim();
  return RETAILERS.map(r => ({ id: r.id, name: r.name, region: r.region, url: r.search(name) }));
}
