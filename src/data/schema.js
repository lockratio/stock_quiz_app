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

/** Parse the Python-written 'True'/'False' booleans from universe.csv. */
const bool = v => v === true || v === 'True' || v === 'true';

/** Coerce one PapaParse row (all strings) from universe.csv into a typed stock. */
export function coerceStock(r) {
  const s = {
    qaid: r.qaid,
    indexCode: r.index_code,
    ticker: r.ticker,
    symbol: r.symbol,
    tickerCode: r.ticker_code,
    numericTicker: bool(r.numeric_ticker),
    firstLetter: r.first_letter,
    mag7: bool(r.mag7),
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
    capUSD: num(r.mktcap_usd_mln),   // in millions USD (cap-bucket basis)
    weight: num(r.bm_weight),        // benchmark weight %, may be null
    desc: r.desc || '',
  };
  s.bucket = capBucket(s)?.key ?? null;   // bucket key, or null when cap unknown
  s.bucketShort = capBucketShort(s);      // pre-rendered short label
  return s;
}

// Market-cap buckets (USD millions). mag7 is a flag check, not a threshold;
// remaining tiers are ordered high->low and matched by USD cap.
export const CAP_BUCKETS = [
  { key: 'mag7',      label: 'Mag 7',     short: 'Mag 7 · top-7 ACWI',   min: null },
  { key: 'mega',      label: 'Mega',      short: 'Mega · $100bn–Mag7',   min: 100000 },
  { key: 'large',     label: 'Large',     short: 'Large · $10–100bn',    min: 10000 },
  { key: 'mid',       label: 'Mid',       short: 'Mid · $1–10bn',        min: 1000 },
  { key: 'small_mid', label: 'Small-Mid', short: 'Small-Mid · $500m–1bn', min: 500 },
  { key: 'small',     label: 'Small',     short: 'Small · $250–500m',    min: 250 },
  { key: 'micro',     label: 'Micro',     short: 'Micro · <$250m',       min: 0 },
];

const MAG7_BUCKET = CAP_BUCKETS[0];

/** Bucket for a stock OBJECT. mag7 flag wins; else threshold on USD cap. */
export function capBucket(stock) {
  if (!stock) return null;
  if (stock.mag7 === true) return MAG7_BUCKET;
  const usd = stock.capUSD;
  if (usd == null) return null;
  return CAP_BUCKETS.find(b => b.min != null && usd >= b.min);
}
export const capBucketShort = stock => (capBucket(stock)?.short) || '—';

/** Format an AUD-millions cap like the sketch: >=1e6 -> $X.XXT, else $Ybn. */
export function fmtCap(m) {
  if (m == null) return '—';
  return m >= 1e6 ? '$' + (m / 1e6).toFixed(2) + 'T' : '$' + Math.round(m / 1e3) + 'bn';
}
