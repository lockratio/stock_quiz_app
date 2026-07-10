// idcard.js — "Stock Universe". A stock's identity card: shown one facet
// (bare ticker or company name) the player recalls another — name, ticker,
// industry, sector, country, or market-cap tier. Pure question factory.
//
// Design rules (Wave 3):
//  - Every non-`name` prompt references the company NAME, never the raw ticker.
//  - `name` shows the bare `symbol` and asks for the name (typeahead on).
//  - `ticker` shows the name and asks for the `symbol` (no typeahead — tickers
//    are short, a dropdown adds nothing).
//  - Distractors are cohort-plausible via query.plausibleDistractors (up to 7,
//    the runner slices to mcCount-1). Min-distractor guard skips an ask whose
//    in-scope pool can't supply enough deduped options; small answer spaces
//    (cap tiers, GICS sectors) relax to "as many as exist".

import { nice } from '../data/schema.js';
import { filter, plausibleDistractors } from '../data/query.js';
import { flagName } from '../lib/fx.js';

const OPTIONS_WANTED = 7;   // supply up to 7; runner slices to mcCount-1

// Each ASK variant declares: what the card FRONT displays, the prompt text
// (name-referencing for every variant except `name` itself), the correct
// answer, the cohort predicates that make wrong options plausible, a
// non-leaking hint, whether type-ahead applies, and whether it is a small
// answer space (relaxes the min-distractor guard).
const ASK = {
  name: {
    kicker:    'Stock Universe · Name',
    display:   s => s.symbol,                       // front = bare ticker
    prompt:    () => 'Name the company',
    answer:    s => s.name,
    cohorts:   ['region', 'numeric', 'firstLetter', 'sector'],
    hint:      s => `A ${nice(s.gsector)} name from ${flagName(s.iso2)}.`,
    typeahead: true,
    smallSpace: false,
  },
  ticker: {
    kicker:    'Stock Universe · Ticker',
    display:   s => s.name,                          // front = company name
    prompt:    s => `What's the ticker symbol for ${s.name}?`,
    answer:    s => s.symbol,
    cohorts:   ['numeric', 'firstLetter', 'region'],
    hint:      s => `A ${nice(s.gsector)} name from ${flagName(s.iso2)}.`,
    typeahead: false,
    smallSpace: false,
  },
  industry: {
    kicker:    'Stock Universe · Industry',
    display:   s => s.name,
    prompt:    s => `Which industry is ${s.name} in?`,
    answer:    s => nice(s.gindustry),
    cohorts:   ['sector'],                           // sibling industries
    hint:      s => `A ${s.bucketShort} name from ${flagName(s.iso2)}.`,
    typeahead: false,
    smallSpace: false,
  },
  sector: {
    kicker:    'Stock Universe · Sector',
    display:   s => s.name,
    prompt:    s => `Which sector is ${s.name} in?`,
    answer:    s => nice(s.gsector),
    cohorts:   ['region'],
    hint:      s => `Ticker "${s.symbol}", based in ${flagName(s.iso2)}.`,
    typeahead: false,
    smallSpace: true,                                // ~11 GICS sectors
  },
  country: {
    kicker:    'Stock Universe · Country',
    display:   s => s.name,
    prompt:    s => `Which country is ${s.name} based in?`,
    answer:    s => flagName(s.iso2),
    cohorts:   ['region'],                           // same-region countries
    hint:      s => `A ${nice(s.gsector)} name, ticker "${s.symbol}".`,
    typeahead: false,
    smallSpace: false,
  },
  cap: {
    kicker:    'Stock Universe · Cap tier',
    display:   s => s.name,
    prompt:    s => `Which market-cap tier is ${s.name}?`,
    answer:    s => s.bucketShort,
    cohorts:   ['capBucket'],                        // adjacent tiers
    hint:      s => `A ${nice(s.gindustry)} name from ${flagName(s.iso2)}.`,
    typeahead: false,
    smallSpace: true,                                // 7 cap tiers
  },
};
export const ID_ASK = ASK;
export const ID_ASK_KEYS = Object.keys(ASK);

/** The shared-filter slice of a cfg (region/iso2/gsector/gindustry) + indexCode. */
function scopeOf(cfg) {
  return {
    indexCode: cfg.indexCode,
    gsector:   cfg.gsector,
    gindustry: cfg.gindustry,
    iso2:      cfg.iso2,
    region:    cfg.region,
  };
}

export function buildItems(ctx, cfg = {}) {
  const ask = cfg.ask && ASK[cfg.ask] ? cfg.ask : 'name';
  const spec = ASK[ask];
  const scope = scopeOf(cfg);

  let rows = filter(ctx.universe, scope);
  rows = rows.filter(s => {
    if (!s.name || !s.symbol) return false;
    const a = spec.answer(s);
    return a != null && a !== '' && a !== '—';
  });
  if (rows.length === 0) return [];

  // Min-distractor guard. `plausibleDistractors` fills from the in-scope pool,
  // so an ask can produce OPTIONS_WANTED distractors iff the pool holds at
  // least that many distinct answer values besides the answer itself. Small
  // answer spaces (cap/sector) relax to "supply whatever exists" (need >=2).
  const distinct = new Set(rows.map(spec.answer)).size;
  const minDistinct = spec.smallSpace ? 2 : OPTIONS_WANTED + 1;
  if (distinct < minDistinct) return [];

  return rows.map(s => ({ _type: 'idcard', id: 'card:' + s.qaid, data: s, ask, scope }));
}

export function makeQuestion(item, ctx) {
  const s = item.data;
  const spec = ASK[item.ask] || ASK.name;
  const answer = spec.answer(s);
  const front = spec.display(s);

  // Distractors are drawn from the SAME in-scope pool the item came from, so a
  // region- or sector-scoped quiz keeps its options in scope; cohorts then rank
  // the most look-alike candidates first.
  const pool = filter(ctx.universe, item.scope || {}).filter(x => x.qaid !== s.qaid);
  const wrong = plausibleDistractors(pool, {
    n: OPTIONS_WANTED,
    value: spec.answer,
    answerValue: answer,
    answerRow: s,
    cohorts: spec.cohorts,
  });
  const w1 = wrong[0] || answer;

  const q = {
    _type: 'idcard',
    kicker: spec.kicker,
    sector: s.gsector,
    big: true,
    display: front,                    // large card front
    question: spec.prompt(s),          // prompt above the card
    answer,
    distractors: wrong,                // up to 7; runner slices to mcCount-1
    sub: `${nice(s.gindustry)} · ${flagName(s.iso2)} · ${s.bucketShort}`,
    back: [
      ['company', s.name], ['ticker', s.symbol],
      ['sector', nice(s.gsector)], ['industry', nice(s.gindustry)],
      ['country', flagName(s.iso2)], ['cap', s.bucketShort],
    ],
    tfTrue:  `${front} → ${answer}.`,
    tfFalse: `${front} → ${w1}.`,
    hint: spec.hint(s),
    expl: `${s.symbol} = ${s.name} · ${nice(s.gsector)} · ${nice(s.gindustry)} · ${flagName(s.iso2)}.`,
  };
  if (spec.typeahead) q.typeahead = true;   // only the `name` ask
  return q;
}
