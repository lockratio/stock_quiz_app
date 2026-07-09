// fuzzy.js — typo-tolerant string matching (Dice bigram coefficient)
// Ported/extracted from the sketch's dice()/normz(); used by leaderboard + type-in.

export function normz(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Sørensen–Dice coefficient on character bigrams. Returns 0..1. */
export function dice(a, b) {
  a = normz(a); b = normz(b);
  if (a === b) return a ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = s => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.substr(i, 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, tot = 0;
  A.forEach((c, g) => { tot += c; if (B.has(g)) inter += Math.min(c, B.get(g)); });
  B.forEach(c => tot += c);
  return tot ? (2 * inter) / tot : 0;
}

/**
 * Best fuzzy match of `query` against `candidates`.
 * keyFns: array of functions mapping a candidate -> a string to score against.
 * Returns { item, score, matched } where matched is true if score >= threshold.
 */
export function bestMatch(query, candidates, keyFns, threshold = 0.9) {
  let best = null, bestScore = 0;
  for (const item of candidates) {
    for (const kf of keyFns) {
      const s = dice(query, kf(item));
      if (s > bestScore) { bestScore = s; best = item; }
    }
  }
  return { item: best, score: bestScore, matched: bestScore >= threshold };
}
