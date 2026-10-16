// Flat ESLint config (optional — install with `npm i -D eslint`).
// Kept dependency-free: browser/ServiceWorker globals are declared inline so
// no `globals` package is required.

const BROWSER = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  localStorage: 'readonly', history: 'readonly', location: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  fetch: 'readonly', Response: 'readonly', Request: 'readonly', Headers: 'readonly',
  WebSocket: 'readonly', AbortController: 'readonly', URL: 'readonly',
  URLSearchParams: 'readonly', Intl: 'readonly', console: 'readonly',
  btoa: 'readonly', atob: 'readonly', crypto: 'readonly'
};

const WORKER = {
  self: 'readonly', caches: 'readonly', clients: 'readonly', fetch: 'readonly',
  Response: 'readonly', Request: 'readonly', URL: 'readonly', console: 'readonly'
};

const NODE = {
  process: 'readonly', Buffer: 'readonly', console: 'readonly', URL: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly', WebSocket: 'readonly'
};

export default [
  { ignores: ['vendor/**', 'node_modules/**', 'icons/**'] },
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: BROWSER },
    rules: { 'no-unused-vars': 'warn', 'no-undef': 'warn', 'no-empty': 'warn' }
  },
  {
    files: ['service-worker.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: WORKER },
    rules: { 'no-unused-vars': 'warn', 'no-undef': 'warn' }
  },
  {
    files: ['server.mjs', 'tests/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: NODE },
    rules: { 'no-unused-vars': 'warn', 'no-undef': 'warn' }
  }
];
