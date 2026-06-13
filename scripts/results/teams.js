// Maps football-data.org team identities to the Portuguese names used across the app
// (the canonical keys in GROUPS / FLAGS in ../../js/data.js). The API returns English
// names and a 3-letter code (tla); we match on name first, tla as a fallback.

// Normalize for matching: lowercase, strip accents/punctuation, collapse whitespace.
export function normalize(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// English name (and common variants) -> PT name. Keys are normalized at load time.
const NAME_TO_PT_RAW = {
  'Mexico': 'México',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul', 'Korea Republic': 'Coreia do Sul',
  'Czech Republic': 'República Tcheca', 'Czechia': 'República Tcheca',
  'Canada': 'Canadá',
  'Bosnia and Herzegovina': 'Bósnia e Herzegovina', 'Bosnia-Herzegovina': 'Bósnia e Herzegovina',
  'Qatar': 'Catar',
  'Switzerland': 'Suíça',
  'Brazil': 'Brasil',
  'Morocco': 'Marrocos',
  'Haiti': 'Haiti',
  'Scotland': 'Escócia',
  'United States': 'Estados Unidos', 'USA': 'Estados Unidos', 'United States of America': 'Estados Unidos',
  'Paraguay': 'Paraguai',
  'Australia': 'Austrália',
  'Turkey': 'Turquia', 'Türkiye': 'Turquia', 'Turkiye': 'Turquia',
  'Germany': 'Alemanha',
  'Curacao': 'Curaçao', 'Curaçao': 'Curaçao',
  'Ivory Coast': 'Costa do Marfim', "Cote d'Ivoire": 'Costa do Marfim', 'Côte d’Ivoire': 'Costa do Marfim',
  'Ecuador': 'Equador',
  'Netherlands': 'Holanda',
  'Japan': 'Japão',
  'Sweden': 'Suécia',
  'Tunisia': 'Tunísia',
  'Belgium': 'Bélgica',
  'Egypt': 'Egito',
  'Iran': 'Irã', 'IR Iran': 'Irã',
  'New Zealand': 'Nova Zelândia',
  'Spain': 'Espanha',
  'Cape Verde': 'Cabo Verde', 'Cabo Verde': 'Cabo Verde',
  'Saudi Arabia': 'Arábia Saudita',
  'Uruguay': 'Uruguai',
  'France': 'França',
  'Senegal': 'Senegal',
  'Iraq': 'Iraque',
  'Norway': 'Noruega',
  'Argentina': 'Argentina',
  'Algeria': 'Argélia',
  'Austria': 'Áustria',
  'Jordan': 'Jordânia',
  'Portugal': 'Portugal',
  'DR Congo': 'Congo (RD)', 'Congo DR': 'Congo (RD)',
  'Democratic Republic of the Congo': 'Congo (RD)', 'Congo (DR)': 'Congo (RD)',
  'Uzbekistan': 'Uzbequistão',
  'Colombia': 'Colômbia',
  'England': 'Inglaterra',
  'Croatia': 'Croácia',
  'Ghana': 'Gana',
  'Panama': 'Panamá',
};

// FIFA 3-letter codes (football-data.org `tla`) -> PT name. Fallback only.
const TLA_TO_PT = {
  MEX: 'México', RSA: 'África do Sul', KOR: 'Coreia do Sul', CZE: 'República Tcheca',
  CAN: 'Canadá', BIH: 'Bósnia e Herzegovina', QAT: 'Catar', SUI: 'Suíça',
  BRA: 'Brasil', MAR: 'Marrocos', HAI: 'Haiti', SCO: 'Escócia',
  USA: 'Estados Unidos', PAR: 'Paraguai', AUS: 'Austrália', TUR: 'Turquia',
  GER: 'Alemanha', CUW: 'Curaçao', CIV: 'Costa do Marfim', ECU: 'Equador',
  NED: 'Holanda', JPN: 'Japão', SWE: 'Suécia', TUN: 'Tunísia',
  BEL: 'Bélgica', EGY: 'Egito', IRN: 'Irã', NZL: 'Nova Zelândia',
  ESP: 'Espanha', CPV: 'Cabo Verde', KSA: 'Arábia Saudita', URU: 'Uruguai',
  FRA: 'França', SEN: 'Senegal', IRQ: 'Iraque', NOR: 'Noruega',
  ARG: 'Argentina', ALG: 'Argélia', AUT: 'Áustria', JOR: 'Jordânia',
  POR: 'Portugal', COD: 'Congo (RD)', UZB: 'Uzbequistão', COL: 'Colômbia',
  ENG: 'Inglaterra', CRO: 'Croácia', GHA: 'Gana', PAN: 'Panamá',
};

const NAME_TO_PT = {};
for (const [en, pt] of Object.entries(NAME_TO_PT_RAW)) NAME_TO_PT[normalize(en)] = pt;

// Resolve an API team ({ name, tla }) to its PT name, or null if unknown.
export function toPt(apiTeam) {
  if (!apiTeam) return null;
  const byName = NAME_TO_PT[normalize(apiTeam.name)];
  if (byName) return byName;
  if (apiTeam.tla && TLA_TO_PT[apiTeam.tla]) return TLA_TO_PT[apiTeam.tla];
  return null;
}
