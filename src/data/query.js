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

// ---------------------------------------------------------------------------
// Plausible distractors + lightweight aggregates (Wave 2)
// ---------------------------------------------------------------------------

// Cap-bucket order high->low (authoritative, from schema.js §2 contract).
// Defined locally so adjacency is stable even if schema.CAP_BUCKETS lags.
const CAP_BUCKET_ORDER = ['mag7', 'mega', 'large', 'mid', 'small_mid', 'small', 'micro'];

// Each predicate answers "does candidate `c` share this cohort with answer `a`?".
// All are robust to missing/blank fields (blank never counts as a shared cohort,
// except `numeric` where absence coerces to the same falsey bool on both sides).
const COHORT_PREDICATES = {
  region:      (c, a) => c.region      != null && c.region      !== '' && c.region      === a.region,
  firstLetter: (c, a) => c.firstLetter != null && c.firstLetter !== '' && c.firstLetter === a.firstLetter,
  numeric:     (c, a) => !!c.numericTicker === !!a.numericTicker,
  sector:      (c, a) => c.gsector     != null && c.gsector     !== '' && c.gsector     === a.gsector,
  country:     (c, a) => c.iso2        != null && c.iso2        !== '' && c.iso2        === a.iso2,
  capBucket:   (c, a) => {
    const ci = CAP_BUCKET_ORDER.indexOf(c.bucket);
    const ai = CAP_BUCKET_ORDER.indexOf(a.bucket);
    if (ci < 0 || ai < 0) return false;          // unknown/null bucket never adjacent
    return Math.abs(ci - ai) <= 1;               // same or neighbouring bucket
  },
};

/**
 * Plausible, non-obvious distractors. Ranks the pool by how many of the
 * requested cohort predicates each candidate shares with `answerRow`, so wrong
 * options resemble the right one; ties broken randomly. Dedupes by display
 * value, excludes `answerValue`, and — because zero-score candidates remain in
 * the ranked list — naturally falls back to random fill to reach `n`.
 *
 * opts: { n, value:(row)=>displayString, answerValue, answerRow, cohorts:[names] }
 * Returns up to `n` unique display strings, most-plausible first.
 */
export function plausibleDistractors(pool, { n, value = r => r, answerValue, answerRow, cohorts = [] } = {}) {
  const preds = (cohorts || []).map(name => COHORT_PREDICATES[name]).filter(Boolean);

  const scored = [];
  for (const row of pool) {
    let v;
    try { v = value(row); } catch { continue; }
    if (v === '' || v == null) continue;
    if (v === answerValue) continue;
    let score = 0;
    if (answerRow) {
      for (const p of preds) {
        try { if (p(row, answerRow)) score++; } catch { /* ignore malformed field */ }
      }
    }
    scored.push({ v, score, rand: Math.random() });
  }

  // most shared cohorts first; random tie-break keeps score-0 fill random too.
  scored.sort((x, y) => (y.score - x.score) || (x.rand - y.rand));

  const out = [], seen = new Set();
  for (const s of scored) {
    if (seen.has(s.v)) continue;
    seen.add(s.v);
    out.push(s.v);
    if (out.length >= n) break;
  }
  return out;
}

/** Count rows per distinct value of `field`. Map(value -> count); blanks skipped. */
export function countBy(rows, field) {
  const m = new Map();
  for (const r of rows) {
    const k = r[field];
    if (k === '' || k == null) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/** Sum a weight per distinct value of `field`. Map(value -> sum); blanks skipped, null weights -> 0. */
export function sumBy(rows, field, weightFn = r => r.capUSD || 0) {
  const m = new Map();
  for (const r of rows) {
    const k = r[field];
    if (k === '' || k == null) continue;
    const w = weightFn(r) || 0;
    m.set(k, (m.get(k) || 0) + w);
  }
  return m;
}

/** Top-n groups of `field` by summed weight, descending: [{ key, total }]. */
export function topGroups(rows, field, n, weightFn) {
  const m = sumBy(rows, field, weightFn);
  return [...m.entries()]
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}
