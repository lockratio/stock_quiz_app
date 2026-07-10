// leaderboard.js — "Leaderboard Guess". Own single-box mechanic (no answer-style
// selector). Sets are built LIVE from the universe (replacing largest_*.csv).
//
// Wave 3 generalises the single "top-N by cap" set into three MODES, all sharing
// the same type-one-box-fill-the-list mechanic:
//   • topN       — top-N stocks by market cap in a group (ordered, partial credit)
//   • anyN       — "Name any 5 stocks in Japan" / "Name any 2 industries in
//                  Financials"; pass with any `needed` distinct hits
//   • rankGroups — "Name the 3 biggest industries by market cap in Europe";
//                  match against the top-N group display names
//
// Each item:  { _type:'leaderboard', mode, family, key, label, prompt, sector,
//               answers:[{ display, aliases, kind, name, symbol, cap, stock }],
//               needed, ordered, revealAll, denom, suggestPool }
//
// Answers carry `aliases` per the shared contract; matching keeps the original
// stock thresholds (dice>=0.85 on name, >=0.9 on symbol) and adds a group path
// (dice>=0.85 or normalized equality on the group display name).

import { el, haptic } from '../lib/dom.js';
import { nice, fmtCap } from '../data/schema.js';
import { topN, filter, uniques, byCapDesc, topGroups } from '../data/query.js';
import { sectorOf, icoSvg } from '../lib/icons.js';
import { dice, normz, suggest } from '../lib/fuzzy.js';
import { flagName } from '../lib/fx.js';

// ---------------------------------------------------------------- tunables
const SET_SIZE    = 10;   // topN list length
const TOP_TARGET  = 5;    // topN hits needed to pass
const ANY_STOCKS  = 5;    // "name any N stocks"
const ANY_GROUPS  = 2;    // "name any N industries in a sector"
const RANK_N      = 3;    // "name the N biggest groups by cap"
const MIN_SET     = 4;    // drop thin categories

// Family → mode. First four are the legacy topN sets (config defaults [0..3]);
// the rest are the new anyN / rankGroups variants (opt-in chips).
export const LB_FAMILY_MODE = {
  sector: 'topN', region: 'topN', industry: 'topN', country: 'topN',
  anyCountry: 'anyN', anySector: 'anyN', anyRegion: 'anyN', anyIndustryInSector: 'anyN',
  rankIndustriesByCap: 'rankGroups', rankSectorsByCap: 'rankGroups', rankCountriesByCap: 'rankGroups',
};

// Config-UI labels (key → chip label). Order matters: config defaults select 0–3.
export const LB_FAMILIES = {
  sector:   'Top-N · Sectors',
  region:   'Top-N · Regions',
  industry: 'Top-N · Industries',
  country:  'Top-N · Countries',
  anyCountry:          'Any-N · Country stocks',
  anySector:           'Any-N · Sector stocks',
  anyRegion:           'Any-N · Region stocks',
  anyIndustryInSector: 'Any-N · Industries in a sector',
  rankIndustriesByCap: 'Rank · Biggest industries by cap',
  rankSectorsByCap:    'Rank · Biggest sectors by cap',
  rankCountriesByCap:  'Rank · Biggest countries by cap',
};

// ---------------------------------------------------------------- answer builders
function stockAnswer(s) {
  const symbol = s.symbol || '';
  return {
    display: s.name, aliases: [s.name, symbol].filter(Boolean),
    kind: 'stock', name: s.name, symbol, cap: s.capAUD, stock: s,
  };
}
function groupAnswer(display, cap = null) {
  return {
    display, aliases: [display],
    kind: 'group', name: display, symbol: '', cap, stock: null,
  };
}

// Lightweight rows for fuzzy.suggest() over a group's display names.
const groupPool = displays => displays.map(d => ({ name: d, symbol: '', qaid: d }));

// ---------------------------------------------------------------- build
/** Build the pool of leaderboard questions from the universe (honours shared filter). */
export function buildItems(ctx, cfg = {}) {
  const U = ctx.universe;
  const ref = ctx.reference;

  // shared cross-mode filter (empty/absent = no constraint)
  const base = filter(U, {
    region: cfg.region, iso2: cfg.iso2, gsector: cfg.gsector, gindustry: cfg.gindustry,
  });

  const fams    = (cfg.families && cfg.families.length) ? cfg.families : Object.keys(LB_FAMILIES);
  const setSize = cfg.setSize   || SET_SIZE;
  const target  = cfg.target    || TOP_TARGET;
  const anyStk  = cfg.anyStocks || ANY_STOCKS;
  const anyGrp  = cfg.anyGroups || ANY_GROUPS;
  const rankN   = cfg.rankN     || RANK_N;
  const minSet  = cfg.minSet    || MIN_SET;

  const sectorName   = k => ref.sectors.find(s => s.key === k)?.name    || nice(k);
  const industryName = k => ref.industries.find(g => g.key === k)?.name || nice(k);
  const regionName   = k => ref.regions.find(r => r.key === k)?.name    || k;

  const items = [];
  const mk = (mode, fam, key, label, sector, prompt, answers, needed, suggestPool, ordered, revealAll) =>
    items.push({
      _type: 'leaderboard', id: `lb:${fam}:${key}`, mode, family: fam, key,
      label, sector, prompt, answers, needed, ordered, revealAll,
      denom: ordered ? answers.length : needed, suggestPool,
    });

  // ---- topN: top-N stocks by cap in a group (ordered, partial credit) ----
  const pushTopN = (fam, key, label, sector, group, rows) => {
    const answers = topN(rows, setSize).map(stockAnswer);
    if (answers.length < minSet) return;
    mk('topN', fam, key, label, sector,
      `Name as many of the top ${answers.length} stocks by market cap in ${group}`,
      answers, Math.min(target, answers.length), rows, true, true);
  };
  if (fams.includes('sector'))
    for (const s of uniques(base, 'gsector'))
      pushTopN('sector', s, `Sector · ${sectorName(s)}`, s, sectorName(s), filter(base, { gsector: s }));
  if (fams.includes('region'))
    for (const rk of uniques(base, 'region'))
      pushTopN('region', rk, `Region · ${regionName(rk)}`, '', regionName(rk), filter(base, { region: rk }));
  if (fams.includes('industry'))
    for (const gk of uniques(base, 'gindustry')) {
      const rows = filter(base, { gindustry: gk });
      pushTopN('industry', gk, `Industry · ${industryName(gk)}`, rows[0]?.gsector || '', industryName(gk), rows);
    }
  if (fams.includes('country'))
    for (const iso of uniques(base, 'iso2'))
      pushTopN('country', iso, `Country · ${flagName(iso)}`, '', flagName(iso), filter(base, { iso2: iso }));

  // ---- anyN (stocks): "Name any N stocks in <group>" ----
  const pushAnyStocks = (fam, key, label, sector, group, rows) => {
    if (rows.length < Math.max(minSet, anyStk)) return;           // enough to ask "any N"
    const answers = byCapDesc(rows.filter(r => r.capAUD != null)).map(stockAnswer);
    if (answers.length < anyStk) return;
    const needed = Math.min(anyStk, answers.length);
    mk('anyN', fam, key, label, sector,
      `Name any ${needed} stocks in ${group}`,
      answers, needed, rows, false, false);
  };
  if (fams.includes('anyCountry'))
    for (const iso of uniques(base, 'iso2'))
      pushAnyStocks('anyCountry', iso, `Any · ${flagName(iso)}`, '', flagName(iso), filter(base, { iso2: iso }));
  if (fams.includes('anySector'))
    for (const s of uniques(base, 'gsector'))
      pushAnyStocks('anySector', s, `Any · ${sectorName(s)}`, s, sectorName(s), filter(base, { gsector: s }));
  if (fams.includes('anyRegion'))
    for (const rk of uniques(base, 'region'))
      pushAnyStocks('anyRegion', rk, `Any · ${regionName(rk)}`, '', regionName(rk), filter(base, { region: rk }));

  // ---- anyN (groups): "Name any N industries in <sector>" ----
  if (fams.includes('anyIndustryInSector'))
    for (const sk of uniques(base, 'gsector')) {
      const rows = filter(base, { gsector: sk });
      const inds = uniques(rows, 'gindustry');
      if (inds.length < Math.max(2, anyGrp)) continue;             // trivial-guard: need choices
      const answers = inds.map(gk => groupAnswer(industryName(gk)));
      const needed = Math.min(anyGrp, answers.length);
      mk('anyN', 'anyIndustryInSector', sk, `Any · Industries in ${sectorName(sk)}`, sk,
        `Name any ${needed} industries in ${sectorName(sk)}`,
        answers, needed, groupPool(answers.map(a => a.display)), false, true);
    }

  // ---- rankGroups: "Name the N biggest <groups> by market cap in <region>" ----
  const pushRank = (fam, field, nameFn, groupNoun) => {
    for (const rk of uniques(base, 'region')) {
      const rows = filter(base, { region: rk });
      const candidates = uniques(rows, field);
      if (candidates.length < rankN + 1) continue;                 // ranking must be non-trivial
      const top = topGroups(rows, field, rankN, r => r.capUSD || 0);
      if (top.length < rankN) continue;
      const answers = top.map(g => groupAnswer(nameFn(g.key)));
      mk('rankGroups', fam, rk, `Rank · ${groupNoun} in ${regionName(rk)}`, '',
        `Name the ${rankN} biggest ${groupNoun} by market cap in ${regionName(rk)}`,
        answers, answers.length, groupPool(candidates.map(nameFn)), true, true);
    }
  };
  if (fams.includes('rankIndustriesByCap')) pushRank('rankIndustriesByCap', 'gindustry', industryName, 'industries');
  if (fams.includes('rankSectorsByCap'))    pushRank('rankSectorsByCap', 'gsector', sectorName, 'sectors');
  if (fams.includes('rankCountriesByCap'))  pushRank('rankCountriesByCap', 'iso2', flagName, 'countries');

  return items;
}

// ---------------------------------------------------------------- matching
function matchAnswer(guess, a) {
  if (a.kind === 'stock')
    return dice(guess, a.name) >= 0.85 || (!!a.symbol && dice(guess, a.symbol) >= 0.9);
  return dice(guess, a.display) >= 0.85 || normz(guess) === normz(a.display);
}

// ---------------------------------------------------------------- diverse hints
// Cycles the addendum variety list for stock answers; a compact group list for
// group answers. `tick` advances on every add/miss so the hint keeps changing.
function hintText(a, tick) {
  const s = a.stock;
  if (s) {
    const opts = [];
    if (s.gsector) opts.push(`a ${nice(s.gsector)} business`);
    if (s.bucketShort && s.bucketShort !== '—') opts.push(`a ${s.bucketShort} name from ${flagName(s.iso2)}`);
    if (s.firstLetter) opts.push(`ticker starts with "${s.firstLetter}"`);
    if (s.gindustry) opts.push(`an ${nice(s.gindustry)} company`);
    if (s.iso2) opts.push(`based in ${flagName(s.iso2)}`);
    if (opts.length) return opts[tick % opts.length];
  }
  const d = a.display || '';
  const words = d.split(/\s+/).filter(Boolean).length;
  const group = [
    `name starts with "${(d.replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase()}"`,
    `${words} word${words === 1 ? '' : 's'}`,
    `${d.replace(/\s/g, '').length} characters`,
  ];
  return group[tick % group.length];
}

// ---------------------------------------------------------------- render
/** Render the single-box guessing UI into the runner's prompt + answer zone. */
export function renderLeaderboard(app, item, P, Z) {
  const answers = item.answers;
  const needed = item.needed;
  const denom = item.denom;
  const typeahead = (app.cfg?.typeahead !== false);         // default ON
  const [cv, ic] = sectorOf(item.sector);
  const found = new Array(answers.length).fill(false);
  let graded = false, tick = 0;

  P.innerHTML =
    `<div class="kicker"><span class="catico" style="background:var(${cv})">${icoSvg(ic)}</span>Leaderboard</div>
     <div class="q">${item.prompt}</div>
     <div class="hintline show">💡 …</div>`;

  const progress = el('div', 'lb-progress',
    `<b id="lbCount">0</b> / ${denom} found · need ${needed} to pass`);
  progress.style.cssText = 'font-family:var(--mono);font-size:12px;color:var(--ink-mute);font-weight:600;margin:2px 2px 10px';

  const foundBox = el('div', 'lb-guess');

  // single input row + type-ahead dropdown (styled in Wave 4)
  const inrow = el('div', 'typein');
  const box = el('div', 'inrow');
  const inp = el('input'); inp.placeholder = 'Name or ticker…'; inp.autocomplete = 'off';
  inp.setAttribute('enterkeyhint', 'go'); inp.setAttribute('autocapitalize', 'off');
  const add = el('button', 'check-btn press', 'Add');
  box.append(inp, add);
  const sugg = el('div', 'lb-suggest'); sugg.style.display = 'none';
  inrow.append(box, sugg);

  const reveal = el('button', 'next brand show press', 'Reveal & grade →');
  reveal.style.marginTop = '10px';

  Z.append(progress, foundBox, inrow, reveal);
  setTimeout(() => inp.focus(), 120);

  const foundCount = () => found.filter(Boolean).length;
  const updateCount = () => { Z.querySelector('#lbCount').textContent = foundCount(); };

  const updateHint = () => {
    const line = P.querySelector('.hintline');
    if (!line) return;
    const missing = [];
    for (let i = 0; i < answers.length; i++) if (!found[i]) missing.push(i);
    if (!missing.length) { line.classList.remove('show'); return; }
    const a = answers[missing[Math.floor(Math.random() * missing.length)]];
    line.innerHTML = '💡 ' + hintText(a, tick++);
    line.classList.add('show');
  };
  updateHint();

  const clearSuggest = () => { sugg.innerHTML = ''; sugg.style.display = 'none'; };
  const renderSuggest = () => {
    if (!typeahead || !item.suggestPool || !item.suggestPool.length) return;
    const list = suggest(inp.value.trim(), item.suggestPool, { limit: 5 });
    sugg.innerHTML = '';
    if (!list.length) { sugg.style.display = 'none'; return; }
    for (const s of list) {
      const label = s.symbol ? `${s.label} <span class="sym">${s.symbol}</span>` : s.label;
      const row = el('div', 'lb-suggest-item', label);
      row.onmousedown = e => e.preventDefault();          // keep input focus through click
      row.onclick = () => { inp.value = s.label; clearSuggest(); submit(); };
      sugg.appendChild(row);
    }
    sugg.style.display = '';
  };

  const flashBad = () => {
    inp.classList.remove('bad'); void inp.offsetWidth; inp.classList.add('bad');
    haptic(inp);
    updateHint();
  };

  const rowMarkup = (i, ok) => {
    const a = answers[i];
    const rank = item.ordered ? String(i + 1).padStart(2, '0') : '•';
    const cap = (a.cap != null && item.mode !== 'rankGroups') ? `<span class="cap">${fmtCap(a.cap)}</span>` : '';
    return `<span class="rank">${rank}</span>
       <span class="truth">${a.display}${cap}</span>
       <span class="mark ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</span>`;
  };

  const addFound = (i) => {
    found[i] = true;
    const row = el('div', 'lb-row revealed');
    row.innerHTML = rowMarkup(i, true);
    foundBox.prepend(row);                                 // newest on top
    row.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.22,.72,.26,1)' });
    updateCount();
    updateHint();
  };

  const submit = () => {
    if (graded) return;
    const guess = inp.value.trim();
    if (!guess) return;
    let hit = -1;
    for (let i = 0; i < answers.length; i++) {
      if (found[i]) continue;
      if (matchAnswer(guess, answers[i])) { hit = i; break; }
    }
    if (hit >= 0) {
      addFound(hit); inp.value = ''; clearSuggest();
      if (foundCount() >= needed && foundCount() === answers.length) grade();
    } else {
      flashBad(); inp.select();
    }
  };

  const grade = () => {
    if (graded) return; graded = true;
    inp.disabled = true; add.style.opacity = 0.5; clearSuggest(); reveal.remove();
    // reveal misses
    const missing = [];
    for (let i = 0; i < answers.length; i++) if (!found[i]) missing.push(i);
    const revealList = item.revealAll ? missing : missing.slice(0, 6);
    for (const i of revealList) {
      const row = el('div', 'lb-row revealed');
      row.style.opacity = 0.55;
      row.innerHTML = rowMarkup(i, false);
      foundBox.appendChild(row);
    }
    if (!item.revealAll && missing.length > revealList.length) {
      foundBox.appendChild(el('div', 'lb-more', `…and ${missing.length - revealList.length} more`));
    }
    const n = foundCount(), score = Math.min(n / denom, 1), ok = n >= needed;
    P.querySelector('.hintline')?.classList.remove('show');
    P.querySelector('.q').insertAdjacentHTML('beforeend',
      `<div style="font-family:var(--mono);font-size:13px;margin-top:12px;color:${ok ? 'var(--good)' : 'var(--bad)'}">${n} found · needed ${needed} ${ok ? '✓' : '✗'}</div>`);
    app.record(ok, item, ok ? add : null, score);
  };

  inp.addEventListener('input', renderSuggest);
  inp.addEventListener('blur', () => setTimeout(clearSuggest, 120));
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  add.onclick = submit;
  reveal.onclick = grade;
  Z._submit = submit;      // Enter handled locally; keep for parity
  Z._leaderboard = true;
}
