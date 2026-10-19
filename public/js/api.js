// API client. Talks to the Netlify Function at /api/*.
// If no backend is reachable (opened as a static preview), it falls back to
// running the same API core in the browser with localStorage ("this device" mode).
import { createApi } from './core.js';

const TOKEN_KEY = 'calcify.token';
const DB_PREFIX = 'calcify.db:';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage full / blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};

// In-memory mirror so local mode still works if storage is blocked.
const mem = new Map();
const localStore = {
  get: async (k) => { const v = ls.get(DB_PREFIX + k) ?? mem.get(k); return v ? JSON.parse(v) : null; },
  set: async (k, v) => { const s = JSON.stringify(v); mem.set(k, s); ls.set(DB_PREFIX + k, s); },
  del: async (k) => { mem.delete(k); ls.del(DB_PREFIX + k); },
  list: async (p) => [...new Set([...ls.keys().filter((k) => k.startsWith(DB_PREFIX)).map((k) => k.slice(DB_PREFIX.length)), ...mem.keys()])].filter((k) => k.startsWith(p)),
};

let mode = null; // 'cloud' | 'local'
let localApi = null;
let token = ls.get(TOKEN_KEY);

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function detect() {
  if (mode) return mode;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    const j = await r.json();
    mode = j && j.service === 'calcify' ? 'cloud' : 'local';
  } catch {
    mode = 'local';
  }
  if (mode === 'local') localApi = createApi({ store: localStore });
  return mode;
}

export async function request(method, path, body) {
  await detect();
  let status; let data;
  if (mode === 'cloud') {
    let r;
    try {
      r = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new ApiError(0, "Can't reach the server. Check your internet connection.");
    }
    status = r.status;
    try { data = await r.json(); } catch { data = { error: 'Unexpected server response' }; }
  } else {
    const url = new URL(path, 'http://local');
    ({ status, body: data } = await localApi.handle({
      method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: body || {}, token,
    }));
  }
  if (status === 401 && token && !path.startsWith('/api/auth/')) { setToken(null); }
  if (status >= 400) throw new ApiError(status, data?.error || `Request failed (${status})`);
  return data;
}

export function setToken(t) {
  token = t;
  if (t) ls.set(TOKEN_KEY, t); else ls.del(TOKEN_KEY);
}
export const hasToken = () => !!token;
export const getMode = () => mode;
export { detect };

const q = (o) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString();
  return s ? `?${s}` : '';
};

export const api = {
  signup: (b) => request('POST', '/api/auth/signup', b),
  login: (b) => request('POST', '/api/auth/login', b),
  me: () => request('GET', '/api/me'),
  updateMe: (b) => request('PATCH', '/api/me', b),
  mine: () => request('GET', '/api/calcs/mine'),
  stars: () => request('GET', '/api/stars'),
  get: (id) => request('GET', `/api/calcs/${encodeURIComponent(id)}`),
  create: (b) => request('POST', '/api/calcs', b),
  update: (id, b) => request('PUT', `/api/calcs/${encodeURIComponent(id)}`, b),
  remove: (id) => request('DELETE', `/api/calcs/${encodeURIComponent(id)}`),
  setVisibility: (id, visibility) => request('POST', `/api/calcs/${encodeURIComponent(id)}/visibility`, { visibility }),
  fork: (id) => request('POST', `/api/calcs/${encodeURIComponent(id)}/fork`),
  run: (id) => request('POST', `/api/calcs/${encodeURIComponent(id)}/run`),
  star: (id) => request('POST', `/api/calcs/${encodeURIComponent(id)}/star`),
  unstar: (id) => request('DELETE', `/api/calcs/${encodeURIComponent(id)}/star`),
  reviews: (id) => request('GET', `/api/calcs/${encodeURIComponent(id)}/reviews`),
  saveReview: (id, b) => request('PUT', `/api/calcs/${encodeURIComponent(id)}/reviews`, b),
  deleteReview: (id) => request('DELETE', `/api/calcs/${encodeURIComponent(id)}/reviews`),
  explore: (o = {}) => request('GET', `/api/explore${q(o)}`),
  user: (u) => request('GET', `/api/users/${encodeURIComponent(u)}`),
};
