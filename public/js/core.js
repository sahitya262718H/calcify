// CalciFy API core — the whole backend logic, storage-agnostic.
// Runs inside the Netlify Function (backed by Netlify Blobs) and, as a fallback,
// inside the browser (backed by localStorage) so the app still works offline.
//
// store interface: get(key) -> object|null, set(key, obj), del(key), list(prefix) -> string[]

import { parse } from './engine.js';

export const CATEGORIES = [
  'Finance', 'Business', 'Health', 'Engineering', 'Education', 'Everyday', 'Science', 'Other',
];

const LIMITS = { calcsPerUser: 300, name: 80, desc: 600, formula: 2000, comment: 1000, bio: 280, label: 60, unit: 16, varDesc: 160 };
const TOKEN_DAYS = 30;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// ---------- crypto (WebCrypto works in modern browsers and Node 18+) ----------
const enc = new TextEncoder();
const b64u = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uDecode = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const randomId = (bytes = 9) => b64u(crypto.getRandomValues(new Uint8Array(bytes)));

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? b64uDecode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120000 }, key, 256);
  return { salt: b64u(salt), hash: b64u(bits) };
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// ---------- helpers ----------
const str = (v, max, field, { required = false } = {}) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (required && !s) fail(400, `${field} is required`);
  if (s.length > max) fail(400, `${field} is too long (max ${max} characters)`);
  return s;
};
const numOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function createApi({ store, secret: envSecret = null, now = () => Date.now() }) {
  let secretPromise = null;
  const getSecret = () => {
    if (envSecret) return Promise.resolve(envSecret);
    if (!secretPromise) {
      secretPromise = (async () => {
        const m = await store.get('meta/secret');
        if (m?.value) return m.value;
        const value = randomId(32);
        await store.set('meta/secret', { value });
        return value;
      })();
    }
    return secretPromise;
  };

  async function issueToken(username) {
    const payload = b64u(enc.encode(JSON.stringify({ u: username, exp: now() + TOKEN_DAYS * 864e5 })));
    return `${payload}.${await hmac(await getSecret(), payload)}`;
  }
  async function readToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    if (!safeEqual(sig, await hmac(await getSecret(), payload))) return null;
    try {
      const data = JSON.parse(new TextDecoder().decode(b64uDecode(payload)));
      if (data.exp < now()) return null;
      const user = await store.get(`user/${data.u}`);
      return user || null;
    } catch { return null; }
  }

  const publicUser = (u) => u && ({ username: u.username, displayName: u.displayName, bio: u.bio || '', createdAt: u.createdAt });

  const userCache = new Map();
  async function userName(username) {
    if (!userCache.has(username)) userCache.set(username, store.get(`user/${username}`).then((u) => u?.displayName || username));
    return userCache.get(username);
  }

  async function getStats(id) {
    return (await store.get(`stats/${id}`)) || { runs: 0, stars: 0, forks: 0, ratingSum: 0, ratingCount: 0 };
  }
  async function bumpStats(id, fn) {
    const s = await getStats(id);
    fn(s);
    for (const k of ['runs', 'stars', 'forks', 'ratingSum', 'ratingCount']) s[k] = Math.max(0, s[k] || 0);
    await store.set(`stats/${id}`, s);
    return s;
  }
  const statsView = (s) => ({
    runs: s.runs, stars: s.stars, forks: s.forks, reviews: s.ratingCount,
    rating: s.ratingCount ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : null,
  });

  async function view(calc, me, { withStar = false } = {}) {
    const [stats, ownerName] = await Promise.all([getStats(calc.id), userName(calc.owner)]);
    const out = { ...calc, ownerName, stats: statsView(stats), isMine: !!me && me.username === calc.owner };
    if (withStar && me) out.starred = !!(await store.get(`star/${me.username}/${calc.id}`));
    return out;
  }

  async function loadCalc(id, me, { mustOwn = false } = {}) {
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(id || '')) fail(404, 'Calculator not found');
    const calc = await store.get(`calc/${id}`);
    if (!calc) fail(404, 'Calculator not found');
    const mine = !!me && me.username === calc.owner;
    if (!mine) {
      if (calc.visibility !== 'public') fail(404, 'Calculator not found');
      if (mustOwn) fail(403, 'Only the owner can do that');
    }
    return calc;
  }

  // Validate and normalise a calculator definition coming from the client.
  function cleanCalc(body) {
    const name = str(body.name, LIMITS.name, 'Name', { required: true });
    const description = str(body.description, LIMITS.desc, 'Description');
    const category = CATEGORIES.includes(body.category) ? body.category : 'Other';
    const formula = str(body.formula, LIMITS.formula, 'Formula', { required: true });
    const parsed = parse(formula);
    if (!parsed.ok) fail(400, `Formula error: ${parsed.error.message}`);
    const given = new Map((Array.isArray(body.variables) ? body.variables : []).map((v) => [String(v?.key || '').toLowerCase(), v]));
    const variables = parsed.variables.map(({ key, name: vname }) => {
      const g = given.get(key) || {};
      return {
        key,
        name: vname,
        label: str(g.label, LIMITS.label, `Label for ${vname}`) || prettify(vname),
        unit: str(g.unit, LIMITS.unit, `Unit for ${vname}`),
        description: str(g.description, LIMITS.varDesc, `Hint for ${vname}`),
        default: numOrNull(g.default),
      };
    });
    const r = body.result || {};
    const decimals = Math.min(10, Math.max(0, Math.trunc(Number(r.decimals ?? 2)) || 0));
    const result = {
      label: str(r.label, LIMITS.label, 'Result label') || 'Result',
      unit: str(r.unit, LIMITS.unit, 'Result unit'),
      prefix: str(r.prefix, 4, 'Result prefix'),
      decimals: Number.isFinite(Number(r.decimals)) ? decimals : 2,
    };
    const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
      .map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').slice(0, 24)).filter(Boolean).slice(0, 6);
    return { name, description, category, formula, variables, result, tags: [...new Set(tags)] };
  }

  async function myCalcIds(username) {
    const keys = await store.list(`byowner/${username}/`);
    return keys.map((k) => k.split('/').pop());
  }

  async function createCalc(me, def, extra = {}) {
    const ids = await myCalcIds(me.username);
    if (ids.length >= LIMITS.calcsPerUser) fail(400, `You can have up to ${LIMITS.calcsPerUser} calculators`);
    const t = now();
    const calc = { id: randomId(9), owner: me.username, ...def, visibility: 'private', createdAt: t, updatedAt: t, publishedAt: null, forkedFrom: null, ...extra };
    await store.set(`calc/${calc.id}`, calc);
    await store.set(`byowner/${me.username}/${calc.id}`, { at: t });
    return calc;
  }

  function matches(calc, q) {
    if (!q) return true;
    const hay = [calc.name, calc.description, calc.category, calc.ownerName, calc.owner, ...(calc.tags || []), ...calc.variables.map((v) => v.label)].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }

  function sortCalcs(list, sort) {
    const by = {
      top: (a, b) => (b.stats.rating ?? 0) * Math.log2(2 + b.stats.reviews) - (a.stats.rating ?? 0) * Math.log2(2 + a.stats.reviews) || b.stats.runs - a.stats.runs,
      popular: (a, b) => b.stats.runs + b.stats.stars * 5 + b.stats.forks * 5 - (a.stats.runs + a.stats.stars * 5 + a.stats.forks * 5),
      stars: (a, b) => b.stats.stars - a.stats.stars,
      new: (a, b) => (b.publishedAt || b.updatedAt) - (a.publishedAt || a.updatedAt),
      updated: (a, b) => b.updatedAt - a.updatedAt,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(by[sort] || by.popular);
  }

  // ---------- routes ----------
  const routes = [];
  const route = (method, pattern, auth, fn) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
    routes.push({ method, re, keys, auth, fn });
  };

  route('GET', '/api/health', false, async () => ({ ok: true, service: 'calcify', categories: CATEGORIES }));

  route('POST', '/api/auth/signup', false, async ({ body }) => {
    const username = String(body.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) fail(400, 'Username must be 3–24 characters: letters, numbers or _');
    if (['admin', 'api', 'calcify', 'about', 'explore', 'me', 'null', 'undefined', 'system'].includes(username)) fail(400, 'That username is reserved');
    const password = String(body.password || '');
    if (password.length < 6) fail(400, 'Password must be at least 6 characters');
    if (password.length > 200) fail(400, 'Password is too long');
    const displayName = str(body.displayName, 40, 'Display name') || username;
    if (await store.get(`user/${username}`)) fail(409, 'That username is already taken');
    const { salt, hash } = await hashPassword(password);
    const user = { username, displayName, bio: '', salt, hash, createdAt: now() };
    await store.set(`user/${username}`, user);
    return { token: await issueToken(username), user: publicUser(user) };
  });

  route('POST', '/api/auth/login', false, async ({ body }) => {
    const username = String(body.username || '').trim().toLowerCase();
    const user = /^[a-z0-9_]{3,24}$/.test(username) ? await store.get(`user/${username}`) : null;
    const { hash } = await hashPassword(String(body.password || ''), user?.salt || b64u(new Uint8Array(16)));
    if (!user || !safeEqual(hash, user.hash)) fail(401, 'Wrong username or password');
    return { token: await issueToken(username), user: publicUser(user) };
  });

  route('GET', '/api/me', true, async ({ me }) => ({ user: publicUser(me) }));

  route('PATCH', '/api/me', true, async ({ me, body }) => {
    const u = { ...me };
    if (body.displayName !== undefined) u.displayName = str(body.displayName, 40, 'Display name') || me.username;
    if (body.bio !== undefined) u.bio = str(body.bio, LIMITS.bio, 'Bio');
    if (body.newPassword) {
      const { hash } = await hashPassword(String(body.currentPassword || ''), me.salt);
      if (!safeEqual(hash, me.hash)) fail(401, 'Current password is wrong');
      if (String(body.newPassword).length < 6) fail(400, 'New password must be at least 6 characters');
      Object.assign(u, await hashPassword(String(body.newPassword)));
    }
    await store.set(`user/${me.username}`, u);
    return { user: publicUser(u) };
  });

  route('GET', '/api/calcs/mine', true, async ({ me }) => {
    const ids = await myCalcIds(me.username);
    const calcs = (await Promise.all(ids.map((id) => store.get(`calc/${id}`)))).filter(Boolean);
    return { calcs: await Promise.all(calcs.map((c) => view(c, me))) };
  });

  route('POST', '/api/calcs', true, async ({ me, body }) => {
    const calc = await createCalc(me, cleanCalc(body));
    if (body.visibility === 'public') {
      calc.visibility = 'public'; calc.publishedAt = now();
      await store.set(`calc/${calc.id}`, calc);
      await store.set(`pub/${calc.id}`, { at: calc.publishedAt });
    }
    return { calc: await view(calc, me) };
  });

  route('GET', '/api/calcs/:id', false, async ({ me, params }) => {
    const calc = await loadCalc(params.id, me);
    return { calc: await view(calc, me, { withStar: true }) };
  });

  route('PUT', '/api/calcs/:id', true, async ({ me, params, body }) => {
    const calc = await loadCalc(params.id, me, { mustOwn: true });
    const updated = { ...calc, ...cleanCalc(body), updatedAt: now() };
    await store.set(`calc/${calc.id}`, updated);
    return { calc: await view(updated, me) };
  });

  route('DELETE', '/api/calcs/:id', true, async ({ me, params }) => {
    const calc = await loadCalc(params.id, me, { mustOwn: true });
    const reviewKeys = await store.list(`review/${calc.id}/`);
    await Promise.all([
      store.del(`calc/${calc.id}`), store.del(`byowner/${me.username}/${calc.id}`), store.del(`pub/${calc.id}`),
      store.del(`stats/${calc.id}`), ...reviewKeys.map((k) => store.del(k)),
    ]);
    return { ok: true };
  });

  route('POST', '/api/calcs/:id/visibility', true, async ({ me, params, body }) => {
    const calc = await loadCalc(params.id, me, { mustOwn: true });
    const vis = body.visibility === 'public' ? 'public' : 'private';
    calc.visibility = vis;
    if (vis === 'public') {
      calc.publishedAt = calc.publishedAt || now();
      await store.set(`pub/${calc.id}`, { at: calc.publishedAt });
    } else {
      await store.del(`pub/${calc.id}`);
    }
    await store.set(`calc/${calc.id}`, calc);
    return { calc: await view(calc, me) };
  });

  route('POST', '/api/calcs/:id/fork', true, async ({ me, params }) => {
    const src = await loadCalc(params.id, me);
    const { name, description, category, formula, variables, result, tags } = src;
    const copy = await createCalc(me, {
      name: src.owner === me.username ? `${name} (copy)`.slice(0, LIMITS.name) : name,
      description, category, formula, variables, result, tags,
    }, { forkedFrom: { id: src.id, owner: src.owner, name: src.name } });
    if (src.owner !== me.username) await bumpStats(src.id, (s) => { s.forks++; });
    return { calc: await view(copy, me) };
  });

  route('POST', '/api/calcs/:id/run', false, async ({ me, params }) => {
    const calc = await loadCalc(params.id, me);
    await bumpStats(calc.id, (s) => { s.runs++; });
    return { ok: true };
  });

  route('POST', '/api/calcs/:id/star', true, async ({ me, params }) => {
    const calc = await loadCalc(params.id, me);
    const key = `star/${me.username}/${calc.id}`;
    if (!(await store.get(key))) {
      await store.set(key, { at: now() });
      await bumpStats(calc.id, (s) => { s.stars++; });
    }
    return { starred: true, stats: statsView(await getStats(calc.id)) };
  });

  route('DELETE', '/api/calcs/:id/star', true, async ({ me, params }) => {
    const key = `star/${me.username}/${params.id}`;
    if (await store.get(key)) {
      await store.del(key);
      if (await store.get(`calc/${params.id}`)) await bumpStats(params.id, (s) => { s.stars--; });
    }
    return { starred: false, stats: statsView(await getStats(params.id)) };
  });

  route('GET', '/api/stars', true, async ({ me }) => {
    const keys = await store.list(`star/${me.username}/`);
    const calcs = (await Promise.all(keys.map((k) => store.get(`calc/${k.split('/').pop()}`))))
      .filter((c) => c && (c.visibility === 'public' || c.owner === me.username));
    return { calcs: await Promise.all(calcs.map((c) => view(c, me))) };
  });

  route('GET', '/api/calcs/:id/reviews', false, async ({ me, params }) => {
    const calc = await loadCalc(params.id, me);
    const keys = await store.list(`review/${calc.id}/`);
    const reviews = (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    await Promise.all(reviews.map(async (r) => { r.displayName = await userName(r.username); }));
    return { reviews, mine: me ? reviews.find((r) => r.username === me.username) || null : null };
  });

  route('PUT', '/api/calcs/:id/reviews', true, async ({ me, params, body }) => {
    const calc = await loadCalc(params.id, me);
    if (calc.owner === me.username) fail(400, "You can't review your own calculator");
    if (calc.visibility !== 'public') fail(400, 'Only published calculators can be reviewed');
    const rating = Math.trunc(Number(body.rating));
    if (!(rating >= 1 && rating <= 5)) fail(400, 'Rating must be 1 to 5 stars');
    const comment = str(body.comment, LIMITS.comment, 'Review');
    const key = `review/${calc.id}/${me.username}`;
    const prev = await store.get(key);
    const t = now();
    const review = { username: me.username, rating, comment, createdAt: prev?.createdAt || t, updatedAt: t };
    await store.set(key, review);
    await bumpStats(calc.id, (s) => {
      if (prev) s.ratingSum -= prev.rating; else s.ratingCount++;
      s.ratingSum += rating;
    });
    return { review: { ...review, displayName: me.displayName } };
  });

  route('DELETE', '/api/calcs/:id/reviews', true, async ({ me, params }) => {
    const key = `review/${params.id}/${me.username}`;
    const prev = await store.get(key);
    if (prev) {
      await store.del(key);
      await bumpStats(params.id, (s) => { s.ratingSum -= prev.rating; s.ratingCount--; });
    }
    return { ok: true };
  });

  route('GET', '/api/explore', false, async ({ me, query }) => {
    const keys = await store.list('pub/');
    const calcs = (await Promise.all(keys.map((k) => store.get(`calc/${k.split('/').pop()}`))))
      .filter((c) => c && c.visibility === 'public');
    let list = await Promise.all(calcs.map((c) => view(c, me)));
    if (query.category && query.category !== 'All') list = list.filter((c) => c.category === query.category);
    if (query.author) list = list.filter((c) => c.owner === query.author);
    list = list.filter((c) => matches(c, query.q));
    const total = list.length;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 60));
    return { calcs: sortCalcs(list, query.sort).slice(0, limit), total };
  });

  route('GET', '/api/users/:username', false, async ({ me, params }) => {
    const user = await store.get(`user/${String(params.username).toLowerCase()}`);
    if (!user) fail(404, 'User not found');
    const ids = await myCalcIds(user.username);
    const calcs = (await Promise.all(ids.map((id) => store.get(`calc/${id}`))))
      .filter((c) => c && c.visibility === 'public');
    const list = sortCalcs(await Promise.all(calcs.map((c) => view(c, me))), 'popular');
    const totals = list.reduce((t, c) => ({ runs: t.runs + c.stats.runs, stars: t.stars + c.stats.stars, forks: t.forks + c.stats.forks }), { runs: 0, stars: 0, forks: 0 });
    return { user: publicUser(user), calcs: list, totals };
  });

  async function handle({ method, path, query = {}, body = {}, token = null }) {
    userCache.clear();
    try {
      const m = String(method || 'GET').toUpperCase();
      const p = String(path || '').replace(/\/+$/, '') || '/';
      let matchedPath = false;
      for (const r of routes) {
        const mm = p.match(r.re);
        if (!mm) continue;
        matchedPath = true;
        if (r.method !== m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(mm[i + 1])]));
        const me = await readToken(token);
        if (r.auth && !me) fail(401, 'Please log in first');
        const data = await r.fn({ me, params, query, body: body && typeof body === 'object' ? body : {} });
        return { status: 200, body: data };
      }
      return matchedPath ? { status: 405, body: { error: 'Method not allowed' } } : { status: 404, body: { error: 'Not found' } };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
      console.error(e);
      return { status: 500, body: { error: 'Something went wrong on the server' } };
    }
  }

  return { handle };
}

export function prettify(name) {
  return String(name)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
