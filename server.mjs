// Minimal zero-dependency static server for the PC Builder.
// Usage: node server.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const send = (res, status, body, headers = {}) => res.writeHead(status, headers).end(body);

http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    }

    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    // Resolve against ROOT and reject anything that escapes it (defends
    // against ../ traversal and same-prefix sibling directories).
    const file = normalize(join(ROOT, pathname === '/' ? '/index.html' : pathname));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      return send(res, 403, 'Forbidden');
    }

    const info = await stat(file);
    if (info.isDirectory()) return send(res, 404, 'Not found');

    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store, must-revalidate'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    send(res, 404, 'Not found');
  }
}).listen(PORT, () => {
  console.log(`\n  ForgePC running at  http://localhost:${PORT}\n  Press Ctrl+C to stop.\n`);
});
