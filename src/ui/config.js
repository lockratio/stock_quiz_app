// config.js — ONE unified quiz-builder screen. Everything renders into #cfgBody:
// question-type chips (multi-select), per-selected-type sub-options, an optional
// Focus filter (region/sector/country/industry), length, MC-count and answer
// style. All controls write through fixed app methods (toggleType/setFilter/
// setLen/setMcCount/setStyle) or into app.cfg; state persists across the
// re-renders that app.toggleType triggers.

import { $, el, haptic } from '../lib/dom.js';
import { icoSvg } from '../lib/icons.js';
import { QUIZ_TYPES, STYLE_LABEL, STYLE_HINT } from '../modes/registry.js';
import { FACT_TOPICS } from '../modes/facts.js';
import { ID_ASK_KEYS } from '../modes/idcard.js';
import { COLUMNS as FLASH_COLS } from '../modes/flashcards.js';
import { LB_FAMILIES, LB_FAMILY_MODE } from '../modes/leaderboard.js';
import { getReference } from '../data/loader.js';

// {obj} -> [{key,label}] where a value may be a plain label or {label}.
const asObjs = (obj, labelKey = 'label') =>
  Object.entries(obj).map(([key, v]) => ({ key, label: typeof v === 'string' ? v : v[labelKey] }));

// Human labels for the idcard "Quiz me on" chips (ID_ASK carries no label field).
const ASK_LABELS = {
  name: 'Company name', ticker: 'Ticker', industry: 'Industry',
  sector: 'Sector', country: 'Country', cap: 'Cap tier',
};

/**
 * A chip field bound to app.cfg[field]. Re-render safe: an existing app.cfg
 * value is preserved; otherwise `defaults` seed the selection.
 * opts: [{key,label}]. single => scalar; else => array (multi-select).
 */
function chipField(app, field, label, opts, { single = false, defaults = [] } = {}) {
  const valid = new Set(opts.map(o => o.key));
  let cur;
  if (single) {
    cur = (app.cfg[field] != null && valid.has(app.cfg[field]))
      ? app.cfg[field] : opts[defaults[0] ?? 0].key;
    app.cfg[field] = cur;
  } else {
    cur = Array.isArray(app.cfg[field])
      ? app.cfg[field].filter(k => valid.has(k))
      : defaults.map(i => opts[i].key);
    app.cfg[field] = cur;
  }

  const f = el('div', 'field');
  f.appendChild(el('label', null,
    `<span>${label}</span>${single ? '' : '<span class="opt">multi-select</span>'}`));
  const wrap = el('div', 'chips');

  opts.forEach(o => {
    const on = single ? o.key === cur : cur.includes(o.key);
    const c = el('button', 'chip' + (single ? '' : ' multi') + (on ? ' on' : ''), o.label);
    c.onclick = () => {
      if (single) {
        wrap.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
        c.classList.add('on');
        app.cfg[field] = o.key;
      } else {
        c.classList.toggle('on');
        const set = new Set(app.cfg[field]);
        c.classList.contains('on') ? set.add(o.key) : set.delete(o.key);
        app.cfg[field] = [...set];
      }
      haptic(c);
    };
    wrap.appendChild(c);
  });
  f.appendChild(wrap);
  return f;
}

// A single-select filter-chip row (Any + options) writing through app.setFilter.
function filterChipRow(app, label, dim, opts) {
  const row = el('div', 'ffield');
  row.appendChild(el('div', 'flabel', label));
  const wrap = el('div', 'chips filter-chips');
  const cur = app.filter?.[dim] || '';
  [{ key: '', label: 'Any' }, ...opts].forEach(o => {
    const on = (o.key || '') === cur;
    const c = el('button', 'chip fchip' + (on ? ' on' : ''), o.label);
    c.onclick = () => {
      wrap.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
      app.setFilter(dim, o.key);
      haptic(c);
    };
    wrap.appendChild(c);
  });
  row.appendChild(wrap);
  return row;
}

// A <select> filter row (Any + options) writing through app.setFilter.
function filterSelectRow(app, label, dim, opts, anyLabel) {
  const row = el('div', 'ffield');
  row.appendChild(el('div', 'flabel', label));
  const sel = el('select', 'fselect');
  const cur = app.filter?.[dim] || '';
  [{ key: '', label: anyLabel }, ...opts].forEach(o => {
    const op = el('option', null, o.label);
    op.value = o.key;
    if ((o.key || '') === cur) op.selected = true;
    sel.appendChild(op);
  });
  sel.onchange = () => app.setFilter(dim, sel.value);
  row.appendChild(sel);
  return row;
}

// Leaderboard "type-ahead help" toggle -> app.cfg.typeahead (default on).
function typeaheadToggle(app) {
  if (app.cfg.typeahead == null) app.cfg.typeahead = true;
  const f = el('div', 'field');
  const row = el('div', 'toggle-row');
  row.appendChild(el('div', null,
    '<div class="t">Type-ahead help</div><div class="d">Show live suggestions as you type</div>'));
  const tg = el('div', 'toggle' + (app.cfg.typeahead ? ' on' : ''), '<i></i>');
  tg.onclick = () => {
    app.cfg.typeahead = !app.cfg.typeahead;
    tg.classList.toggle('on', app.cfg.typeahead);
    haptic(tg);
  };
  row.appendChild(tg);
  f.appendChild(row);
  return f;
}

export function renderConfig(app) {
  app.cfg = app.cfg || {};
  app.filter = app.filter || { region: '', iso2: '', gsector: '', gindustry: '' };
  const types = app.types || [];
  const ref = getReference() || {};

  if ($('#cfgEye')) $('#cfgEye').textContent = 'configure';
  if ($('#cfgTitle')) $('#cfgTitle').textContent = 'Build your quiz';
  if ($('#cfgSub')) $('#cfgSub').textContent = 'Choose question types, an optional focus, and a length.';

  const body = $('#cfgBody');
  body.innerHTML = '';

  // ---- 1. Question types (multi-select chips) --------------------------------
  const qtField = el('div', 'field');
  qtField.appendChild(el('label', null, '<span>Question types</span><span class="opt">multi-select</span>'));
  const grid = el('div', 'qtype-grid');
  (QUIZ_TYPES || []).forEach(t => {
    const on = types.includes(t.key);
    const chip = el('button', 'qtype-chip' + (on ? ' on' : ''),
      `<span class="ic">${icoSvg(t.icon)}</span><span class="lb">${t.label}</span>`);
    chip.onclick = () => app.toggleType(t.key);
    grid.appendChild(chip);
  });
  qtField.appendChild(grid);
  body.appendChild(qtField);

  // ---- 2. Per-selected-type sub-options -------------------------------------
  const askOpts = ID_ASK_KEYS.map(k => ({ key: k, label: ASK_LABELS[k] || k }));
  const factOpts = asObjs(FACT_TOPICS);
  const colOpts = asObjs(FLASH_COLS);
  const nameIdx = Math.max(0, colOpts.findIndex(o => o.key === 'name'));
  const lbOpts = asObjs(LB_FAMILIES);
  const lbDefaults = lbOpts.reduce((a, o, i) => (LB_FAMILY_MODE[o.key] === 'topN' ? [...a, i] : a), []);

  (QUIZ_TYPES || []).forEach(t => {
    if (!types.includes(t.key)) return;
    const head = el('div', 'cfg-typehead', t.label);
    if (t.key === 'idcard') {
      body.appendChild(head);
      body.appendChild(chipField(app, 'ask', 'Quiz me on', askOpts, { single: true, defaults: [0] }));
    } else if (t.key === 'facts') {
      body.appendChild(head);
      body.appendChild(chipField(app, 'topics', 'Topics', factOpts, { defaults: factOpts.map((_, i) => i) }));
    } else if (t.key === 'flash') {
      body.appendChild(head);
      body.appendChild(chipField(app, 'front', 'Front (question)', colOpts, { single: true, defaults: [0] }));
      body.appendChild(chipField(app, 'back', 'Back (answer)', colOpts, { defaults: [nameIdx] }));
    } else if (t.key === 'leaderboard') {
      body.appendChild(head);
      body.appendChild(chipField(app, 'families', 'Sets', lbOpts, { defaults: lbDefaults }));
      body.appendChild(typeaheadToggle(app));
    } else if (t.key === 'desc') {
      body.appendChild(head);
      body.appendChild(el('div', 'field cfg-note', 'Masked business descriptions — guess the company blind.'));
    }
  });

  // ---- 3. Focus (optional) filter -------------------------------------------
  const filterField = el('div', 'field filter-field');
  filterField.appendChild(el('label', null, '<span>Focus</span><span class="opt">optional</span>'));
  filterField.appendChild(filterChipRow(app, 'Region', 'region',
    (ref.regions || []).map(r => ({ key: r.key, label: r.name }))));
  filterField.appendChild(filterChipRow(app, 'Sector', 'gsector',
    (ref.sectors || []).map(s => ({ key: s.key, label: s.name }))));
  filterField.appendChild(filterSelectRow(app, 'Country', 'iso2',
    (ref.countries || []).map(c => ({ key: c.iso2, label: `${c.flag || ''} ${c.name}`.trim() })), 'Any country'));
  filterField.appendChild(filterSelectRow(app, 'Industry', 'gindustry',
    (ref.industries || []).map(i => ({ key: i.key, label: i.name })), 'Any industry'));
  body.appendChild(filterField);

  // ---- 4. Length ------------------------------------------------------------
  const lenField = el('div', 'field len-field');
  lenField.appendChild(el('label', null,
    `<span>Length</span><span class="len-val" id="lenVal">${app.len}</span>`));
  const lenWrap = el('div', 'len-slider');
  const range = el('input', 'len-range');
  range.type = 'range'; range.min = '3'; range.max = '50'; range.value = app.len;
  range.oninput = () => {
    app.setLen(range.value);
    const lv = $('#lenVal'); if (lv) lv.textContent = range.value;
  };
  lenWrap.appendChild(range);
  lenField.appendChild(lenWrap);
  body.appendChild(lenField);

  // ---- 5. Answer options (4/6/8) --------------------------------------------
  const mcField = el('div', 'field');
  mcField.appendChild(el('label', null, 'Answer options'));
  const mcSeg = el('div', 'seg mc-seg');
  [4, 6, 8].forEach(n => {
    const b = el('button', n === (app.opts?.mcCount || 4) ? 'on' : '', String(n));
    b.dataset.n = n;
    b.onclick = () => {
      mcSeg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      app.setMcCount(n);
      haptic(b);
    };
    mcSeg.appendChild(b);
  });
  mcField.appendChild(mcSeg);
  body.appendChild(mcField);

  // ---- 6. Answer style ------------------------------------------------------
  const styleField = el('div', 'field');
  styleField.appendChild(el('label', null, 'Answer style'));
  const styleSeg = el('div', 'seg style-seg'); styleSeg.id = 'styleSeg';
  Object.keys(STYLE_LABEL).forEach(s => {
    const b = el('button', s === app.style ? 'on' : '', STYLE_LABEL[s]);
    b.dataset.s = s;
    b.onclick = () => {
      styleSeg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      app.setStyle(s);
    };
    styleSeg.appendChild(b);
  });
  styleField.appendChild(styleSeg);
  const hint = el('div', 'hint'); hint.id = 'styleHint';
  hint.textContent = STYLE_HINT[app.style] || '';
  styleField.appendChild(hint);
  body.appendChild(styleField);

  // ---- Start button gating --------------------------------------------------
  const btn = $('#startBtn');
  if (btn) btn.classList.toggle('disabled', types.length === 0);
}

/** Light fixups before a run: fill any selected type whose sub-opts are empty. */
export function readConfig(app) {
  app.cfg = app.cfg || {};
  const has = k => (app.types || []).includes(k);
  if (has('flash') && (!app.cfg.back || !app.cfg.back.length)) app.cfg.back = ['name'];
  if (has('flash') && !app.cfg.front) app.cfg.front = 'ticker';
  if (has('idcard') && !app.cfg.ask) app.cfg.ask = 'name';
  if (has('facts') && (!app.cfg.topics || !app.cfg.topics.length)) app.cfg.topics = Object.keys(FACT_TOPICS);
  if (has('leaderboard') && (!app.cfg.families || !app.cfg.families.length)) app.cfg.families = Object.keys(LB_FAMILIES);
  if (has('leaderboard') && app.cfg.typeahead == null) app.cfg.typeahead = true;
}
