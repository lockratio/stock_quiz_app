// descriptions.js — "Business Descriptions". Two views over the universe:
//   • Browse & read — searchable/filterable grid → sectioned detail sheet
//   • Guess mode    — filtered shuffle of the SAME card styling, blind-guess
// Industry icons are unique emoji; country flags are inline at name size.

import { $, el, haptic, toast } from '../lib/dom.js';
import { store } from '../state/store.js';
import { nice, capBucketShort, fmtCap } from '../data/schema.js';
import { loadUniverse, getUniverse, getReference } from '../data/loader.js';
import { sectorOf, industryEmoji } from '../lib/icons.js';
import { flagOf, flagName } from '../lib/fx.js';
import { shuffle } from '../data/query.js';

function state(app) {
  return (app._bd ||= { view: 'browse', search: '',
    filters: { gsector: new Set(), region: new Set(), iso2: new Set(), gindustry: new Set() } });
}

function applyFilters(app) {
  const bd = state(app), U = getUniverse() || [];
  const q = bd.search.toLowerCase();
  const F = bd.filters;
  return U.filter(c =>
    (!F.gsector.size || F.gsector.has(c.gsector)) &&
    (!F.region.size || F.region.has(c.region)) &&
    (!F.iso2.size || F.iso2.has(c.iso2)) &&
    (!F.gindustry.size || F.gindustry.has(c.gindustry)) &&
    (!q || c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q)));
}

export async function openBrowser(app) {
  const bd = state(app);
  bd.view = 'browse';
  $$seg('browse');
  $('#bdBrowse').style.display = 'block';
  $('#bdShuffle').style.display = 'none';
  $('#bdGrid').innerHTML = '<div class="bd-empty">Loading universe…</div>';
  try { await loadUniverse(); } catch { $('#bdGrid').innerHTML = '<div class="bd-empty">Data failed to load.</div>'; return; }
  buildFilters(app);
  const input = $('#bdSearchInput');
  input.oninput = () => { bd.search = input.value; renderGrid(app); };
  renderGrid(app);
  wireSeg(app);
}

function $$seg(m) {
  document.querySelectorAll('#bdModeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
}
function wireSeg(app) {
  document.querySelectorAll('#bdModeSeg button').forEach(b => b.onclick = () => {
    const bd = state(app); bd.view = b.dataset.m; $$seg(b.dataset.m);
    if (b.dataset.m === 'browse') { $('#bdBrowse').style.display = 'block'; $('#bdShuffle').style.display = 'none'; renderGrid(app); }
    else { $('#bdBrowse').style.display = 'none'; $('#bdShuffle').style.display = 'block'; startGuess(app); }
  });
}

function buildFilters(app) {
  const bd = state(app), ref = getReference();
  const wrap = $('#bdFilters'); wrap.innerHTML = '';
  const groups = [
    ['gsector', 'sector', ref.sectors.map(s => [s.key, s.name])],
    ['gindustry', 'industry', ref.industries.map(g => [g.key, `${industryEmoji(g.key)} ${g.name}`])],
    ['region', 'region', ref.regions.map(r => [r.key, r.name])],
    ['iso2', 'country', ref.countries.map(c => [c.iso2, `${c.flag} ${c.name}`])],
  ];
  groups.forEach(([field, label, vals]) => {
    const fg = el('div', 'fg'); fg.innerHTML = `<div class="fgl">${label}</div>`;
    const ch = el('div', 'chips');
    vals.forEach(([key, text]) => {
      const c = el('button', 'chip multi', text);
      c.onclick = () => {
        c.classList.toggle('on');
        c.classList.contains('on') ? bd.filters[field].add(key) : bd.filters[field].delete(key);
        haptic(c);
        bd.view === 'guess' ? startGuess(app) : renderGrid(app);
      };
      ch.appendChild(c);
    });
    fg.appendChild(ch); wrap.appendChild(fg);
  });
}

function renderGrid(app) {
  const cards = applyFilters(app);
  const grid = $('#bdGrid');
  if (!cards.length) { grid.innerHTML = '<div class="bd-empty">No matches. Loosen the filters.</div>'; return; }
  grid.innerHTML = '';
  cards.slice(0, 300).forEach(c => {
    const [cv] = sectorOf(c.gsector);
    const cell = el('div', 'bd-cell press');
    cell.innerHTML =
      `<div class="secdot" style="background:var(${cv})"><span class="ind-emoji">${industryEmoji(c.gindustry)}</span></div>
       <div class="nm">${c.name}</div>
       <div class="tk">${c.ticker}</div>
       <div class="country">${flagOf(c.iso2)} ${c.country}</div>`;
    cell.onclick = () => openSheet(c);
    grid.appendChild(cell);
  });
  if (cards.length > 300) grid.insertAdjacentHTML('beforeend',
    `<div class="bd-empty">+${cards.length - 300} more — narrow with filters or search</div>`);
}

function field(label, value) {
  return `<div class="s-field"><div class="s-flabel">${label}</div><div class="s-fval">${value}</div></div>`;
}

function openSheet(c) {
  const [cv] = sectorOf(c.gsector);
  $('#sheetBody').innerHTML =
    `<div class="grip"></div>
     <div class="s-head">
       <div class="s-ico" style="background:var(${cv})"><span class="s-ico-emoji">${industryEmoji(c.gindustry)}</span></div>
       <div><div class="s-name">${flagOf(c.iso2)} ${c.name}</div><div class="s-tk">${c.ticker} · ${c.qaid}</div></div>
     </div>
     <div class="s-sections">
       ${field('Sector', nice(c.gsector))}
       ${field('Industry', `${industryEmoji(c.gindustry)} ${nice(c.gindustry)}`)}
       ${field('Country', flagName(c.iso2))}
       ${field('Exchange', c.exchange || '—')}
       ${field('Market cap (bucket)', `${capBucketShort(c.capAUD)}${c.capAUD != null ? ' · ' + fmtCap(c.capAUD) : ''}`)}
       ${field('GICS code', c.gics || '—')}
       ${field('Index', c.indexCode)}
       ${c.weight != null ? field('Benchmark weight', c.weight + '%') : ''}
     </div>
     <div class="s-field"><div class="s-flabel">Business summary</div></div>
     <div class="s-desc">${c.desc || 'No description available.'}</div>
     <button class="s-close press" onclick="app.closeSheet()">Close</button>`;
  $('#sheetScrim').classList.add('show');
}

// ---------------------------------------------------------------- guess mode
function startGuess(app) {
  const bd = state(app);
  bd.queue = shuffle(applyFilters(app));
  bd.i = 0;
  renderGuess(app);
}

function renderGuess(app) {
  const bd = state(app), wrap = $('#bdShuffle');
  if (!bd.queue.length) { wrap.innerHTML = '<div class="bd-empty">No stocks match those filters.</div>' + filterHint(); wireGuessFilters(app); return; }
  const c = bd.queue[bd.i];
  const [cv] = sectorOf(c.gsector);
  wrap.innerHTML =
    `<div class="prompt slide-in">
       <div class="kicker"><span class="catico" style="background:var(${cv})"><span style="font-size:12px">${industryEmoji(c.gindustry)}</span></span>Guess the company · ${bd.i + 1}/${bd.queue.length}</div>
       <div class="desc">${c.desc || 'No description available.'}</div>
       <div class="reveal-id" id="bdRev"><div class="hidden-id">${flagOf(c.iso2)} ${c.name} · ${c.ticker}</div>
         <button class="rbtn press" onclick="document.getElementById('bdRev').classList.add('shown');this.remove()">Reveal</button></div>
     </div>
     <div class="selfgrade show">
       <button class="sg miss" id="bdMiss">Didn't get it</button>
       <button class="sg hit" id="bdHit">Knew it</button>
     </div>
     <div class="action-bar">
       <button class="ab press ${bd.i === 0 ? 'disabled' : ''}" id="bdPrev"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Prev</button>
       <button class="ab press" id="bdNext"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>Next</button>
       <button class="ab press" id="bdReshuffle"><svg viewBox="0 0 24 24"><path d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14-3M4 16a8 8 0 0014 3"/></svg>Reshuffle</button>
     </div>
     <div class="fg" style="margin-top:16px"><div class="fgl">Filter the shuffle</div></div>
     <div id="bdGuessFilters"></div>`;
  const grade = ok => { store.markSeen('desc', c.qaid); toast(ok ? 'Nice — knew it ✓' : 'Filed for review'); guessNext(app); };
  $('#bdMiss').onclick = () => grade(false);
  $('#bdHit').onclick = () => grade(true);
  $('#bdPrev').onclick = () => { if (bd.i > 0) { bd.i--; renderGuess(app); } };
  $('#bdNext').onclick = () => guessNext(app);
  $('#bdReshuffle').onclick = () => startGuess(app);
  wireGuessFilters(app);
}

function filterHint() { return '<div class="fg" style="margin-top:16px"><div class="fgl">Filter the shuffle</div></div><div id="bdGuessFilters"></div>'; }

// Re-render the shared filter chips inside guess mode so the shuffle is filterable.
function wireGuessFilters(app) {
  const bd = state(app), ref = getReference(), host = $('#bdGuessFilters');
  if (!host) return;
  host.innerHTML = '';
  const groups = [
    ['gsector', 'sector', ref.sectors.map(s => [s.key, s.name])],
    ['gindustry', 'industry', ref.industries.map(g => [g.key, `${industryEmoji(g.key)} ${g.name}`])],
    ['region', 'region', ref.regions.map(r => [r.key, r.name])],
    ['iso2', 'country', ref.countries.map(c => [c.iso2, `${c.flag} ${c.name}`])],
  ];
  groups.forEach(([f, label, vals]) => {
    const fg = el('div', 'fg'); fg.innerHTML = `<div class="fgl">${label}</div>`;
    const ch = el('div', 'chips');
    vals.forEach(([key, text]) => {
      const c = el('button', 'chip multi' + (bd.filters[f].has(key) ? ' on' : ''), text);
      c.onclick = () => {
        c.classList.toggle('on');
        c.classList.contains('on') ? bd.filters[f].add(key) : bd.filters[f].delete(key);
        startGuess(app);
      };
      ch.appendChild(c);
    });
    fg.appendChild(ch); host.appendChild(fg);
  });
}

function guessNext(app) {
  const bd = state(app);
  bd.i = (bd.i + 1) % bd.queue.length;
  renderGuess(app);
}
