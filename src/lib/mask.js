// mask.js — identity masking for descriptions (Wave 2).
// Replaces identifying words (company name/legal-name words, country name and
// its adjective form) with black-box spans, leaving generic prose intact so a
// "guess the company from its description" question stays fair.

/** Split a string into alphanumeric word tokens. */
function wordTokens(s) {
  if (!s) return [];
  return String(s).split(/[^A-Za-z0-9]+/).filter(Boolean);
}

/** Escape regex metacharacters so tokens match literally. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A masked box roughly sized to the token: min 3, cap 14 block chars. */
function maskBox(len) {
  const n = Math.min(Math.max(len, 3), 14);
  return `<span class="mask" aria-hidden="true">${'█'.repeat(n)}</span>`;
}

// Small country -> demonym map so e.g. country "Taiwan" also masks the word
// "Taiwanese" in the prose. (The bare "Taiwan" token already covers
// "Taiwan-based" via the word boundary.) Unknown countries add no adjective.
const COUNTRY_ADJ = {
  'united states': 'American', 'usa': 'American', 'us': 'American',
  'united kingdom': 'British', 'britain': 'British', 'uk': 'British',
  'china': 'Chinese', 'taiwan': 'Taiwanese', 'japan': 'Japanese',
  'south korea': 'Korean', 'korea': 'Korean', 'india': 'Indian',
  'germany': 'German', 'france': 'French', 'italy': 'Italian',
  'spain': 'Spanish', 'portugal': 'Portuguese', 'netherlands': 'Dutch',
  'belgium': 'Belgian', 'switzerland': 'Swiss', 'sweden': 'Swedish',
  'norway': 'Norwegian', 'denmark': 'Danish', 'finland': 'Finnish',
  'ireland': 'Irish', 'canada': 'Canadian', 'australia': 'Australian',
  'new zealand': 'New Zealand', 'brazil': 'Brazilian', 'mexico': 'Mexican',
  'singapore': 'Singaporean', 'hong kong': 'Hong Kong', 'israel': 'Israeli',
  'russia': 'Russian', 'saudi arabia': 'Saudi', 'south africa': 'South African',
};

function countryAdjective(country) {
  if (!country) return null;
  return COUNTRY_ADJ[String(country).toLowerCase().trim()] || null;
}

/**
 * Mask identifying words inside `text`.
 * fields: { name, legalName, country, iso2 } — any may be null/blank.
 *   - name / legalName: mask each alphabetic word token (len >= 2), e.g.
 *     "Chroma", "ATE", "Inc".
 *   - country: mask each country word plus its demonym (if known).
 *   - iso2: accepted for signature stability; not masked (2-letter codes like
 *     "US"/"IT" collide with generic prose).
 * Matching is case-insensitive on word boundaries; tokens are regex-escaped.
 * Returns the HTML string (original text untouched if there is nothing to mask).
 */
export function maskIdentity(text, { name, legalName, country, iso2 } = {}) {
  void iso2; // reserved by contract signature; intentionally not masked.
  if (text == null) return text;
  const src = String(text);

  const terms = new Set();
  const addWords = s => {
    for (const t of wordTokens(s)) {
      if (t.length >= 2 && /[A-Za-z]/.test(t)) terms.add(t);
    }
  };

  addWords(name);
  addWords(legalName);
  if (country) {
    addWords(country);
    const adj = countryAdjective(country);
    if (adj) addWords(adj);
  }

  if (terms.size === 0) return src;

  // Longest-first so a longer term wins over a shorter substring term.
  const pattern = [...terms]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');

  const re = new RegExp(`\\b(?:${pattern})\\b`, 'gi');
  return src.replace(re, m => maskBox(m.length));
}
