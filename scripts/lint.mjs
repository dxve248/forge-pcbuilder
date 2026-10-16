// Lint step: syntax-check every first-party module with `node --check`, then
// run ESLint when it has been installed (it's an optional dev dependency, so
// CI stays green on a bare checkout).

import { readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'vendor', '.git', 'icons']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (['.js', '.mjs'].includes(extname(p))) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error(`syntax error: ${f}`); }
}
if (failed) process.exit(1);
console.log(`syntax ok — ${files.length} files`);

try {
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles([
    'js/**/*.js', 'tests/**/*.mjs', 'scripts/**/*.mjs', 'server.mjs', 'service-worker.js'
  ]);
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  const warnings = results.reduce((n, r) => n + r.warningCount, 0);
  console.log(`eslint — ${errors} error(s), ${warnings} warning(s)`);
  if (errors) process.exit(1);
} catch {
  console.log('eslint not installed — skipped (optional: npm i -D eslint)');
}
