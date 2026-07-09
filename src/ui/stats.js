// stats.js — progress screen: overall hero, 7-day activity, per-mode accuracy.

import { $, el } from '../lib/dom.js';
import { store } from '../state/store.js';
import { MODES, MODE_ORDER } from '../modes/registry.js';
import { icoSvg } from '../lib/icons.js';
import { getReference } from '../data/loader.js';

export function renderStats(app) {
  const ov = store.overall();
  $('#ovAcc').innerHTML = ov.acc + '<span>%</span>';
  $('#ovSeen').textContent = store.totalSeen();
  $('#ovStreak').textContent = ov.best;
  $('#ovSess').textContent = ov.sess;
  $('#ovTime').textContent = ov.sess ? '—' : '0s';

  // 7-day activity: light the trailing `dayStreak` days up to today
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = (new Date().getDay() + 6) % 7;
  const streak = store.dayStreak;
  $('#weekRow').innerHTML = days.map((d, i) =>
    `<div class="d"><div class="dot ${i <= today && i > today - streak ? 'on' : ''}"></div><div class="lb">${d}</div></div>`).join('');

  const ref = getReference();
  const box = $('#modeStats');
  box.innerHTML = '';
  MODE_ORDER.forEach(k => {
    const m = MODES[k];
    const s = store.statOf(k);
    const t = s.c + s.w;
    const acc = t ? Math.round(100 * s.c / t) : 0;
    const sn = store.seenCount(k);
    const total = ref?.meta?.total_stocks || 1;
    const row = el('div', 'mode-stat');
    row.innerHTML =
      `<div class="msico" style="background:var(${m.col})">${icoSvg(m.icon)}</div>
       <div class="msbody">
         <div class="mt"><span>${m.title}</span><span class="acc" style="color:${acc >= 70 ? 'var(--good)' : acc >= 40 ? 'var(--warn)' : 'var(--ink-mute)'}">${t ? acc + '%' : '—'}</span></div>
         <div class="bar"><i style="width:${Math.min(100, Math.round(100 * sn / total))}%;background:var(${m.col})"></i></div>
       </div>`;
    box.appendChild(row);
  });
}
