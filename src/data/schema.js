// schema.js — pure data helpers: row coercion, cap buckets, formatting, labels.
// The heavy cleaning (cap strings, GICS derivation) happens in tools/build_data.py;
// universe.csv arrives already-cleaned, so here we only coerce CSV strings -> types.

/** Title-case a snake/space token: "consumer_staples" -> "Consumer Staples". */
export const nice = s => (s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

const num = v => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Coerce one PapaParse row (all strings) from universe.csv into a typed stock. */
export function coerceStock(r) {
  return {
    qaid: r.qaid,
    indexCode: r.index_code,
    ticker: r.ticker,
    name: r.name,
    legalName: r.legal_name,
    iso2: r.iso2,
    country: r.country,
    region: r.region,
    gsector: r.gsector,
    gindustry: r.gindustry,
    gics: r.gics,
    sectorNum: r.sector_num,
    sectorCode: r.sector_code,
    exchange: r.exchange,
    currency: r.currency,
    currencyIso: r.currency_iso,
    capAUD: num(r.mktcap_aud_mln),   // in millions AUD
    capUSD: num(r.mktcap_usd_mln),
    weight: num(r.bm_weight),        // benchmark weight %, may be null
    desc: r.desc || '',
  };
}

// Market-cap buckets (AUD millions). Thresholds match the sketch/Settings screen.
export const CAP_BUCKETS = [
  { key: 'mega',  label: 'Mega',  short: 'Mega · >$500bn',      min: 500000 },
  { key: 'large', label: 'Large', short: 'Large · $100–500bn',  min: 100000 },
  { key: 'mid',   label: 'Mid',   short: 'Mid · $10–100bn',     min: 10000 },
  { key: 'small', label: 'Small', short: 'Small · <$10bn',      min: 0 },
];

export function capBucket(aud) {
  if (aud == null) return null;
  return CAP_BUCKETS.find(b => aud >= b.min);
}
export const capBucketShort = aud => (capBucket(aud)?.short) || '—';

/** Format an AUD-millions cap like the sketch: >=1e6 -> $X.XXT, else $Ybn. */
export function fmtCap(m) {
  if (m == null) return '—';
  return m >= 1e6 ? '$' + (m / 1e6).toFixed(2) + 'T' : '$' + Math.round(m / 1e3) + 'bn';
}
