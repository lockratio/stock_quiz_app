// icons.js — visual identity. Sector badges reuse the sketch's inline-SVG set
// (colour + glyph). Industries use ONE unique emoji each (text icons, no files),
// covering every gindustry in the data. Mode glyphs come from the sketch too.

// sector -> [colour CSS var, SVG path string] (verbatim from sketch SEC map)
export const SECTOR = {
  information_technology: ['--s-tech', 'M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M6 6h12v12H6z M9 9h6v6H9z'],
  financials: ['--s-fin', 'M3 21h18M4 21V10M20 21V10M4 10l8-6 8 6M9 21v-6h6v6'],
  energy: ['--s-enr', 'M13 2L4 14h6l-1 8 9-12h-6z'],
  health_care: ['--s-hc', 'M12 21s-7-4.5-7-10a4 4 0 018-1 4 4 0 018 1c0 5.5-7 10-9 10z'],
  materials: ['--s-mat', 'M12 2l9 5v10l-9 5-9-5V7z M12 2v20 M3 7l9 5 9-5'],
  consumer_discretionary: ['--s-cd', 'M6 2l-2 5h16l-2-5M4 7v13h16V7M9 11a3 3 0 006 0'],
  consumer_staples: ['--s-cs', 'M4 6h16l-1.5 12H5.5z M9 6V4a3 3 0 016 0v2'],
  communication_services: ['--s-comm', 'M5 12a7 7 0 0114 0M8 12a4 4 0 018 0M12 12v6M9 21h6'],
  industrials: ['--s-ind', 'M4 21V10l6 4V10l6 4V6l4 3v12z'],
  utilities: ['--s-util', 'M12 2s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z'],
  real_estate: ['--s-re', 'M3 21V9l9-6 9 6v12M9 21v-6h6v6'],
  DEF: ['--accent', 'M3 17l5-6 4 4 6-8M17 7h4v4'],
};
export const sectorOf = name => SECTOR[name] || SECTOR.DEF;

// One unique emoji per gindustry (all 24 in the universe).
export const INDUSTRY_EMOJI = {
  energy: '🛢️', materials: '🪨', capital_goods: '🏗️', prof_services: '📋',
  transport: '🚚', autos_components: '🚗', durables_apparel: '👗',
  consumer_services: '🍽️', cd_retail: '🛍️', cs_retail: '🛒',
  food_bev_tobacco: '🥫', household_personal: '🧴', hc_equip_services: '🩺',
  pharma_biotech_life: '💊', banks: '🏦', financial_services: '💳',
  insurance: '🛡️', real_estate: '🏢', software_services: '💻', tech_hw: '🖥️',
  semis: '💠', telecom: '📡', media_ent: '🎬', utilities: '⚡',
};
export const industryEmoji = key => INDUSTRY_EMOJI[key] || '🏷️';

// mode glyphs (verbatim from sketch MODEICO)
export const MODE_ICON = {
  leaderboard: 'M6 21V11M12 21V3M18 21v-6M3 21h18',
  facts: 'M12 2a10 10 0 100 20 10 10 0 000-20M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20',
  idcard: 'M3 5h18v14H3z M7 9h4M7 13h7M15 9h2',
  desc: 'M6 3h9l3 3v15H6z M9 8h6M9 12h6M9 16h4',
  flash: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4',
};

/** Build an inline SVG from a space-'M'-separated path string. */
export function icoSvg(pathStr) {
  return `<svg viewBox="0 0 24 24">${pathStr.split(' M')
    .map((p, i) => `<path d="${i ? 'M' + p : p}"/>`).join('')}</svg>`;
}

/** Coloured sector badge: <div class="cls" style="background:var(--sX)">svg</div> */
export function sectorBadge(sector, cls) {
  const [cv, ic] = sectorOf(sector);
  return `<div class="${cls}" style="background:var(${cv})">${icoSvg(ic)}</div>`;
}
