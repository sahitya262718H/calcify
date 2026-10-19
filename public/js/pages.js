// Home, My calculators, Explore, Profile, Auth, Settings, About.
import { api, setToken } from './api.js';
import { CATEGORIES } from './core.js';
import { BUILTINS } from './builtins.js';
import { state, setUser, go } from './state.js';
import { ABOUT } from './about.js';
import { esc, icon, calcCard, emptyState, skeletons, toast, debounce, safeLS, timeAgo, compact, confirmModal } from './ui.js';

const newBtn = (label = 'New calculator') => `<a class="btn primary" href="#/new">${icon('plus')}${esc(label)}</a>`;

// ------------------------------------------------------------------ home
export async function renderHome(el) {
  const u = state.user;
  const hero = u ? `
    <div class="page-head welcome">
      <div><h1>Welcome back, ${esc(u.displayName)}</h1><p class="muted">Pick up a calculator, or make a new one.</p></div>
      <div class="row"><a class="link-quiet" href="#/about">${icon('info')}About</a>${newBtn()}</div>
    </div>
    <div class="quick"><div class="search">${icon('search')}<input class="input" id="qs" placeholder="Search your calculators and ready-made ones" aria-label="Search calculators"></div></div>
    <div id="qs-results"></div>` : `
    <section class="hero">
      <a class="link-quiet hero-about" href="#/about">${icon('info')}About CalciFy</a>
      <div>
        <h1>Do the maths once.<br><em>Reuse it forever.</em></h1>
        <p class="lead">Turn the formulas you repeat every week into your own calculators. Next time, just fill in the values. Keep them private, or publish them for others to use, rate and fork.</p>
        <div class="row"><a class="btn primary" href="#/signup">Get started, it's free</a><a class="btn" href="#/explore">${icon('compass')}Explore calculators</a></div>
      </div>
      <div class="demo" aria-label="Example">
        <div class="demo-bar">${icon('calc')}Team trip cost</div>
        <div class="demo-body">
          <div class="demo-step"><span class="n">1</span><div><div class="t">Write your formula once</div>
            <div class="demo-code"><span class="tk-op">(</span>People <span class="tk-op">x</span> Cost <span class="tk-op">x</span> Days<span class="tk-op">)</span> <span class="tk-op">+</span> AutoCharge <span class="tk-op">-</span> Cuttings</div></div></div>
          <div class="demo-step"><span class="n">2</span><div><div class="t">Next time, only enter values</div>
            <div class="demo-inputs"><div><span>People</span>4</div><div><span>Cost</span>₹250</div><div><span>Days</span>3</div><div><span>AutoCharge</span>₹500</div><div><span>Cuttings</span>₹200</div></div></div></div>
          <div class="demo-result"><span class="muted small">Total</span><b>₹3,300.00</b></div>
        </div>
      </div>
    </section>
    <div class="section features">
      <div class="feature"><div class="ic">${icon('bolt')}</div><h3>Any formula, your names</h3><p>Use your own words like <span class="mono">AutoCharge</span> or <span class="mono">[Old Pay]</span>. CalciFy finds the inputs for you.</p></div>
      <div class="feature"><div class="ic">${icon('lock')}</div><h3>Private by default</h3><p>Your calculators stay yours. Publish one only when you want to share it.</p></div>
      <div class="feature"><div class="ic">${icon('users')}</div><h3>Community library</h3><p>Find calculators other people made for niche jobs. Rate, review and fork them.</p></div>
    </div>`;

  el.innerHTML = `${hero}
    ${u ? '<section class="section" id="mine-sec"><div class="section-head"><h2>Your calculators</h2><a href="#/mine">View all' + icon('chevron') + '</a></div><div id="mine-list">' + skeletons(3) + '</div></section>' : ''}
    <section class="section"><div class="section-head"><h2>Ready-made calculators</h2><span class="faint small">Click Customize on any of them to make your own version</span></div>
      <div class="grid grid-builtins">${BUILTINS.map((b) => calcCard(b)).join('')}</div></section>
    <section class="section"><div class="section-head"><h2>Popular in the community</h2><a href="#/explore">Explore${icon('chevron')}</a></div><div id="pop">${skeletons(3)}</div></section>`;

  let mine = [];
  if (u) {
    api.mine().then(({ calcs }) => {
      mine = calcs.sort((a, b) => b.updatedAt - a.updatedAt);
      const box = el.querySelector('#mine-list');
      if (!box) return;
      box.innerHTML = mine.length ? `<div class="grid">${mine.slice(0, 6).map((c) => calcCard(c, { showOwner: false, showVisibility: true })).join('')}</div>`
        : emptyState({ title: 'No calculators yet', text: 'Make your first one. Write a formula, name it, and it’s ready to reuse.', action: newBtn('Create your first calculator') });
    }).catch((e) => { const b = el.querySelector('#mine-list'); if (b) b.innerHTML = `<p class="error-text">${esc(e.message)}</p>`; });

    const qs = el.querySelector('#qs');
    const out = el.querySelector('#qs-results');
    qs.addEventListener('input', () => {
      const q = qs.value.trim().toLowerCase();
      if (!q) { out.innerHTML = ''; return; }
      const hits = [...mine, ...BUILTINS].filter((c) => `${c.name} ${c.description} ${c.category} ${(c.tags || []).join(' ')}`.toLowerCase().includes(q)).slice(0, 6);
      out.innerHTML = `<div class="section" style="margin-top:16px">${hits.length ? `<div class="grid">${hits.map((c) => calcCard(c, { showVisibility: true })).join('')}</div>` : `<p class="muted">Nothing found for “${esc(qs.value)}”. <a href="#/explore" style="color:var(--accent)">Search the community</a> instead?</p>`}</div>`;
    });
  }

  api.explore({ sort: 'popular', limit: 6 }).then(({ calcs }) => {
    const box = el.querySelector('#pop');
    if (!box) return;
    box.innerHTML = calcs.length ? `<div class="grid">${calcs.map((c) => calcCard(c)).join('')}</div>`
      : emptyState({ iconName: 'users', title: 'Nothing published yet', text: 'Be the first to publish a calculator for the community.', action: u ? newBtn() : '<a class="btn" href="#/signup">Sign up</a>' });
  }).catch((e) => { const b = el.querySelector('#pop'); if (b) b.innerHTML = `<p class="error-text">${esc(e.message)}</p>`; });
}

// ------------------------------------------------------------------ my calculators
export async function renderMine(el, params, query) {
  const tab = ['all', 'private', 'public', 'starred'].includes(query.tab) ? query.tab : 'all';
  const prefs = safeLS.get('calcify.mine.prefs', { sort: 'updated' });
  el.innerHTML = `
    <div class="page-head"><div><h1>My calculators</h1><p>Everything you've built, plus the ones you've starred.</p></div>${newBtn()}</div>
    <div class="toolbar">
      <div class="segmented" id="tabs" role="tablist">
        ${[['all', 'All'], ['private', 'Private'], ['public', 'Published'], ['starred', 'Starred']].map(([k, l]) => `<button role="tab" data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}<span class="count" data-count="${k}"></span></button>`).join('')}
      </div>
      <div class="search">${icon('search')}<input class="input" id="q" placeholder="Search" aria-label="Search my calculators"></div>
      <select class="select input" id="sort" style="width:auto" aria-label="Sort">
        <option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="runs">Most used</option>
      </select>
    </div>
    <div id="list">${skeletons(6)}</div>`;
  el.querySelector('#sort').value = prefs.sort;

  let mine = []; let starred = [];
  try {
    [{ calcs: mine }, { calcs: starred }] = await Promise.all([api.mine(), api.stars()]);
  } catch (e) { el.querySelector('#list').innerHTML = `<p class="error-text">${esc(e.message)}</p>`; return; }

  const counts = { all: mine.length, private: mine.filter((c) => c.visibility !== 'public').length, public: mine.filter((c) => c.visibility === 'public').length, starred: starred.length };
  el.querySelectorAll('[data-count]').forEach((s) => { s.textContent = counts[s.dataset.count]; });

  let cur = tab;
  const draw = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase();
    const sort = el.querySelector('#sort').value;
    let list = cur === 'starred' ? starred : cur === 'all' ? mine : mine.filter((c) => (cur === 'public' ? c.visibility === 'public' : c.visibility !== 'public'));
    if (q) list = list.filter((c) => `${c.name} ${c.description} ${c.category} ${(c.tags || []).join(' ')} ${c.formula}`.toLowerCase().includes(q));
    list = [...list].sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'runs' ? (a, b) => b.stats.runs - a.stats.runs : (a, b) => b.updatedAt - a.updatedAt);
    const box = el.querySelector('#list');
    if (list.length) { box.innerHTML = `<div class="grid">${list.map((c) => calcCard(c, { showOwner: cur === 'starred', showVisibility: cur !== 'starred' })).join('')}</div>`; return; }
    if (q) { box.innerHTML = emptyState({ iconName: 'search', title: 'No matches', text: `Nothing matches “${q}”.` }); return; }
    box.innerHTML = {
      all: emptyState({ title: 'No calculators yet', text: 'Write a formula once, then reuse it any time by just entering values.', action: newBtn('Create your first calculator') }),
      private: emptyState({ iconName: 'lock', title: 'No private calculators', text: 'New calculators are private until you publish them.' }),
      public: emptyState({ iconName: 'globe', title: 'Nothing published yet', text: 'Open one of your calculators and click Publish to share it in Explore.' }),
      starred: emptyState({ iconName: 'star', title: 'No stars yet', text: 'Star calculators in Explore to keep them handy here.', action: '<a class="btn" href="#/explore">Explore</a>' }),
    }[cur];
  };
  el.querySelector('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    cur = b.dataset.tab;
    el.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    history.replaceState(null, '', `#/mine${cur === 'all' ? '' : `?tab=${cur}`}`);
    draw();
  });
  el.querySelector('#q').addEventListener('input', draw);
  el.querySelector('#sort').addEventListener('change', (e) => { safeLS.set('calcify.mine.prefs', { sort: e.target.value }); draw(); });
  draw();
}

// ------------------------------------------------------------------ explore
export async function renderExplore(el, params, query) {
  const st = { q: query.q || '', category: query.category || 'All', sort: query.sort || 'popular' };
  el.innerHTML = `
    <div class="page-head"><div><h1>Explore</h1><p>Calculators published by the community. Use them, rate them, or fork your own copy.</p></div></div>
    <div class="toolbar">
      <div class="search">${icon('search')}<input class="input" id="q" placeholder="Search by name, tag, or input" value="${esc(st.q)}" aria-label="Search"></div>
      <select class="select input" id="sort" style="width:auto" aria-label="Sort">
        <option value="popular">Most popular</option><option value="top">Top rated</option><option value="new">Newest</option><option value="stars">Most starred</option>
      </select>
    </div>
    <div class="chips" id="cats" style="margin-bottom:20px">${['All', ...CATEGORIES].map((c) => `<button class="chip ${c === st.category ? 'active' : ''}" data-c="${c}">${c}</button>`).join('')}</div>
    <div class="faint small" id="count" style="margin-bottom:12px"></div>
    <div id="list">${skeletons(6)}</div>`;
  el.querySelector('#sort').value = st.sort;

  let seq = 0;
  const load = async () => {
    const my = ++seq;
    history.replaceState(null, '', `#/explore?${new URLSearchParams(Object.entries(st).filter(([k, v]) => v && !(k === 'category' && v === 'All') && !(k === 'sort' && v === 'popular')))}`.replace(/\?$/, ''));
    try {
      const { calcs, total } = await api.explore({ q: st.q, category: st.category, sort: st.sort });
      if (my !== seq) return;
      el.querySelector('#count').textContent = `${total} calculator${total === 1 ? '' : 's'}`;
      el.querySelector('#list').innerHTML = calcs.length ? `<div class="grid">${calcs.map((c) => calcCard(c)).join('')}</div>`
        : (st.q || st.category !== 'All')
          ? emptyState({ iconName: 'search', title: 'No calculators found', text: 'Try different words or another category. Or build the one you need.', action: newBtn('Build it yourself') })
          : emptyState({ iconName: 'users', title: 'Nothing published yet', text: 'When people publish calculators, they show up here.', action: newBtn() });
    } catch (e) { if (my === seq) el.querySelector('#list').innerHTML = `<p class="error-text">${esc(e.message)}</p>`; }
  };
  el.querySelector('#q').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); load(); }, 250));
  el.querySelector('#sort').addEventListener('change', (e) => { st.sort = e.target.value; load(); });
  el.querySelector('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    st.category = b.dataset.c;
    el.querySelectorAll('#cats .chip').forEach((x) => x.classList.toggle('active', x === b));
    load();
  });
  load();
}

// ------------------------------------------------------------------ profile
export async function renderProfile(el, { username }) {
  el.innerHTML = '<div class="loading-line">Loading profile…</div>';
  let data;
  try { data = await api.user(username); } catch (e) {
    el.innerHTML = emptyState({ iconName: 'user', title: 'User not found', text: e.status === 404 ? `There's no one called @${username}.` : e.message, action: '<a class="btn" href="#/explore">Explore</a>' });
    return;
  }
  const { user, calcs, totals } = data;
  const me = state.user?.username === user.username;
  el.innerHTML = `
    <div class="profile-head">
      <span class="avatar lg">${esc(user.displayName[0])}</span>
      <div><h1>${esc(user.displayName)}</h1><div class="handle">@${esc(user.username)} · joined ${esc(new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }))}</div>
        ${user.bio ? `<p class="bio">${esc(user.bio)}</p>` : ''}
        ${me ? `<div style="margin-top:10px"><a class="btn sm" href="#/settings">${icon('edit')}Edit profile</a></div>` : ''}</div>
      <div class="profile-stats"><div><b>${calcs.length}</b><span>Published</span></div><div><b>${compact(totals.runs)}</b><span>Runs</span></div><div><b>${compact(totals.stars)}</b><span>Stars</span></div><div><b>${compact(totals.forks)}</b><span>Forks</span></div></div>
    </div>
    <div class="section-head"><h2>Published calculators</h2></div>
    ${calcs.length ? `<div class="grid">${calcs.map((c) => calcCard(c, { showOwner: false })).join('')}</div>`
      : emptyState({ iconName: 'globe', title: 'Nothing published yet', text: me ? 'Your private calculators are only visible to you. Publish one to show it here.' : `${user.displayName} hasn't published anything yet.` })}`;
}

// ------------------------------------------------------------------ auth
export function renderAuth(el, params, query, kind) {
  if (state.user) { go(query.next || '#/'); return; }
  const signup = kind === 'signup';
  const next = query.next || '#/';
  el.innerHTML = `
    <div class="auth"><div class="card card-pad">
      <h1>${signup ? 'Create your account' : 'Welcome back'}</h1>
      <p class="sub">${signup ? 'Save your calculators and share them when you want.' : 'Log in to get to your calculators.'}</p>
      <form id="af" novalidate>
        <div class="form-error" id="err" hidden></div>
        ${signup ? '<div class="field"><label for="dn">Your name</label><input class="input" id="dn" autocomplete="name" maxlength="40" placeholder="Edward Elric"></div>' : ''}
        <div class="field"><label for="un">Username</label><input class="input" id="un" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="24" placeholder="edward">
          ${signup ? '<span class="hint">3–24 characters: letters, numbers or _</span>' : ''}</div>
        <div class="field"><label for="pw">Password</label><input class="input" id="pw" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'At least 6 characters' : ''}"></div>
        <button class="btn primary block" type="submit" id="go">${signup ? 'Create account' : 'Log in'}</button>
      </form>
      <div class="switch">${signup ? `Already have an account? <a href="#/login?next=${encodeURIComponent(next)}">Log in</a>` : `New to CalciFy? <a href="#/signup?next=${encodeURIComponent(next)}">Create an account</a>`}</div>
    </div>
    ${state.mode === 'local' ? '<p class="faint small" style="text-align:center;margin-top:14px">Running in this-device mode: your account is stored only in this browser.</p>' : ''}
    </div>`;
  const f = el.querySelector('#af');
  (el.querySelector('#dn') || el.querySelector('#un')).focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = el.querySelector('#err');
    err.hidden = true;
    const body = { username: el.querySelector('#un').value.trim(), password: el.querySelector('#pw').value };
    if (signup) body.displayName = el.querySelector('#dn').value.trim();
    if (!body.username || !body.password) { err.textContent = 'Enter your username and password'; err.hidden = false; return; }
    const btn = el.querySelector('#go');
    btn.disabled = true; btn.textContent = signup ? 'Creating account…' : 'Logging in…';
    try {
      const r = signup ? await api.signup(body) : await api.login(body);
      setToken(r.token);
      setUser(r.user);
      toast(signup ? `Welcome to CalciFy, ${r.user.displayName}` : `Welcome back, ${r.user.displayName}`);
      go(next.startsWith('#/') ? next : '#/');
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      btn.disabled = false; btn.textContent = signup ? 'Create account' : 'Log in';
    }
  });
}

// ------------------------------------------------------------------ settings
export function renderSettings(el) {
  const u = state.user;
  el.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>Your profile, password and data.</p></div></div>
    <div style="max-width:640px;display:grid;gap:18px">
      <form class="card card-pad" id="pf">
        <h3 style="margin-bottom:16px">Profile</h3>
        <div class="field"><label for="dn">Display name</label><input class="input" id="dn" maxlength="40" value="${esc(u.displayName)}"></div>
        <div class="field"><label for="bio">Bio <span class="faint">(optional)</span></label><textarea class="textarea" id="bio" maxlength="280" rows="3" placeholder="What kind of calculations do you do?">${esc(u.bio || '')}</textarea></div>
        <div class="row"><button class="btn primary" type="submit">Save profile</button><a class="btn ghost" href="#/u/${esc(u.username)}">View public profile</a></div>
      </form>
      <form class="card card-pad" id="pwf">
        <h3 style="margin-bottom:16px">Change password</h3>
        <div class="grid-2">
          <div class="field"><label for="cp">Current password</label><input class="input" id="cp" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="np">New password</label><input class="input" id="np" type="password" autocomplete="new-password"></div>
        </div>
        <button class="btn" type="submit">Update password</button>
      </form>
      <div class="card card-pad">
        <h3>Your data</h3>
        <p class="muted small" style="margin:4px 0 16px">Download all your calculators as a JSON file, or import calculators from one.</p>
        <div class="row"><button class="btn" id="exp">${icon('download')}Export</button>
          <label class="btn">${icon('upload')}Import<input type="file" id="imp" accept="application/json,.json" hidden></label></div>
      </div>
      <div class="card card-pad row"><div><h3>Log out</h3><p class="muted small" style="margin:0">Sign out on this device.</p></div><span class="spacer"></span><button class="btn danger" id="lo">${icon('logout')}Log out</button></div>
    </div>`;
  el.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await api.updateMe({ displayName: el.querySelector('#dn').value, bio: el.querySelector('#bio').value }); setUser(r.user); toast('Profile saved'); } catch (ex) { toast(ex.message, 'err'); }
  });
  el.querySelector('#pwf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.updateMe({ currentPassword: el.querySelector('#cp').value, newPassword: el.querySelector('#np').value });
      el.querySelector('#cp').value = ''; el.querySelector('#np').value = '';
      toast('Password updated');
    } catch (ex) { toast(ex.message, 'err'); }
  });
  el.querySelector('#exp').addEventListener('click', async () => {
    try {
      const { calcs } = await api.mine();
      const data = calcs.map(({ name, description, category, tags, formula, variables, result, visibility }) => ({ name, description, category, tags, formula, variables, result, visibility }));
      const blob = new Blob([JSON.stringify({ app: 'calcify', version: 1, exportedAt: new Date().toISOString(), calculators: data }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `calcify-${u.username}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (ex) { toast(ex.message, 'err'); }
  });
  el.querySelector('#imp').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let list;
    try { const j = JSON.parse(await file.text()); list = Array.isArray(j) ? j : j.calculators; if (!Array.isArray(list)) throw new Error(); } catch { toast('That file is not a CalciFy export', 'err'); return; }
    if (!(await confirmModal({ title: `Import ${list.length} calculator${list.length === 1 ? '' : 's'}?`, message: 'They will be added to your calculators as private copies.', confirmText: 'Import' }))) return;
    let ok = 0; let bad = 0;
    for (const c of list.slice(0, 300)) { try { await api.create({ ...c, visibility: 'private' }); ok++; } catch { bad++; } }
    toast(`Imported ${ok}${bad ? `, skipped ${bad}` : ''}`, ok ? 'ok' : 'err');
  });
  el.querySelector('#lo').addEventListener('click', () => { setToken(null); setUser(null); toast('Logged out'); go('#/'); });
}

// ------------------------------------------------------------------ about
export function renderAbout(el) {
  el.innerHTML = `<article class="about">
    <div class="crumbs"><a href="#/">Home</a>${icon('chevron')}<span>About</span></div>
    <h1>${esc(ABOUT.title)}</h1>
    <p class="lead">${esc(ABOUT.lead)}</p>
    ${ABOUT.sections.length ? ABOUT.sections.map((s) => `<h2>${esc(s.heading)}</h2>${(s.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')
      : `<div class="placeholder">${esc(ABOUT.placeholder)}</div>`}
  </article>`;
}

export function renderNotFound(el) {
  el.innerHTML = emptyState({ iconName: 'alert', title: 'Page not found', text: 'That link doesn’t go anywhere.', action: '<a class="btn" href="#/">Go home</a>' });
}

export { timeAgo };
