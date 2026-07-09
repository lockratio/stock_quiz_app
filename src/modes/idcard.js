// idcard.js — "Stock Universe": from a ticker (large, the card FRONT), recall
// the company name / industry / country / cap bucket. Pure question factory.

import { nice, capBucket, capBucketShort } from '../data/schema.js';
import { filter, distractors, shuffle } from '../data/query.js';
import { flagName } from '../lib/fx.js';

// what the player is asked to recall
const ASK = {
  name:     { label: 'Name the company', field: s => s.name,               kicker: s => `Stock ID · ${s.ticker}` },
  industry: { label: 'Which industry?',  field: s => nice(s.gindustry),    kicker: s => `Industry · ${s.ticker}` },
  country:  { label: 'Which country?',   field: s => flagName(s.iso2),     kicker: s => `Country · ${s.ticker}` },
  cap:      { label: 'Which cap bucket?',field: s => capBucketShort(s.capAUD), kicker: s => `Cap bucket · ${s.ticker}` },
};
export const ID_ASK = ASK;

export function buildItems(ctx, cfg = {}) {
  let rows = filter(ctx.universe, {
    indexCode: cfg.indexCode, gsector: cfg.gsector, region: cfg.region,
  });
  rows = rows.filter(s => s.name && s.ticker);
  return rows.map(s => ({ id: 'card:' + s.qaid, data: s, ask: cfg.ask || 'name' }));
}

export function makeQuestion(item, ctx) {
  const s = item.data;
  const spec = ASK[item.ask] || ASK.name;
  const answer = spec.field(s);
  const pool = ctx.universe.filter(x => x.qaid !== s.qaid);
  const wrong = distractors(pool, 3, x => spec.field(x) === answer, x => spec.field(x));
  const w1 = wrong[0] || spec.field(pool[0]);
  return {
    kicker: spec.kicker(s), sector: s.gsector, big: true,
    display: s.ticker,               // large card front
    question: spec.label,            // small prompt above the card
    answer, distractors: wrong,
    sub: `${nice(s.gindustry)} · ${flagName(s.iso2)} · ${capBucketShort(s.capAUD)}`,
    back: [
      ['company', s.name], ['industry', nice(s.gindustry)],
      ['country', flagName(s.iso2)], ['cap', capBucketShort(s.capAUD)],
    ],
    tfTrue: `${s.ticker} → ${answer}.`,
    tfFalse: `${s.ticker} → ${w1}.`,
    hint: `A ${(capBucket(s.capAUD)?.label || '—')} name from ${flagName(s.iso2)}.`,
    expl: `${s.ticker} = ${s.name} · ${nice(s.gindustry)} · ${flagName(s.iso2)}.`,
  };
}
