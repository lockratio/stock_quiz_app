// persistence.js — storage adapter. localStorage today, swappable for a remote
// backend (Supabase, etc.) by replacing ONLY this file. All app state goes through
// get/set/merge/remove/list. Keys are namespaced under a single prefix.

const NS = 'bourse:';           // change to re-scope all storage
const k = key => NS + key;

function safeParse(s, fallback) {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

export const persistence = {
  get(key, fallback = null) {
    return safeParse(localStorage.getItem(k(key)), fallback);
  },
  set(key, val) {
    try { localStorage.setItem(k(key), JSON.stringify(val)); } catch { /* quota */ }
    return val;
  },
  /** Shallow-merge a partial object into an existing stored object. */
  merge(key, partial) {
    const cur = this.get(key, {}) || {};
    const next = { ...cur, ...partial };
    return this.set(key, next);
  },
  remove(key) { localStorage.removeItem(k(key)); },
  /** List [key, value] pairs whose (un-namespaced) key starts with prefix. */
  list(prefix = '') {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full || !full.startsWith(NS)) continue;
      const bare = full.slice(NS.length);
      if (bare.startsWith(prefix)) out.push([bare, safeParse(localStorage.getItem(full))]);
    }
    return out;
  },

  // ---- export / import (stopgap for cross-device sync; see Settings) ----
  exportAll() {
    const data = {};
    for (const [key, val] of this.list('')) data[key] = val;
    return { app: 'bourse', version: 1, exportedAt: new Date().toISOString(), data };
  },
  importAll(obj) {
    if (!obj || obj.app !== 'bourse' || !obj.data) throw new Error('Not a BOURSE export file');
    for (const [key, val] of Object.entries(obj.data)) this.set(key, val);
    return Object.keys(obj.data).length;
  },
  clearAll() {
    for (const [key] of this.list('')) this.remove(key);
  },
};
