// Small UI helpers: escaping, icons, toasts, modals, cards, number formatting.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  home: '<path d="M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18.5h.01M12 18.5h4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M8 3v5h7M8 21v-7h8v7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.4L4 8M4 4v4h4M4 13a8 8 0 0 0 14.7 4.4L20 16M20 20v-4h-4"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

export function stars(rating, { size = '' } = {}) {
  const r = Math.round((rating || 0) * 2) / 2;
  let out = '';
  for (let i = 1; i <= 5; i++) out += icon('star', `${size} ${i <= Math.round(r) ? 'fill' : 'off fill'}`);
  return `<span class="stars" aria-label="${rating ? `${rating} out of 5` : 'No ratings'}">${out}</span>`;
}

// ---------- number formatting ----------
export function fmtNumber(n, decimals = 2) {
  if (!Number.isFinite(n)) return '—';
  const d = Math.max(0, Math.min(10, decimals));
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 10 ** -d / 2)) {
    return abs >= 1e15 ? n.toExponential(4) : n.toPrecision(4);
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const fmtPlain = (n) => (Number.isInteger(n) ? n.toLocaleString() : Number(n.toPrecision(12)).toLocaleString(undefined, { maximumFractionDigits: 10 }));
export function fmtResult(n, result) {
  const num = fmtNumber(n, result?.decimals ?? 2);
  return { text: `${result?.prefix || ''}${num}`, unit: result?.unit || '' };
}
export function timeAgo(t) {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0));

// ---------- toasts ----------
export function toast(message, kind = 'ok') {
  let host = document.querySelector('.toasts');
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); document.body.append(host); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'ok' ? 'check' : 'alert')}<span>${esc(message)}</span>`;
  host.append(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => { el.style.transition = 'opacity .2s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 220); }, 2800);
}

// ---------- modal ----------
export function confirmModal({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
      <h2 id="m-title">${esc(title)}</h2><p>${esc(message)}</p>
      <div class="row"><button class="btn ghost" data-a="no">Cancel</button>
      <button class="btn ${danger ? 'danger-solid' : 'primary'}" data-a="yes">${esc(confirmText)}</button></div></div>`;
    const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    back.addEventListener('click', (e) => {
      if (e.target === back) done(false);
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a) done(a === 'yes');
    });
    document.addEventListener('keydown', onKey);
    document.body.append(back);
    back.querySelector('[data-a="yes"]').focus();
  });
}

// ---------- calculator card ----------
export function calcCard(c, { showOwner = true, showVisibility = false } = {}) {
  const s = c.stats;
  const statsHtml = s ? `<span class="stats">
      ${s.rating ? `<span class="stat star" title="${s.rating} average from ${s.reviews} review${s.reviews === 1 ? '' : 's'}">${icon('star', 'fill')}${s.rating.toFixed(1)}</span>` : ''}
      <span class="stat" title="${s.runs} runs">${icon('play')}${compact(s.runs)}</span>
      ${s.forks ? `<span class="stat" title="${s.forks} forks">${icon('fork')}${compact(s.forks)}</span>` : ''}
    </span>` : '';
  const vis = showVisibility && !c.builtin
    ? (c.visibility === 'public' ? `<span class="tag public">${icon('globe')}Public</span>` : `<span class="tag private">${icon('lock')}Private</span>`)
    : '';
  return `<article class="calc-card">
    <div class="top"><span class="tag">${esc(c.category || 'Other')}</span>${vis}${c.builtin ? '<span class="tag accent">Ready-made</span>' : ''}${c.forkedFrom ? `<span class="tag plain" title="Forked from ${esc(c.forkedFrom.name)}">${icon('fork')}Fork</span>` : ''}</div>
    <h3><a class="stretched" href="#/c/${encodeURIComponent(c.id)}">${esc(c.name)}</a></h3>
    <p>${esc(c.description || 'No description')}</p>
    <div class="formula" title="${esc(c.formula)}">${esc(c.formula)}</div>
    <div class="foot">${showOwner ? `<span class="by">${c.builtin ? 'by CalciFy' : `by ${esc(c.ownerName || c.owner)}`}</span>` : `<span class="by">Updated ${timeAgo(c.updatedAt)}</span>`}${statsHtml}</div>
  </article>`;
}

export function emptyState({ iconName = 'calc', title, text, action = '' }) {
  return `<div class="empty">${icon(iconName)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
export const skeletons = (n = 6) => `<div class="grid">${'<div class="skeleton"></div>'.repeat(n)}</div>`;

// ---------- formula syntax highlighting (works even on invalid input) ----------
export function highlight(src, errPos = null, errLen = 1) {
  const re = /(\s+)|(\d*\.?\d+(?:[eE][+-]?\d+)?(?:_\d+)*)|(\[[^\]]*\]?)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?|(<=|>=|==|!=|[-+*/^×÷−<>%,])|([()])|(.)/g;
  let out = '';
  let m;
  const marks = [];
  while ((m = re.exec(src))) {
    const [all, ws, num, br, id, call, op, par] = m;
    let cls = '';
    if (ws) cls = '';
    else if (num) cls = 'tk-num';
    else if (br) cls = 'tk-var';
    else if (id) cls = call ? 'tk-fn' : (id === 'x' || id === 'X') ? 'tk-maybe-x' : 'tk-var';
    else if (op) cls = 'tk-op';
    else if (par) cls = 'tk-paren';
    marks.push({ start: m.index, end: m.index + all.length, cls, id: !!id, call: !!call });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  // "x" between two values is multiplication -> colour as operator
  marks.forEach((mk, i) => {
    if (mk.cls !== 'tk-maybe-x') return;
    const prev = [...marks.slice(0, i)].reverse().find((k) => k.cls);
    const isOp = prev && ['tk-num', 'tk-var', 'tk-paren'].includes(prev.cls) && !(prev.cls === 'tk-paren' && src[prev.start] === '(');
    mk.cls = isOp ? 'tk-op' : 'tk-var';
  });
  for (const mk of marks) {
    let text = src.slice(mk.start, mk.end);
    if (mk.call) {
      const name = text.match(/^[A-Za-z_][A-Za-z0-9_]*/)[0];
      out += wrap(name, 'tk-fn', mk.start, errPos, errLen) + wrap(text.slice(name.length, -1), '', 0, null) + wrap('(', 'tk-paren', mk.end - 1, errPos, errLen);
      continue;
    }
    out += wrap(text, mk.cls, mk.start, errPos, errLen);
  }
  return `${out}\n`; // trailing newline keeps heights in sync with the textarea
}
function wrap(text, cls, start, errPos, errLen) {
  const bad = errPos != null && start < errPos + Math.max(errLen, 1) && start + text.length > errPos;
  const c = [cls, bad ? 'tk-err' : ''].filter(Boolean).join(' ');
  return c ? `<span class="${c}">${esc(text)}</span>` : esc(text);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export const safeLS = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
