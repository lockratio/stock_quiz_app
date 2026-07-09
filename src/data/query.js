// query.js — dynamic selectors over the loaded universe. This is what replaces
// the old pre-baked largest_*.csv files: any "top N in X", filter, or unique-set
// is computed live, enabling richer questions and filters in the UI.

/** Numeric market-cap sort (desc), nulls last. */
export const byCapDesc = rows =>
  [...rows].sort((a, b) => (b.capAUD ?? -1) - (a.capAUD ?? -1));

export const topN = (rows, n = 10) => byCapDesc(rows.filter(r => r.capAUD != null)).slice(0, n);

/** Unique, sorted values of a field across rows (blanks dropped). */
export function uniques(rows, field) {
  return [...new Set(rows.map(r => r[field]).filter(v => v !== '' && v != null))].sort();
}

/**
 * Filter the universe by any combination of dimensions.
 * spec: { indexCode, gsector, gindustry, iso2, region, exchange, capMin, capMax }
 * Array values match any-of; scalars match equality.
 */
export function filter(rows, spec = {}) {
  const has = (val, want) => (want == null || want === '') ? true
    : Array.isArray(want) ? (want.length === 0 || want.includes(val)) : val === want;
  return rows.filter(r =>
    has(r.indexCode, spec.indexCode) &&
    has(r.gsector, spec.gsector) &&
    has(r.gindustry, spec.gindustry) &&
    has(r.iso2, spec.iso2) &&
    has(r.region, spec.region) &&
    has(r.exchange, spec.exchange) &&
    (spec.capMin == null || (r.capAUD != null && r.capAUD >= spec.capMin)) &&
    (spec.capMax == null || (r.capAUD != null && r.capAUD <= spec.capMax))
  );
}

/** Group rows by a field -> Map(value -> rows[]). */
export function groupBy(rows, field) {
  const m = new Map();
  for (const r of rows) {
    const key = r[field];
    if (key === '' || key == null) continue;
    (m.get(key) || m.set(key, []).get(key)).push(r);
  }
  return m;
}

/** N random distractors from rows, excluding those matching `exclude(row)`. */
export function distractors(rows, n, exclude, map = r => r) {
  const pool = rows.filter(r => !exclude(r));
  for (let i = pool.length - 1; i > 0; i--) {   // Fisher–Yates
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = [], seen = new Set();
  for (const r of pool) {
    const v = map(r);
    if (seen.has(v)) continue;
    seen.add(v); out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

export const shuffle = a => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};
export const sample = (a, n) => shuffle(a).slice(0, n);
