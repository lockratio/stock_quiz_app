// config.js — per-mode setup screen. Builds the mode-specific chip fields (which
// write live into app.cfg), the answer-style segment (hidden for leaderboard's
// single-box mechanic), and leaves length/options to the static markup.

import { $, el, haptic } from '../lib/dom.js';
import { nice } from '../data/schema.js';
import { MODES, STYLE_LABEL, STYLE_HINT } from '../modes/registry.js';
import { FACT_TOPICS } from '../modes/facts.js';
import { LB_FAMILIES } from '../modes/leaderboard.js';
import { ID_ASK } from '../modes/idcard.js';
import { COLUMNS as FLASH_COLS } from '../modes/flashcards.js';
import { getReference } from '../data/loader.js';

/**
 * A chip field bound to app.cfg[field].
 * opts: array of { key, label }. single => scalar; else => array (multi-select).
 */
function chipField(app, field, label, opts, { single = false, defaults = [] } = {}) {
  const f = el('div', 'field');
  f.appendChild(el('label', null, `<span>${label}</span>${single ? '' : '<span class="opt">multi-select</span>'}`));
  const wrap = el('div', 'chips');
  // seed app.cfg default
  if (single) app.cfg[field] = opts[defaults[0] ?? 0].key;
  else app.cfg[field] = defaults.map(i => opts[i].key);

  opts.forEach((o, i) => {
    const on = single ? i === (defaults[0] ?? 0) : defaults.includes(i);
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

const asObjs = (obj, labelKey = 'label') =>
  Object.entries(obj).map(([key, v]) => ({ key, label: typeof v === 'string' ? v : v[labelKey] }));

export function renderConfig(app, m) {
  const M = MODES[m];
  $('#cfgEye').textContent = 'mode ' + M.n;
  $('#cfgTitle').textContent = M.title;
  $('#cfgSub').textContent = M.blurb;
  const body = $('#cfgBody');
  body.innerHTML = '';
  app.cfg = {};
  const ref = getReference();

  if (m === 'leaderboard') {
    body.appendChild(chipField(app, 'families', 'Leaderboard sets',
      asObjs(LB_FAMILIES), { defaults: [0, 1, 2, 3] }));
  } else if (m === 'facts') {
    body.appendChild(chipField(app, 'topics', 'Topics',
      asObjs(FACT_TOPICS), { defaults: [0, 1, 2, 3, 4] }));
  } else if (m === 'idcard') {
    body.appendChild(chipField(app, 'indexCode', 'Universe',
      [{ key: '', label: 'All' }, ...ref.meta.index_codes.map(c => ({ key: c, label: c }))],
      { single: true, defaults: [0] }));
    body.appendChild(chipField(app, 'ask', 'Quiz me on',
      Object.entries(ID_ASK).map(([key, v]) => ({ key, label: v.label })),
      { single: true, defaults: [0] }));
  } else if (m === 'flash') {
    const cols = asObjs(FLASH_COLS);
    body.appendChild(chipField(app, 'front', 'Front (question)', cols, { single: true, defaults: [0] }));
    body.appendChild(chipField(app, 'back', 'Back (answer) · pick 1+', cols, { defaults: [1, 2, 4] }));
  }

  // answer-style segment (leaderboard has its own single-box mechanic → hide)
  const styleField = $('#styleField');
  if (M.styles) {
    styleField.style.display = '';
    const seg = $('#styleSeg'); seg.innerHTML = '';
    M.styles.forEach((s, i) => {
      const b = el('button', i === 0 ? 'on' : '', STYLE_LABEL[s]);
      b.dataset.s = s; b.onclick = () => app.setStyle(s);
      seg.appendChild(b);
    });
    app.style = M.styles[0];
    $('#styleHint').textContent = STYLE_HINT[M.styles[0]];
  } else {
    styleField.style.display = 'none';
  }
}

/** Finalise config before a run (defaults already live in app.cfg via chips). */
export function readConfig(app) {
  if (app.mode === 'flash' && (!app.cfg.back || !app.cfg.back.length)) app.cfg.back = ['name'];
}
