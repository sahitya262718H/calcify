import assert from 'node:assert/strict';
import { createApi } from '../public/js/core.js';

const db = new Map();
const store = {
  get: async (k) => (db.has(k) ? JSON.parse(JSON.stringify(db.get(k))) : null),
  set: async (k, v) => { db.set(k, JSON.parse(JSON.stringify(v))); },
  del: async (k) => { db.delete(k); },
  list: async (p) => [...db.keys()].filter((k) => k.startsWith(p)),
};
const api = createApi({ store });
let pass = 0;
const call = async (method, path, { body, token, query } = {}) => api.handle({ method, path, body, token, query });
const ok = async (...a) => { const r = await call(...a); assert.equal(r.status, 200, `${a[0]} ${a[1]} -> ${r.status} ${JSON.stringify(r.body)}`); pass++; return r.body; };
const err = async (status, ...a) => { const r = await call(...a); assert.equal(r.status, status, `${a[0]} ${a[1]} -> ${r.status} ${JSON.stringify(r.body)}`); pass++; return r.body; };

await ok('GET', '/api/health');
const ed = await ok('POST', '/api/auth/signup', { body: { username: 'Edward', displayName: 'Edward Elric', password: 'alchemy' } });
assert.equal(ed.user.username, 'edward');
await err(409, 'POST', '/api/auth/signup', { body: { username: 'edward', password: 'xxxxxx' } });
await err(400, 'POST', '/api/auth/signup', { body: { username: 'ab', password: 'xxxxxx' } });
await err(400, 'POST', '/api/auth/signup', { body: { username: 'abc', password: '123' } });
await err(401, 'POST', '/api/auth/login', { body: { username: 'edward', password: 'wrong!' } });
const login = await ok('POST', '/api/auth/login', { body: { username: 'EDWARD', password: 'alchemy' } });
const T = login.token;
await err(401, 'GET', '/api/me', { token: 'garbage.token' });
await err(401, 'GET', '/api/me', { token: T.slice(0, -2) + 'xx' });
assert.equal((await ok('GET', '/api/me', { token: T })).user.displayName, 'Edward Elric');

const al = await ok('POST', '/api/auth/signup', { body: { username: 'alphonse', password: 'armor123' } });
const A = al.token;

await err(401, 'POST', '/api/calcs', { body: {} });
await err(400, 'POST', '/api/calcs', { token: T, body: { name: 'x', formula: '1 +' } });
await err(400, 'POST', '/api/calcs', { token: T, body: { name: '', formula: '1' } });
const c1 = (await ok('POST', '/api/calcs', { token: T, body: {
  name: 'Trip cost', description: 'Team trip', category: 'Business',
  formula: '(NumberOfPeople x Cost x days) + AutoCharge + (oldPay) - (Cuttings)',
  variables: [{ key: 'cost', label: 'Cost per person per day', unit: '₹', default: 250 }, { key: 'bogus', label: 'nope' }],
  result: { label: 'Total', prefix: '₹', decimals: 2 }, tags: 'travel, Team, travel',
} })).calc;
assert.equal(c1.visibility, 'private');
assert.equal(c1.variables.length, 6);
assert.equal(c1.variables.find((v) => v.key === 'cost').default, 250);
assert.equal(c1.variables.find((v) => v.key === 'numberofpeople').label, 'Number Of People');
assert.deepEqual(c1.tags, ['travel', 'team']);

// privacy
await err(404, 'GET', `/api/calcs/${c1.id}`, { token: A });
await err(404, 'GET', `/api/calcs/${c1.id}`);
await ok('GET', `/api/calcs/${c1.id}`, { token: T });
assert.equal((await ok('GET', '/api/explore')).total, 0);
await err(404, 'POST', `/api/calcs/${c1.id}/fork`, { token: A });

// publish
await ok('POST', `/api/calcs/${c1.id}/visibility`, { token: T, body: { visibility: 'public' } });
assert.equal((await ok('GET', '/api/explore')).total, 1);
assert.equal((await ok('GET', '/api/explore', { query: { q: 'trip' } })).total, 1);
assert.equal((await ok('GET', '/api/explore', { query: { q: 'nothing-here' } })).total, 0);
assert.equal((await ok('GET', '/api/explore', { query: { category: 'Health' } })).total, 0);
await ok('GET', `/api/calcs/${c1.id}`);
await err(403, 'PUT', `/api/calcs/${c1.id}`, { token: A, body: { name: 'hack', formula: '1' } });
await err(403, 'DELETE', `/api/calcs/${c1.id}`, { token: A });

// run, star, fork, review
await ok('POST', `/api/calcs/${c1.id}/run`);
await ok('POST', `/api/calcs/${c1.id}/star`, { token: A });
await ok('POST', `/api/calcs/${c1.id}/star`, { token: A }); // idempotent
const fork = (await ok('POST', `/api/calcs/${c1.id}/fork`, { token: A })).calc;
assert.equal(fork.owner, 'alphonse');
assert.equal(fork.forkedFrom.id, c1.id);
assert.equal(fork.visibility, 'private');
await err(400, 'PUT', `/api/calcs/${c1.id}/reviews`, { token: T, body: { rating: 5 } });
await err(400, 'PUT', `/api/calcs/${c1.id}/reviews`, { token: A, body: { rating: 9 } });
await ok('PUT', `/api/calcs/${c1.id}/reviews`, { token: A, body: { rating: 4, comment: 'Nice' } });
await ok('PUT', `/api/calcs/${c1.id}/reviews`, { token: A, body: { rating: 5, comment: 'Even nicer' } });
let d = (await ok('GET', `/api/calcs/${c1.id}`, { token: A })).calc;
assert.deepEqual(d.stats, { runs: 1, stars: 1, forks: 1, reviews: 1, rating: 5 });
assert.equal(d.starred, true);
const rv = await ok('GET', `/api/calcs/${c1.id}/reviews`, { token: A });
assert.equal(rv.reviews.length, 1); assert.equal(rv.mine.comment, 'Even nicer');
assert.equal((await ok('GET', '/api/stars', { token: A })).calcs.length, 1);
await ok('DELETE', `/api/calcs/${c1.id}/star`, { token: A });
await ok('DELETE', `/api/calcs/${c1.id}/reviews`, { token: A });
d = (await ok('GET', `/api/calcs/${c1.id}`)).calc;
assert.deepEqual(d.stats, { runs: 1, stars: 0, forks: 1, reviews: 0, rating: null });

// edit, profile, unpublish, delete
const upd = (await ok('PUT', `/api/calcs/${c1.id}`, { token: T, body: { ...c1, name: 'Trip cost v2', formula: 'a + b' } })).calc;
assert.equal(upd.name, 'Trip cost v2'); assert.equal(upd.variables.length, 2); assert.equal(upd.visibility, 'public');
const prof = await ok('GET', '/api/users/edward');
assert.equal(prof.calcs.length, 1); assert.equal(prof.user.displayName, 'Edward Elric'); assert.equal(prof.user.hash, undefined);
await ok('POST', `/api/calcs/${c1.id}/visibility`, { token: T, body: { visibility: 'private' } });
assert.equal((await ok('GET', '/api/explore')).total, 0);
assert.equal((await ok('GET', '/api/users/edward')).calcs.length, 0);
assert.equal((await ok('GET', '/api/calcs/mine', { token: T })).calcs.length, 1);
await ok('DELETE', `/api/calcs/${c1.id}`, { token: T });
assert.equal((await ok('GET', '/api/calcs/mine', { token: T })).calcs.length, 0);
assert.equal([...db.keys()].some((k) => k.includes(c1.id)), false, 'no leftovers after delete');

// profile edit + password change
await ok('PATCH', '/api/me', { token: T, body: { displayName: 'Fullmetal', bio: 'Equivalent exchange' } });
await err(401, 'PATCH', '/api/me', { token: T, body: { currentPassword: 'nope', newPassword: 'newpass' } });
await ok('PATCH', '/api/me', { token: T, body: { currentPassword: 'alchemy', newPassword: 'newpass' } });
await ok('POST', '/api/auth/login', { body: { username: 'edward', password: 'newpass' } });

await err(404, 'GET', '/api/nope');
await err(405, 'DELETE', '/api/health');
console.log(`api: ${pass} tests passed`);
