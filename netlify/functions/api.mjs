// Netlify Function: every /api/* request lands here.
// Data lives in Netlify Blobs (built into Netlify, no database account needed).
import { getStore } from '@netlify/blobs';
import { createApi } from '../../public/js/core.js';

let api = null;

function blobStore() {
  const s = getStore({ name: 'calcify', consistency: 'strong' });
  return {
    get: (key) => s.get(key, { type: 'json' }),
    set: (key, value) => s.setJSON(key, value),
    del: (key) => s.delete(key),
    list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key),
  };
}

export default async (req) => {
  if (!api) api = createApi({ store: blobStore(), secret: process.env.CALCIFY_SECRET || null });
  const url = new URL(req.url);
  let body = {};
  if (!['GET', 'HEAD'].includes(req.method)) {
    const text = await req.text();
    if (text.length > 64 * 1024) return Response.json({ error: 'Request is too large' }, { status: 413 });
    try { body = text ? JSON.parse(text) : {}; } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  }
  const auth = req.headers.get('authorization') || '';
  const { status, body: out } = await api.handle({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body,
    token: auth.startsWith('Bearer ') ? auth.slice(7) : null,
  });
  return Response.json(out, { status, headers: { 'cache-control': 'no-store' } });
};

export const config = { path: '/api/*' };
