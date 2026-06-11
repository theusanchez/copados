export const FLAGS = {
  'México': '🇲🇽', 'África do Sul': '🇿🇦', 'Coreia do Sul': '🇰🇷', 'República Tcheca': '🇨🇿',
  'Canadá': '🇨🇦', 'Bósnia e Herzegovina': '🇧🇦', 'Catar': '🇶🇦', 'Suíça': '🇨🇭',
  'Brasil': '🇧🇷', 'Marrocos': '🇲🇦', 'Haiti': '🇭🇹', 'Escócia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Estados Unidos': '🇺🇸', 'Paraguai': '🇵🇾', 'Austrália': '🇦🇺', 'Turquia': '🇹🇷',
  'Alemanha': '🇩🇪', 'Curaçao': '🇨🇼', 'Costa do Marfim': '🇨🇮', 'Equador': '🇪🇨',
  'Holanda': '🇳🇱', 'Japão': '🇯🇵', 'Suécia': '🇸🇪', 'Tunísia': '🇹🇳',
  'Bélgica': '🇧🇪', 'Egito': '🇪🇬', 'Irã': '🇮🇷', 'Nova Zelândia': '🇳🇿',
  'Espanha': '🇪🇸', 'Cabo Verde': '🇨🇻', 'Arábia Saudita': '🇸🇦', 'Uruguai': '🇺🇾',
  'França': '🇫🇷', 'Senegal': '🇸🇳', 'Iraque': '🇮🇶', 'Noruega': '🇳🇴',
  'Argentina': '🇦🇷', 'Argélia': '🇩🇿', 'Áustria': '🇦🇹', 'Jordânia': '🇯🇴',
  'Portugal': '🇵🇹', 'Congo (RD)': '🇨🇩', 'Uzbequistão': '🇺🇿', 'Colômbia': '🇨🇴',
  'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croácia': '🇭🇷', 'Gana': '🇬🇭', 'Panamá': '🇵🇦',
};

export const GROUPS = {
  A: { teams: ['México', 'África do Sul', 'Coreia do Sul', 'República Tcheca'],
    matches: [
      { id: 'A1', md: 1, home: 'México', away: 'África do Sul' },
      { id: 'A2', md: 1, home: 'Coreia do Sul', away: 'República Tcheca' },
      { id: 'A3', md: 2, home: 'República Tcheca', away: 'África do Sul' },
      { id: 'A4', md: 2, home: 'México', away: 'Coreia do Sul' },
      { id: 'A5', md: 3, home: 'República Tcheca', away: 'México' },
      { id: 'A6', md: 3, home: 'África do Sul', away: 'Coreia do Sul' },
    ]
  },
  B: { teams: ['Canadá', 'Bósnia e Herzegovina', 'Catar', 'Suíça'],
    matches: [
      { id: 'B1', md: 1, home: 'Canadá', away: 'Bósnia e Herzegovina' },
      { id: 'B2', md: 1, home: 'Catar', away: 'Suíça' },
      { id: 'B3', md: 2, home: 'Suíça', away: 'Bósnia e Herzegovina' },
      { id: 'B4', md: 2, home: 'Canadá', away: 'Catar' },
      { id: 'B5', md: 3, home: 'Suíça', away: 'Canadá' },
      { id: 'B6', md: 3, home: 'Bósnia e Herzegovina', away: 'Catar' },
    ]
  },
  C: { teams: ['Brasil', 'Marrocos', 'Haiti', 'Escócia'],
    matches: [
      { id: 'C1', md: 1, home: 'Brasil', away: 'Marrocos' },
      { id: 'C2', md: 1, home: 'Haiti', away: 'Escócia' },
      { id: 'C3', md: 2, home: 'Escócia', away: 'Marrocos' },
      { id: 'C4', md: 2, home: 'Brasil', away: 'Haiti' },
      { id: 'C5', md: 3, home: 'Escócia', away: 'Brasil' },
      { id: 'C6', md: 3, home: 'Marrocos', away: 'Haiti' },
    ]
  },
  D: { teams: ['Estados Unidos', 'Paraguai', 'Austrália', 'Turquia'],
    matches: [
      { id: 'D1', md: 1, home: 'Estados Unidos', away: 'Paraguai' },
      { id: 'D2', md: 1, home: 'Austrália', away: 'Turquia' },
      { id: 'D3', md: 2, home: 'Estados Unidos', away: 'Austrália' },
      { id: 'D4', md: 2, home: 'Turquia', away: 'Paraguai' },
      { id: 'D5', md: 3, home: 'Turquia', away: 'Estados Unidos' },
      { id: 'D6', md: 3, home: 'Paraguai', away: 'Austrália' },
    ]
  },
  E: { teams: ['Alemanha', 'Curaçao', 'Costa do Marfim', 'Equador'],
    matches: [
      { id: 'E1', md: 1, home: 'Alemanha', away: 'Curaçao' },
      { id: 'E2', md: 1, home: 'Costa do Marfim', away: 'Equador' },
      { id: 'E3', md: 2, home: 'Alemanha', away: 'Costa do Marfim' },
      { id: 'E4', md: 2, home: 'Equador', away: 'Curaçao' },
      { id: 'E5', md: 3, home: 'Equador', away: 'Alemanha' },
      { id: 'E6', md: 3, home: 'Curaçao', away: 'Costa do Marfim' },
    ]
  },
  F: { teams: ['Holanda', 'Japão', 'Suécia', 'Tunísia'],
    matches: [
      { id: 'F1', md: 1, home: 'Holanda', away: 'Japão' },
      { id: 'F2', md: 1, home: 'Suécia', away: 'Tunísia' },
      { id: 'F3', md: 2, home: 'Holanda', away: 'Suécia' },
      { id: 'F4', md: 2, home: 'Tunísia', away: 'Japão' },
      { id: 'F5', md: 3, home: 'Japão', away: 'Suécia' },
      { id: 'F6', md: 3, home: 'Tunísia', away: 'Holanda' },
    ]
  },
  G: { teams: ['Bélgica', 'Egito', 'Irã', 'Nova Zelândia'],
    matches: [
      { id: 'G1', md: 1, home: 'Bélgica', away: 'Egito' },
      { id: 'G2', md: 1, home: 'Irã', away: 'Nova Zelândia' },
      { id: 'G3', md: 2, home: 'Bélgica', away: 'Irã' },
      { id: 'G4', md: 2, home: 'Nova Zelândia', away: 'Egito' },
      { id: 'G5', md: 3, home: 'Egito', away: 'Irã' },
      { id: 'G6', md: 3, home: 'Nova Zelândia', away: 'Bélgica' },
    ]
  },
  H: { teams: ['Espanha', 'Cabo Verde', 'Arábia Saudita', 'Uruguai'],
    matches: [
      { id: 'H1', md: 1, home: 'Espanha', away: 'Cabo Verde' },
      { id: 'H2', md: 1, home: 'Arábia Saudita', away: 'Uruguai' },
      { id: 'H3', md: 2, home: 'Espanha', away: 'Arábia Saudita' },
      { id: 'H4', md: 2, home: 'Uruguai', away: 'Cabo Verde' },
      { id: 'H5', md: 3, home: 'Uruguai', away: 'Espanha' },
      { id: 'H6', md: 3, home: 'Cabo Verde', away: 'Arábia Saudita' },
    ]
  },
  I: { teams: ['França', 'Senegal', 'Iraque', 'Noruega'],
    matches: [
      { id: 'I1', md: 1, home: 'França', away: 'Senegal' },
      { id: 'I2', md: 1, home: 'Iraque', away: 'Noruega' },
      { id: 'I3', md: 2, home: 'França', away: 'Iraque' },
      { id: 'I4', md: 2, home: 'Noruega', away: 'Senegal' },
      { id: 'I5', md: 3, home: 'Noruega', away: 'França' },
      { id: 'I6', md: 3, home: 'Senegal', away: 'Iraque' },
    ]
  },
  J: { teams: ['Argentina', 'Argélia', 'Áustria', 'Jordânia'],
    matches: [
      { id: 'J1', md: 1, home: 'Argentina', away: 'Argélia' },
      { id: 'J2', md: 1, home: 'Áustria', away: 'Jordânia' },
      { id: 'J3', md: 2, home: 'Argentina', away: 'Áustria' },
      { id: 'J4', md: 2, home: 'Jordânia', away: 'Argélia' },
      { id: 'J5', md: 3, home: 'Jordânia', away: 'Argentina' },
      { id: 'J6', md: 3, home: 'Argélia', away: 'Áustria' },
    ]
  },
  K: { teams: ['Portugal', 'Congo (RD)', 'Uzbequistão', 'Colômbia'],
    matches: [
      { id: 'K1', md: 1, home: 'Portugal', away: 'Congo (RD)' },
      { id: 'K2', md: 1, home: 'Uzbequistão', away: 'Colômbia' },
      { id: 'K3', md: 2, home: 'Portugal', away: 'Uzbequistão' },
      { id: 'K4', md: 2, home: 'Colômbia', away: 'Congo (RD)' },
      { id: 'K5', md: 3, home: 'Colômbia', away: 'Portugal' },
      { id: 'K6', md: 3, home: 'Congo (RD)', away: 'Uzbequistão' },
    ]
  },
  L: { teams: ['Inglaterra', 'Croácia', 'Gana', 'Panamá'],
    matches: [
      { id: 'L1', md: 1, home: 'Inglaterra', away: 'Croácia' },
      { id: 'L2', md: 1, home: 'Gana', away: 'Panamá' },
      { id: 'L3', md: 2, home: 'Inglaterra', away: 'Gana' },
      { id: 'L4', md: 2, home: 'Panamá', away: 'Croácia' },
      { id: 'L5', md: 3, home: 'Panamá', away: 'Inglaterra' },
      { id: 'L6', md: 3, home: 'Croácia', away: 'Gana' },
    ]
  },
};

// Slot types: { type:'w', group:'A' }=1º do grupo, { type:'ru', group:'A' }=2º do grupo,
//             { type:'b3', groups:['A','B',...] }=melhor 3º desses grupos,
//             { type:'mw', id:'R32_01' }=vencedor da partida, { type:'ml', id:'SF_01' }=perdedor
export const KNOCKOUT = {
  r32: [
    { id: 'R32_01', home: {type:'ru',group:'A'}, away: {type:'ru',group:'B'} },
    { id: 'R32_02', home: {type:'w',group:'E'},  away: {type:'b3',groups:['A','B','C','D','F']} },
    { id: 'R32_03', home: {type:'w',group:'F'},  away: {type:'ru',group:'C'} },
    { id: 'R32_04', home: {type:'w',group:'C'},  away: {type:'ru',group:'F'} },
    { id: 'R32_05', home: {type:'w',group:'I'},  away: {type:'b3',groups:['C','D','F','G','H']} },
    { id: 'R32_06', home: {type:'ru',group:'E'}, away: {type:'ru',group:'I'} },
    { id: 'R32_07', home: {type:'w',group:'A'},  away: {type:'b3',groups:['C','E','F','H','I']} },
    { id: 'R32_08', home: {type:'w',group:'L'},  away: {type:'b3',groups:['E','H','I','J','K']} },
    { id: 'R32_09', home: {type:'w',group:'D'},  away: {type:'b3',groups:['B','E','F','I','J']} },
    { id: 'R32_10', home: {type:'w',group:'G'},  away: {type:'b3',groups:['A','E','H','I','J']} },
    { id: 'R32_11', home: {type:'ru',group:'K'}, away: {type:'ru',group:'L'} },
    { id: 'R32_12', home: {type:'w',group:'H'},  away: {type:'ru',group:'J'} },
    { id: 'R32_13', home: {type:'w',group:'B'},  away: {type:'b3',groups:['E','F','G','I','J']} },
    { id: 'R32_14', home: {type:'w',group:'J'},  away: {type:'ru',group:'H'} },
    { id: 'R32_15', home: {type:'w',group:'K'},  away: {type:'b3',groups:['D','E','I','J','L']} },
    { id: 'R32_16', home: {type:'ru',group:'D'}, away: {type:'ru',group:'G'} },
  ],
  r16: [
    { id: 'R16_01', home: {type:'mw',id:'R32_01'}, away: {type:'mw',id:'R32_02'} },
    { id: 'R16_02', home: {type:'mw',id:'R32_03'}, away: {type:'mw',id:'R32_04'} },
    { id: 'R16_03', home: {type:'mw',id:'R32_05'}, away: {type:'mw',id:'R32_06'} },
    { id: 'R16_04', home: {type:'mw',id:'R32_07'}, away: {type:'mw',id:'R32_08'} },
    { id: 'R16_05', home: {type:'mw',id:'R32_09'}, away: {type:'mw',id:'R32_10'} },
    { id: 'R16_06', home: {type:'mw',id:'R32_11'}, away: {type:'mw',id:'R32_12'} },
    { id: 'R16_07', home: {type:'mw',id:'R32_13'}, away: {type:'mw',id:'R32_14'} },
    { id: 'R16_08', home: {type:'mw',id:'R32_15'}, away: {type:'mw',id:'R32_16'} },
  ],
  qf: [
    { id: 'QF_01', home: {type:'mw',id:'R16_01'}, away: {type:'mw',id:'R16_02'} },
    { id: 'QF_02', home: {type:'mw',id:'R16_03'}, away: {type:'mw',id:'R16_04'} },
    { id: 'QF_03', home: {type:'mw',id:'R16_05'}, away: {type:'mw',id:'R16_06'} },
    { id: 'QF_04', home: {type:'mw',id:'R16_07'}, away: {type:'mw',id:'R16_08'} },
  ],
  sf: [
    { id: 'SF_01', home: {type:'mw',id:'QF_01'}, away: {type:'mw',id:'QF_02'} },
    { id: 'SF_02', home: {type:'mw',id:'QF_03'}, away: {type:'mw',id:'QF_04'} },
  ],
  third: [
    { id: 'THIRD', home: {type:'ml',id:'SF_01'}, away: {type:'ml',id:'SF_02'} },
  ],
  final: [
    { id: 'FINAL', home: {type:'mw',id:'SF_01'}, away: {type:'mw',id:'SF_02'} },
  ],
};

export const ROUND_LABELS = {
  r32: 'Rodada de 32',
  r16: 'Oitavas de Final',
  qf: 'Quartas de Final',
  sf: 'Semifinais',
  third: '3° Lugar',
  final: 'Final',
};
