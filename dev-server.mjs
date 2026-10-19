// Local development server (no Netlify account needed).
//   node dev-server.mjs            -> http://localhost:8888
// Serves /public and runs the same API core, storing data in .data/db.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './public/js/core.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(root, 'public');
const dbFile = process.env.CALCIFY_DB || path.join(root, '.data', 'db.json');
const port = Number(process.env.PORT || 8888);

fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new Map(Object.entries(fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : {}));
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFileSync(dbFile, JSON.stringify(Object.fromEntries(db), null, 1)), 50); };
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
const store = {
  get: async (k) => clone(db.get(k)),
  set: async (k, v) => { db.set(k, clone(v)); save(); },
  del: async (k) => { db.delete(k); save(); },
  list: async (prefix) => [...db.keys()].filter((k) => k.startsWith(prefix)),
};
const api = createApi({ store });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    let text = '';
    for await (const chunk of req) text += chunk;
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    const auth = req.headers.authorization || '';
    const out = await api.handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, token: auth.startsWith('Bearer ') ? auth.slice(7) : null });
    res.writeHead(out.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out.body));
    return;
  }
  let file = path.join(pub, decodeURIComponent(url.pathname));
  if (!file.startsWith(pub)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(pub, 'index.html'); // SPA fallback
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`CalciFy running at http://localhost:${port}`));
