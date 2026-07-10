// runner.js — the quiz runner view: renders the current question, owns the four
// shared answer styles (MC / TF / type-in / flip) with ONE green/red feedback
// treatment, the synced countdown timer, and hands leaderboard off to its module.
// Session lifecycle (record/next/prev/finish) lives on the app controller.

import { $, el, haptic } from '../lib/dom.js';
import { store } from '../state/store.js';
import { sectorOf, icoSvg } from '../lib/icons.js';
import { dice, suggest } from '../lib/fuzzy.js';
import { shuffle } from '../data/query.js';
import { QUIZ_TYPE_STYLES } from '../modes/registry.js';
import { makeQuestion as factsQ } from '../modes/facts.js';
import { makeQuestion as idcardQ } from '../modes/idcard.js';
import { makeQuestion as flashQ } from '../modes/flashcards.js';
import { makeQuestion as descQ } from '../modes/descriptions.js';
import { renderLeaderboard } from '../modes/leaderboard.js';

// One quiz mixes types; dispatch the current item's question factory by `_type`.
const QFN = { facts: factsQ, idcard: idcardQ, flash: flashQ, desc: descQ };
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
  delete Z._opts; delete Z._flip; delete Z._sg; delete Z._submit; delete Z._tf; delete Z._leaderboard;
  P.classList.remove('slide-in'); void P.offsetWidth; P.classList.add('slide-in');
  store.markSeen(app.mode, item.id);

  // leaderboard owns its whole single-box mechanic (no answer style).
  if (item._type === 'leaderboard') { $('#runTag').textContent = 'leaderboard'; return renderLeaderboard(app, item, P, Z); }

  const q = QFN[item._type](item, app.ctx);
  item._q = q;

  // desc (and any _selfGrade question) is inherently a flip card; otherwise
  // honour app.style when the type supports it, falling back to MC.
  const styles = QUIZ_TYPE_STYLES[item._type] || [];
  const selfGrade = item._type === 'desc' || q._selfGrade;
  const st = selfGrade ? 'flip' : (styles.includes(app.style) ? app.style : 'mc');
  $('#runTag').textContent = STYLE_TAG[st] || 'quiz';

  const [cv, ic] = sectorOf(q.sector);
  const head = `<div class="kicker"><span class="catico" style="background:var(${cv})">${icoSvg(ic)}</span>${q.kicker}</div>`;
  // self-graded (desc) cards carry their content in the flip card itself, so the
  // prompt only shows the question — avoids a giant duplicate of the description.
  const body = (q.display && !selfGrade)
    ? `<div class="desc" style="font-size:14px;margin-bottom:4px">${q.question}</div><div class="q big">${q.display}</div>`
    : `<div class="q ${q.big && !selfGrade ? 'big' : ''}">${q.question}</div>`;
  const hint = q.hint ? `<div class="hintline">💡 ${q.hint}</div>` : '';
  P.innerHTML = head + body + hint;

  if (selfGrade) renderFlip(app, q, Z, item);
  else if (st === 'mc') renderMC(app, q, Z, item);
  else if (st === 'tf') renderTF(app, q, Z, item);
  else if (st === 'type') renderType(app, q, Z, item);
  else renderFlip(app, q, Z, item);

  startTimer(app);
}

// ---------------------------------------------------------------- MULTIPLE CHOICE
function renderMC(app, q, Z, item) {
  // dynamic option count: 4 / 6 / 8. Slice distractors to mcCount-1 and add the
  // answer. Degrades gracefully when fewer distractors exist (min 2 options).
  const mc = app.opts.mcCount || 4;
  const KEYS = 'ABCDEFGH'.split('');
  const ds = (q.distractors || []).slice(0, mc - 1);
  const opts = app.opts.shuffle ? shuffle([q.answer, ...ds]) : [q.answer, ...ds];
  const box = el('div', 'opts');
  opts.forEach((o, i) => {
    const b = el('button', 'opt press', `<span class="key">${KEYS[i]}</span><span>${o}</span>`);
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
  const sugg = el('div', 'ta-suggest'); sugg.style.display = 'none';
  const grade = el('div', 'grade');

  const clearSuggest = () => { sugg.innerHTML = ''; sugg.style.display = 'none'; };

  const submit = () => {
    if (inp.disabled) return;
    clearSuggest();
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

  // Type-ahead dropdown for company-name answers. Suggestions come from the whole
  // universe; grading is unchanged (dice vs threshold). Never hijacks typing.
  if (q.typeahead) {
    const renderSuggest = () => {
      const val = inp.value.trim();
      if (inp.disabled || val.length < 2) { clearSuggest(); return; }
      const list = suggest(val, app.ctx.universe, { limit: 5 });
      sugg.innerHTML = '';
      if (!list.length) { sugg.style.display = 'none'; return; }
      for (const s of list) {
        const label = s.symbol ? `${s.label} <span class="sym">${s.symbol}</span>` : s.label;
        const it = el('div', 'ta-suggest-item', label);
        it.onmousedown = e => e.preventDefault();          // keep input focus through the click
        it.onclick = () => { inp.value = s.label; clearSuggest(); inp.focus(); };
        sugg.appendChild(it);
      }
      sugg.style.display = '';
    };
    inp.addEventListener('input', renderSuggest);
    inp.addEventListener('blur', () => setTimeout(clearSuggest, 120));
  }

  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  btn.onclick = submit;
  wrap.append(row, sugg, grade);
  Z.appendChild(wrap);
  Z._submit = submit;
  setTimeout(() => inp.focus(), 120);
}

// ---------------------------------------------------------------- FLASHCARD FLIP
function renderFlip(app, q, Z, item) {
  const longFront = q._selfGrade || (q.display && q.display.length > 120);
  const wrap = el('div', 'flip-wrap' + (longFront ? ' longfront' : ''));
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
