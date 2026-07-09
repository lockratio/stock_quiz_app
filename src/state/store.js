// store.js — central app state on top of the persistence adapter.
// Everything persisted: settings, per-item "seen", per-mode stats, flags,
// best streak, and the daily-play streak. Swap the backend in persistence.js only.

import { persistence } from './persistence.js';

const todayStr = () => new Date().toISOString().slice(0, 10);
const sk = (mode, id) => mode + ':' + id;

const DEFAULT_SETTINGS = {
  accent: '#7C5CFF',
  font: 'rounded',
  fontScale: 100,
  fuzzyThreshold: 90,     // %
  instant: true,
  sound: false,
  haptic: true,
  dataBaseUrl: '',        // blank = repo ./data/ ; else raw URL override
};

export const store = {
  settings: { ...DEFAULT_SETTINGS, ...(persistence.get('settings') || {}) },
  seen: persistence.get('seen', {}) || {},
  stats: persistence.get('stats', {}) || {},
  flags: persistence.get('flags', {}) || {},
  streak: persistence.get('streak', { day: 0, last: null }) || { day: 0, last: null },

  // ---- settings ----
  saveSettings(patch) {
    Object.assign(this.settings, patch);
    persistence.set('settings', this.settings);
  },
  get fuzzy() { return (this.settings.fuzzyThreshold || 90) / 100; },

  // ---- seen ----
  markSeen(mode, id) { this.seen[sk(mode, id)] = 1; persistence.set('seen', this.seen); },
  isSeen(mode, id) { return !!this.seen[sk(mode, id)]; },
  seenCount(mode) { return Object.keys(this.seen).filter(x => x.startsWith(mode + ':')).length; },
  totalSeen() { return Object.keys(this.seen).length; },

  // ---- flags / bookmarks ----
  toggleFlag(mode, id) {
    const key = sk(mode, id);
    this.flags[key] = !this.flags[key];
    persistence.set('flags', this.flags);
    return this.flags[key];
  },
  isFlagged(mode, id) { return !!this.flags[sk(mode, id)]; },
  flaggedCount() { return Object.values(this.flags).filter(Boolean).length; },

  // ---- stats ----
  statOf(mode) {
    return this.stats[mode] || (this.stats[mode] = { c: 0, w: 0, best: 0, sess: 0 });
  },
  /** Record a finished session's aggregate into a mode's lifetime stats. */
  recordSession(mode, { correct, wrong, best }) {
    const s = this.statOf(mode);
    s.c += correct; s.w += wrong; s.best = Math.max(s.best, best); s.sess += 1;
    persistence.set('stats', this.stats);
  },
  overall() {
    let c = 0, w = 0, best = 0, sess = 0;
    for (const s of Object.values(this.stats)) { c += s.c; w += s.w; best = Math.max(best, s.best); sess += s.sess; }
    return { c, w, best, sess, acc: (c + w) ? Math.round(100 * c / (c + w)) : 0 };
  },

  // ---- daily streak ----
  touchDailyStreak() {
    const t = todayStr();
    if (this.streak.last === t) return this.streak.day;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    this.streak.day = this.streak.last === y ? this.streak.day + 1 : 1;
    this.streak.last = t;
    persistence.set('streak', this.streak);
    return this.streak.day;
  },
  get dayStreak() { return this.streak.day || 0; },

  // ---- reset ----
  resetAll() {
    persistence.clearAll();
    this.seen = {}; this.stats = {}; this.flags = {};
    this.streak = { day: 0, last: null };
    this.settings = { ...DEFAULT_SETTINGS };
    persistence.set('settings', this.settings);
  },
};
