// registry.js — display metadata for the five modes. Logic lives in the
// per-mode files; the runner/config read this for titles, colours, glyphs and
// which answer styles each mode supports.

import { MODE_ICON } from '../lib/icons.js';

export const MODES = {
  leaderboard: {
    key: 'leaderboard', n: '01', title: 'Leaderboard Guess',
    blurb: 'Name the biggest by rank in a sector, region, industry or country.',
    icon: MODE_ICON.leaderboard, col: '--s-fin',
    special: 'leaderboard',            // own single-box mechanic, no style selector
  },
  facts: {
    key: 'facts', n: '02', title: 'Universe Facts',
    blurb: 'Currencies, the sector→industry map, exchanges and country roster.',
    icon: MODE_ICON.facts, col: '--s-comm',
    styles: ['mc', 'tf', 'type', 'flip'],
  },
  idcard: {
    key: 'idcard', n: '03', title: 'Stock Universe',
    blurb: 'From a ticker: name, industry, country, cap bucket.',
    icon: MODE_ICON.idcard, col: '--s-cd',
    styles: ['mc', 'type', 'flip'],
  },
  desc: {
    key: 'desc', n: '04', title: 'Business Descriptions',
    blurb: 'Browse the profiles, or guess the company blind.',
    icon: MODE_ICON.desc, col: '--s-hc',
    special: 'browser',
  },
  flash: {
    key: 'flash', n: '05', title: 'Custom Flashcards',
    blurb: 'Pick any column as front, any as back. Your call.',
    icon: MODE_ICON.flash, col: '--s-enr',
    styles: ['mc', 'type', 'flip'],
  },
};

export const MODE_ORDER = ['leaderboard', 'facts', 'idcard', 'desc', 'flash'];

export const STYLE_LABEL = { mc: 'Multiple choice', tf: 'True / False', type: 'Type-in', flip: 'Flashcard' };
export const STYLE_HINT = {
  mc: 'Distractors auto-picked from the same category.',
  tf: 'Half the statements are false — spot them.',
  type: 'Fuzzy graded; a miss shows how close you were.',
  flip: 'No input — flip and self-grade.',
};

// ---------------------------------------------------------------------------
// Unified quiz model (Wave 4). One quiz mixes several TYPES; each type carries
// the answer styles it supports (leaderboard/desc self-render, so styles []).
// Chip order is fixed: leaderboard, idcard, facts, flash, desc. icon/col reuse
// the per-mode MODES entry so config chips match the rest of the UI.
// ---------------------------------------------------------------------------
export const QUIZ_TYPES = [
  { key: 'leaderboard', label: 'Leaderboard',    icon: MODES.leaderboard.icon, col: MODES.leaderboard.col, styles: [] },
  { key: 'idcard',      label: 'Stock Universe', icon: MODES.idcard.icon,      col: MODES.idcard.col,      styles: ['mc', 'type', 'flip'] },
  { key: 'facts',       label: 'Universe Facts', icon: MODES.facts.icon,       col: MODES.facts.col,       styles: ['mc', 'tf', 'type', 'flip'] },
  { key: 'flash',       label: 'Flashcards',     icon: MODES.flash.icon,       col: MODES.flash.col,       styles: ['mc', 'type', 'flip'] },
  { key: 'desc',        label: 'Descriptions',   icon: MODES.desc.icon,        col: MODES.desc.col,        styles: [] },
];

// key -> supported answer styles (the runner uses this to pick a render and to
// fall back to 'mc' when app.style isn't supported by the current item's type).
export const QUIZ_TYPE_STYLES = QUIZ_TYPES.reduce((m, t) => (m[t.key] = t.styles, m), {});
