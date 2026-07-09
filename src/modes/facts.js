// facts.js — "Universe Facts": currencies, sector↔industry map, GICS codes,
// exchanges, regions. Pure question factory; the runner renders the answer style.
// buildItems(ctx) -> items[] ; makeQuestion(item, ctx) -> question object.

import { nice } from '../data/schema.js';
import { sample } from '../data/query.js';

const TOPICS = {
  currency: 'Currencies',
  sectormap: 'Sector → Industry',
  sectorcode: 'GICS codes',
  region: 'Country roster',
  exchange: 'Exchanges',
};
export const FACT_TOPICS = TOPICS;

export function buildItems(ctx, topics) {
  const { reference } = ctx;
  const want = topics && topics.length ? topics : Object.keys(TOPICS);
  const items = [];
  if (want.includes('currency'))
    reference.countries.filter(c => c.currency_iso)
      .forEach((c, i) => items.push({ id: 'cur:' + c.iso2, kind: 'currency', data: c }));
  if (want.includes('sectormap'))
    reference.industries.forEach((g, i) => items.push({ id: 'map:' + g.key, kind: 'sectormap', data: g }));
  if (want.includes('sectorcode'))
    reference.sectors.forEach(s => items.push({ id: 'code:' + s.key, kind: 'sectorcode', data: s }));
  if (want.includes('region'))
    reference.countries.forEach(c => items.push({ id: 'reg:' + c.iso2, kind: 'region', data: c }));
  if (want.includes('exchange'))
    reference.countries.filter(c => (ctx.exchByCountry?.[c.iso2] || []).length)
      .forEach(c => items.push({ id: 'exc:' + c.iso2, kind: 'exchange', data: c }));
  return items;
}

export function makeQuestion(item, ctx) {
  const { reference } = ctx;
  const d = item.data;

  if (item.kind === 'currency') {
    // unique by currency (many countries share EUR) and != the answer
    const seen = new Set([d.currency_iso]);
    const others = reference.countries.filter(c =>
      c.currency_iso && !seen.has(c.currency_iso) && seen.add(c.currency_iso));
    const wrong = sample(others, 3).map(c => `${c.currency} (${c.currency_iso})`);
    const w1 = sample(others, 1)[0];
    return {
      kicker: 'Currency', sector: 'communication_services',
      question: `What currency does <b>${d.flag} ${d.name}</b> use?`,
      answer: `${d.currency} (${d.currency_iso})`, distractors: wrong,
      tfTrue: `${d.name} uses the ${d.currency}.`,
      tfFalse: `${d.name} uses the ${w1.currency}.`,
      hint: `ISO code starts with "${d.currency_iso[0]}".`,
      expl: `${d.name} → ${d.currency} (${d.currency_iso}).`,
    };
  }

  if (item.kind === 'sectormap') {
    const sectors = reference.sectors;
    const wrong = sample(sectors.filter(s => s.key !== d.sector), 3).map(s => s.name);
    const w1 = sample(sectors.filter(s => s.key !== d.sector), 1)[0];
    return {
      kicker: 'Sector map', sector: d.sector,
      question: `<b>${nice(d.key)}</b> sits in which sector?`,
      answer: nice(d.sector), distractors: wrong,
      tfTrue: `${nice(d.key)} is in ${nice(d.sector)}.`,
      tfFalse: `${nice(d.key)} is in ${w1.name}.`,
      hint: `Think about what these companies actually sell.`,
      expl: `${nice(d.key)} maps to ${nice(d.sector)}.`,
    };
  }

  if (item.kind === 'sectorcode') {
    const others = reference.sectors.filter(s => s.key !== d.key);
    return {
      kicker: 'GICS code', sector: d.key,
      question: `Which GICS sector code is <b>${d.name}</b>?`,
      answer: `${d.num} · ${d.code}`,
      distractors: sample(others, 3).map(s => `${s.num} · ${s.code}`),
      tfTrue: `${d.name} is GICS ${d.num} (${d.code}).`,
      tfFalse: `${d.name} is GICS ${sample(others, 1)[0].num}.`,
      hint: `Codes run 10–60 in steps of 5.`,
      expl: `${d.name} = GICS ${d.num}, 4-letter code ${d.code}.`,
    };
  }

  if (item.kind === 'region') {
    const regionNames = [...new Set(reference.countries.map(c => c.region_name).filter(Boolean))];
    const others = regionNames.filter(r => r !== d.region_name);
    return {
      kicker: 'Region', sector: '',
      question: `Which region group is <b>${d.flag} ${d.name}</b> in?`,
      answer: d.region_name, distractors: sample(others, Math.min(3, others.length)),
      tfTrue: `${d.name} is grouped under ${d.region_name}.`,
      tfFalse: `${d.name} is grouped under ${sample(others, 1)[0]}.`,
      hint: `Groups: US, Japan, Europe, Asia-Pacific, Emerging (ex-Asia).`,
      expl: `${d.name} → ${d.region_name}.`,
    };
  }

  // exchange
  const exchanges = ctx.exchByCountry[d.iso2] || [];
  const primary = exchanges[0];
  const allEx = ctx.allExchanges.filter(e => !exchanges.includes(e));
  return {
    kicker: 'Exchange', sector: '',
    question: `Which exchange lists the most <b>${d.flag} ${d.name}</b> stocks?`,
    answer: primary, distractors: sample(allEx, 3),
    tfTrue: `${primary} is a main exchange for ${d.name} stocks.`,
    tfFalse: `${sample(allEx, 1)[0]} is a main exchange for ${d.name} stocks.`,
    hint: `${exchanges.length} distinct exchange${exchanges.length === 1 ? '' : 's'} in the data for ${d.name}.`,
    expl: `Most ${d.name} names here trade on ${primary}.`,
  };
}
