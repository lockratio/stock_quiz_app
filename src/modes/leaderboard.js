// leaderboard.js — "Leaderboard Guess". Own single-box mechanic (no answer-style
// selector). Sets are built LIVE from the universe (replacing largest_*.csv):
// top-N by market cap per sector / region / industry / country. You type names or
// tickers into one box; correct guesses fill green and stack into a found list;
// wrong guesses shake. Score is partial: found / list size.

import { el, haptic, toast } from '../lib/dom.js';
import { nice, fmtCap } from '../data/schema.js';
import { topN, filter, uniques, shuffle } from '../data/query.js';
import { sectorOf, icoSvg } from '../lib/icons.js';
import { dice } from '../lib/fuzzy.js';
import { flagName } from '../lib/fx.js';

const SET_SIZE = 10;   // list length
const MIN_SET = 4;     // drop thin categories

export const LB_FAMILIES = {
  sector: 'Sectors', region: 'Regions', industry: 'Industries', country: 'Countries',
};

/** Build the pool of leaderboard questions from the universe. */
export function buildItems(ctx, cfg = {}) {
  const U = ctx.universe;
  const fams = (cfg.families && cfg.families.length) ? cfg.families : Object.keys(LB_FAMILIES);
  const items = [];
  const push = (type, key, label, sector, rows) => {
    const list = topN(rows, SET_SIZE);
    if (list.length >= MIN_SET) items.push({ id: `lb:${type}:${key}`, type, key, label, sector, list });
  };
  if (fams.includes('sector'))
    for (const s of ctx.reference.sectors)
      push('sector', s.key, `Sector · ${s.name}`, s.key, filter(U, { gsector: s.key }));
  if (fams.includes('region'))
    for (const r of ctx.reference.regions)
      push('region', r.key, `Region · ${r.name}`, '', filter(U, { region: r.key }));
  if (fams.includes('industry'))
    for (const g of ctx.reference.industries)
      push('industry', g.key, `Industry · ${g.name}`, g.sector, filter(U, { gindustry: g.key }));
  if (fams.includes('country'))
    for (const iso of uniques(U, 'iso2'))
      push('country', iso, `Country · ${flagName(iso)}`, '', filter(U, { iso2: iso }));
  return items;
}

/** Render the single-box guessing UI into the runner's prompt + answer zone. */
export function renderLeaderboard(app, item, P, Z) {
  const list = item.list;
  const target = Math.min(5, list.length);
  const [cv, ic] = sectorOf(item.sector);
  const found = new Array(list.length).fill(false);
  let graded = false;

  P.innerHTML =
    `<div class="kicker"><span class="catico" style="background:var(${cv})">${icoSvg(ic)}</span>Leaderboard</div>
     <div class="q">Name as many of the top <b>${list.length}</b><br>${item.label}</div>
     <div class="hintline">💡 #1 is ${list[0].name.split(' ')[0]}…</div>`;

  // running "found" list (fills top-down as you get them)
  const foundBox = el('div', 'lb-guess');
  const progress = el('div', 'lb-progress',
    `<b id="lbCount">0</b> / ${list.length} found · need ${target} to pass`);
  progress.style.cssText = 'font-family:var(--mono);font-size:12px;color:var(--ink-mute);font-weight:600;margin:2px 2px 10px';

  // single input row
  const inrow = el('div', 'typein');
  const box = el('div', 'inrow');
  const inp = el('input'); inp.placeholder = 'Name or ticker…'; inp.autocomplete = 'off';
  inp.setAttribute('enterkeyhint', 'go'); inp.setAttribute('autocapitalize', 'off');
  const add = el('button', 'check-btn press', 'Add');
  box.append(inp, add); inrow.append(box);

  const reveal = el('button', 'next brand show press', 'Reveal & grade →');
  reveal.style.marginTop = '10px';

  Z.append(progress, foundBox, inrow, reveal);
  setTimeout(() => inp.focus(), 120);

  const foundCount = () => found.filter(Boolean).length;
  const updateCount = () => { Z.querySelector('#lbCount').textContent = foundCount(); };

  const flashBad = () => {
    inp.classList.remove('bad'); void inp.offsetWidth; inp.classList.add('bad');
    haptic(inp);
  };

  const addFound = (i) => {
    found[i] = true;
    const row = el('div', 'lb-row revealed');
    row.innerHTML =
      `<span class="rank">${String(i + 1).padStart(2, '0')}</span>
       <span class="truth">${list[i].name}<span class="cap">${fmtCap(list[i].cap)}</span></span>
       <span class="mark ok">✓</span>`;
    // newest on top of the found list
    foundBox.prepend(row);
    row.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.22,.72,.26,1)' });
    updateCount();
  };

  const submit = () => {
    if (graded) return;
    const guess = inp.value.trim();
    if (!guess) return;
    let hit = -1;
    for (let i = 0; i < list.length; i++) {
      if (found[i]) continue;
      if (dice(guess, list[i].name) >= 0.85 || dice(guess, list[i].ticker) >= 0.9) { hit = i; break; }
    }
    if (hit >= 0) {
      addFound(hit); inp.value = '';
      if (foundCount() === list.length) grade();
    } else {
      flashBad(); inp.select();
    }
  };

  const grade = () => {
    if (graded) return; graded = true;
    inp.disabled = true; add.style.opacity = 0.5; reveal.remove();
    // reveal any missed entries (greyed, in place)
    for (let i = 0; i < list.length; i++) {
      if (found[i]) continue;
      const row = el('div', 'lb-row revealed');
      row.style.opacity = 0.55;
      row.innerHTML =
        `<span class="rank">${String(i + 1).padStart(2, '0')}</span>
         <span class="truth">${list[i].name}<span class="cap">${fmtCap(list[i].cap)}</span></span>
         <span class="mark no">✗</span>`;
      foundBox.appendChild(row);
    }
    const n = foundCount(), score = n / list.length, ok = n >= target;
    P.querySelector('.hintline')?.classList.remove('show');
    P.querySelector('.q').insertAdjacentHTML('beforeend',
      `<div style="font-family:var(--mono);font-size:13px;margin-top:12px;color:${ok ? 'var(--good)' : 'var(--bad)'}">${n}/${list.length} named · needed ${target} ${ok ? '✓' : '✗'}</div>`);
    app.record(ok, item, ok ? add : null, score);
  };

  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  add.onclick = submit;
  reveal.onclick = grade;
  Z._submit = submit;   // Enter handled locally; keep for parity
  Z._leaderboard = true;
}
