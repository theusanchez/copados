// Lightweight i18n. Portuguese is the default (and the source of truth for the E2E
// suite, which asserts pt-BR copy); English is opt-in via the language switcher and
// persisted in localStorage. `t(key, vars)` looks up the active language, falling
// back to pt, then to the raw key. `{var}` placeholders are interpolated.

const DICT = {
  pt: {
    // --- nav / header ---
    'nav.fixtures': 'Jogos',
    'nav.groups': 'Grupos',
    'nav.knockout': 'Mata-Mata',
    'nav.compare': 'Comparar',
    'nav.ranking': 'Ranking',
    'nav.leagues': 'Ligas',
    'header.logout': 'Sair',
    'header.theme': 'Escolher tema',
    'header.lang': 'Idioma',

    // --- login ---
    'login.subtitle': 'Faça seus palpites para a Copa do Mundo FIFA 2026 e compete com seus amigos.',
    'login.google': 'Entrar com Google',
    'login.divider': 'ou com e-mail',
    'login.name': 'Seu nome',
    'login.email': 'E-mail',
    'login.password': 'Senha (mín. 6 caracteres)',
    'login.submit': 'Entrar / Criar conta',
    'login.magic': 'Receber link de acesso por e-mail',
    'login.guest': 'Entrar como convidado',

    // --- auth errors ---
    'err.auth/email-already-in-use': 'Este e-mail já tem conta — confira a senha e tente entrar.',
    'err.auth/invalid-email': 'E-mail inválido.',
    'err.auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'err.auth/wrong-password': 'Senha incorreta.',
    'err.auth/invalid-credential': 'E-mail ou senha incorretos.',
    'err.auth/user-not-found': 'Conta não encontrada.',
    'err.auth/too-many-requests': 'Muitas tentativas — tente novamente em instantes.',
    'err.auth/popup-closed-by-user': 'Login cancelado.',
    'err.auth/credential-already-in-use': 'Esta conta Google já está em uso. Saia e entre com ela.',
    'err.generic': 'Algo deu errado. Tente novamente.',

    // --- progress ---
    'progress.complete': '✓ Bolão completo — boa sorte!',
    'progress.remaining': 'Faltam <strong>{done}</strong> de {total} palpites',
    'progress.detail': 'Grupos {group}/{groupTotal} · Mata-mata {ko}/{koTotal}',

    // --- knockout reset notice ---
    'reset.text': '⚠️ Corrigimos um erro no chaveamento do <strong>mata-mata</strong>. Seus palpites dessa fase foram resetados — por favor, <strong>preencha novamente</strong>.',
    'reset.close': 'Fechar aviso',

    // --- guest gate ---
    'guest.ranking': 'o ranking',
    'guest.leagues': 'as ligas',
    'guest.compare': 'a comparação de palpites',
    'guest.body': 'Você está como <strong>convidado</strong>. Seus palpites já estão salvos — crie uma conta para entrar no ranking e comparar com a galera. Você não perde nada.',
    'guest.password': 'Senha (mín. 6 caracteres)',
    'guest.heading': 'Crie sua conta para ver {what}',
    'guest.create': 'Criar minha conta',
    'guest.google': 'Usar minha conta Google',
    'guest.fill': 'Preencha e-mail e senha.',

    // --- groups / standings ---
    'groups.matchday': 'Rodada {n}',
    'standings.aria': 'Classificação Grupo {group}',
    'standings.team': 'Seleção',
    'std.played': 'PJ', 'std.playedT': 'Jogos',
    'std.gf': 'G', 'std.gfT': 'Gols',
    'std.gd': 'SG', 'std.gdT': 'Saldo de Gols',
    'std.pts': 'PTS', 'std.ptsT': 'Pontos',
    'std.q1': 'Classificado (1°)', 'std.q2': 'Classificado (2°)', 'std.q3': 'Melhor 3°',

    // --- knockout ---
    'ko.locked': '🔒 Complete a <strong>fase de grupos</strong> para preencher o mata-mata. Por enquanto você pode acompanhar como o chaveamento está ficando.',
    'ko.hint': 'Arraste para o lado para ver todas as fases →',
    'round.r32': 'Rodada de 32',
    'round.r16': 'Oitavas de Final',
    'round.qf': 'Quartas de Final',
    'round.sf': 'Semifinais',
    'round.third': '3° Lugar',
    'round.final': 'Final',

    // --- fixtures ---
    'fx.today': 'Hoje',
    'fx.tomorrow': 'Amanhã',
    'fx.empty': 'O calendário aparece aqui assim que os horários dos jogos forem publicados.',

    // --- match card ---
    'live.now': 'AO VIVO',
    'live.half': 'INTERVALO',
    'aria.score': 'Placar {team}',
    'pens.label': 'Pens:',
    'result.label': 'Resultado:',

    // --- common ---
    'common.loading': 'Carregando...',
    'common.refresh': '↻ Atualizar',
    'common.refreshAria': 'Atualizar',

    // --- compare ---
    'compare.champion': 'Campeão previsto',
    'compare.heading': 'Palpites',
    'compare.complete': '✓ Finalizados',
    'compare.incomplete': '⏳ Em andamento',
    'compare.with': 'Comparar com {name}',
    'compare.you': 'Você',
    'compare.pen': '(pên: {team})',
    'compare.closeAria': 'Fechar comparação',
    'compare.yourChampion': 'Seu campeão: {flag} <strong>{champion}</strong>',
    'compare.theirChampion': 'Campeão de {name}: {flag} <strong>{champion}</strong>',
    'compare.tabGroups': 'Grupos',
    'compare.tabKnockout': 'Mata-Mata',
    'cmp.same': '✓ igual',
    'cmp.diff': '✗ diverge',
    'cmp.result': 'Resultado',
    'cmp.group': 'Grupo {g}',

    // --- leagues ---
    'leagues.code': 'Código <strong>{code}</strong>',
    'leagues.intro': 'Crie uma liga privada e compartilhe o convite — o ranking e a comparação passam a contar só entre os membros dela.',
    'leagues.joinPlaceholder': 'Código do convite',
    'leagues.join': 'Entrar',
    'leagues.notFound': 'Liga não encontrada para esse código.',
    'leagues.geral': 'Geral',
    'leagues.label': 'Liga:',
    'leagues.activeAria': 'Liga ativa',
    'leagues.active': 'Ativa',
    'leagues.activate': 'Ativar',
    'leagues.member': 'membro',
    'leagues.members': 'membros',
    'leagues.copy': 'Copiar convite',
    'leagues.copied': 'Convite copiado!',
    'leagues.everyone': 'Todos os participantes',
    'leagues.createPlaceholder': 'Nome da nova liga',
    'leagues.create': 'Criar liga',

    // --- ranking ---
    'rank.round1': 'Rodada 1 (grupos)',
    'rank.round2': 'Rodada 2 (grupos)',
    'rank.round3': 'Rodada 3 (grupos)',
    'rank.finalThird': 'Final / 3º lugar',
    'rank.stats': '{exact} cravadas · {correct} resultados',
    'rank.empty': 'Os jogos ainda não começaram — o ranking aparece assim que os primeiros resultados saírem.',
    'rank.note': 'Última rodada pontuada: <strong>{round}</strong> — o <span class="rank-move rank-move-up">▲</span>/<span class="rank-move rank-move-down">▼</span> mostra a variação desde a rodada anterior.',
    'rank.me': ' (eu)',

    // --- badges ---
    'badge.leader': 'Líder da liga',
    'badge.roundTop': 'Mais cravadas na rodada',
    'badge.streak': 'Em chamas — {n} acertos seguidos',
    'badge.perfect': 'Grupo perfeito',
    'badge.perfectN': 'Grupo perfeito ×{n}',
    'badge.nostradamus': 'Nostradamus — cravou o campeão',
  },

  en: {
    'nav.fixtures': 'Matches',
    'nav.groups': 'Groups',
    'nav.knockout': 'Knockout',
    'nav.compare': 'Compare',
    'nav.ranking': 'Ranking',
    'nav.leagues': 'Leagues',
    'header.logout': 'Log out',
    'header.theme': 'Choose theme',
    'header.lang': 'Language',

    'login.subtitle': 'Predict every FIFA World Cup 2026 result and compete with your friends.',
    'login.google': 'Sign in with Google',
    'login.divider': 'or with e-mail',
    'login.name': 'Your name',
    'login.email': 'E-mail',
    'login.password': 'Password (min. 6 characters)',
    'login.submit': 'Sign in / Sign up',
    'login.magic': 'Get a sign-in link by e-mail',
    'login.guest': 'Continue as guest',

    'err.auth/email-already-in-use': 'This e-mail already has an account — check the password and sign in.',
    'err.auth/invalid-email': 'Invalid e-mail.',
    'err.auth/weak-password': 'Password must be at least 6 characters.',
    'err.auth/wrong-password': 'Wrong password.',
    'err.auth/invalid-credential': 'Wrong e-mail or password.',
    'err.auth/user-not-found': 'Account not found.',
    'err.auth/too-many-requests': 'Too many attempts — try again shortly.',
    'err.auth/popup-closed-by-user': 'Sign-in cancelled.',
    'err.auth/credential-already-in-use': 'This Google account is already in use. Log out and sign in with it.',
    'err.generic': 'Something went wrong. Try again.',

    'progress.complete': '✓ All predictions in — good luck!',
    'progress.remaining': '<strong>{done}</strong> of {total} predictions left',
    'progress.detail': 'Groups {group}/{groupTotal} · Knockout {ko}/{koTotal}',

    'reset.text': '⚠️ We fixed a bug in the <strong>knockout</strong> bracket. Your knockout picks were reset — please fill them in again.',
    'reset.close': 'Dismiss notice',

    'guest.ranking': 'the ranking',
    'guest.leagues': 'the leagues',
    'guest.compare': 'the prediction comparison',
    'guest.body': "You're playing as a <strong>guest</strong>. Your picks are already saved — create an account to join the ranking and compare with everyone. You won't lose anything.",
    'guest.password': 'Password (min. 6 characters)',
    'guest.heading': 'Create your account to see {what}',
    'guest.create': 'Create my account',
    'guest.google': 'Use my Google account',
    'guest.fill': 'Fill in e-mail and password.',

    'groups.matchday': 'Matchday {n}',
    'standings.aria': 'Group {group} standings',
    'standings.team': 'Team',
    'std.played': 'P', 'std.playedT': 'Played',
    'std.gf': 'GF', 'std.gfT': 'Goals for',
    'std.gd': 'GD', 'std.gdT': 'Goal difference',
    'std.pts': 'PTS', 'std.ptsT': 'Points',
    'std.q1': 'Qualified (1st)', 'std.q2': 'Qualified (2nd)', 'std.q3': 'Best 3rd',

    'ko.locked': '🔒 Finish the <strong>group stage</strong> to fill in the knockout. For now you can watch the bracket take shape.',
    'ko.hint': 'Swipe sideways to see every round →',
    'round.r32': 'Round of 32',
    'round.r16': 'Round of 16',
    'round.qf': 'Quarter-finals',
    'round.sf': 'Semi-finals',
    'round.third': 'Third place',
    'round.final': 'Final',

    'fx.today': 'Today',
    'fx.tomorrow': 'Tomorrow',
    'fx.empty': 'The schedule shows up here once kickoff times are published.',

    'live.now': 'LIVE',
    'live.half': 'HALF-TIME',
    'aria.score': '{team} score',
    'pens.label': 'Pens:',
    'result.label': 'Result:',

    'common.loading': 'Loading...',
    'common.refresh': '↻ Refresh',
    'common.refreshAria': 'Refresh',

    'compare.champion': 'Predicted champion',
    'compare.heading': 'Predictions',
    'compare.complete': '✓ Complete',
    'compare.incomplete': '⏳ In progress',
    'compare.with': 'Compare with {name}',
    'compare.you': 'You',
    'compare.pen': '(pens: {team})',
    'compare.closeAria': 'Close comparison',
    'compare.yourChampion': 'Your champion: {flag} <strong>{champion}</strong>',
    'compare.theirChampion': "{name}'s champion: {flag} <strong>{champion}</strong>",
    'compare.tabGroups': 'Groups',
    'compare.tabKnockout': 'Knockout',
    'cmp.same': '✓ same',
    'cmp.diff': '✗ differs',
    'cmp.result': 'Result',
    'cmp.group': 'Group {g}',

    'leagues.code': 'Code <strong>{code}</strong>',
    'leagues.intro': 'Create a private league and share the invite — the ranking and comparison then count only among its members.',
    'leagues.joinPlaceholder': 'Invite code',
    'leagues.join': 'Join',
    'leagues.notFound': 'No league found for that code.',
    'leagues.geral': 'Overall',
    'leagues.label': 'League:',
    'leagues.activeAria': 'Active league',
    'leagues.active': 'Active',
    'leagues.activate': 'Activate',
    'leagues.member': 'member',
    'leagues.members': 'members',
    'leagues.copy': 'Copy invite',
    'leagues.copied': 'Invite copied!',
    'leagues.everyone': 'Everyone',
    'leagues.createPlaceholder': 'New league name',
    'leagues.create': 'Create league',

    'rank.round1': 'Round 1 (groups)',
    'rank.round2': 'Round 2 (groups)',
    'rank.round3': 'Round 3 (groups)',
    'rank.finalThird': 'Final / Third place',
    'rank.stats': '{exact} exact · {correct} outcomes',
    'rank.empty': "The matches haven't started yet — the ranking appears once the first results come in.",
    'rank.note': 'Last scored round: <strong>{round}</strong> — the <span class="rank-move rank-move-up">▲</span>/<span class="rank-move rank-move-down">▼</span> shows the change since the previous round.',
    'rank.me': ' (you)',

    'badge.leader': 'League leader',
    'badge.roundTop': 'Most exact scores this round',
    'badge.streak': 'On fire — {n} correct in a row',
    'badge.perfect': 'Perfect group',
    'badge.perfectN': 'Perfect group ×{n}',
    'badge.nostradamus': 'Nostradamus — nailed the champion',
  },
};

// pt canonical team name → English. Used to display country names per language.
const TEAMS_EN = {
  'Alemanha': 'Germany', 'Argentina': 'Argentina', 'Argélia': 'Algeria',
  'Arábia Saudita': 'Saudi Arabia', 'Austrália': 'Australia', 'Brasil': 'Brazil',
  'Bélgica': 'Belgium', 'Bósnia e Herzegovina': 'Bosnia & Herzegovina',
  'Cabo Verde': 'Cape Verde', 'Canadá': 'Canada', 'Catar': 'Qatar',
  'Colômbia': 'Colombia', 'Congo (RD)': 'DR Congo', 'Coreia do Sul': 'South Korea',
  'Costa do Marfim': 'Ivory Coast', 'Croácia': 'Croatia', 'Curaçao': 'Curaçao',
  'Egito': 'Egypt', 'Equador': 'Ecuador', 'Escócia': 'Scotland', 'Espanha': 'Spain',
  'Estados Unidos': 'United States', 'França': 'France', 'Gana': 'Ghana',
  'Haiti': 'Haiti', 'Holanda': 'Netherlands', 'Inglaterra': 'England',
  'Iraque': 'Iraq', 'Irã': 'Iran', 'Japão': 'Japan', 'Jordânia': 'Jordan',
  'Marrocos': 'Morocco', 'México': 'Mexico', 'Noruega': 'Norway',
  'Nova Zelândia': 'New Zealand', 'Panamá': 'Panama', 'Paraguai': 'Paraguay',
  'Portugal': 'Portugal', 'República Tcheca': 'Czechia', 'Senegal': 'Senegal',
  'Suécia': 'Sweden', 'Suíça': 'Switzerland', 'Tunísia': 'Tunisia',
  'Turquia': 'Turkey', 'Uruguai': 'Uruguay', 'Uzbequistão': 'Uzbekistan',
  'África do Sul': 'South Africa', 'Áustria': 'Austria',
};

const SUPPORTED = ['pt', 'en'];

function detectLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch { /* no localStorage */ }
  return 'pt'; // default — keeps existing users and the E2E suite on Portuguese
}

export let lang = detectLang();

export function setLang(next) {
  if (!SUPPORTED.includes(next)) return;
  lang = next;
  try { localStorage.setItem('lang', next); } catch { /* ignore */ }
}

export function t(key, vars) {
  let s = (DICT[lang] && DICT[lang][key]) ?? DICT.pt[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

// Country name for the active language ('?' and resolved-bracket placeholders pass through).
export function tTeam(name) {
  if (lang === 'en' && name && TEAMS_EN[name]) return TEAMS_EN[name];
  return name;
}

// Translate static markup: [data-i18n] → textContent, [data-i18n-ph] → placeholder,
// [data-i18n-aria] → aria-label. Run once on boot.
export function applyStaticI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
