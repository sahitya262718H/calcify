// CalciFy app shell + hash router.
import { api, detect, hasToken, setToken } from './api.js';
import { state, setUser, onUserChange, go, requireLogin } from './state.js';
import { esc, icon, safeLS, confirmModal } from './ui.js';
import { renderRunner } from './runner.js';
import { renderBuilder } from './builder.js';
import { renderHome, renderMine, renderExplore, renderProfile, renderAuth, renderSettings, renderAbout, renderNotFound } from './pages.js';

const app = document.getElementById('app');

const ROUTES = [
  ['/', renderHome, 'home'],
  ['/mine', renderMine, 'mine', { auth: true }],
  ['/explore', renderExplore, 'explore'],
  ['/new', (el, p, q) => renderBuilder(el, {}, q), 'new', { auth: true }],
  ['/edit/:id', (el, p, q) => renderBuilder(el, p, q), 'mine', { auth: true }],
  ['/c/:id', renderRunner, ''],
  ['/u/:username', renderProfile, ''],
  ['/login', (el, p, q) => renderAuth(el, p, q, 'login'), ''],
  ['/signup', (el, p, q) => renderAuth(el, p, q, 'signup'), ''],
  ['/settings', renderSettings, '', { auth: true }],
  ['/about', renderAbout, 'about'],
].map(([pattern, view, nav, opts = {}]) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  return { re, keys, view, nav, ...opts };
});

function shell() {
  app.innerHTML = `
    <header class="header"><div class="header-inner">
      <a class="brand" href="#/" aria-label="CalciFy home"><span class="brand-mark"><span></span></span>CalciFy</a>
      <nav class="nav" id="nav">
        <a href="#/" data-nav="home">Home</a>
        <a href="#/mine" data-nav="mine">My calculators</a>
        <a href="#/explore" data-nav="explore">Explore</a>
      </nav>
      <div class="header-right" id="hright"></div>
    </div></header>
    <div class="banner" id="banner" hidden><div class="banner-inner">${icon('info')}<span>This-device mode: no server found, so your data is saved only in this browser. Deploy to Netlify to share with others.</span><button id="bclose" aria-label="Dismiss">${icon('x')}</button></div></div>
    <main id="view"></main>
    <footer class="footer"><div class="footer-inner"><span>© ${new Date().getFullYear()} CalciFy</span><a href="#/about">About</a><a href="#/explore">Explore</a><span class="spacer"></span><span>Do the maths once. Reuse it forever.</span></div></footer>
    <nav class="tabbar" id="tabbar">
      <a href="#/" data-nav="home">${icon('home')}Home</a>
      <a href="#/mine" data-nav="mine">${icon('grid')}Mine</a>
      <a href="#/new" data-nav="new" class="new">${icon('plus')}New</a>
      <a href="#/explore" data-nav="explore">${icon('compass')}Explore</a>
    </nav>`;
  document.getElementById('bclose').addEventListener('click', () => { document.getElementById('banner').hidden = true; safeLS.set('calcify.bannerClosed', true); });
}

let closeMenu = () => {};
document.addEventListener('click', (e) => closeMenu(e));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

function renderHeaderRight() {
  closeMenu = () => {};
  const u = state.user;
  const el = document.getElementById('hright');
  el.innerHTML = `<a class="link-quiet hide-sm" href="#/about" data-nav="about">${icon('info')}About</a>${u ? `
    <a class="btn primary sm hide-sm" href="#/new">${icon('plus')}New calculator</a>
    <div class="menu-wrap">
      <button class="menu-btn" id="ubtn" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu"><span class="avatar">${esc(u.displayName[0] || u.username[0])}</span></button>
      <div class="menu" id="umenu" role="menu" hidden>
        <div class="menu-head"><b>${esc(u.displayName)}</b><small>@${esc(u.username)}</small></div>
        <a href="#/u/${esc(u.username)}" role="menuitem">${icon('user')}Public profile</a>
        <a href="#/mine" role="menuitem">${icon('grid')}My calculators</a>
        <a href="#/mine?tab=starred" role="menuitem">${icon('star')}Starred</a>
        <a href="#/about" role="menuitem">${icon('info')}About</a>
        <a href="#/settings" role="menuitem">${icon('settings')}Settings</a>
        <button id="logout" role="menuitem">${icon('logout')}Log out</button>
      </div>
    </div>` : `<a class="btn ghost sm" href="#/login">Log in</a><a class="btn primary sm" href="#/signup">Sign up</a>`}`;
  if (!u) {
    // keep About reachable on phones when logged out
    el.querySelector('.link-quiet').classList.remove('hide-sm');
    return;
  }
  const btn = el.querySelector('#ubtn');
  const menu = el.querySelector('#umenu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
  closeMenu = (e) => { if (!e || !menu.contains(e.target)) close(); };
  menu.addEventListener('click', (e) => { if (e.target.closest('a,button')) close(); });
  el.querySelector('#logout').addEventListener('click', () => { setToken(null); setUser(null); go('#/'); });
}

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

let current = null;
let lastHash = location.hash;
let suppress = false;

async function router() {
  if (suppress) { suppress = false; return; }
  if (current?.isDirty?.() && location.hash !== lastHash) {
    const target = location.hash;
    suppress = true;
    location.hash = lastHash;
    const leave = await confirmModal({ title: 'Leave without saving?', message: 'You have unsaved changes on this calculator.', confirmText: 'Leave', danger: true });
    if (!leave) return;
    current = null;
    location.hash = target;
    return;
  }
  lastHash = location.hash;
  const { path, query } = parseHash();
  let match = null; let params = {};
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { match = r; params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])); break; }
  }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', !!match && a.dataset.nav === match.nav));
  const view = document.getElementById('view');
  window.scrollTo(0, 0);
  current = null;
  if (!match) { renderNotFound(view); return; }
  if (match.auth && !state.user) { requireLogin(location.hash); return; }
  try {
    current = (await match.view(view, params, query)) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty">${icon('alert')}<h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn" href="#/">Go home</a></div>`;
  }
  const titles = { home: 'Home', mine: 'My calculators', explore: 'Explore', new: 'New calculator', about: 'About' };
  const h1 = view.querySelector('h1')?.textContent;
  document.title = `${match.nav && titles[match.nav] ? titles[match.nav] : h1 || 'CalciFy'} · CalciFy`;
}

window.addEventListener('beforeunload', (e) => { if (current?.isDirty?.()) { e.preventDefault(); e.returnValue = ''; } });

async function start() {
  shell();
  const mode = await detect();
  state.mode = mode;
  if (mode === 'local' && !safeLS.get('calcify.bannerClosed', false)) document.getElementById('banner').hidden = false;
  if (hasToken()) {
    try { setUser((await api.me()).user); } catch { setToken(null); }
  }
  renderHeaderRight();
  onUserChange(renderHeaderRight);
  window.addEventListener('hashchange', router);
  router();
}

start();
