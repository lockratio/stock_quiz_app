// flashcards.js — "Custom Flashcards": pick any column as the front (question)
// and one or more as the back (answer). Fully data-driven over the universe.

import { nice, capBucketShort } from '../data/schema.js';
import { distractors, shuffle } from '../data/query.js';
import { flagName } from '../lib/fx.js';

// Selectable columns -> {label, value(stock)}
export const COLUMNS = {
  ticker:     { label: 'Ticker',    val: s => s.ticker },
  name:       { label: 'Company',   val: s => s.name },
  gindustry:  { label: 'Industry',  val: s => nice(s.gindustry) },
  gsector:    { label: 'Sector',    val: s => nice(s.gsector) },
  country:    { label: 'Country',   val: s => flagName(s.iso2) },
  exchange:   { label: 'Exchange',  val: s => s.exchange },
  cap:        { label: 'Cap bucket',val: s => capBucketShort(s.capAUD) },
  currency:   { label: 'Currency',  val: s => s.currencyIso },
};

export function buildItems(ctx, cfg = {}) {
  const rows = ctx.universe.filter(s => s.name && s.ticker);
  const front = cfg.front || 'ticker';
  const back = (cfg.back && cfg.back.length) ? cfg.back : ['name'];
  return rows.map(s => ({ id: 'flash:' + s.qaid, data: s, front, back }));
}

export function makeQuestion(item, ctx) {
  const s = item.data;
  const front = COLUMNS[item.front] || COLUMNS.ticker;
  const backCols = item.back.map(k => COLUMNS[k]).filter(Boolean);
  const primary = backCols[0] || COLUMNS.name;
  const answer = primary.val(s);
  const pool = ctx.universe.filter(x => x.qaid !== s.qaid);
  const wrong = distractors(pool, 3, x => primary.val(x) === answer, x => primary.val(x));
  return {
    kicker: `Flashcard · front = ${front.label}`, sector: s.gsector, big: true,
    display: front.val(s),
    question: front.val(s),
    answer, distractors: wrong,
    back: backCols.map(c => [c.label.toLowerCase(), c.val(s)]),
    tfTrue: `${front.val(s)} → ${answer}.`,
    tfFalse: `${front.val(s)} → ${wrong[0] || primary.val(pool[0])}.`,
    hint: `${nice(s.gsector)} sector.`,
    expl: `${front.val(s)} → ${answer}.`,
  };
}
