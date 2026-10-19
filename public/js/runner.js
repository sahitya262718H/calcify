// Calculator page: fill in values, get the answer, see the working, keep a history,
// plus owner actions (edit / publish / delete) and community actions (star / fork / review).
import { parse, evaluate, stringify } from './engine.js';
import { api, ApiError } from './api.js';
import { builtinById } from './builtins.js';
import { state, go, requireLogin } from './state.js';
import { esc, icon, toast, confirmModal, fmtResult, fmtPlain, timeAgo, stars, safeLS, debounce } from './ui.js';

const MAX_HISTORY = 25;

/** Read a user-typed value. Accepts plain numbers and simple maths like "250*3" or "18%". */
export function readValue(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return { empty: true };
  const plain = s.replace(/[,\s_]/g, '');
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(plain)) return { value: Number(plain) };
  const p = parse(s);
  if (!p.ok) return { error: 'Not a number' };
  if (p.variables.length) return { error: 'Use numbers only' };
  try { return { value: evaluate(p.ast, {}), computed: true }; } catch (e) { return { error: e.message }; }
}

export function inputsHtml(calc, values, idPrefix = 'v') {
  if (!calc.variables.length) return '<p class="muted small">This formula has no inputs, the answer is always the same.</p>';
  return `<div class="inputs-grid">${calc.variables.map((v) => {
    const id = `${idPrefix}-${v.key.replace(/[^a-z0-9]/g, '_')}`;
    const val = values[v.key] ?? '';
    return `<div class="field" data-field="${esc(v.key)}">
      <label for="${id}">${esc(v.label || v.name)}</label>
      <div class="input-group">
        <input class="input" id="${id}" data-key="${esc(v.key)}" inputmode="decimal" autocomplete="off" spellcheck="false"
          value="${esc(val)}" placeholder="${v.default != null ? esc(fmtPlain(v.default)) : 'Enter a value'}">
        ${v.unit ? `<span class="addon">${esc(v.unit)}</span>` : ''}
      </div>
      <span class="hint" data-hint>${esc(v.description || '')}</span>
    </div>`;
  }).join('')}</div>`;
}

/** Compute from raw string values. Returns { ok, value, error, nums, badKeys }. */
export function compute(calc, ast, raw) {
  const nums = {};
  const badKeys = {};
  const missing = [];
  for (const v of calc.variables) {
    const r = readValue(raw[v.key]);
    if (r.empty) missing.push(v.label || v.name);
    else if (r.error) badKeys[v.key] = r.error;
    else nums[v.key] = r.value;
  }
  if (Object.keys(badKeys).length) return { ok: false, error: 'Fix the highlighted values', nums, badKeys };
  if (missing.length) return { ok: false, error: `Enter ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`, nums, badKeys, incomplete: true };
  try { return { ok: true, value: evaluate(ast, nums), nums, badKeys }; } catch (e) { return { ok: false, error: e.message, nums, badKeys }; }
}

export async function renderRunner(el, { id }) {
  el.innerHTML = '<div class="loading-line">Loading calculator…</div>';
  let calc = builtinById(id);
  if (!calc) {
    try { calc = (await api.get(id)).calc; } catch (e) {
      el.innerHTML = `<div class="empty">${icon('alert')}<h3>${e.status === 404 ? 'Calculator not found' : 'Could not load calculator'}</h3>
        <p>${e.status === 404 ? 'It may have been deleted, or it is private.' : esc(e.message)}</p><a class="btn" href="#/">Go home</a></div>`;
      return;
    }
  }
  const parsed = parse(calc.formula);
  const ast = parsed.ast;
  const isOwner = !calc.builtin && state.user && state.user.username === calc.owner;
  const lastKey = `calcify.last.${calc.id}`;
  const histKey = `calcify.hist.${calc.id}`;
  const defaults = Object.fromEntries(calc.variables.map((v) => [v.key, v.default != null ? fmtPlain(v.default) : '']));
  const saved = safeLS.get(lastKey, null);
  let raw = { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}) };
  let ranCounted = false;
  let last = null;

  const back = calc.builtin ? ['#/', 'Ready-made'] : isOwner ? ['#/mine', 'My calculators'] : ['#/explore', 'Explore'];
  const s = calc.stats;

  el.innerHTML = `
  <div class="crumbs"><a href="${back[0]}">${esc(back[1])}</a>${icon('chevron')}<span>${esc(calc.name)}</span></div>
  <div class="run">
    <div class="run-main">
      <div class="title-row"><h1>${esc(calc.name)}</h1></div>
      <div class="meta">
        <span class="tag">${esc(calc.category)}</span>
        ${calc.builtin ? '<span class="tag accent">Ready-made</span>' : calc.visibility === 'public' ? `<span class="tag public">${icon('globe')}Public</span>` : `<span class="tag private">${icon('lock')}Private</span>`}
        ${calc.builtin ? '<span>by CalciFy</span>' : `<span>by <a href="#/u/${esc(calc.owner)}">${esc(calc.ownerName || calc.owner)}</a></span>`}
        ${s && calc.visibility === 'public' ? `<span class="sep">•</span><span class="stat star">${icon('star', 'fill')}${s.rating ? `${s.rating.toFixed(1)} (${s.reviews})` : 'No ratings'}</span>
          <span class="stat">${icon('play')}${s.runs} run${s.runs === 1 ? '' : 's'}</span><span class="stat">${icon('fork')}${s.forks}</span>` : ''}
        ${calc.updatedAt ? `<span class="sep">•</span><span class="faint">Updated ${timeAgo(calc.updatedAt)}</span>` : ''}
      </div>
      ${calc.forkedFrom ? `<div class="meta faint">${icon('fork')}<span>Forked from <a href="#/c/${esc(calc.forkedFrom.id)}">${esc(calc.forkedFrom.name)}</a> by ${esc(calc.forkedFrom.owner)}</span></div>` : ''}
      ${calc.description ? `<p class="desc">${esc(calc.description)}</p>` : ''}
      <div class="actions" id="actions"></div>

      <section class="card inputs-card">
        <div class="card-head"><h2>Inputs</h2><span class="spacer"></span>
          <button class="btn sm ghost" id="reset" type="button">${icon('refresh')}Reset</button></div>
        <div class="card-body"><form id="form" novalidate>${inputsHtml(calc, raw)}</form></div>
      </section>
    </div>
    <div class="run-extra">
      <div class="formula-box"><span class="lbl">Formula</span>${esc(ast ? stringify(ast) : calc.formula)}</div>
      ${!calc.builtin && calc.visibility === 'public' ? '<section class="reviews" id="reviews"></section>' : ''}
    </div>

    <aside class="card result-card" aria-live="polite">
      <div class="result-main">
        <div class="result-label">${esc(calc.result?.label || 'Result')}</div>
        <div class="result-value dim" id="value">—</div>
        <div class="result-error" id="err"></div>
        <div class="result-actions">
          <button class="btn sm" id="copy" type="button" disabled>${icon('copy')}Copy</button>
          <button class="btn sm" id="save" type="button" disabled>${icon('save')}Save to history</button>
        </div>
      </div>
      <details class="working" id="working"><summary>${icon('chevron', 'chev')}Show working</summary><pre id="steps"></pre></details>
      <div class="history"><h3>${icon('clock')}History <button class="btn sm ghost" id="clear-h" type="button" hidden>Clear</button></h3><ul id="hist"></ul></div>
    </aside>
  </div>`;

  const $ = (sel) => el.querySelector(sel);
  const form = $('#form');

  // ----- actions -----
  function renderActions() {
    const a = [];
    if (calc.builtin) {
      a.push(`<button class="btn primary" data-act="customize">${icon('edit')}Customize</button>`);
    } else if (isOwner) {
      a.push(`<a class="btn" href="#/edit/${esc(calc.id)}">${icon('edit')}Edit</a>`);
      a.push(calc.visibility === 'public'
        ? `<button class="btn" data-act="private">${icon('lock')}Make private</button>`
        : `<button class="btn primary" data-act="publish">${icon('globe')}Publish</button>`);
      a.push(`<button class="btn" data-act="duplicate">${icon('copy')}Duplicate</button>`);
    } else {
      a.push(`<button class="btn ${calc.starred ? 'on' : ''}" data-act="star">${icon('star', calc.starred ? 'fill' : '')}${calc.starred ? 'Starred' : 'Star'}<span class="faint">${calc.stats?.stars ?? 0}</span></button>`);
      a.push(`<button class="btn" data-act="fork">${icon('fork')}Fork</button>`);
    }
    a.push(`<button class="btn ghost" data-act="share">${icon('link')}Copy link</button>`);
    if (isOwner) a.push(`<button class="btn ghost danger" data-act="delete">${icon('trash')}Delete</button>`);
    $('#actions').innerHTML = a.join('');
  }
  renderActions();

  $('#actions').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const needLogin = ['star', 'fork', 'customize'].includes(act);
    if (needLogin && !state.user) { toast('Log in to do that', 'err'); requireLogin(); return; }
    btn.disabled = true;
    try {
      if (act === 'customize') go(`#/new?from=${encodeURIComponent(calc.id)}`);
      if (act === 'share') {
        const url = `${location.origin}${location.pathname}#/c/${calc.id}`;
        await copyText(url);
        toast(calc.visibility === 'public' || calc.builtin ? 'Link copied' : 'Link copied. Only you can open it while it’s private.');
      }
      if (act === 'publish' || act === 'private') {
        const ok = act === 'private' || await confirmModal({ title: 'Publish this calculator?', message: 'Everyone will be able to find, use, rate and fork it in Explore. You can make it private again anytime.', confirmText: 'Publish' });
        if (ok) {
          calc = { ...calc, ...(await api.setVisibility(calc.id, act === 'publish' ? 'public' : 'private')).calc };
          toast(act === 'publish' ? 'Published to Explore' : 'Now private');
          renderRunner(el, { id: calc.id });
          return;
        }
      }
      if (act === 'duplicate' || act === 'fork') {
        const { calc: copy } = await api.fork(calc.id);
        toast(act === 'fork' ? 'Forked to your calculators' : 'Duplicated');
        go(`#/c/${copy.id}`);
        return;
      }
      if (act === 'star') {
        const r = calc.starred ? await api.unstar(calc.id) : await api.star(calc.id);
        calc.starred = r.starred; calc.stats = { ...calc.stats, stars: r.stats.stars };
        renderActions();
        return;
      }
      if (act === 'delete') {
        const ok = await confirmModal({ title: 'Delete calculator?', message: `"${calc.name}" will be deleted for good, along with its reviews.`, confirmText: 'Delete', danger: true });
        if (ok) { await api.remove(calc.id); safeLS.del(lastKey); safeLS.del(histKey); toast('Deleted'); go('#/mine'); return; }
      }
    } catch (err) {
      toast(err.message, 'err');
    }
    btn.disabled = false;
  });

  // ----- compute -----
  const update = () => {
    const r = compute(calc, ast, raw);
    last = r.ok ? r : null;
    form.querySelectorAll('input[data-key]').forEach((inp) => {
      const k = inp.dataset.key;
      const bad = r.badKeys[k];
      inp.closest('.input-group').style.borderColor = bad ? 'var(--danger)' : '';
      const hint = inp.closest('.field').querySelector('[data-hint]');
      const v = calc.variables.find((x) => x.key === k);
      const rv = readValue(raw[k]);
      hint.textContent = bad ? bad : rv.computed ? `= ${fmtPlain(rv.value)}` : (v.description || '');
      hint.style.color = bad ? 'var(--danger)' : '';
    });
    const valueEl = $('#value');
    if (r.ok) {
      const f = fmtResult(r.value, calc.result);
      valueEl.className = 'result-value';
      valueEl.innerHTML = `${esc(f.text)}${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ''}`;
      $('#err').textContent = '';
      $('#steps').innerHTML = `<b>${esc(stringify(ast))}</b>\n= ${esc(stringify(ast, r.nums, fmtPlain))}\n= <b>${esc(f.text)}${f.unit ? ` ${esc(f.unit)}` : ''}</b>`;
    } else {
      valueEl.className = 'result-value dim';
      valueEl.textContent = '—';
      $('#err').textContent = r.error || '';
      $('#steps').textContent = ast ? stringify(ast) : '';
    }
    $('#copy').disabled = !r.ok;
    $('#save').disabled = !r.ok;
  };

  const countRun = debounce(() => {
    if (ranCounted || !last || calc.builtin) return;
    ranCounted = true;
    api.run(calc.id).catch(() => {});
  }, 1500);

  form.addEventListener('input', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    raw[k] = e.target.value;
    safeLS.set(lastKey, raw);
    update();
    countRun();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  $('#reset').addEventListener('click', () => {
    raw = { ...defaults };
    safeLS.del(lastKey);
    form.querySelectorAll('input[data-key]').forEach((inp) => { inp.value = raw[inp.dataset.key] ?? ''; });
    update();
  });
  $('#copy').addEventListener('click', async () => {
    if (!last) return;
    const f = fmtResult(last.value, calc.result);
    await copyText(`${f.text}${f.unit ? ` ${f.unit}` : ''}`);
    toast('Result copied');
  });

  // ----- history -----
  const renderHistory = () => {
    const h = safeLS.get(histKey, []);
    $('#clear-h').hidden = !h.length;
    $('#hist').innerHTML = h.length ? h.map((item, i) => {
      const f = fmtResult(item.value, calc.result);
      const summary = calc.variables.map((v) => `${v.label || v.name}: ${item.raw[v.key] ?? ''}`).join(' · ');
      return `<li><button type="button" data-i="${i}" title="Load these values"><span class="h-val">${esc(f.text)}${f.unit ? ` ${esc(f.unit)}` : ''}</span><span class="h-meta">${esc(timeAgo(item.t))} · ${esc(summary)}</span></button></li>`;
    }).join('') : '<li class="faint small">Saved results show up here, only on this device.</li>';
  };
  renderHistory();
  $('#save').addEventListener('click', () => {
    if (!last) return;
    const h = safeLS.get(histKey, []);
    h.unshift({ t: Date.now(), raw: { ...raw }, value: last.value });
    safeLS.set(histKey, h.slice(0, MAX_HISTORY));
    renderHistory();
    toast('Saved to history');
  });
  $('#hist').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const item = safeLS.get(histKey, [])[Number(b.dataset.i)];
    if (!item) return;
    raw = { ...defaults, ...item.raw };
    form.querySelectorAll('input[data-key]').forEach((inp) => { inp.value = raw[inp.dataset.key] ?? ''; });
    update();
    toast('Values loaded');
  });
  $('#clear-h').addEventListener('click', () => { safeLS.del(histKey); renderHistory(); });

  update();

  // ----- reviews -----
  if ($('#reviews')) renderReviews($('#reviews'), calc, isOwner);
}

async function renderReviews(box, calc, isOwner) {
  box.innerHTML = '<div class="section-head"><h2>Reviews</h2></div><div class="faint">Loading reviews…</div>';
  let data;
  try { data = await api.reviews(calc.id); } catch (e) { box.innerHTML = `<div class="section-head"><h2>Reviews</h2></div><p class="error-text">${esc(e.message)}</p>`; return; }
  const { reviews, mine } = data;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  let pick = mine?.rating || 0;

  const formHtml = () => {
    if (isOwner) return '<p class="muted small">This is your calculator. Reviews from other people show up here.</p>';
    if (!state.user) return `<div class="card card-pad review-form row"><span class="muted">Used this calculator? Log in to rate and review it.</span><span class="spacer"></span><a class="btn sm" href="#/login?next=${encodeURIComponent(`#/c/${calc.id}`)}">Log in</a></div>`;
    return `<form class="card card-pad review-form" id="rform">
      <div class="label" style="margin-bottom:6px">${mine ? 'Your review' : 'Rate this calculator'}</div>
      <div class="star-input" id="pick" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${n === pick}" aria-label="${n} star${n > 1 ? 's' : ''}" data-n="${n}" class="${n <= pick ? 'on' : ''}">${icon('star', 'fill')}</button>`).join('')}</div>
      <div class="field" style="margin:12px 0"><textarea class="textarea" id="rcomment" maxlength="1000" placeholder="What did you use it for? Was it accurate? (optional)">${esc(mine?.comment || '')}</textarea></div>
      <div class="row"><button class="btn primary sm" type="submit">${mine ? 'Update review' : 'Post review'}</button>
      ${mine ? '<button class="btn ghost sm danger" type="button" id="rdel">Delete my review</button>' : ''}</div>
    </form>`;
  };

  box.innerHTML = `
    <div class="section-head"><h2>Reviews</h2></div>
    <div class="rating-summary">
      <span class="rating-big">${reviews.length ? avg.toFixed(1) : '—'}</span>
      <div>${stars(avg)}<div class="faint small">${reviews.length} review${reviews.length === 1 ? '' : 's'}</div></div>
    </div>
    ${formHtml()}
    <div>${reviews.length ? reviews.map((r) => `<div class="review">
      <div class="review-head"><span class="avatar">${esc((r.displayName || r.username)[0])}</span>
        <a class="name" href="#/u/${esc(r.username)}">${esc(r.displayName || r.username)}</a>${stars(r.rating)}<span class="faint small">${timeAgo(r.updatedAt)}</span></div>
      ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}</div>`).join('') : '<p class="faint">No reviews yet.</p>'}</div>`;

  const rform = box.querySelector('#rform');
  if (!rform) return;
  const pickEl = box.querySelector('#pick');
  const paint = (n) => pickEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) <= n));
  pickEl.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) { pick = Number(b.dataset.n); paint(pick); pickEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.n) === pick))); } });
  pickEl.addEventListener('mouseover', (e) => { const b = e.target.closest('[data-n]'); if (b) paint(Number(b.dataset.n)); });
  pickEl.addEventListener('mouseleave', () => paint(pick));
  rform.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pick) { toast('Pick a star rating first', 'err'); return; }
    try {
      await api.saveReview(calc.id, { rating: pick, comment: box.querySelector('#rcomment').value });
      toast(mine ? 'Review updated' : 'Thanks for the review');
      renderReviews(box, calc, isOwner);
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Could not save review', 'err'); }
  });
  box.querySelector('#rdel')?.addEventListener('click', async () => {
    try { await api.deleteReview(calc.id); toast('Review deleted'); renderReviews(box, calc, isOwner); } catch (err) { toast(err.message, 'err'); }
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* fall back */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
}
