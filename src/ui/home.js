// home.js — landing screen: greeting, day streak, stat strip, question-of-the-day,
// and the mode grid. Runs off reference.json only (universe loads on first drill).

import { $, el } from '../lib/dom.js';
import { store } from '../state/store.js';
import { getReference } from '../data/loader.js';
import { MODES, MODE_ORDER } from '../modes/registry.js';
import { icoSvg } from '../lib/icons.js';

function totalFor(mode, ref) {
  const c = ref.counts || ref.meta?.counts || {};
  const stocks = ref.meta?.total_stocks || 0;
  switch (mode) {
    case 'leaderboard': return (ref.sectors.length + ref.regions.length + ref.industries.length + ref.countries.length);
    case 'facts': return (ref.countries.length * 2 + ref.industries.length + ref.sectors.length);
    default: return stocks;   // idcard, desc, flash
  }
}

export function renderHome(app) {
  const ref = getReference();
  if (!ref) return;
  const hr = new Date().getHours();
  $('#greetLine').textContent = hr < 12 ? 'Good morning.' : hr < 18 ? 'Good afternoon.' : 'Evening drill?';
  $('#dayStreak').textContent = store.dayStreak + ' day streak';

  const ov = store.overall();
  $('#statStrip').innerHTML = [
    ['Accuracy', ov.acc + '<small>%</small>'],
    ['Seen', store.totalSeen()],
    ['Best streak', ov.best],
    ['Flagged', store.flaggedCount()],
  ].map(([l, n]) => `<div class="stat-pill"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  // question of the day — rotates by date
  const day = Math.floor(Date.now() / 8.64e7);
  const withCur = ref.countries.filter(c => c.currency_iso);
  const f = withCur[day % withCur.length];
  $('#qotdQ').textContent = `What currency does ${f.flag} ${f.name} use?`;

  const grid = $('#modeGrid');
  grid.innerHTML = '';
  MODE_ORDER.forEach(k => {
    const m = MODES[k];
    const total = totalFor(k, ref);
    const sn = store.seenCount(k);
    const pct = Math.round(100 * sn / Math.max(1, total));
    const c = el('div', 'mode-card press');
    c.innerHTML =
      `<div class="decoblob" style="background:var(${m.col})"></div>
       <div class="ico" style="background:var(${m.col})">${icoSvg(m.icon)}</div>
       <h3>${m.title}</h3><p>${m.blurb}</p>
       <div class="foot"><div class="mini-bar"><i style="width:${pct}%;background:var(${m.col})"></i></div><span class="seen">${sn}/${total}</span></div>`;
    c.onclick = () => app.openMode(k);
    grid.appendChild(c);
  });
}
