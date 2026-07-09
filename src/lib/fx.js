// fx.js — country / flag / currency helpers, indexed from reference.json.
// Flags are keyed on ISO-2 but we always DISPLAY the full country name.

let _byIso = new Map();

/** Build the ISO-2 index from reference.countries. Call once after loadReference. */
export function initCountries(reference) {
  _byIso = new Map((reference?.countries || []).map(c => [c.iso2, c]));
}

export const countryOf = iso2 => _byIso.get(iso2) || null;
export const allCountries = () => [..._byIso.values()];

/** Full display name for an ISO-2 code, falling back to the code itself. */
export const countryName = iso2 => countryOf(iso2)?.name || iso2 || '';

/** Flag emoji: prefer reference value; else derive from the ISO-2 code. */
export function flagOf(iso2) {
  const c = countryOf(iso2);
  if (c && c.flag) return c.flag;
  iso2 = (iso2 || '').toUpperCase();
  if (iso2.length !== 2 || !/^[A-Z]{2}$/.test(iso2)) return '';
  return String.fromCodePoint(...[...iso2].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

/** "🇰🇷 South Korea" — flag + full name inline. */
export const flagName = iso2 => {
  const f = flagOf(iso2), n = countryName(iso2);
  return f ? `${f} ${n}` : n;
};
