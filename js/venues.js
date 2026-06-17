// World Cup 2026 venues. The 16 stadium/city/state/country values are real and were
// cross-checked against en.wikipedia.org/wiki/2026_FIFA_World_Cup and nbcsports.com.
//
// The bracket in data.js IS the real 2026 draw, so MATCH_VENUE below is the official
// venue for each group-stage fixture, matched by team pair against the ESPN schedule
// (espn.com/.../2026-fifa-world-cup-fixtures...). Knockout: only the Final (MetLife)
// and third-place (Miami) are mapped — both unambiguous, single-venue matches. The
// R32/R16/QF/SF venues are left out until each bracket slot can be mapped precisely,
// so we never show a wrong stadium.

import { lang } from './i18n.js';

export const VENUES = {
  azteca:    { stadium: 'Estadio Azteca',          city: 'Cidade do México', state: 'CDMX',               country: 'México' },
  akron:     { stadium: 'Estadio Akron',           city: 'Zapopan',          state: 'Jalisco',            country: 'México' },
  bbva:      { stadium: 'Estadio BBVA',            city: 'Guadalupe',        state: 'Nuevo León',         country: 'México' },
  metlife:   { stadium: 'MetLife Stadium',         city: 'East Rutherford',  state: 'Nova Jersey',        country: 'EUA' },
  att:       { stadium: 'AT&T Stadium',            city: 'Arlington',        state: 'Texas',              country: 'EUA' },
  nrg:       { stadium: 'NRG Stadium',             city: 'Houston',          state: 'Texas',              country: 'EUA' },
  arrowhead: { stadium: 'Arrowhead Stadium',       city: 'Kansas City',      state: 'Missouri',           country: 'EUA' },
  sofi:      { stadium: 'SoFi Stadium',            city: 'Inglewood',        state: 'Califórnia',         country: 'EUA' },
  levis:     { stadium: "Levi's Stadium",          city: 'Santa Clara',      state: 'Califórnia',         country: 'EUA' },
  lumen:     { stadium: 'Lumen Field',             city: 'Seattle',          state: 'Washington',         country: 'EUA' },
  mercedes:  { stadium: 'Mercedes-Benz Stadium',   city: 'Atlanta',          state: 'Geórgia',            country: 'EUA' },
  linc:      { stadium: 'Lincoln Financial Field', city: 'Filadélfia',       state: 'Pensilvânia',        country: 'EUA' },
  hardrock:  { stadium: 'Hard Rock Stadium',       city: 'Miami Gardens',    state: 'Flórida',            country: 'EUA' },
  gillette:  { stadium: 'Gillette Stadium',        city: 'Foxborough',       state: 'Massachusetts',      country: 'EUA' },
  bcplace:   { stadium: 'BC Place',                city: 'Vancouver',        state: 'Colúmbia Britânica', country: 'Canadá' },
  bmo:       { stadium: 'BMO Field',               city: 'Toronto',          state: 'Ontário',            country: 'Canadá' },
};

// Official venue per fixture (group stage matched by team pair; Final + third place).
const MATCH_VENUE = {
  A1: 'azteca',    A2: 'akron',     A3: 'mercedes',  A4: 'akron',     A5: 'azteca',    A6: 'bbva',
  B1: 'bmo',       B2: 'levis',     B3: 'sofi',      B4: 'bcplace',   B5: 'bcplace',   B6: 'lumen',
  C1: 'metlife',   C2: 'gillette',  C3: 'gillette',  C4: 'linc',      C5: 'hardrock',  C6: 'mercedes',
  D1: 'sofi',      D2: 'bcplace',   D3: 'lumen',     D4: 'levis',     D5: 'sofi',      D6: 'levis',
  E1: 'nrg',       E2: 'linc',      E3: 'bmo',       E4: 'arrowhead', E5: 'metlife',   E6: 'linc',
  F1: 'att',       F2: 'bbva',      F3: 'nrg',       F4: 'bbva',      F5: 'att',       F6: 'arrowhead',
  G1: 'lumen',     G2: 'sofi',      G3: 'sofi',      G4: 'bcplace',   G5: 'lumen',     G6: 'bcplace',
  H1: 'mercedes',  H2: 'hardrock',  H3: 'mercedes',  H4: 'hardrock',  H5: 'akron',     H6: 'nrg',
  I1: 'metlife',   I2: 'gillette',  I3: 'linc',      I4: 'metlife',   I5: 'gillette',  I6: 'bmo',
  J1: 'arrowhead', J2: 'levis',     J3: 'att',       J4: 'levis',     J5: 'att',       J6: 'arrowhead',
  K1: 'nrg',       K2: 'azteca',    K3: 'nrg',       K4: 'azteca',    K5: 'hardrock',  K6: 'mercedes',
  L1: 'att',       L2: 'bmo',       L3: 'gillette',  L4: 'bmo',       L5: 'metlife',   L6: 'linc',

  // Knockout — each slot matched to its official venue via the bracket feeders
  // (FIFA / Wikipedia knockout stage). The bracket now follows the official flow,
  // so every round maps to a real venue.
  R32_01: 'sofi',  R32_02: 'gillette', R32_03: 'bbva',   R32_04: 'nrg',
  R32_05: 'metlife', R32_06: 'att',    R32_07: 'azteca', R32_08: 'mercedes',
  R32_09: 'levis', R32_10: 'lumen',    R32_11: 'bmo',    R32_12: 'sofi',
  R32_13: 'bcplace', R32_14: 'hardrock', R32_15: 'arrowhead', R32_16: 'att',
  R16_01: 'linc',  R16_02: 'nrg',     R16_03: 'metlife', R16_04: 'azteca',
  R16_05: 'att',   R16_06: 'lumen',   R16_07: 'mercedes', R16_08: 'bcplace',
  QF_01: 'gillette', QF_02: 'sofi',   QF_03: 'hardrock', QF_04: 'arrowhead',
  SF_01: 'att',    SF_02: 'mercedes',
  FINAL: 'metlife',
  THIRD: 'hardrock',
};

export function venueFor(matchId) {
  return VENUES[MATCH_VENUE[matchId]] || null;
}

// Geographic terms that differ in English (stadium names are proper nouns — kept).
const GEO_EN = {
  'Cidade do México': 'Mexico City', 'Filadélfia': 'Philadelphia',
  'Nova Jersey': 'New Jersey', 'Califórnia': 'California', 'Geórgia': 'Georgia',
  'Pensilvânia': 'Pennsylvania', 'Flórida': 'Florida', 'Ontário': 'Ontario',
  'Colúmbia Britânica': 'British Columbia',
  'México': 'Mexico', 'EUA': 'USA', 'Canadá': 'Canada',
};
const geo = (s) => (lang === 'en' ? GEO_EN[s] || s : s);

// "Stadium · City, State (Country)" or null when unknown. City/state/country follow
// the active language; the stadium name stays as-is.
export function venueLabel(matchId) {
  const v = venueFor(matchId);
  return v ? `${v.stadium} · ${geo(v.city)}, ${geo(v.state)} (${geo(v.country)})` : null;
}
