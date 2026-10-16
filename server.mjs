// Minimal zero-dependency static server for the PC Builder.
// Usage: node server.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip, brotliCompress } from 'node:zlib';

const gzipP = promisify(gzip);
const brP = promisify(brotliCompress);

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const send = (res, status, body, headers = {}) =>
  res.writeHead(status, { ...SECURITY, ...headers }).end(body);

// --- security headers -------------------------------------------------------
// The only inline script in the page is the import map, so we hash it at boot
// and allow just that one under a strict script-src (no 'unsafe-inline').
async function inlineScriptHashes() {
  try {
    const html = await readFile(join(ROOT, 'index.html'), 'utf8');
    const out = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
      out.push(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    }
    return out;
  } catch {
    return [];
  }
}

const SCRIPT_HASHES = await inlineScriptHashes();
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${SCRIPT_HASHES.join(' ')}`.trim(),
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const SECURITY = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

// Live prices live in price-cache.json (refilled by js/update-prices.mjs).
// When absent or fresh, the client falls back to the catalog estimates.
const PRICES_CACHE = join(ROOT, 'price-cache.json');
async function readPriceCache() {
  try {
    const raw = await readFile(PRICES_CACHE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Compressed variants are cached in memory so each asset is encoded once.
const encCache = new Map(); // `${filePath}#${encoding}` -> Buffer
async function compress(file, data, encoding) {
  const key = `${file}#${encoding}`;
  let out = encCache.get(key);
  if (!out) {
    out = encoding === 'br'
      ? await brP(data)
      : encoding === 'gzip'
        ? await gzipP(data, { level: 6 })
        : data;
    encCache.set(key, out);
  }
  return out;
}

http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    }

    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);

    if (pathname === '/api/prices') {
      const cache = await readPriceCache();
      const body = JSON.stringify(cache && cache.checkedAt
        ? { mode: 'live', checkedAt: cache.checkedAt, prices: cache.prices || {} }
        : { mode: 'estimate', checkedAt: null, prices: {} });
      res.writeHead(200, {
        'Content-Type': TYPES['.json'],
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store, must-revalidate',
        ...SECURITY
      });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }

    // Resolve against ROOT and reject anything that escapes it (defends
    // against ../ traversal and same-prefix sibling directories).
    const file = normalize(join(ROOT, pathname === '/' ? '/index.html' : pathname));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      return send(res, 403, 'Forbidden');
    }

    const info = await stat(file);
    if (!info.isFile()) return send(res, 404, 'Not found');

    const data = await readFile(file);

    // Strong ETag derived from the content, so responses can be cached and
    // revalidated cheaply (304) after the browser's short max-age.
    const hash = createHash('sha1').update(data).digest('hex').slice(0, 20);
    const etag = `"${hash}"`;
    // Node's HTTP parser strips the surrounding quotes on if-none-match.
    if (req.headers['if-none-match'] === hash) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=3600' });
      return res.end();
    }

    // Apply content negotiation for /api and the HTML route; everything
    // else has Cache-Control pointing at the immutable-ish ETag above.
    const isHtml = extname(file).toLowerCase() === '.html';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    let encoding = null;
    if (!isHtml && (acceptEncoding.includes('br') || acceptEncoding.includes('gzip'))) {
      encoding = acceptEncoding.includes('br') ? 'br' : 'gzip';
    }

    const head = {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'ETag': etag,
      'Cache-Control': isHtml ? 'public, no-cache' : 'public, max-age=3600',
      'Vary': 'Accept-Encoding',
      ...SECURITY
    };
    if (encoding) {
      const payload = await compress(file, data, encoding);
      head['Content-Encoding'] = encoding;
      head['Content-Length'] = payload.length;
      res.writeHead(200, head);
      return res.end(req.method === 'HEAD' ? undefined : payload);
    }
    head['Content-Length'] = data.length;
    res.writeHead(200, head);
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (err) {
    if (err && err.code === 'ENOENT') return send(res, 404, 'Not found');
    send(res, 500, 'Internal error');
  }
}).listen(PORT, () => {
  console.log(`\n  ForgePC running at  http://localhost:${PORT}\n  Press Ctrl+C to stop.\n`);
});
