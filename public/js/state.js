// Shared app state + navigation helpers.
export const state = {
  user: null,       // { username, displayName, bio }
  mode: null,       // 'cloud' | 'local'
  listeners: new Set(),
};
export function setUser(u) {
  state.user = u;
  state.listeners.forEach((fn) => fn());
}
export const onUserChange = (fn) => { state.listeners.add(fn); return () => state.listeners.delete(fn); };
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
export const requireLogin = (next = location.hash) => go(`#/login?next=${encodeURIComponent(next || '#/')}`);
