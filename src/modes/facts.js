// facts.js — "Universe Facts": currencies (both directions), country ISO codes,
// the sector↔industry map, GICS codes, exchanges, and live aggregates (biggest
// sector by cap, most-listed country, biggest industry in a sector).
//
// Two-phase, like the other modes:
//   buildItems(ctx, cfg)  -> items[]   (each tagged _type:'facts', guards applied)
//   makeQuestion(item,ctx) -> question object (renders under mc/tf/type/flip)
//
// Design rules honoured (Wave 3 addendum):
//   • Currency answers are DE-OBVIOUSED: the country-derived word is stripped and
//     the ISO is always appended, e.g. "Ringgit (MYR)", "Dollar (AUD)".
//   • Every MC-style item supplies up to 7 plausible, deduped distractors; the
//     min-distractor guard skips any item that cannot meet its threshold.
//   • The shared filter (cfg.region / iso2 / gsector / gindustry) scopes both the
//     fact roster and the live aggregates.

import { nice } from '../data/schema.js';
import { plausibleDistractors, sample, filter, countBy, topGroups, uniques } from '../data/query.js';
import { flagName, countryName } from '../lib/fx.js';

// User-facing topic keys (the config chips). Kinds each topic emits are noted.
// NOTE: the trivial per-country "region roster" topic has been dropped.
const TOPICS = {
  currency: 'Currencies',          // kinds: currency, curword
  isocode: 'Country codes',        // kinds: isocode
  sectormap: 'Sector → Industry',  // kinds: sectormap
  sectorcode: 'GICS codes',        // kinds: sectorcode
  exchange: 'Exchanges',           // kinds: exchange
  sectorcap: 'Sector heavyweights',// kinds: sectorcap
  counts: 'Population counts',      // kinds: countcountry, countindustry
};
export const FACT_TOPICS = TOPICS;

// Distractor thresholds. Open answer-spaces demand 7; small answer-spaces (GICS
// codes, sectors, same-country exchanges) are relaxed per the addendum.
const MIN_OPEN = 7;
const MIN_SMALL = 3;
const WANT = 7;               // supply up to 7; the runner slices to mcCount-1.

// ---------------------------------------------------------------------------
// Currency helpers — strip country-derived words, always disambiguate by ISO.
// ---------------------------------------------------------------------------

// Irregular demonyms whose stem does NOT prefix-match the country name.
// Keyed by a lowercase substring of the country name.
const DEMONYM_IRREGULARS = [
  { match: 'denmark',        strip: ['danish'] },
  { match: 'switzerland',    strip: ['swiss'] },
  { match: 'united kingdom', strip: ['british'] },
  { match: 'united states',  strip: ['us', 'american'] },
];

const alnum = w => (w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const commonPrefix = (a, b) => {
  let i = 0; const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  return i;
};

/**
 * Remove words in `currencyName` that derive from `countryName` (name or demonym)
 * so the answer no longer names its own country. Match rule: a currency word is
 * dropped if it exactly equals a country word, shares a >=4-char prefix with one
 * (covers demonyms: Australian↔Australia, Japanese↔Japan, Canadian↔Canada), or is
 * a listed irregular (Swiss, British, US…). If everything strips, keep the last
 * word so we never return empty.
 */
export function stripCountryWords(currencyName, countryName) {
  const name = (currencyName || '').trim();
  if (!name) return '';
  const countryWords = (countryName || '').split(/\s+/).map(alnum).filter(w => w.length >= 3);
  const irregular = new Set();
  const cLower = (countryName || '').toLowerCase();
  for (const r of DEMONYM_IRREGULARS)
    if (cLower.includes(r.match)) r.strip.forEach(w => irregular.add(w));

  const isCountryWord = raw => {
    const w = alnum(raw);
    if (!w) return false;
    if (irregular.has(w)) return true;
    for (const cw of countryWords) {
      if (w === cw) return true;
      if (commonPrefix(w, cw) >= 4) return true;   // demonym / inflection
    }
    return false;
  };

  const words = name.split(/\s+/);
  const kept = words.filter(w => !isCountryWord(w));
  const out = (kept.length ? kept : [words[words.length - 1]]).join(' ').trim();
  return out.replace(/\s{2,}/g, ' ');
}

// Answer form for the currency question: "Ringgit (MYR)". Always ISO-tagged so
// shared words (Dollar/Peso/Franc/Krone) stay distinguishable.
const currencyDisplay = c => `${stripCountryWords(c.currency, c.name)} (${c.currency_iso})`;
// Bare stripped word for the reverse (curword) question: "Ringgit".
const currencyWord = c => stripCountryWords(c.currency, c.name);

// ---------------------------------------------------------------------------
// Small scope utilities.
// ---------------------------------------------------------------------------

const sharedOf = cfg => ({
  region: cfg.region, iso2: cfg.iso2, gsector: cfg.gsector, gindustry: cfg.gindustry,
});
const hasAnyFilter = s => !!(s.region || s.iso2 || s.gsector || s.gindustry);

/** Human label for a scope filter ("Europe", "🇯🇵 Japan", "Financials", or a combo). */
function scopeLabel(ref, s) {
  const parts = [];
  if (s.iso2) parts.push(flagName(s.iso2));
  if (s.region && !s.iso2) {
    const r = (ref.regions || []).find(x => x.key === s.region);
    parts.push(r ? r.name : s.region);
  }
  if (s.gsector) parts.push(nice(s.gsector));
  if (s.gindustry) parts.push(nice(s.gindustry));
  return parts.length ? parts.join(' · ') : 'the universe';
}

// ---------------------------------------------------------------------------
// buildItems — emit guarded items. Second arg is cfg {topics, region, iso2, …};
// legacy callers may still pass a bare topics array.
// ---------------------------------------------------------------------------

export function buildItems(ctx, cfg = {}) {
  const { reference } = ctx;
  const isArr = Array.isArray(cfg);
  const topics = isArr ? cfg : (cfg.topics && cfg.topics.length ? cfg.topics : Object.keys(TOPICS));
  const opt = isArr ? {} : cfg;
  const shared = sharedOf(opt);
  const want = t => topics.includes(t);

  // Countries in scope for the reference-fact roster (currency / isocode / exchange).
  const countriesInScope = reference.countries.filter(c =>
    (!shared.region || c.region === shared.region) &&
    (!shared.iso2 || c.iso2 === shared.iso2));

  const items = [];
  const tag = it => (it._type = 'facts', it);

  // --- currency + curword ---
  if (want('currency')) {
    // currency: one per in-scope country that has an ISO currency.
    countriesInScope.filter(c => c.currency_iso)
      .forEach(c => items.push(tag({ id: 'cur:' + c.iso2, kind: 'currency', data: c })));
    // curword: one per DISTINCT currency in scope (reverse lookup, code -> word).
    const seen = new Set();
    countriesInScope.filter(c => c.currency_iso).forEach(c => {
      if (seen.has(c.currency_iso)) return;
      seen.add(c.currency_iso);
      items.push(tag({ id: 'curw:' + c.currency_iso, kind: 'curword', data: c }));
    });
  }

  // --- isocode ---
  if (want('isocode'))
    countriesInScope.forEach(c => items.push(tag({ id: 'iso:' + c.iso2, kind: 'isocode', data: c })));

  // --- sectormap (industry -> sector) ---
  if (want('sectormap'))
    reference.industries
      .filter(g => !shared.gsector || g.sector === shared.gsector)
      .forEach(g => items.push(tag({ id: 'map:' + g.key, kind: 'sectormap', data: g })));

  // --- sectorcode (GICS) ---
  if (want('sectorcode'))
    reference.sectors
      .filter(s => !shared.gsector || s.key === shared.gsector)
      .forEach(s => items.push(tag({ id: 'code:' + s.key, kind: 'sectorcode', data: s })));

  // --- exchange: only countries with >=4 distinct exchanges (same-country distractors) ---
  if (want('exchange'))
    countriesInScope
      .filter(c => (ctx.exchByCountry?.[c.iso2] || []).length >= 4)
      .forEach(c => items.push(tag({ id: 'exc:' + c.iso2, kind: 'exchange', data: c })));

  // --- live aggregates: sectorcap + population counts ---
  const needAgg = want('sectorcap') || want('counts');
  if (needAgg) {
    // Build the scope list. A filtered run yields one scope; an unfiltered run
    // fans out to the universe plus each region present (for variety).
    const scopes = [];
    if (hasAnyFilter(shared)) {
      scopes.push({ filter: shared, label: scopeLabel(reference, shared) });
    } else {
      scopes.push({ filter: {}, label: 'the universe' });
      for (const rk of uniques(ctx.universe, 'region')) {
        const r = (reference.regions || []).find(x => x.key === rk);
        scopes.push({ filter: { region: rk }, label: r ? r.name : rk });
      }
    }

    for (const sc of scopes) {
      const rows = filter(ctx.universe, sc.filter);
      if (want('sectorcap')) {
        // Emit only if >=2 sectors carry cap in scope (a real contest).
        const secs = [...countBy(rows.filter(r => r.capUSD != null), 'gsector').keys()];
        if (secs.length >= 2)
          items.push(tag({ id: 'scap:' + (sc.label), kind: 'sectorcap', scope: sc.filter, label: sc.label }));
      }
      if (want('counts')) {
        const nCountries = [...countBy(rows, 'iso2').keys()].length;
        if (nCountries >= 2)
          items.push(tag({ id: 'cco:' + (sc.label), kind: 'countcountry', scope: sc.filter, label: sc.label }));
      }
    }

    // countindustry: one per sector (in scope) that has >=2 industries present.
    if (want('counts')) {
      const base = filter(ctx.universe, shared);
      const secList = shared.gsector ? [shared.gsector] : [...countBy(base, 'gsector').keys()];
      for (const sec of secList) {
        const rows = base.filter(r => r.gsector === sec);
        const inds = [...countBy(rows, 'gindustry').keys()];
        if (inds.length >= 2)
          items.push(tag({ id: 'cind:' + sec, kind: 'countindustry', sector: sec, scope: shared }));
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// makeQuestion — dispatch by kind. Distractors regenerate per render.
// ---------------------------------------------------------------------------

export function makeQuestion(item, ctx) {
  const { reference } = ctx;
  const d = item.data;

  switch (item.kind) {

    // ---- currency: country -> "Word (ISO)" ----
    case 'currency': {
      const ans = currencyDisplay(d);
      const pool = reference.countries.filter(c => c.currency_iso && c.currency_iso !== d.currency_iso);
      const wrong = plausibleDistractors(pool, {
        n: WANT, value: currencyDisplay, answerValue: ans, answerRow: d, cohorts: ['region'],
      });
      const trueWord = currencyWord(d);
      // A false statement must use a genuinely different WORD — skip distractors
      // that share the answer's word (e.g. another "Dollar") so TF stays unambiguous.
      const wordOf = s => s.replace(/\s*\([A-Z]{3}\)$/, '');
      const falseWord = wordOf(wrong.find(w => wordOf(w) !== trueWord) || wrong[0]);
      return {
        kicker: 'Currency', sector: 'communication_services',
        question: `What currency does <b>${d.flag} ${d.name}</b> use?`,
        answer: ans, distractors: wrong,
        tfTrue: `${d.name} uses the ${trueWord}.`,
        tfFalse: `${d.name} uses the ${falseWord}.`,
        hint: `ISO code starts with "${d.currency_iso[0]}".`,
        expl: `${d.name} → ${d.currency} (${d.currency_iso}).`,
        back: [['country', `${d.flag} ${d.name}`], ['currency', ans]],
      };
    }

    // ---- curword: code -> word (reverse) ----
    case 'curword': {
      const ans = currencyWord(d);
      const pool = reference.countries.filter(c => c.currency_iso && c.currency_iso !== d.currency_iso);
      const wrong = plausibleDistractors(pool, {
        n: WANT, value: currencyWord, answerValue: ans, answerRow: d, cohorts: ['region'],
      });
      return {
        kicker: 'Currency code', sector: 'communication_services',
        question: `What is the currency named for the code <b>${d.currency_iso}</b>?`,
        answer: ans, distractors: wrong,
        tfTrue: `${d.currency_iso} is the ${ans}.`,
        tfFalse: `${d.currency_iso} is the ${wrong[0]}.`,
        hint: `Used in ${d.flag} ${d.name}.`,
        expl: `${d.currency_iso} → ${d.currency}.`,
        back: [['code', d.currency_iso], ['currency', ans], ['country', `${d.flag} ${d.name}`]],
      };
    }

    // ---- isocode: ISO-2 -> country ----
    case 'isocode': {
      const ans = d.name;
      const pool = reference.countries.filter(c => c.iso2 !== d.iso2);
      const wrong = plausibleDistractors(pool, {
        n: WANT, value: c => c.name, answerValue: ans, answerRow: d, cohorts: ['region'],
      });
      return {
        kicker: 'Country code', sector: '',
        question: `Which country has ISO country-code <b>${d.iso2}</b>?`,
        answer: ans, distractors: wrong,
        tfTrue: `ISO code ${d.iso2} is ${d.name}.`,
        tfFalse: `ISO code ${d.iso2} is ${wrong[0]}.`,
        hint: `${d.flag} — in ${d.region_name}.`,
        expl: `${d.iso2} → ${d.flag} ${d.name}.`,
        back: [['code', d.iso2], ['country', `${d.flag} ${d.name}`]],
      };
    }

    // ---- sectormap: industry -> sector ----
    case 'sectormap': {
      const ans = nice(d.sector);
      const pool = reference.sectors.filter(s => s.key !== d.sector);
      const wrong = plausibleDistractors(pool, { n: WANT, value: s => s.name, answerValue: ans });
      return {
        kicker: 'Sector map', sector: d.sector,
        question: `<b>${nice(d.key)}</b> sits in which sector?`,
        answer: ans, distractors: wrong,
        tfTrue: `${nice(d.key)} is in ${ans}.`,
        tfFalse: `${nice(d.key)} is in ${wrong[0]}.`,   // a real, plausible wrong sector
        hint: `Think about what these companies actually sell.`,
        expl: `${nice(d.key)} maps to ${ans}.`,
        back: [['industry', nice(d.key)], ['sector', ans]],
      };
    }

    // ---- sectorcode: sector -> GICS num · code (small answer space) ----
    case 'sectorcode': {
      const ans = `${d.num} · ${d.code}`;
      const pool = reference.sectors.filter(s => s.key !== d.key);
      const wrong = plausibleDistractors(pool, { n: WANT, value: s => `${s.num} · ${s.code}`, answerValue: ans });
      return {
        kicker: 'GICS code', sector: d.key,
        question: `Which GICS sector code is <b>${d.name}</b>?`,
        answer: ans, distractors: wrong,
        tfTrue: `${d.name} is GICS ${d.num} (${d.code}).`,
        tfFalse: `${d.name} is GICS ${wrong[0]}.`,
        hint: `Codes run 10–60 in steps of 5.`,
        expl: `${d.name} = GICS ${d.num}, 4-letter code ${d.code}.`,
        back: [['sector', d.name], ['GICS', ans]],
      };
    }

    // ---- exchange: country -> busiest exchange, SAME-COUNTRY distractors ----
    case 'exchange': {
      const exchanges = ctx.exchByCountry[d.iso2] || [];
      const primary = exchanges[0];
      const wrong = sample(exchanges.slice(1), Math.min(WANT, exchanges.length - 1));
      return {
        kicker: 'Exchange', sector: '',
        question: `Which exchange lists the most <b>${d.flag} ${d.name}</b> stocks?`,
        answer: primary, distractors: wrong,
        tfTrue: `${primary} lists the most ${d.name} stocks here.`,
        tfFalse: `${wrong[0]} lists the most ${d.name} stocks here.`,
        hint: `${exchanges.length} distinct exchanges for ${d.name} in the data.`,
        expl: `Most ${d.name} names here trade on ${primary}.`,
        back: [['country', `${d.flag} ${d.name}`], ['exchange', primary]],
      };
    }

    // ---- sectorcap: biggest sector by total cap in scope ----
    case 'sectorcap': {
      const rows = filter(ctx.universe, item.scope || {});
      const top = topGroups(rows, 'gsector', 1, r => r.capUSD || 0)[0];
      const ansKey = top ? top.key : null;
      const ans = ansKey ? nice(ansKey) : '—';
      const pool = reference.sectors.filter(s => s.key !== ansKey);
      const wrong = plausibleDistractors(pool, { n: WANT, value: s => s.name, answerValue: ans });
      return {
        kicker: 'Sector weight', sector: ansKey || '',
        question: `Which sector has the largest total market cap in <b>${item.label}</b>?`,
        answer: ans, distractors: wrong,
        tfTrue: `${ans} is the biggest sector by cap in ${item.label}.`,
        tfFalse: `${wrong[0]} is the biggest sector by cap in ${item.label}.`,
        hint: `Sum every company's market cap, then compare sectors.`,
        expl: `In ${item.label}, ${ans} carries the largest combined market cap.`,
        back: [['scope', item.label], ['biggest sector', ans]],
      };
    }

    // ---- countcountry: most-listed country in scope ----
    case 'countcountry': {
      const rows = filter(ctx.universe, item.scope || {});
      const counts = countBy(rows, 'iso2');
      const winIso = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const winRow = reference.countries.find(c => c.iso2 === winIso) || { iso2: winIso, region: null };
      const ans = countryName(winIso);
      const pool = reference.countries.filter(c => c.iso2 !== winIso);
      const wrong = plausibleDistractors(pool, {
        n: WANT, value: c => c.name, answerValue: ans, answerRow: winRow, cohorts: ['region'],
      });
      return {
        kicker: 'Country roster', sector: '',
        question: `Which country lists the most stocks in <b>${item.label}</b>?`,
        answer: ans, distractors: wrong,
        tfTrue: `${ans} lists the most stocks in ${item.label}.`,
        tfFalse: `${wrong[0]} lists the most stocks in ${item.label}.`,
        hint: `${flagName(winIso)} — count the listings, don't weight by size.`,
        expl: `${flagName(winIso)} has the most listed names in ${item.label}.`,
        back: [['scope', item.label], ['most listings', flagName(winIso)]],
      };
    }

    // ---- countindustry: biggest industry (by count) within a sector ----
    case 'countindustry': {
      const sec = item.sector;
      const rows = filter(ctx.universe, { ...(item.scope || {}), gsector: sec });
      const counts = countBy(rows, 'gindustry');
      const winKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const ans = winKey ? nice(winKey) : '—';
      // Distractors: sibling industries first (cohort 'sector'), then any industry.
      const pool = reference.industries
        .filter(g => g.key !== winKey)
        .map(g => ({ key: g.key, gsector: g.sector }));   // shape for the 'sector' cohort
      const wrong = plausibleDistractors(pool, {
        n: WANT, value: g => nice(g.key), answerValue: ans,
        answerRow: { gsector: sec }, cohorts: ['sector'],
      });
      return {
        kicker: 'Industry count', sector: sec,
        question: `Which industry has the most companies in <b>${nice(sec)}</b>?`,
        answer: ans, distractors: wrong,
        tfTrue: `${ans} has the most companies in ${nice(sec)}.`,
        tfFalse: `${wrong[0]} has the most companies in ${nice(sec)}.`,
        hint: `Count the names in each ${nice(sec)} industry.`,
        expl: `Within ${nice(sec)}, ${ans} holds the most companies.`,
        back: [['sector', nice(sec)], ['biggest industry', ans]],
      };
    }

    default:
      // Unknown kind — surface loudly rather than render a broken card.
      throw new Error(`facts.makeQuestion: unknown kind "${item.kind}"`);
  }
}

// Exposed for callers/tests that want the guard thresholds.
export const FACT_MIN = { open: MIN_OPEN, small: MIN_SMALL };
