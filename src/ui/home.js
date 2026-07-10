// home.js — landing screen: greeting, day streak, stat strip, question-of-the-day,
// and the consolidated action grid (Shuffle/All hero → Quiz + Browse). Runs off
// reference.json only (the universe loads on first drill / browse).

import { $, el } from '../lib/dom.js';
import { store } from '../state/store.js';
import { getReference } from '../data/loader.js';

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

  // 1. Shuffle / All hero — full-width, distinct fill → mixed quiz of every type.
  const hero = el('button', 'mode-shuffle press');
  hero.type = 'button';
  hero.innerHTML =
    `<div class="ms-ico">🎲</div>
     <div class="ms-copy"><div class="ms-title">Shuffle · All</div>
       <div class="ms-sub">Every question type, one mixed quiz</div></div>
     <div class="ms-go">→</div>`;
  hero.onclick = () => app.startShuffle();
  grid.appendChild(hero);

  // 2. Two primary cards — build a custom quiz, or explore the universe.
  const cards = [
    ['Quiz', 'Build a custom quiz — pick types & focus', () => app.newQuiz()],
    ['Browse', 'Explore the universe — read & review', () => app.openBrowse()],
  ];
  cards.forEach(([title, blurb, fn]) => {
    const c = el('div', 'mode-card press');
    c.innerHTML = `<h3>${title}</h3><p>${blurb}</p>`;
    c.onclick = fn;
    grid.appendChild(c);
  });

  // 3. Non-interactive line listing what a shuffle contains.
  const note = el('div', 'mode-inside');
  note.textContent = 'Inside: Leaderboard · Stock Universe · Facts · Flashcards · Descriptions';
  grid.appendChild(note);
}
