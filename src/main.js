// main.js — app controller + boot. Holds runtime state and session lifecycle,
// wires the (minimal) keyboard, exposes `app` globally for the inline handlers
// in index.html. View rendering lives in ui/* and modes/*.

import { store } from './state/store.js';
import { persistence } from './state/persistence.js';
import { loadReference, loadUniverse, getUniverse, getReference } from './data/loader.js';
import { shuffle } from './data/query.js';
import { initCountries } from './lib/fx.js';
import { $, $$, toast, beep } from './lib/dom.js';
import { MODES } from './modes/registry.js';
import { renderQuestion, stopTimer } from './ui/runner.js';
import { renderHome } from './ui/home.js';
import { renderConfig, readConfig } from './ui/config.js';
import { renderSummary } from './ui/summary.js';
import { renderStats } from './ui/stats.js';
import { renderSettings } from './ui/settings.js';
import { openBrowser } from './modes/descriptions.js';

import * as facts from './modes/facts.js';
import * as idcard from './modes/idcard.js';
import * as flash from './modes/flashcards.js';
import * as leaderboard from './modes/leaderboard.js';

const BUILD = {
  facts: facts.buildItems, idcard: idcard.buildItems,
  flash: flash.buildItems, leaderboard: leaderboard.buildItems,
};

function buildCtx() {
  const universe = getUniverse(), reference = getReference();
  // exchange counts per country -> ordered list (for the exchange fact)
  const exchByCountry = {};
  for (const s of universe) {
    if (!s.iso2 || !s.exchange) continue;
    (exchByCountry[s.iso2] ||= {});
    exchByCountry[s.iso2][s.exchange] = (exchByCountry[s.iso2][s.exchange] || 0) + 1;
  }
  for (const iso in exchByCountry)
    exchByCountry[iso] = Object.entries(exchByCountry[iso]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  return { universe, reference, exchByCountry, allExchanges: reference.exchanges };
}

const app = {
  mode: null, style: 'mc', len: 5,
  opts: { unseen: false, shuffle: true, timed: false, revealEnd: false },
  cfg: {},
  ctx: null, queue: [], idx: 0, session: null, _qStart: 0, _timer: null,

  // ---------------- navigation ----------------
  go(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#' + id).classList.add('active');
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === id));
    $('main').scrollTop = 0;
    stopTimer(this);
    if (id === 'home') renderHome(this);
    if (id === 'stats') renderStats(this);
    if (id === 'settings') renderSettings(this);
  },
  openMode(m) {
    this.mode = m;
    if (MODES[m].special === 'browser') { openBrowser(this); this.go('browser'); return; }
    this.style = (MODES[m].styles || ['mc'])[0];
    this.cfg = {};
    renderConfig(this, m);
    this.go('config');
  },

  // ---------------- config controls ----------------
  setStyle(s) {
    this.style = s;
    $$('#styleSeg button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
    const hint = { mc: 'Distractors auto-picked from the same category.',
      tf: 'Half the statements are false — spot them.',
      type: 'Fuzzy graded; a miss shows how close you were.',
      flip: 'No input — flip and self-grade.' }[s] || '';
    $('#styleHint').textContent = hint;
  },
  setLen(n) { this.len = n; $$('#lenSeg button').forEach(b => b.classList.toggle('on', +b.dataset.n === n)); },
  tgl(node) {
    const k = node.dataset.opt || node.dataset.set;
    node.classList.toggle('on');
    const v = node.classList.contains('on');
    if (node.dataset.opt) this.opts[k] = v;
    else { this.settingsTgl(k, v); }
  },

  // ---------------- quiz lifecycle ----------------
  async startQuiz() {
    readConfig(this);
    $('#boot')?.classList.remove('gone');   // (no-op if already gone)
    try { await loadUniverse(); } catch (e) { toast('Data failed to load'); return; }
    this.ctx = buildCtx(); this.ctx.config = this.cfg;
    let items = BUILD[this.mode](this.ctx, this.cfg) || [];
    if (this.opts.shuffle) items = shuffle(items);
    if (this.opts.unseen) items = items.filter(it => !store.isSeen(this.mode, it.id));
    if (!items.length) { toast('No items — turn "unseen only" off'); return; }
    this.queue = items.slice(0, this.len);
    this.idx = 0;
    this.session = { results: [], c: 0, w: 0, streak: 0, best: 0, t0: Date.now(), times: [], review: false };
    store.touchDailyStreak();
    this.go('runner');
    renderQuestion(this);
  },
  record(ok, item, node, score) {
    if (score == null) score = ok ? 1 : 0;
    this.session.results[this.idx] = { ok, score, answered: true, item };
    this.session.times.push((Date.now() - (this._qStart || Date.now())) / 1000);
    this.recompute();
    beep(ok);
    if (!ok) { const p = $('#promptCard'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }
    this.showNext();
  },
  recompute() {
    const r = this.session.results;
    let c = 0, w = 0, run = 0, best = 0;
    r.forEach(x => {
      if (x && x.ok === true) { c++; run++; best = Math.max(best, run); }
      else if (x && x.ok === false) { w++; run = 0; }
    });
    this.session.c = c; this.session.w = w; this.session.streak = run;
    this.session.best = Math.max(this.session.best, best);
    $('#streakN').textContent = run;
    if (run > 0) { const b = $('#streakBox'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  },
  showNext() { $('#nextBtn').classList.add('show'); $('#postmark').classList.add('show'); stopTimer(this); },
  next() { this.idx++; if (this.idx >= this.queue.length) return this.finish(); renderQuestion(this); },
  prev() { if (this.idx === 0) return; this.idx--; renderQuestion(this); },
  skip() { toast('Skipped'); this.next(); },
  retry() { this.session.results[this.idx] = null; this.recompute(); renderQuestion(this); },
  markCorrect() {
    this.session.results[this.idx] = { ok: true, score: 1, answered: true, item: this.queue[this.idx] };
    this.recompute(); toast('Marked correct ✓');
  },
  toggleFlag() {
    const it = this.queue[this.idx];
    const on = store.toggleFlag(this.mode, it.id);
    $('#abFlag').classList.toggle('on', on);
    toast(on ? 'Flagged for review' : 'Unflagged');
  },
  hint() {
    const h = $('#promptCard').querySelector('.hintline');
    if (h) { h.classList.add('show'); toast('Hint revealed'); } else toast('No hint here');
  },
  confirmExit() { if (confirm('Leave this drill? This session resets.')) { stopTimer(this); this.go('home'); } },
  finish() {
    stopTimer(this);
    if (!this.session.review)
      store.recordSession(this.mode, { correct: this.session.c, wrong: this.session.w, best: this.session.best });
    renderSummary(this);
    this.go('summary');
  },
  reviewWrong() {
    const miss = this.session.results.filter(r => r && r.ok === false).map(r => r.item);
    if (!miss.length) { toast('Nothing missed 🎉'); return; }
    this.queue = miss; this.idx = 0;
    this.session = { results: [], c: 0, w: 0, streak: 0, best: 0, t0: Date.now(), times: [], review: true };
    this.go('runner'); renderQuestion(this);
  },

  // ---------------- home extras ----------------
  questionOfDay() { this.openMode('facts'); },
  surprise() {
    const keys = Object.keys(MODES).filter(k => MODES[k].special !== 'browser');
    this.openMode(keys[Math.floor(Math.random() * keys.length)]);
    toast('🎲 Surprise drill!');
  },

  // ---------------- settings hooks ----------------
  settingsTgl(k, v) { store.saveSettings({ [k]: v }); },
  setAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-soft', hex + '22');
    store.saveSettings({ accent: hex });
    $$('.sw').forEach(s => s.classList.toggle('on', s.dataset.hex === hex));
  },
  setFont(f) {
    const map = { rounded: '"SF Pro Rounded",ui-rounded,"Nunito",system-ui,sans-serif',
      sans: '-apple-system,"Segoe UI",Roboto,system-ui,sans-serif',
      serif: 'Georgia,"Times New Roman",serif', mono: 'var(--mono)' };
    document.documentElement.style.setProperty('--font', map[f]);
    store.saveSettings({ font: f });
    $$('#fontSeg button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
  },
  setFontScale(v) {
    document.documentElement.style.setProperty('--fs', v / 100);
    $('#fsVal') && ($('#fsVal').textContent = v + '%');
    store.saveSettings({ fontScale: +v });
  },
  setFuzzy(v) { store.saveSettings({ fuzzyThreshold: +v }); $('#thVal') && ($('#thVal').textContent = v + '%'); },
  resetAll() { if (confirm('Clear all progress in this browser?')) { store.resetAll(); applySettings(); toast('Progress cleared'); this.go('home'); } },
  exportStats() {
    const blob = new Blob([JSON.stringify(persistence.exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bourse-stats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href); toast('Stats exported');
  },
  importStats() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { const n = persistence.importAll(JSON.parse(r.result)); location.reload(); toast(`Imported ${n} keys`); }
        catch (e) { toast(e.message || 'Import failed'); }
      };
      r.readAsText(f);
    };
    inp.click();
  },
  reloadData() { location.reload(); },
  soon() { toast('Coming soon'); },

  // ---------------- overlays ----------------
  showKb() { $('#kbcheat').classList.add('show'); },
  hideKb() { $('#kbcheat').classList.remove('show'); },
  closeSheet() { $('#sheetScrim').classList.remove('show'); },
};

window.app = app;

// ------------------------------------------------ settings application
function applySettings() {
  const s = store.settings;
  app.setAccent(s.accent);
  app.setFont(s.font);
  app.setFontScale(s.fontScale);
}

// ------------------------------------------------ keyboard (minimal; never hijacks typing)
document.addEventListener('keydown', e => {
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea';
  if (e.key === 'Escape') {
    if ($('#kbcheat').classList.contains('show')) return app.hideKb();
    if ($('#sheetScrim').classList.contains('show')) return app.closeSheet();
  }
  if (typing) return;   // while typing, single letters type normally; inputs own Enter

  const onRunner = $('#runner').classList.contains('active');
  const onConfig = $('#config').classList.contains('active');
  if (onConfig && e.key === 'Enter') { e.preventDefault(); return app.startQuiz(); }
  if (!onRunner) return;

  const Z = $('#answerZone');
  const done = $('#nextBtn').classList.contains('show');

  // pre-answer style shortcuts
  if (!done && Z._opts) {
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
    const idx = map[e.key.toLowerCase()];
    if (idx != null) { Z._opts.querySelectorAll('.opt')[idx]?.click(); return; }
  }
  if (!done && Z._flip && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); Z._flip(); return; }
  if (!done && Z._sg && Z._sg.classList.contains('show')) {
    if (e.key === '1' || e.key === 'ArrowLeft') { Z._sg.querySelector('.miss').click(); return; }
    if (e.key === '2' || e.key === 'ArrowRight') { Z._sg.querySelector('.hit').click(); return; }
  }
  if (!done && Z._tf) {
    if (e.key.toLowerCase() === 't') { Z._tf.querySelector('.tf:first-child').click(); return; }
    if (e.key.toLowerCase() === 'f') { Z._tf.querySelectorAll('.tf')[1].click(); return; }
  }

  // navigation: Enter advances when answered; Alt+←/→ move between questions
  if (e.key === 'Enter' && done) { e.preventDefault(); app.next(); return; }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); app.next(); return; }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); app.prev(); return; }
});

// ------------------------------------------------ boot
(async function boot() {
  try {
    const ref = await loadReference();
    initCountries(ref);
  } catch (e) {
    $('#boot').innerHTML = `<div class="txt" style="color:var(--bad)">Failed to load data.<br>${e.message}</div>`;
    return;
  }
  applySettings();
  renderHome(app);
  setTimeout(() => { $('#boot').classList.add('gone'); setTimeout(() => $('#boot').remove(), 450); }, 500);
})();
