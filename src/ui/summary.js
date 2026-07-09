// summary.js — end-of-session results ring, breakdown, missed list, confetti.

import { $ } from '../lib/dom.js';
import { nice } from '../data/schema.js';

function itemLabel(item) {
  if (item._q && item._q.answer) return item._q.answer;
  if (item.data && item.data.name) return item.data.name;
  if (item.label) return item.label.split(' · ').pop();
  return 'item';
}

export function renderSummary(app) {
  const s = app.session;
  const answered = s.results.filter(Boolean).length;
  const scoreSum = s.results.reduce((a, r) => a + (r ? (r.score ?? (r.ok ? 1 : 0)) : 0), 0);
  const pct = answered ? Math.round(100 * scoreSum / answered) : 0;

  $('#sumPct').textContent = pct + '%';
  const off = 434 - (434 * pct / 100);
  const R = $('#sumRing');
  R.style.strokeDashoffset = 434;
  requestAnimationFrame(() => { R.style.transition = 'stroke-dashoffset 1.1s var(--ease)'; R.style.strokeDashoffset = off; });

  $('#sumHead').textContent = pct >= 80 ? 'Sharp. 🎯' : pct >= 50 ? 'Solid drill.' : 'Keep grinding.';
  const avg = s.times.length ? (s.times.reduce((a, b) => a + b, 0) / s.times.length).toFixed(1) : '0';
  $('#sumLine').textContent = `${s.c}/${answered} correct · best streak ${s.best} · ~${avg}s/q`;
  $('#sumInsight').textContent = pct >= 80
    ? 'Your recall on this set is locked in. Try a longer or unseen-only run.'
    : pct >= 50 ? 'Good base. Review the misses below, then re-run just those.'
      : 'This set needs another pass. Hit "Review the misses" to drill only the gaps.';

  $('#sumBrkdn').innerHTML = [['Correct', s.c, 'var(--good)'], ['Missed', s.w, 'var(--bad)'], ['Streak', s.best, 'var(--warn)']]
    .map(([l, n, c]) => `<div class="b"><div class="n" style="color:${c}">${n}</div><div class="l">${l}</div></div>`).join('');

  const miss = s.results.filter(r => r && r.ok === false).map(r => r.item);
  const box = $('#missedBox');
  if (miss.length) {
    box.style.display = 'block';
    box.innerHTML = `<div class="h">Missed · ${miss.length}</div>` +
      miss.map(m => `<div class="m-row"><span>${itemLabel(m)}</span><span class="a">tap to review</span></div>`).join('');
  } else box.style.display = 'none';

  if (pct >= 70) fireConfetti();
}

function fireConfetti() {
  const cv = $('#confetti');
  cv.style.display = 'block';
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#7C5CFF', '#12B886', '#F59F00', '#FA5252', '#0EA5E9', '#EC4899'];
  const parts = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 11, vy: Math.random() * -13 - 3,
    r: Math.random() * 6 + 3, c: cols[Math.floor(Math.random() * cols.length)], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
  }));
  let f = 0;
  (function anim() {
    f++; ctx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(p => { p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore(); });
    if (f < 130) requestAnimationFrame(anim);
    else { cv.style.display = 'none'; ctx.clearRect(0, 0, cv.width, cv.height); }
  })();
}
