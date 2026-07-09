// dom.js — tiny DOM + feedback helpers shared across the UI.

import { store } from '../state/store.js';

export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

/** Visual pulse (+ device vibrate) on tap, gated by the haptic setting. */
export function haptic(node) {
  if (!store.settings.haptic || !node) return;
  node.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }],
    { duration: 120 });
  if (navigator.vibrate) navigator.vibrate(8);
}

let audioCtx = null;
/** Short chime, gated by the sound setting. good=true higher/sine, else buzz. */
export function beep(good) {
  if (!store.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = good ? 660 : 220;
    o.type = good ? 'sine' : 'square';
    g.gain.value = 0.06; o.start();
    o.frequency.exponentialRampToValueAtTime(good ? 990 : 180, audioCtx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
    o.stop(audioCtx.currentTime + 0.22);
  } catch { /* no audio */ }
}
