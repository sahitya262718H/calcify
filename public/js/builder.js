// Create / edit a calculator.
import { parse, functionList } from './engine.js';
import { CATEGORIES, prettify } from './core.js';
import { api } from './api.js';
import { builtinById } from './builtins.js';
import { state, go } from './state.js';
import { esc, icon, toast, highlight, fmtResult } from './ui.js';
import { inputsHtml, compute } from './runner.js';

const INSERTS = [
  ['+', ' + '], ['−', ' - '], ['×', ' * '], ['÷', ' / '], ['( )', '()', -1], ['^', '^'], ['%', '%'],
  ['round', 'round(, 2)', -4], ['if', 'if(, , )', -5], ['min', 'min(, )', -3], ['max', 'max(, )', -3], ['sqrt', 'sqrt()', -1],
];

export async function renderBuilder(el, { id } = {}, query = {}) {
  el.innerHTML = '<div class="loading-line">Loading…</div>';
  let existing = null;
  let source = null;
  if (id) {
    try { existing = (await api.get(id)).calc; } catch (e) {
      el.innerHTML = `<div class="empty">${icon('alert')}<h3>Can't edit this calculator</h3><p>${esc(e.message)}</p><a class="btn" href="#/mine">My calculators</a></div>`;
      return {};
    }
    if (existing.owner !== state.user?.username) {
      el.innerHTML = `<div class="empty">${icon('lock')}<h3>Only the owner can edit this</h3><p>You can fork it to get your own editable copy.</p><a class="btn" href="#/c/${esc(id)}">Back</a></div>`;
      return {};
    }
  } else if (query.from) {
    source = builtinById(query.from);
    if (!source) { try { source = (await api.get(query.from)).calc; } catch { source = null; } }
  }
  const base = existing || source;

  const st = {
    name: base ? (source && !source.builtin ? `${base.name}` : base.name) : '',
    description: base?.description || '',
    category: base?.category || 'Other',
    tags: (base?.tags || []).join(', '),
    formula: base?.formula || '',
    meta: new Map((base?.variables || []).map((v) => [v.key, { label: v.label, unit: v.unit, default: v.default ?? '', description: v.description }])),
    result: { label: 'Result', prefix: '', unit: '', decimals: 2, ...(base?.result || {}) },
    visibility: existing?.visibility || 'private',
  };
  let parsed = parse(st.formula);
  let varKeys = '';
  let previewRaw = {};
  let saving = false;

  const snapshot = () => JSON.stringify({ ...st, meta: [...st.meta] });
  let clean = snapshot();

  el.innerHTML = `
  <div class="crumbs"><a href="#/mine">My calculators</a>${icon('chevron')}<span>${existing ? 'Edit' : 'New calculator'}</span></div>
  <div class="page-head"><div><h1>${existing ? `Edit “${esc(existing.name)}”` : 'New calculator'}</h1>
    <p>${source ? `Starting from “${esc(source.name)}”. Change anything you like.` : 'Write your formula once. Next time, you only fill in the values.'}</p></div></div>
  <form class="builder" id="bform" novalidate>
    <div>
      <section class="card b-section">
        <div class="card-head"><span class="step">1</span><h2>Formula</h2></div>
        <div class="card-body">
          <div class="editor" id="editor">
            <pre id="hl" aria-hidden="true"></pre>
            <textarea id="formula" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Formula"
              placeholder="e.g. (People x CostPerDay x Days) + AutoCharge - Cuttings"></textarea>
          </div>
          <div class="formula-status" id="fstatus"></div>
          <div class="helpers" id="helpers">${INSERTS.map(([t], i) => `<button type="button" data-i="${i}">${esc(t)}</button>`).join('')}</div>
          <details class="syntax-help">
            <summary>${icon('chevron', 'chev')}How to write formulas</summary>
            <div class="body"><table>
              <tr><td>Price * Qty</td><td>Any word becomes an input. Use letters, numbers and _ (no spaces).</td></tr>
              <tr><td>[Auto Charge]</td><td>Put a name in square brackets if you want spaces in it.</td></tr>
              <tr><td>a x b, a * b, a × b</td><td>All three mean multiply.</td></tr>
              <tr><td>+  -  /  ^  ( )</td><td>Add, subtract, divide, power, grouping.</td></tr>
              <tr><td>Amount * 18%</td><td>% after a value divides it by 100.</td></tr>
              <tr><td>if(Sales &gt; 10000, Sales * 5%, 0)</td><td>Conditions with &gt; &lt; &gt;= &lt;= == !=</td></tr>
              ${functionList().filter((f) => f.name !== 'if').map((f) => `<tr><td>${esc(f.doc.split(' ')[0])}</td><td>${esc(f.doc.split(' ').slice(1).join(' ') || f.name)}</td></tr>`).join('')}
              <tr><td>pi</td><td>3.14159…</td></tr>
              <tr><td>Days, days, DAYS</td><td>Names are not case-sensitive, they're the same input.</td></tr>
            </table></div>
          </details>
        </div>
      </section>

      <section class="card b-section">
        <div class="card-head"><span class="step">2</span><h2>Inputs</h2><span class="faint small" id="vcount"></span></div>
        <div class="card-body"><div class="var-list" id="vars"></div></div>
      </section>

      <section class="card b-section">
        <div class="card-head"><span class="step">3</span><h2>Details</h2></div>
        <div class="card-body">
          <div class="field"><label for="name">Calculator name</label>
            <input class="input" id="name" maxlength="80" placeholder="e.g. Team trip cost" value="${esc(st.name)}"></div>
          <div class="field"><label for="desc">What does it do? <span class="faint">(optional)</span></label>
            <textarea class="textarea" id="desc" maxlength="600" rows="3" placeholder="A short note so you, or others, know when to use it.">${esc(st.description)}</textarea></div>
          <div class="grid-2">
            <div class="field"><label for="cat">Category</label>
              <select class="select input" id="cat">${CATEGORIES.map((c) => `<option ${c === st.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            <div class="field"><label for="tags">Tags <span class="faint">(optional)</span></label>
              <input class="input" id="tags" maxlength="160" placeholder="travel, payroll" value="${esc(st.tags)}"></div>
          </div>
          <div class="label" style="margin:4px 0 10px">Result</div>
          <div class="grid-2">
            <div class="field"><label for="rlabel">Result name</label><input class="input" id="rlabel" maxlength="60" value="${esc(st.result.label)}" placeholder="Total"></div>
            <div class="field"><label for="rdec">Decimal places</label>
              <select class="select input" id="rdec">${[0, 1, 2, 3, 4, 6].map((d) => `<option value="${d}" ${Number(st.result.decimals) === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
            <div class="field"><label for="rprefix">Before number <span class="faint">(e.g. ₹, $)</span></label><input class="input" id="rprefix" maxlength="4" value="${esc(st.result.prefix)}"></div>
            <div class="field"><label for="runit">After number <span class="faint">(e.g. kg, %)</span></label><input class="input" id="runit" maxlength="16" value="${esc(st.result.unit)}"></div>
          </div>
        </div>
      </section>

      <section class="card b-section">
        <div class="card-head"><span class="step">4</span><h2>Who can see it</h2></div>
        <div class="card-body">
          <div class="vis-options" id="vis">
            <label class="vis-option" data-v="private"><input type="radio" name="vis" value="private"><div><b>${icon('lock')}Private</b><span>Only you can see and use it.</span></div></label>
            <label class="vis-option" data-v="public"><input type="radio" name="vis" value="public"><div><b>${icon('globe')}Public</b><span>Shown in Explore. Anyone can use, rate and fork it.</span></div></label>
          </div>
        </div>
      </section>

      <div class="form-error" id="ferr" hidden></div>
      <div class="save-bar">
        <a class="btn ghost" href="${existing ? `#/c/${esc(existing.id)}` : '#/mine'}">Cancel</a>
        <button class="btn primary" type="submit" id="savebtn">${icon('check')}${existing ? 'Save changes' : 'Create calculator'}</button>
      </div>
    </div>

    <aside class="preview">
      <div class="preview-label">${icon('play')}Live preview</div>
      <div class="card">
        <div class="card-body">
          <h3 id="pname">Untitled calculator</h3>
          <p class="muted small" id="pdesc" style="margin:0 0 14px"></p>
          <div id="pinputs"></div>
        </div>
        <div class="result-main" style="border-top:1px solid var(--border);border-bottom:0">
          <div class="result-label" id="plabel">Result</div>
          <div class="result-value dim" id="pvalue">—</div>
          <div class="result-error" id="perr"></div>
        </div>
      </div>
    </aside>
  </form>`;

  const $ = (s) => el.querySelector(s);
  const ta = $('#formula');
  const hl = $('#hl');
  ta.value = st.formula;

  // ---- formula editor ----
  const syncHeight = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(96, ta.scrollHeight)}px`; };
  const onFormula = () => {
    st.formula = ta.value;
    parsed = parse(st.formula);
    const err = parsed.ok ? null : parsed.error;
    hl.innerHTML = highlight(st.formula, err && st.formula.trim() ? err.pos : null, err?.len);
    $('#editor').classList.toggle('has-error', !!err && !!st.formula.trim());
    const fs = $('#fstatus');
    if (!st.formula.trim()) { fs.className = 'formula-status faint'; fs.innerHTML = `${icon('info')}<span>Type your formula. Words become inputs automatically.</span>`; }
    else if (err) { fs.className = 'formula-status bad'; fs.innerHTML = `${icon('alert')}<span>${esc(err.message)}${err.pos != null && err.len ? ` <span class="faint">(at character ${err.pos + 1})</span>` : ''}</span>`; }
    else { fs.className = 'formula-status ok'; fs.innerHTML = `${icon('check')}<span>Formula looks good · ${parsed.variables.length} input${parsed.variables.length === 1 ? '' : 's'} found</span>`; }
    syncHeight();
    renderVars();
    renderPreview();
  };
  ta.addEventListener('input', onFormula);
  ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; });
  $('#helpers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const [, text, back = 0] = INSERTS[Number(b.dataset.i)];
    const s = ta.selectionStart; const en = ta.selectionEnd;
    ta.setRangeText(text, s, en, 'end');
    const pos = ta.selectionStart + back;
    ta.focus(); ta.setSelectionRange(pos, pos);
    onFormula();
  });

  // ---- variables ----
  const vars = () => (parsed.ok ? parsed.variables : lastGoodVars);
  let lastGoodVars = parsed.ok ? parsed.variables : [];
  function renderVars() {
    if (parsed.ok) lastGoodVars = parsed.variables;
    const list = vars();
    const keys = list.map((v) => v.key).join('|');
    $('#vcount').textContent = list.length ? `${list.length} found in your formula` : '';
    if (keys === varKeys) return; // keep focus while typing
    varKeys = keys;
    $('#vars').innerHTML = list.length ? list.map((v) => {
      const m = st.meta.get(v.key) || {};
      const k = esc(v.key);
      return `<div class="var-row" data-key="${k}">
        <div class="var-name">${icon('bolt')}${esc(v.name)}</div>
        <div class="grid-3">
          <div class="field"><label>Label people see</label><input class="input" data-m="label" maxlength="60" value="${esc(m.label ?? '')}" placeholder="${esc(prettify(v.name))}"></div>
          <div class="field"><label>Unit</label><input class="input" data-m="unit" maxlength="16" value="${esc(m.unit ?? '')}" placeholder="₹, kg, days"></div>
          <div class="field"><label>Default</label><input class="input" data-m="default" inputmode="decimal" value="${esc(m.default ?? '')}" placeholder="none"></div>
        </div>
        <div class="field"><input class="input" data-m="description" maxlength="160" value="${esc(m.description ?? '')}" placeholder="Hint for this input (optional)"></div>
      </div>`;
    }).join('') : '<p class="faint small" style="margin:0 0 4px">Inputs appear here as you type your formula.</p>';
  }
  $('#vars').addEventListener('input', (e) => {
    const f = e.target.dataset.m;
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (!f || !key) return;
    const m = st.meta.get(key) || {};
    m[f] = e.target.value;
    st.meta.set(key, m);
    if (f === 'default') {
      const bad = e.target.value.trim() !== '' && Number.isNaN(Number(e.target.value));
      e.target.classList.toggle('invalid', bad);
    }
    renderPreview(true);
  });

  // ---- details ----
  const bind = (sel, fn) => $(sel).addEventListener('input', (e) => { fn(e.target.value); renderPreview(); });
  bind('#name', (v) => { st.name = v; $('#name').classList.remove('invalid'); });
  bind('#desc', (v) => { st.description = v; });
  bind('#cat', (v) => { st.category = v; });
  bind('#tags', (v) => { st.tags = v; });
  bind('#rlabel', (v) => { st.result.label = v; });
  bind('#rdec', (v) => { st.result.decimals = Number(v); });
  bind('#rprefix', (v) => { st.result.prefix = v; });
  bind('#runit', (v) => { st.result.unit = v; });
  const paintVis = () => el.querySelectorAll('.vis-option').forEach((o) => {
    o.classList.toggle('active', o.dataset.v === st.visibility);
    o.querySelector('input').checked = o.dataset.v === st.visibility;
  });
  $('#vis').addEventListener('change', (e) => { st.visibility = e.target.value; paintVis(); });
  paintVis();

  // ---- preview ----
  const definition = () => ({
    name: st.name.trim(), description: st.description.trim(), category: st.category, tags: st.tags, formula: st.formula,
    variables: vars().map((v) => {
      const m = st.meta.get(v.key) || {};
      const d = String(m.default ?? '').trim();
      return { key: v.key, name: v.name, label: (m.label || '').trim() || prettify(v.name), unit: (m.unit || '').trim(), description: (m.description || '').trim(), default: d === '' || Number.isNaN(Number(d)) ? null : Number(d) };
    }),
    result: { label: st.result.label.trim() || 'Result', prefix: st.result.prefix.trim(), unit: st.result.unit.trim(), decimals: Number(st.result.decimals) },
    visibility: st.visibility,
  });
  let previewKeys = '';
  function renderPreview(defaultsChanged = false) {
    const def = definition();
    $('#pname').textContent = def.name || 'Untitled calculator';
    $('#pdesc').textContent = def.description;
    $('#plabel').textContent = def.result.label;
    const keys = def.variables.map((v) => `${v.key}:${v.label}:${v.unit}:${v.description}`).join('|');
    if (keys !== previewKeys || defaultsChanged) {
      for (const v of def.variables) if (defaultsChanged || previewRaw[v.key] === undefined) previewRaw[v.key] = v.default != null ? String(v.default) : (previewRaw[v.key] ?? '');
      if (keys !== previewKeys) $('#pinputs').innerHTML = inputsHtml(def, previewRaw, 'p');
      else $('#pinputs').querySelectorAll('input[data-key]').forEach((i) => { if (document.activeElement !== i) i.value = previewRaw[i.dataset.key] ?? ''; });
      previewKeys = keys;
    }
    const pv = $('#pvalue');
    if (!parsed.ok) { pv.className = 'result-value dim'; pv.textContent = '—'; $('#perr').textContent = st.formula.trim() ? 'Fix the formula to see a result' : ''; return; }
    const r = compute(def, parsed.ast, previewRaw);
    if (r.ok) {
      const f = fmtResult(r.value, def.result);
      pv.className = 'result-value';
      pv.innerHTML = `${esc(f.text)}${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ''}`;
      $('#perr').textContent = '';
    } else { pv.className = 'result-value dim'; pv.textContent = '—'; $('#perr').textContent = r.error || ''; }
  }
  $('#pinputs').addEventListener('input', (e) => {
    const k = e.target.dataset.key;
    if (!k) return;
    previewRaw[k] = e.target.value;
    renderPreview();
  });

  // ---- save ----
  $('#bform').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    const err = $('#ferr');
    err.hidden = true;
    const def = definition();
    const problems = [];
    if (!parsed.ok) problems.push(st.formula.trim() ? `Formula: ${parsed.error.message}` : 'Write a formula first');
    if (!def.name) { problems.push('Give your calculator a name'); $('#name').classList.add('invalid'); }
    const badDefault = [...st.meta.entries()].find(([k, m]) => vars().some((v) => v.key === k) && String(m.default ?? '').trim() !== '' && Number.isNaN(Number(m.default)));
    if (badDefault) problems.push(`Default for "${badDefault[0]}" must be a number`);
    if (problems.length) {
      err.innerHTML = problems.map(esc).join('<br>');
      err.hidden = false;
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    saving = true;
    const btn = $('#savebtn');
    btn.disabled = true;
    try {
      let saved;
      if (existing) {
        saved = (await api.update(existing.id, def)).calc;
        if (def.visibility !== existing.visibility) saved = (await api.setVisibility(existing.id, def.visibility)).calc;
      } else {
        saved = (await api.create(def)).calc;
      }
      clean = snapshot();
      toast(existing ? 'Changes saved' : 'Calculator created');
      go(`#/c/${saved.id}`);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    } finally {
      saving = false;
    }
  });

  onFormula();
  if (!existing && !source) ta.focus();
  return { isDirty: () => snapshot() !== clean };
}
