// World Cup 2026 venues. The 16 stadium/city/state/country values are real and were
// cross-checked against en.wikipedia.org/wiki/2026_FIFA_World_Cup and nbcsports.com.
//
// This app's bracket is a simulated draw, so there is no official venue per fixture.
// Group matches are assigned a realistic venue by region; the knockout finals, semis
// and third-place use the real, slot-fixed venues (Final → MetLife, semis → Dallas &
// Atlanta, third → Miami), confirmed via Wikipedia/MetLife Stadium.

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

// Each group anchored to one venue, clustered by region for realism.
const GROUP_VENUE = {
  A: 'azteca', B: 'bcplace', C: 'metlife', D: 'att', E: 'mercedes', F: 'sofi',
  G: 'nrg', H: 'akron', I: 'linc', J: 'bbva', K: 'lumen', L: 'bmo',
};

// Real, slot-fixed knockout venues for the decisive rounds.
const KO_FIXED = {
  FINAL: 'metlife', THIRD: 'hardrock', SF_01: 'att', SF_02: 'mercedes',
  QF_01: 'gillette', QF_02: 'levis', QF_03: 'lumen', QF_04: 'arrowhead',
};

// Earlier knockout rounds spread deterministically across all 16 stadiums.
const KO_ROTATION = [
  'azteca', 'bcplace', 'metlife', 'att', 'mercedes', 'sofi', 'nrg', 'akron',
  'linc', 'bbva', 'lumen', 'bmo', 'gillette', 'levis', 'hardrock', 'arrowhead',
];

export function venueFor(matchId) {
  if (/^[A-L][1-6]$/.test(matchId)) return VENUES[GROUP_VENUE[matchId[0]]] || null;
  if (KO_FIXED[matchId]) return VENUES[KO_FIXED[matchId]];
  const m = /^R(?:32|16)_(\d{2})$/.exec(matchId);
  if (m) return VENUES[KO_ROTATION[(Number(m[1]) - 1) % KO_ROTATION.length]];
  return null;
}

// "Stadium · City, State (Country)" or null when unknown.
export function venueLabel(matchId) {
  const v = venueFor(matchId);
  return v ? `${v.stadium} · ${v.city}, ${v.state} (${v.country})` : null;
}
