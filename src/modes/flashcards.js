// flashcards.js — "Custom Flashcards": pick any column as the front (question)
// and one or more as the back (answer). Fully data-driven over the universe.

import { nice } from '../data/schema.js';
import { plausibleDistractors, filter } from '../data/query.js';
import { flagName } from '../lib/fx.js';

// Selectable columns -> {label, value(stock)}
export const COLUMNS = {
  ticker:     { label: 'Ticker',    val: s => s.symbol },        // bare stripped symbol (e.g. "1929", "BHP")
  name:       { label: 'Company',   val: s => s.name },
  gindustry:  { label: 'Industry',  val: s => nice(s.gindustry) },
  gsector:    { label: 'Sector',    val: s => nice(s.gsector) },
  country:    { label: 'Country',   val: s => flagName(s.iso2) },
  exchange:   { label: 'Exchange',  val: s => s.exchange },
  cap:        { label: 'Cap bucket',val: s => s.bucketShort },
  currency:   { label: 'Currency',  val: s => s.currencyIso },
};

// Cohorts fed to plausibleDistractors, keyed by the PRIMARY back column.
// Any column not listed here falls back to random distractors ([]).
const BACK_COHORTS = {
  name:      ['region', 'numeric', 'firstLetter'],
  gindustry: ['sector'],
  country:   ['region'],
  cap:       ['capBucket'],
};

const OPTIONS_WANTED = 7;   // return up to 7 distractors; runner slices to mcCount-1
const GUARD_MIN = 3;        // min distinct distractors for a viable MC (smallest mcCount-1)

// Only the shared cross-mode filter keys (empty/absent = no constraint).
const filterSpecOf = cfg => ({
  region:    cfg.region,
  iso2:      cfg.iso2,
  gsector:   cfg.gsector,
  gindustry: cfg.gindustry,
});

export function buildItems(ctx, cfg = {}) {
  const front = cfg.front || 'ticker';
  const back = (cfg.back && cfg.back.length) ? cfg.back : ['name'];

  const filterSpec = filterSpecOf(cfg);
  const rows = filter(ctx.universe, filterSpec).filter(s => s.name && s.symbol);

  // Min-distractor guard: the primary back column is identical for every item,
  // so the pool of distinct answer values is shared. If it can't supply enough
  // deduped distractors to fill even the smallest MC, skip the whole set rather
  // than emit a degenerate "only a few possible answers" question.
  const primaryKey = (back.find(k => COLUMNS[k])) || 'name';
  const primaryCol = COLUMNS[primaryKey];
  const distinct = new Set();
  for (const r of rows) {
    const v = primaryCol.val(r);
    if (v !== '' && v != null) distinct.add(v);
  }
  if (distinct.size - 1 < GUARD_MIN) return [];   // -1: exclude the answer itself

  return rows.map(s => ({
    _type: 'flash',
    id: 'flash:' + s.qaid,
    data: s,
    front,
    back,
    filterSpec,
  }));
}

export function makeQuestion(item, ctx) {
  const s = item.data;
  const front = COLUMNS[item.front] || COLUMNS.ticker;

  const validBack = item.back.filter(k => COLUMNS[k]);
  const primaryKey = validBack[0] || 'name';
  const primary = COLUMNS[primaryKey];
  const backCols = validBack.map(k => COLUMNS[k]);

  const answer = primary.val(s);
  const cohorts = BACK_COHORTS[primaryKey] || [];   // unlisted -> random distractors

  const pool = filter(ctx.universe, item.filterSpec || {}).filter(x => x.qaid !== s.qaid);
  const wrong = plausibleDistractors(pool, {
    n: OPTIONS_WANTED,
    value: x => primary.val(x),
    answerValue: answer,
    answerRow: s,
    cohorts,
  });

  return {
    kicker: `Flashcard · front = ${front.label}`, sector: s.gsector, big: true,
    display: front.val(s),
    question: front.val(s),
    answer, distractors: wrong,
    optionsWanted: OPTIONS_WANTED,
    typeahead: primaryKey === 'name',   // company-name answers get the type-ahead dropdown
    back: backCols.map(c => [c.label.toLowerCase(), c.val(s)]),
    tfTrue: `${front.val(s)} → ${answer}.`,
    tfFalse: `${front.val(s)} → ${wrong[0] || (pool[0] && primary.val(pool[0])) || answer}.`,
    hint: `${nice(s.gsector)} sector.`,
    expl: `${front.val(s)} → ${answer}.`,
    _type: 'flash',
  };
}
