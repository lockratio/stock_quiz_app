// runner.js — the quiz runner view: renders the current question, owns the four
// shared answer styles (MC / TF / type-in / flip) with ONE green/red feedback
// treatment, the synced countdown timer, and hands leaderboard off to its module.
// Session lifecycle (record/next/prev/finish) lives on the app controller.

import { $, el, haptic } from '../lib/dom.js';
import { store } from '../state/store.js';
import { sectorOf, icoSvg } from '../lib/icons.js';
import { dice } from '../lib/fuzzy.js';
import { shuffle } from '../data/query.js';
import { makeQuestion as factsQ } from '../modes/facts.js';
import { makeQuestion as idcardQ } from '../modes/idcard.js';
import { makeQuestion as flashQ } from '../modes/flashcards.js';
import { renderLeaderboard } from '../modes/leaderboard.js';

const QFN = { facts: factsQ, idcard: idcardQ, flash: flashQ };
const TIMER_SECS = 15;

const STYLE_TAG = { mc: 'multiple choice', tf: 'true / false', type: 'type-in', flip: 'flashcard' };

export function renderQuestion(app) {
  const i = app.idx, total = app.queue.length, item = app.queue[i];
  app._qStart = Date.now();
  $('#qNow').textContent = i + 1;
  $('#qTotal').textContent = total;
  $('#runRingLbl').textContent = i + 1;
  const circ = 107;
  $('#runRing').style.strokeDashoffset = circ - (circ * i / total);
  $('#runTag').textContent = app.mode === 'leaderboard' ? 'leaderboard' : (STYLE_TAG[app.style] || 'quiz');
  $('#nextBtn').classList.remove('show');
  $('#postmark').classList.remove('show');
  $('#abPrev').classList.toggle('disabled', i === 0);
  $('#abFlag').classList.toggle('on', store.isFlagged(app.mode, item.id));
  // last question: primary button reads "Complete Quiz"
  $('#nextBtn').innerHTML = (i === total - 1)
    ? 'Complete Quiz <span class="kbd">↵</span>'
    : 'Next <span class="kbd">↵</span>';

  const P = $('#promptCard'), Z = $('#answerZone');
  Z.innerHTML = '';
  delete Z._opts; delete Z._flip; delete Z._sg; delete Z._submit; delete Z._tf;
  P.classList.remove('slide-in'); void P.offsetWidth; P.classList.add('slide-in');
  store.markSeen(app.mode, item.id);

  if (app.mode === 'leaderboard') return renderLeaderboard(app, item, P, Z);

  const q = QFN[app.mode](item, app.ctx);
  item._q = q;
  const [cv, ic] = sectorOf(q.sector);
  const head = `<div class="kicker"><span class="catico" style="background:var(${cv})">${icoSvg(ic)}</span>${q.kicker}</div>`;
  const body = q.display
    ? `<div class="desc" style="font-size:14px;margin-bottom:4px">${q.question}</div><div class="q big">${q.display}</div>`
    : `<div class="q ${q.big ? 'big' : ''}">${q.question}</div>`;
  const hint = q.hint ? `<div class="hintline">💡 ${q.hint}</div>` : '';
  P.innerHTML = head + body + hint;

  if (app.style === 'mc') renderMC(app, q, Z, item);
  else if (app.style === 'tf') renderTF(app, q, Z, item);
  else if (app.style === 'type') renderType(app, q, Z, item);
  else if (app.style === 'flip') renderFlip(app, q, Z, item);

  startTimer(app);
}

// ---------------------------------------------------------------- MULTIPLE CHOICE
function renderMC(app, q, Z, item) {
  const opts = app.opts.shuffle ? shuffle([q.answer, ...q.distractors]) : [q.answer, ...q.distractors];
  const box = el('div', 'opts');
  const keys = ['A', 'B', 'C', 'D'];
  opts.forEach((o, i) => {
    const b = el('button', 'opt press', `<span class="key">${keys[i]}</span><span>${o}</span>`);
    b.dataset.i = i;
    b.onclick = () => {
      if (box.dataset.done) return;
      box.dataset.done = 1; haptic(b);
      const ok = o === q.answer;
      if (app.opts.revealEnd) { b.querySelector('.key').textContent = '✓'; app.record(ok, item, b); return; }
      box.querySelectorAll('.opt').forEach(x => {
        x.style.pointerEvents = 'none';
        const txt = x.querySelector('span:last-child').textContent;
        if (txt === q.answer) x.classList.add('correct');      // always green the right one
        else if (x === b) x.classList.add('wrong');            // red my wrong pick
        else x.classList.add('dim');
      });
      app.record(ok, item, b);
      appendExpl(Z, q);
    };
    box.appendChild(b);
  });
  Z.appendChild(box);
  Z._opts = box;
}

// ---------------------------------------------------------------- TRUE / FALSE
function renderTF(app, q, Z, item) {
  const isTrue = Math.random() < 0.5;
  $('#promptCard').querySelector('.q').innerHTML = `“${isTrue ? q.tfTrue : q.tfFalse}”`;
  const wrap = el('div', 'tf-opts');
  [['True', '✓', true], ['False', '✕', false]].forEach(([lab, ic, val]) => {
    const b = el('button', 'tf press', `<span class="ic">${ic}</span>${lab}`);
    b.onclick = () => {
      if (wrap.dataset.done) return;
      wrap.dataset.done = 1; haptic(b);
      const ok = (val === isTrue);
      if (!app.opts.revealEnd) {
        b.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) wrap.querySelector(isTrue ? '.tf:first-child' : '.tf:last-child').classList.add('correct');
      }
      app.record(ok, item, b);
      if (!app.opts.revealEnd) appendExpl(Z, q);
    };
    wrap.appendChild(b);
  });
  Z.appendChild(wrap);
  Z._tf = wrap;
}

// ---------------------------------------------------------------- TYPE-IN
function renderType(app, q, Z, item) {
  const wrap = el('div', 'typein');
  const row = el('div', 'inrow');
  const inp = el('input'); inp.placeholder = 'Type your answer…'; inp.autocomplete = 'off';
  inp.setAttribute('enterkeyhint', 'go'); inp.setAttribute('autocapitalize', 'off');
  const btn = el('button', 'check-btn press', 'Check');
  row.append(inp, btn);
  const grade = el('div', 'grade');
  const submit = () => {
    if (inp.disabled) return;
    const sim = dice(inp.value, q.answer), pct = Math.round(sim * 100);
    inp.disabled = true; btn.style.opacity = 0.5;
    const ok = sim >= store.fuzzy;
    if (app.opts.revealEnd) { app.record(ok, item, btn); return; }
    const cls = ok ? 'hit' : (sim >= 0.55 ? 'near' : 'miss');
    const col = ok ? 'var(--good)' : (sim >= 0.55 ? 'var(--warn)' : 'var(--bad)');
    grade.className = 'grade show ' + cls;
    grade.innerHTML =
      `<div class="score">${ok ? 'CORRECT' : (sim >= 0.55 ? 'SO CLOSE · ' + pct + '%' : 'similarity ' + pct + '%')}</div>
       <div class="simbar"><i style="width:${pct}%;background:${col}"></i></div>
       <div class="ans">Answer: <b>${q.answer}</b>${q.sub ? ' · ' + q.sub : ''}</div>
       ${q.expl ? `<div class="expl">${q.expl}</div>` : ''}`;
    app.record(ok, item, btn);
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  btn.onclick = submit;
  wrap.append(row, grade);
  Z.appendChild(wrap);
  Z._submit = submit;
  setTimeout(() => inp.focus(), 120);
}

// ---------------------------------------------------------------- FLASHCARD FLIP
function renderFlip(app, q, Z, item) {
  const wrap = el('div', 'flip-wrap');
  const back = (q.back || [['answer', q.answer]])
    .map(([l, v]) => `<div class="fc-back-item"><span class="lab">${l}</span><span class="val">${v}</span></div>`).join('');
  wrap.innerHTML =
    `<div class="flip" id="flipCard">
       <div class="face front"><span class="tag">front</span><div class="fc-front">${q.display || q.question}</div></div>
       <div class="face back"><span class="tag">back · answer</span><div>${back}</div></div>
     </div>`;
  const hint = el('div', 'flip-hint', 'tap card or press Space to reveal');
  const sg = el('div', 'selfgrade',
    `<button class="sg miss">Missed it<span class="k">← / 1</span></button>
     <button class="sg hit">Got it<span class="k">→ / 2</span></button>`);
  Z.append(wrap, hint, sg);
  const card = wrap.querySelector('#flipCard');
  const flipIt = () => {
    if (card.classList.contains('flipped')) return;
    card.classList.add('flipped');
    hint.textContent = 'how did you do?';
    sg.classList.add('show'); haptic(card);
  };
  card.onclick = flipIt;
  Z._flip = flipIt;
  sg.querySelector('.miss').onclick = () => { app.record(false, item, null); sg.style.opacity = 0.5; };
  sg.querySelector('.hit').onclick = () => { app.record(true, item, sg.querySelector('.hit')); sg.style.opacity = 0.5; };
  Z._sg = sg;
}

// ---------------------------------------------------------------- shared bits
export function appendExpl(container, q) {
  if (!q.expl) return;
  const e = el('div', 'expl', q.expl);
  e.style.marginTop = '12px';
  container.appendChild(e);
}
export function lockZone() {
  $('#answerZone').querySelectorAll('button,input').forEach(b => { b.style.pointerEvents = 'none'; });
}

// ---------------------------------------------------------------- timer (fixed)
export function startTimer(app) {
  stopTimer(app);
  if (!app.opts.timed) return;
  const bar = $('#timerbar'), fill = $('#timerFill');
  bar.classList.add('on');
  fill.style.transition = 'none'; fill.style.width = '100%';
  void fill.offsetWidth;
  // one CSS transition over the FULL duration => 1 real second per bar-second
  fill.style.transition = `width ${TIMER_SECS}s linear`;
  fill.style.width = '0%';
  app._timer = setTimeout(() => {
    stopTimer(app);
    const it = app.queue[app.idx];
    app.record(false, it, null);   // expiry => locked + marked wrong
    lockZone();
  }, TIMER_SECS * 1000);
}
export function stopTimer(app) {
  if (app._timer) { clearTimeout(app._timer); app._timer = null; }
  $('#timerbar').classList.remove('on');
}
