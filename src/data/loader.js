// loader.js — fetches reference.json (instant) and universe.csv (lazy, once).
// Default source is the repo's ./data/ (relative, so it works at the Pages
// subpath). A Settings "data base URL" override wins when set.

import { coerceStock } from './schema.js';
import { store } from '../state/store.js';

const DEFAULT_BASE = './data/';

function base() {
  const override = (store.settings.dataBaseUrl || '').trim();
  if (!override) return DEFAULT_BASE;
  return override.endsWith('/') ? override : override + '/';
}

/** fetch with a couple of retries — smooths over transient network/dev-server resets. */
async function fetchRetry(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
      return res;
    } catch (e) { err = e; await new Promise(r => setTimeout(r, 150 * (i + 1))); }
  }
  throw err;
}

let _reference = null;
let _universe = null;         // array of coerced stocks
let _byQaid = null;           // Map qaid -> stock
let _universePromise = null;  // de-dupe concurrent loads

export async function loadReference() {
  if (_reference) return _reference;
  const res = await fetchRetry(base() + 'reference.json');
  _reference = await res.json();
  return _reference;
}

export function getReference() { return _reference; }

/** Lazily fetch + parse universe.csv. Safe to call repeatedly. */
export function loadUniverse() {
  if (_universe) return Promise.resolve(_universe);
  if (_universePromise) return _universePromise;
  _universePromise = fetchRetry(base() + 'universe.csv')
    .then(res => res.text())
    .then(text => new Promise((resolve, reject) => {
      // Papa is loaded as a global from vendor/papaparse.min.js
      window.Papa.parse(text, {
        header: true, skipEmptyLines: true,
        complete: r => resolve(r.data),
        error: reject,
      });
    }))
    .then(rows => {
      _universe = rows.map(coerceStock).filter(s => s.qaid);
      _byQaid = new Map(_universe.map(s => [s.qaid, s]));
      return _universe;
    });
  return _universePromise;
}

export function getUniverse() { return _universe; }
export function stockByQaid(qaid) { return _byQaid ? _byQaid.get(qaid) : null; }
export function isUniverseLoaded() { return !!_universe; }
