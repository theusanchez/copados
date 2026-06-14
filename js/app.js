import { loginWithGoogle, logout, onAuthChange, loginAsGuest, registerWithEmail, loginWithEmail, sendMagicLink, completeMagicLinkIfPresent, upgradeGuest, upgradeGuestWithGoogle, saveUser, savePred, loadPreds, loadAllUsers, loadUserPreds, loadResults, watchResults, deletePreds, getResetVersion, setResetVersion, createLeague, findLeagueByCode, joinLeague, loadUserLeagues } from './db.js';
import { GROUPS, FLAGS, KNOCKOUT, ROUND_LABELS } from './data.js';
import { venueLabel } from './venues.js';
import { FEATURES } from './features.js';
import { groupStandings, computeAdvancing, buildKnockoutMatches, resolveKnockout, scoreUser, matchPoints, bestStreak, perfectGroups, isNostradamus } from './engine.js';

// -----------------------------------------------------------------------
// State
// -----------------------------------------------------------------------
let currentUser = null;
let predictions = {};       // { matchId: { home, away, penWinner? } }
let results = {};           // { matchId: { home, away, status, kickoff, ... } } actual results
let currentUserKo = {};     // resolved knockout for `predictions` (set before each render)
let koFillLocked = true;     // true while the group stage is incomplete (blocks knockout filling)
let userLeagues = [];       // private leagues the current user belongs to
let activeLeagueId = 'geral'; // 'geral' = everyone; otherwise a private league id
let unsubscribeResults = null; // active Firestore results listener, if any

const KNOCKOUT_IDS = new Set(Object.values(KNOCKOUT).flat().map(m => m.id));

// Bump when a knockout-structure change must invalidate users' saved knockout picks.
// v1: 2026-06-14 — fixed the R16+ bracket to match the official 2026 flow.
const KNOCKOUT_RESET_VERSION = 1;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function flag(team) {
  const code = FLAGS[team];
  if (!code) return '';
  return `<img class="flag-icon" src="https://flagcdn.com/${code}.svg" alt="" loading="lazy">`;
}

// Kickoff is stored as an absolute instant (UTC). Normalize Firestore Timestamp
// or epoch-ms to a number, then always show it in Brazil time.
function kickoffMs(kickoff) {
  if (kickoff == null) return null;
  const ms = typeof kickoff?.toMillis === 'function' ? kickoff.toMillis() : Number(kickoff);
  return isNaN(ms) ? null : ms;
}

const KICKOFF_FMT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short', day: '2-digit', month: 'short',
  hour: '2-digit', minute: '2-digit',
});

function formatKickoff(kickoff) {
  const ms = kickoffMs(kickoff);
  if (ms == null) return '';
  return KICKOFF_FMT.format(new Date(ms)).replace(/\./g, '');
}

// Google/Firebase avatars 403 when a Referer is sent — no-referrer + initials fallback.
function avatarHtml(user, cls) {
  const initial = user.displayName?.[0] || '?';
  return user.photoURL
    ? `<img src="${user.photoURL}" alt="${user.displayName}" class="${cls}"
        referrerpolicy="no-referrer" data-initial="${initial}" data-ph="${cls}-placeholder">`
    : `<div class="${cls}-placeholder">${initial}</div>`;
}

function attachAvatarFallback(root) {
  root.querySelectorAll('img[data-initial]').forEach(img => {
    const swap = () => {
      const ph = document.createElement('div');
      ph.className = img.dataset.ph;
      ph.textContent = img.dataset.initial || '?';
      img.replaceWith(ph);
    };
    if (img.complete && img.naturalWidth === 0) swap();
    else img.addEventListener('error', swap);
  });
}

// A match locks once it has started/finished (or its kickoff time has passed).
function isMatchLocked(matchId) {
  const r = results[matchId];
  if (!r) return false;
  if (r.status === 'live' || r.status === 'paused' || r.status === 'finished') return true;
  const ms = kickoffMs(r.kickoff);
  if (ms != null && Date.now() >= ms) return true;
  return false;
}

// A match no longer needs a prediction once it's locked: a late joiner can't fill
// a game that already kicked off, so a missing pick there must not block progress.
function matchSettled(matchId, preds) {
  const p = preds[matchId];
  return isMatchLocked(matchId) || (p && p.home != null && p.away != null);
}

// The group stage is "ready" (knockout unlocks) when every group match is either
// predicted or already locked. Using strict completeness would trap anyone who
// joined after some group games started — they could never finish the group stage.
function groupStageReady(preds) {
  return Object.values(GROUPS).flatMap(g => g.matches).every(m => matchSettled(m.id, preds));
}

// Resolve the predicted champion from a knockout match set ('?' if undecided).
function championOf(koMatches) {
  const finalMatch = koMatches['FINAL'];
  if (!finalMatch || finalMatch.home == null || finalMatch.away == null) return '?';
  const h = Number(finalMatch.home), a = Number(finalMatch.away);
  if (isNaN(h) || isNaN(a)) return '?';
  if (h > a) return finalMatch.homeTeam;
  if (a > h) return finalMatch.awayTeam;
  return finalMatch.penWinner || '?';
}

// A user is "complete" when every match is either predicted or locked (a late
// joiner can't fill past games, so those don't keep them "in progress" forever).
function predsComplete(preds) {
  return groupStageReady(preds) &&
    Object.values(KNOCKOUT).flat().every(m => matchSettled(m.id, preds));
}

// Count how many group/knockout matches have a full scoreline, for the progress bar.
function countFilled(preds) {
  const filled = m => {
    const p = preds[m.id];
    return p && p.home != null && p.away != null;
  };
  const groups = Object.values(GROUPS).flatMap(g => g.matches);
  const kos = Object.values(KNOCKOUT).flat();
  return {
    group: groups.filter(filled).length, groupTotal: groups.length,
    ko: kos.filter(filled).length, koTotal: kos.length,
  };
}

function renderProgress() {
  const el = document.getElementById('progress-tracker');
  if (!el) return;
  const c = countFilled(predictions);
  const done = c.group + c.ko;
  const total = c.groupTotal + c.koTotal;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = done === total;
  el.classList.remove('hidden');
  el.classList.toggle('complete', complete);
  el.innerHTML = complete
    ? `<div class="progress-row"><span class="progress-msg">✓ Bolão completo — boa sorte!</span></div>`
    : `<div class="progress-row">
        <span class="progress-msg">Faltam <strong>${total - done}</strong> de ${total} palpites</span>
        <span class="progress-detail">Grupos ${c.group}/${c.groupTotal} · Mata-mata ${c.ko}/${c.koTotal}</span>
      </div>
      <div class="progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>`;
}

function recomputeAll() {
  const adv = computeAdvancing(predictions);
  const koResults = {};
  Object.keys(KNOCKOUT).forEach(round => {
    KNOCKOUT[round].forEach(m => {
      const p = predictions[m.id];
      if (p) koResults[m.id] = p;
    });
  });
  return { adv, koResults, koMatches: buildKnockoutMatches(adv, koResults) };
}

// -----------------------------------------------------------------------
// Auth
// -----------------------------------------------------------------------
function isGuest() {
  return !!currentUser?.isAnonymous;
}

// Social views require a real account: guests can play but not appear in / see
// the ranking and league features until they sign up.
const GUEST_LOCKED_VIEWS = ['compare', 'ranking', 'leagues'];

// Finish a magic-link login if the app was opened from the email link, before we
// wire the auth listener (avoids a flash of the login screen).
await completeMagicLinkIfPresent().catch(err => console.error('Magic link error', err));

// Resolve to `fallback` if `promise` doesn't settle within `ms`. Firestore ops can
// HANG (not reject) when the free-tier daily quota is exhausted, so the boot must cap
// every wait — otherwise the app freezes on the loading spinner.
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

onAuthChange(async user => {
  rosterCache = null; // never carry one account's roster into another session
  if (unsubscribeResults) { unsubscribeResults(); unsubscribeResults = null; }

  if (!user) {
    currentUser = null;
    predictions = {};
    results = {};
    userLeagues = [];
    showLogin();
    return;
  }

  currentUser = user;
  const guest = !!user.isAnonymous;
  results = {};
  userLeagues = [];

  // Saving the profile is fire-and-forget — a hung write must never block the boot.
  if (!guest) saveUser(user).catch(err => console.error('saveUser failed', err));

  // We need the user's own picks to land on the right tab, but cap the wait so an
  // exhausted/slow Firestore can't freeze the loading screen.
  predictions = await withTimeout(loadPreds(user.uid).catch(() => ({})), 5000, {});

  restoreActiveLeague();
  showApp();
  renderUserInfo();
  renderProgress();
  renderGroupsView();
  renderKnockoutView();
  unsubscribeResults = watchResults(applyResultsUpdate);

  // Everything below is best-effort and runs AFTER the app is already on screen.
  loadResults()
    .then(r => { results = r || {}; renderProgress(); renderGroupsView(); renderKnockoutView(); })
    .catch(err => console.error('loadResults failed', err));

  if (!guest) {
    loadUserLeagues(user.uid)
      .then(l => { userLeagues = l || []; restoreActiveLeague(); })
      .catch(err => console.error('loadUserLeagues failed', err));
    consumeJoinLink().catch(err => console.error('consumeJoinLink failed', err));
    applyKnockoutReset(user.uid)
      .then(wasReset => {
        if (wasReset) { showResetNotice(); renderProgress(); renderGroupsView(); renderKnockoutView(); }
      })
      .catch(err => console.error('applyKnockoutReset failed', err));
  }
});

// One-off migration: if the user's saved knockout picks predate the bracket fix,
// delete them so they refill against the correct bracket. Server-side versioned, so
// it runs exactly once per user (and never wipes refilled picks on a second device).
async function applyKnockoutReset(uid) {
  const ver = await getResetVersion(uid);
  if (ver >= KNOCKOUT_RESET_VERSION) return false;
  const koIds = [...KNOCKOUT_IDS].filter(id => predictions[id]);
  if (koIds.length) {
    await deletePreds(uid, koIds);
    koIds.forEach(id => delete predictions[id]);
  }
  await setResetVersion(uid, KNOCKOUT_RESET_VERSION);
  return koIds.length > 0;
}

function showResetNotice() {
  const el = document.getElementById('reset-notice');
  if (!el) return;
  el.innerHTML = `
    <span class="reset-notice-text">
      ⚠️ Corrigimos um erro no chaveamento do <strong>mata-mata</strong>. Seus palpites
      dessa fase foram resetados — por favor, <strong>preencha novamente</strong>.
    </span>
    <button class="reset-notice-close" type="button" aria-label="Fechar aviso">×</button>`;
  el.classList.remove('hidden');
  el.querySelector('.reset-notice-close').addEventListener('click', () => {
    el.classList.add('hidden');
    el.innerHTML = '';
  });
}

const loginMsgEl = document.getElementById('login-msg');
function showLoginMsg(text, ok = false) {
  loginMsgEl.textContent = text;
  loginMsgEl.classList.toggle('success', ok);
}

function authErrorText(err) {
  const map = {
    'auth/email-already-in-use': 'Este e-mail já tem conta — confira a senha e tente entrar.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/weak-password': 'A senha precisa ter ao menos 6 caracteres.',
    'auth/user-not-found': 'Conta não encontrada.',
    'auth/too-many-requests': 'Muitas tentativas — tente novamente em instantes.',
    'auth/credential-already-in-use': 'Esta conta Google já está em uso. Saia e entre com ela.',
    'auth/popup-closed-by-user': 'Login cancelado.',
  };
  return map[err?.code] || 'Algo deu errado. Tente novamente.';
}

document.getElementById('btn-login').addEventListener('click', () => {
  showLoginMsg('');
  loginWithGoogle().catch(err => showLoginMsg(authErrorText(err)));
});

// One field, two outcomes: register a new email, or sign in an existing one.
document.getElementById('email-form').addEventListener('submit', async e => {
  e.preventDefault();
  showLoginMsg('');
  const name = document.getElementById('login-name').value.trim();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showLoginMsg('Preencha e-mail e senha.'); return; }
  try {
    await registerWithEmail(email, password, name || email.split('@')[0]);
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') {
      try { await loginWithEmail(email, password); }
      catch (e2) { showLoginMsg(authErrorText(e2)); }
    } else {
      showLoginMsg(authErrorText(err));
    }
  }
});

document.getElementById('btn-magic').addEventListener('click', async () => {
  showLoginMsg('');
  const name = document.getElementById('login-name').value.trim();
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showLoginMsg('Digite seu e-mail para receber o link.'); return; }
  try {
    await sendMagicLink(email, name);
    showLoginMsg('Link enviado! Confira seu e-mail e clique para entrar.', true);
  } catch (err) { showLoginMsg(authErrorText(err)); }
});

document.getElementById('btn-guest').addEventListener('click', () => {
  showLoginMsg('');
  loginAsGuest().catch(err => showLoginMsg(authErrorText(err)));
});

document.getElementById('btn-logout').addEventListener('click', () => {
  logout();
});

// -----------------------------------------------------------------------
// View switching
// -----------------------------------------------------------------------
function hideLoading() {
  document.getElementById('view-loading').classList.add('hidden');
}

function showLogin() {
  hideLoading();
  document.getElementById('view-login').classList.remove('hidden');
  document.getElementById('view-app').classList.add('hidden');
}

function showApp() {
  hideLoading();
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-app').classList.remove('hidden');
  applyGuestUi();
  const start = !isGuest() && predsComplete(predictions) ? 'compare' : 'groups';
  switchMainView(start);
}

// Dim the social tabs a guest can't open yet.
function applyGuestUi() {
  const guest = isGuest();
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('locked', guest && GUEST_LOCKED_VIEWS.includes(tab.dataset.view));
  });
}

function switchMainView(view) {
  ['fixtures', 'groups', 'knockout', 'compare', 'ranking', 'leagues'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  if (isGuest() && GUEST_LOCKED_VIEWS.includes(view)) {
    renderGuestGate(document.getElementById(`view-${view}`), view);
    return;
  }
  if (view === 'fixtures') renderFixturesView();
  if (view === 'compare') renderCompareView();
  if (view === 'ranking') renderRankingView();
  if (view === 'leagues') renderLeaguesView();
}

// Shown to a guest in place of a locked social view: a sign-up prompt that
// promotes the anonymous account (keeping their predictions).
function renderGuestGate(container, view) {
  const what = view === 'ranking' ? 'o ranking'
    : view === 'leagues' ? 'as ligas' : 'a comparação de palpites';
  container.innerHTML = `
    <div class="guest-gate">
      <span class="guest-gate-icon" aria-hidden="true">🔒</span>
      <h2>Crie sua conta para ver ${what}</h2>
      <p>Você está como <strong>convidado</strong>. Seus palpites já estão salvos — crie uma
         conta para entrar no ranking e comparar com a galera. Você não perde nada.</p>
      <form class="email-form guest-upgrade-form" novalidate>
        <input class="login-input" type="text" autocomplete="name" placeholder="Seu nome" aria-label="Seu nome" />
        <input class="login-input" type="email" autocomplete="email" placeholder="E-mail" aria-label="E-mail" required />
        <input class="login-input" type="password" autocomplete="new-password" placeholder="Senha (mín. 6 caracteres)" aria-label="Senha" />
        <button class="btn-upgrade" type="submit">Criar minha conta</button>
        <button class="btn-magic" type="button" data-google>Usar minha conta Google</button>
      </form>
      <p class="login-msg guest-gate-msg" role="alert" aria-live="polite"></p>
    </div>`;
  const form = container.querySelector('.guest-upgrade-form');
  const msg = container.querySelector('.guest-gate-msg');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = '';
    const [nameEl, emailEl, passEl] = form.querySelectorAll('input');
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) { msg.textContent = 'Preencha e-mail e senha.'; return; }
    try {
      const u = await upgradeGuest({ email, password, name: name || email.split('@')[0] });
      await finishUpgrade(u, view);
    } catch (err) { msg.textContent = authErrorText(err); }
  });
  form.querySelector('[data-google]').addEventListener('click', async () => {
    msg.textContent = '';
    try {
      const u = await upgradeGuestWithGoogle();
      await finishUpgrade(u, view);
    } catch (err) { msg.textContent = authErrorText(err); }
  });
}

// linkWithCredential keeps the same uid (predictions carry over) but does NOT
// fire onAuthChange, so refresh the now-real account's UI here.
async function finishUpgrade(user, view) {
  currentUser = user;
  rosterCache = null; // the guest just became a real user — refetch the roster
  await saveUser(user);
  userLeagues = await loadUserLeagues(user.uid);
  renderUserInfo();
  applyGuestUi();
  switchMainView(view);
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchMainView(tab.dataset.view));
});

// -----------------------------------------------------------------------
// User info in header
// -----------------------------------------------------------------------
function renderUserInfo() {
  if (!currentUser) return;
  const el = document.getElementById('user-info');
  const photo = currentUser.photoURL
    ? `<img src="${currentUser.photoURL}" alt="${currentUser.displayName}" class="avatar" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  el.innerHTML = `${photo}<span class="user-name">${currentUser.displayName}</span>`;
}

// -----------------------------------------------------------------------
// Save prediction
// -----------------------------------------------------------------------
async function savePrediction(matchId, field, value) {
  if (!currentUser || isMatchLocked(matchId)) return;
  if (KNOCKOUT_IDS.has(matchId) && !groupStageReady(predictions)) return;
  if (!predictions[matchId]) predictions[matchId] = {};
  predictions[matchId][field] = value === '' ? null : Number(value);
  // The same match can be on screen in more than one view (groups/knockout/fixtures);
  // keep their inputs in sync so an edit in one place is reflected everywhere.
  document.querySelectorAll(`.score-input[data-match-id="${matchId}"][data-side="${field}"]`)
    .forEach(inp => { if (inp.value !== value) inp.value = value; });
  await savePred(currentUser.uid, matchId, predictions[matchId]);
  syncOwnPredsToRoster();
  renderProgress();
  // Rerender live standings for group stage
  const groupKey = Object.keys(GROUPS).find(g =>
    GROUPS[g].matches.some(m => m.id === matchId)
  );
  if (groupKey) {
    renderGroupStandings(groupKey);
    // If this save flipped group-stage completion, re-render the knockout to
    // (un)lock its inputs; otherwise just refresh the resolved team names.
    if (groupStageReady(predictions) === koFillLocked) renderKnockoutView();
    else refreshKnockoutTeams();
  } else {
    refreshKnockoutTeams();
  }
}

async function savePenWinner(matchId, team) {
  if (!currentUser || isMatchLocked(matchId)) return;
  if (KNOCKOUT_IDS.has(matchId) && !groupStageReady(predictions)) return;
  if (!predictions[matchId]) predictions[matchId] = {};
  predictions[matchId].penWinner = team;
  await savePred(currentUser.uid, matchId, predictions[matchId]);
  syncOwnPredsToRoster();
  refreshKnockoutTeams();
}

// -----------------------------------------------------------------------
// Groups view
// -----------------------------------------------------------------------
function renderGroupsView() {
  const container = document.getElementById('view-groups');
  currentUserKo = resolveKnockout(predictions);
  // Group tabs
  const groupKeys = Object.keys(GROUPS);

  const tabsHtml = groupKeys.map((g, i) =>
    `<button class="group-tab${i === 0 ? ' active' : ''}" data-group="${g}">${g}</button>`
  ).join('');

  const panelsHtml = groupKeys.map((g, i) =>
    `<div class="group-panel${i === 0 ? '' : ' hidden'}" id="group-panel-${g}">
      ${renderGroupMatches(g)}
      <div class="standings-container" id="standings-${g}">
        ${renderStandingsTable(g)}
      </div>
    </div>`
  ).join('');

  container.innerHTML = `
    <div class="group-tabs-wrapper">
      <div class="group-tabs">${tabsHtml}</div>
    </div>
    <div class="group-panels">${panelsHtml}</div>
  `;

  // Tab switching
  container.querySelectorAll('.group-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelectorAll('.group-panel').forEach(p => p.classList.add('hidden'));
      container.querySelector(`#group-panel-${tab.dataset.group}`).classList.remove('hidden');
    });
  });

  // Input listeners
  container.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('blur', () => {
      const { matchId, side } = input.dataset;
      savePrediction(matchId, side, input.value);
    });
    input.addEventListener('input', () => {
      const { matchId } = input.dataset;
      const groupKey = Object.keys(GROUPS).find(g =>
        GROUPS[g].matches.some(m => m.id === matchId)
      );
      if (groupKey) renderGroupStandings(groupKey);
    });
  });
}

function renderGroupMatches(groupKey) {
  const group = GROUPS[groupKey];
  const matchdays = [1, 2, 3];
  return matchdays.map(md => {
    const matches = group.matches.filter(m => m.md === md);
    return `
      <div class="matchday">
        <h3 class="matchday-label">Rodada ${md}</h3>
        ${matches.map(m => renderMatchCard(m, false)).join('')}
      </div>
    `;
  }).join('');
}

function renderMatchCard(match, isKnockout, homeTeam, awayTeam) {
  const hTeam = homeTeam || match.home;
  const aTeam = awayTeam || match.away;
  const pred = predictions[match.id] || {};
  const hVal = pred.home != null ? pred.home : '';
  const aVal = pred.away != null ? pred.away : '';
  // Knockout filling is blocked until the group stage is complete (the bracket is
  // still viewable so people can watch it take shape).
  const koLocked = isKnockout && !groupStageReady(predictions);
  const locked = isMatchLocked(match.id) || koLocked;
  const lockAttrs = locked ? 'readonly tabindex="-1"' : '';
  const r = results[match.id];
  const pts = r && r.status === 'finished' && r.home != null && r.away != null
    ? matchPoints(match.id, predictions, currentUserKo, results)
    : null;
  const resultClass = pts == null ? ''
    : pts === 5 ? ' result-exact' : pts === 3 ? ' result-partial' : ' result-miss';
  const live = isInPlay(r);
  const kickoff = formatKickoff(r?.kickoff);
  // While a match is in play (live or halftime), the live score replaces the kickoff.
  const metaBits = [];
  if (kickoff) metaBits.push(`<span aria-hidden="true">🕑</span> ${kickoff}`);
  const venue = venueLabel(match.id);
  if (venue) metaBits.push(`🏟️ <span class="venue-name">${venue}</span>`);
  const headerHtml = live
    ? renderLiveScore(r, isKnockout)
    : (metaBits.length ? `<div class="match-kickoff">${metaBits.join(' · ')}</div>` : '');

  let penHtml = '';
  if (isKnockout) {
    const showPen = pred.home != null && pred.away != null &&
      Number(pred.home) === Number(pred.away) &&
      pred.home !== '' && pred.away !== '';
    penHtml = `
      <div class="pen-section${showPen ? '' : ' hidden'}" id="pen-${match.id}">
        <span class="pen-label">Pens:</span>
        <label class="pen-option">
          <input type="radio" name="pen-${match.id}" value="${hTeam}"
            ${pred.penWinner === hTeam ? 'checked' : ''} ${locked ? 'disabled' : ''}
            class="pen-radio" data-match-id="${match.id}">
          <span>${flag(hTeam)} ${hTeam}</span>
        </label>
        <label class="pen-option">
          <input type="radio" name="pen-${match.id}" value="${aTeam}"
            ${pred.penWinner === aTeam ? 'checked' : ''} ${locked ? 'disabled' : ''}
            class="pen-radio" data-match-id="${match.id}">
          <span>${flag(aTeam)} ${aTeam}</span>
        </label>
      </div>`;
  }

  return `
    <div class="match-card${locked ? ' locked' : ''}${live ? ' live' : ''}${live && r?.status === 'paused' ? ' paused' : ''}${resultClass}" id="match-${match.id}">
      ${headerHtml}
      <div class="match-body">
        <div class="team home-team">
          <span class="team-name">${hTeam}</span>
          <span class="team-flag">${flag(hTeam)}</span>
        </div>
        <div class="score-area">
          <input type="number" min="0" max="20" class="score-input"
            data-match-id="${match.id}" data-side="home"
            value="${hVal}" ${lockAttrs} aria-label="Placar ${hTeam}">
          <span class="score-sep">×</span>
          <input type="number" min="0" max="20" class="score-input"
            data-match-id="${match.id}" data-side="away"
            value="${aVal}" ${lockAttrs} aria-label="Placar ${aTeam}">
        </div>
        <div class="team away-team">
          <span class="team-flag">${flag(aTeam)}</span>
          <span class="team-name">${aTeam}</span>
        </div>
      </div>
      ${penHtml}
      ${renderMatchResult(r, isKnockout, pts)}
    </div>`;
}

// Live scoreline, shown on the card while a match is in progress or at halftime.
function renderLiveScore(r, isKnockout) {
  const paused = r.status === 'paused';
  const h = r.home ?? 0, a = r.away ?? 0;
  const score = isKnockout
    ? `${flag(r.homeTeam)} ${r.homeTeam} ${h} × ${a} ${r.awayTeam} ${flag(r.awayTeam)}`
    : `${h} × ${a}`;
  return `<div class="match-live${paused ? ' paused' : ''}">
      <span class="live-dot" aria-hidden="true"></span>
      <span class="live-label">${paused ? 'INTERVALO' : 'AO VIVO'}</span>
      <span class="live-score">${score}</span>
    </div>`;
}

// A match is "in play" (showing a live scoreline) while live or at halftime.
// Gated by the liveScores flag — the free data source's live data is unreliable.
function isInPlay(r) {
  if (!FEATURES.liveScores) return false;
  return r?.status === 'live' || r?.status === 'paused';
}

// Real result + points earned, shown once a match is finished.
function renderMatchResult(r, isKnockout, pts) {
  if (pts == null) return '';
  const ptsClass = pts === 5 ? 'pts-exact' : pts === 3 ? 'pts-partial' : 'pts-zero';
  const badge = `<span class="result-pts ${ptsClass}">+${pts}</span>`;
  const score = isKnockout
    ? `${flag(r.homeTeam)} ${r.homeTeam} ${r.home} × ${r.away} ${r.awayTeam} ${flag(r.awayTeam)}`
    : `${r.home} × ${r.away}`;
  return `<div class="match-result"><span class="result-label">Resultado:</span> ${score} ${badge}</div>`;
}

function renderGroupStandings(groupKey) {
  const el = document.getElementById(`standings-${groupKey}`);
  if (el) el.innerHTML = renderStandingsTable(groupKey);
}

function renderStandingsTable(groupKey) {
  // Collect live values from inputs if they exist
  const livePreds = collectLivePreds(groupKey);
  const merged = { ...predictions, ...livePreds };
  const standings = groupStandings(groupKey, merged);
  const { bestThirds } = computeAdvancing(merged);
  const bestThirdTeams = new Set(bestThirds.map(t => t.team));

  const rows = standings.map((s, i) => {
    let rowClass = '';
    if (i === 0) rowClass = 'rank-1st';
    else if (i === 1) rowClass = 'rank-2nd';
    else if (i === 2 && bestThirdTeams.has(s.team)) rowClass = 'rank-3rd-best';

    return `<tr class="${rowClass}">
      <td class="rank-cell">${i + 1}</td>
      <td class="team-cell">${flag(s.team)} ${s.team}</td>
      <td>${s.played}</td>
      <td>${s.gf}</td>
      <td>${s.gd >= 0 ? '+' : ''}${s.gd}</td>
      <td class="pts-cell">${s.pts}</td>
    </tr>`;
  }).join('');

  return `
    <table class="standings-table" aria-label="Classificação Grupo ${groupKey}">
      <thead>
        <tr>
          <th>#</th>
          <th>Seleção</th>
          <th title="Jogos">PJ</th>
          <th title="Gols">G</th>
          <th title="Saldo de Gols">SG</th>
          <th title="Pontos">PTS</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="standings-legend">
      <span class="legend-dot rank-1st-dot"></span> Classificado (1°)
      <span class="legend-dot rank-2nd-dot"></span> Classificado (2°)
      <span class="legend-dot rank-3rd-dot"></span> Melhor 3°
    </div>`;
}

function collectLivePreds(groupKey) {
  const result = {};
  const panel = document.getElementById(`group-panel-${groupKey}`);
  if (!panel) return result;
  panel.querySelectorAll('.score-input').forEach(input => {
    const { matchId, side } = input.dataset;
    if (!result[matchId]) result[matchId] = {};
    result[matchId][side] = input.value === '' ? null : Number(input.value);
  });
  return result;
}

// -----------------------------------------------------------------------
// Knockout view
// -----------------------------------------------------------------------
function renderKnockoutView() {
  const container = document.getElementById('view-knockout');
  currentUserKo = resolveKnockout(predictions);
  koFillLocked = !groupStageReady(predictions);
  const rounds = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];

  const tabsHtml = rounds.map((r, i) =>
    `<button class="ko-tab${i === 0 ? ' active' : ''}" data-round="${r}">${ROUND_LABELS[r]}</button>`
  ).join('');

  const panelsHtml = rounds.map((r, i) =>
    `<div class="ko-panel${i === 0 ? '' : ' hidden'}" id="ko-panel-${r}"></div>`
  ).join('');

  const lockNotice = koFillLocked ? `
    <div class="ko-locked-notice">
      🔒 Complete a <strong>fase de grupos</strong> para preencher o mata-mata.
      Por enquanto você pode acompanhar como o chaveamento está ficando.
    </div>` : '';

  container.innerHTML = `
    ${lockNotice}
    <div class="ko-tabs-wrapper">
      <div class="ko-tabs">${tabsHtml}</div>
    </div>
    <div class="ko-panels">${panelsHtml}</div>
  `;

  rounds.forEach(r => renderKnockoutRound(r));

  container.querySelectorAll('.ko-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.ko-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelectorAll('.ko-panel').forEach(p => p.classList.add('hidden'));
      container.querySelector(`#ko-panel-${tab.dataset.round}`).classList.remove('hidden');
    });
  });
}

function renderKnockoutRound(round) {
  const panel = document.getElementById(`ko-panel-${round}`);
  if (!panel) return;
  const { koMatches } = recomputeAll();
  const matches = KNOCKOUT[round];

  panel.innerHTML = matches.map(m => {
    const km = koMatches[m.id];
    return renderMatchCard(m, true, km.homeTeam, km.awayTeam);
  }).join('');

  // Attach input listeners
  panel.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('blur', async () => {
      const { matchId, side } = input.dataset;
      await savePrediction(matchId, side, input.value);
      updateKnockoutPenSection(matchId);
    });
    input.addEventListener('input', () => {
      updateKnockoutPenSection(input.dataset.matchId);
    });
  });

  panel.querySelectorAll('.pen-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) savePenWinner(radio.dataset.matchId, radio.value);
    });
  });
}

function updateKnockoutPenSection(matchId) {
  // Find the two score inputs for this match across all ko panels
  const inputs = document.querySelectorAll(`.score-input[data-match-id="${matchId}"]`);
  if (!inputs.length) return;
  let hVal = null, aVal = null;
  inputs.forEach(inp => {
    if (inp.dataset.side === 'home') hVal = inp.value;
    if (inp.dataset.side === 'away') aVal = inp.value;
  });
  const penSection = document.getElementById(`pen-${matchId}`);
  if (!penSection) return;
  const isDraw = hVal !== '' && aVal !== '' && hVal != null && aVal != null &&
    Number(hVal) === Number(aVal);
  penSection.classList.toggle('hidden', !isDraw);
}

function refreshKnockoutTeams() {
  const { koMatches } = recomputeAll();
  const rounds = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
  rounds.forEach(round => {
    KNOCKOUT[round].forEach(m => {
      const km = koMatches[m.id];
      // Update team names displayed in existing cards
      const card = document.getElementById(`match-${m.id}`);
      if (!card) return;
      const homeNameEl = card.querySelector('.home-team .team-name');
      const awayNameEl = card.querySelector('.away-team .team-name');
      const homeFlagEl = card.querySelector('.home-team .team-flag');
      const awayFlagEl = card.querySelector('.away-team .team-flag');
      if (homeNameEl) homeNameEl.textContent = km.homeTeam;
      if (awayNameEl) awayNameEl.textContent = km.awayTeam;
      if (homeFlagEl) homeFlagEl.innerHTML = flag(km.homeTeam);
      if (awayFlagEl) awayFlagEl.innerHTML = flag(km.awayTeam);

      // Also update pen radio labels
      const radios = card.querySelectorAll('.pen-radio');
      if (radios.length === 2) {
        radios[0].value = km.homeTeam;
        radios[0].name = `pen-${m.id}`;
        radios[0].dataset.matchId = m.id;
        const label0 = radios[0].closest('label');
        if (label0) label0.querySelector('span').innerHTML = `${flag(km.homeTeam)} ${km.homeTeam}`;

        radios[1].value = km.awayTeam;
        radios[1].name = `pen-${m.id}`;
        radios[1].dataset.matchId = m.id;
        const label1 = radios[1].closest('label');
        if (label1) label1.querySelector('span').innerHTML = `${flag(km.awayTeam)} ${km.awayTeam}`;
      }
    });
  });
}

// -----------------------------------------------------------------------
// Fixtures view (chronological, "what's today / locking soon")
// -----------------------------------------------------------------------
const SP_DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const SP_DAY_LABEL = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short',
});

function dayLabel(ms) {
  const key = SP_DAY_KEY.format(new Date(ms));
  const today = SP_DAY_KEY.format(new Date());
  const tomorrow = SP_DAY_KEY.format(new Date(Date.now() + 86400000));
  if (key === today) return 'Hoje';
  if (key === tomorrow) return 'Amanhã';
  return SP_DAY_LABEL.format(new Date(ms)).replace(/\./g, '');
}

// Time remaining until a match locks (kickoff). Null once it has started.
function countdownLabel(ms) {
  const diff = ms - Date.now();
  if (diff <= 0) return null;
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const mn = mins % 60;
  if (d > 0) return `trava em ${d}d ${h}h`;
  if (h > 0) return `trava em ${h}h ${mn}min`;
  return `trava em ${mn}min`;
}

// Flat, kickoff-sorted fixture list. Only matches with a known kickoff appear —
// the schedule comes from the ingested `results` docs, not from data.js.
function fixtureList() {
  const { koMatches } = recomputeAll();
  const items = [];
  Object.values(GROUPS).forEach(g => g.matches.forEach(m => {
    const r = results[m.id];
    items.push({ match: m, isKnockout: false, homeTeam: m.home, awayTeam: m.away, ms: kickoffMs(r?.kickoff) });
  }));
  Object.values(KNOCKOUT).flat().forEach(m => {
    const r = results[m.id];
    const km = koMatches[m.id];
    items.push({
      match: m, isKnockout: true,
      homeTeam: r?.homeTeam || km.homeTeam, awayTeam: r?.awayTeam || km.awayTeam,
      ms: kickoffMs(r?.kickoff),
    });
  });
  return items.filter(i => i.ms != null).sort((a, b) => a.ms - b.ms);
}

function renderFixturesView() {
  const container = document.getElementById('view-fixtures');
  currentUserKo = resolveKnockout(predictions);
  const items = fixtureList();

  if (!items.length) {
    container.innerHTML = `
      <div class="compare-header"><h2>Jogos</h2></div>
      <p class="ranking-empty">O calendário aparece aqui assim que os horários dos jogos forem publicados.</p>`;
    return;
  }

  const buckets = [];
  items.forEach(it => {
    const label = dayLabel(it.ms);
    let b = buckets[buckets.length - 1];
    if (!b || b.label !== label) { b = { label, items: [] }; buckets.push(b); }
    b.items.push(it);
  });

  container.innerHTML = `
    <div class="compare-header"><h2>Jogos</h2></div>
    ${buckets.map(b => `
      <div class="fx-day">
        <h3 class="fx-day-label">${b.label}</h3>
        ${b.items.map(renderFixtureCard).join('')}
      </div>`).join('')}`;

  container.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('blur', () => {
      const { matchId, side } = input.dataset;
      savePrediction(matchId, side, input.value);
    });
  });
}

function renderFixtureCard(it) {
  const { match, isKnockout, homeTeam, awayTeam, ms } = it;
  const pred = predictions[match.id] || {};
  const hVal = pred.home != null ? pred.home : '';
  const aVal = pred.away != null ? pred.away : '';
  const r = results[match.id];
  const live = isInPlay(r);
  const koLocked = isKnockout && !groupStageReady(predictions);
  const locked = isMatchLocked(match.id) || koLocked;
  const lockAttrs = locked ? 'readonly tabindex="-1"' : '';
  const pts = r && r.status === 'finished' && r.home != null && r.away != null
    ? matchPoints(match.id, predictions, currentUserKo, results)
    : null;
  const resultClass = pts == null ? ''
    : pts === 5 ? ' result-exact' : pts === 3 ? ' result-partial' : ' result-miss';

  let topHtml;
  if (live) {
    topHtml = renderLiveScore(r, isKnockout);
  } else {
    const cd = !locked ? countdownLabel(ms) : null;
    const cdHtml = cd ? `<span class="fx-countdown">🔒 ${cd}</span>` : '';
    const venue = venueLabel(match.id);
    const venueHtml = venue ? `<span class="fx-venue">🏟️ ${venue}</span>` : '';
    topHtml = `<div class="fx-meta"><span class="fx-time">🕑 ${formatKickoff(r?.kickoff)}</span>${cdHtml}${venueHtml}</div>`;
  }

  return `
    <div class="match-card fx-card${locked ? ' locked' : ''}${live ? ' live' : ''}${live && r?.status === 'paused' ? ' paused' : ''}${resultClass}" id="fx-match-${match.id}">
      ${topHtml}
      <div class="match-body">
        <div class="team home-team">
          <span class="team-name">${homeTeam}</span>
          <span class="team-flag">${flag(homeTeam)}</span>
        </div>
        <div class="score-area">
          <input type="number" min="0" max="20" class="score-input"
            data-match-id="${match.id}" data-side="home"
            value="${hVal}" ${lockAttrs} aria-label="Placar ${homeTeam}">
          <span class="score-sep">×</span>
          <input type="number" min="0" max="20" class="score-input"
            data-match-id="${match.id}" data-side="away"
            value="${aVal}" ${lockAttrs} aria-label="Placar ${awayTeam}">
        </div>
        <div class="team away-team">
          <span class="team-flag">${flag(awayTeam)}</span>
          <span class="team-name">${awayTeam}</span>
        </div>
      </div>
      ${pts != null ? renderMatchResult(r, isKnockout, pts) : ''}
    </div>`;
}

// A compact signature of the mutable result fields (status + scoreline), so we only
// re-render when a snapshot actually changed something the UI shows.
function resultsSignature(r) {
  return Object.keys(r).sort()
    .map(id => `${id}:${r[id].status}:${r[id].home}:${r[id].away}`)
    .join('|');
}

// Live results arrive via a Firestore real-time listener (watchResults): instant
// updates, billed per changed doc, so live scores/badges and finished results show
// up without a reload and without polling cost. Groups/knockout keep their sub-tab
// state, so they refresh on reentry; the fixtures view updates in place.
function applyResultsUpdate(fresh) {
  const changed = resultsSignature(fresh) !== resultsSignature(results);
  results = fresh;
  if (!changed) return;
  // Never rebuild a card the user is currently typing into.
  if (document.activeElement?.classList?.contains('score-input')) return;
  const active = document.querySelector('.nav-tab.active')?.dataset.view;
  if (active === 'fixtures') renderFixturesView();
  else if (active === 'ranking') renderRankingView();
  else if (active === 'compare') renderCompareView();
}

// Tick the fixtures lock countdowns once a minute (time-based, no data fetch).
setInterval(() => {
  const v = document.getElementById('view-fixtures');
  if (v && !v.classList.contains('hidden') && !v.contains(document.activeElement)) {
    renderFixturesView();
  }
}, 60000);

// -----------------------------------------------------------------------
// Compare view
// -----------------------------------------------------------------------
let compareEntries = [];   // [{ user, preds, koMatches, champion, complete }]

// In-memory roster cache: { users, preds: { uid: preds } }. Ranking + compare share it
// so switching tabs or a live score update re-renders WITHOUT re-reading every user's
// predictions from Firestore — that re-read on every navigation/update is what burned
// the daily read quota. Refilled only on first use, on an explicit "Atualizar", or with
// the user's own edits (updated locally, no read). Cleared on auth changes.
let rosterCache = null;

async function loadRoster({ force = false } = {}) {
  if (rosterCache && !force) return rosterCache;
  const users = await loadAllUsers();
  const preds = {};
  await Promise.all(users.map(async u => { preds[u.uid] = await loadUserPreds(u.uid); }));
  rosterCache = { users, preds };
  return rosterCache;
}

// Reflect the current user's own edits into the shared cache without a read.
function syncOwnPredsToRoster() {
  if (rosterCache && currentUser) rosterCache.preds[currentUser.uid] = { ...predictions };
}

const refreshBtnHtml =
  '<button class="btn-refresh" type="button" aria-label="Atualizar">↻ Atualizar</button>';

function wireRefresh(container, rerender) {
  const btn = container.querySelector('.btn-refresh');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await loadRoster({ force: true });
    rerender();
  });
}

async function renderCompareView() {
  const container = document.getElementById('view-compare');
  container.innerHTML = '<p class="loading-msg">Carregando...</p>';

  const { users: roster, preds: predsByUid } = await loadRoster();
  const users = scopeUsers(roster);
  compareEntries = users.map(u => {
    const preds = predsByUid[u.uid] || {};
    const koMatches = resolveKnockout(preds);
    // No champion until the group stage is complete — the bracket is otherwise
    // resolved from partial standings and would show a bogus winner.
    const champion = groupStageReady(preds) ? championOf(koMatches) : '?';
    return {
      user: u,
      preds,
      koMatches,
      champion,
      complete: predsComplete(preds),
    };
  });

  const byName = (a, b) => (a.user.displayName || '').localeCompare(b.user.displayName || '');
  const complete = compareEntries.filter(e => e.complete).sort(byName);
  const incomplete = compareEntries.filter(e => !e.complete).sort(byName);

  const section = (title, entries) => entries.length ? `
    <section class="compare-section">
      <h3 class="compare-section-title">${title} <span class="compare-count">(${entries.length})</span></h3>
      <div class="compare-grid">${entries.map(compareCardHtml).join('')}</div>
    </section>` : '';

  container.innerHTML = `
    <div class="compare-header"><h2>Palpites · ${activeLeagueName()}</h2>${leagueSwitcherHtml()}${refreshBtnHtml}</div>
    ${section('✓ Finalizados', complete)}
    ${section('⏳ Em andamento', incomplete)}
    <div id="compare-detail" class="compare-detail hidden"></div>
  `;

  attachAvatarFallback(container);
  wireLeagueSwitcher(container, renderCompareView);
  wireRefresh(container, renderCompareView);

  container.querySelectorAll('.compare-card').forEach(card => {
    card.addEventListener('click', () => {
      const uid = card.dataset.uid;
      if (uid === currentUser?.uid) return; // comparing yourself is a no-op
      const them = compareEntries.find(e => e.user.uid === uid);
      const me = compareEntries.find(e => e.user.uid === currentUser?.uid);
      if (them && me) renderComparison(me, them);
    });
  });
}

function compareCardHtml(entry) {
  const { user, champion } = entry;
  const isMe = currentUser && user.uid === currentUser.uid;
  return `
    <button class="compare-card${isMe ? ' compare-card-me' : ''}"
      data-uid="${user.uid}" aria-label="Comparar com ${user.displayName}">
      ${avatarHtml(user, 'compare-avatar')}
      <div class="compare-name">${user.displayName}${isMe ? ' (eu)' : ''}</div>
      <div class="compare-champion">
        <span class="champion-flag">${flag(champion)}</span>
        <span class="champion-name">${champion}</span>
      </div>
      <div class="compare-label">Campeão previsto</div>
    </button>`;
}

// -----------------------------------------------------------------------
// Comparison detail: "you vs them", stacked rows per match
// -----------------------------------------------------------------------
function fmtScore(p) {
  if (!p || p.home == null || p.away == null) return '–';
  return `${p.home} — ${p.away}`;
}

// Points badge (+5/+3/+0) for the comparison rows, once a match is finished.
function cmpPoints(pts) {
  if (pts == null) return '';
  const cls = pts === 5 ? 'cmp-pts-exact' : pts === 3 ? 'cmp-pts-partial' : 'cmp-pts-zero';
  return `<span class="cmp-pts ${cls}">+${pts}</span>`;
}

function renderComparison(me, them) {
  const detail = document.getElementById('compare-detail');
  if (!detail) return;
  const myName = 'Você';
  const themName = them.user.displayName;

  // --- Groups: shared fixtures, two stacked score rows ---
  const groupsHtml = Object.keys(GROUPS).map(g => {
    const matches = GROUPS[g].matches.map(m => {
      const mp = me.preds[m.id], tp = them.preds[m.id];
      const bothFilled = mp && tp && mp.home != null && mp.away != null && tp.home != null && tp.away != null;
      const same = bothFilled && Number(mp.home) === Number(tp.home) && Number(mp.away) === Number(tp.away);
      const badge = bothFilled
        ? (same ? '<span class="cmp-badge cmp-ok">✓ igual</span>' : '<span class="cmp-badge cmp-diff">✗ diverge</span>')
        : '';
      const r = results[m.id];
      const finished = r && r.status === 'finished' && r.home != null && r.away != null;
      const mePts = finished ? matchPoints(m.id, me.preds, me.koMatches, results) : null;
      const themPts = finished ? matchPoints(m.id, them.preds, them.koMatches, results) : null;
      const officialRow = finished
        ? `<div class="cmp-row cmp-row-official"><span class="cmp-who">Resultado</span><span class="cmp-score">${r.home} — ${r.away}</span></div>`
        : '';
      return `
        <div class="cmp-match">
          <div class="cmp-fixture">
            <span class="cmp-fx-team">${flag(m.home)} ${m.home}</span>
            <span class="cmp-fx-x">×</span>
            <span class="cmp-fx-team">${m.away} ${flag(m.away)}</span>
          </div>
          ${officialRow}
          <div class="cmp-row"><span class="cmp-who">${myName}</span><span class="cmp-score">${fmtScore(mp)}</span>${cmpPoints(mePts)}</div>
          <div class="cmp-row${same ? ' cmp-row-ok' : (bothFilled ? ' cmp-row-diff' : '')}">
            <span class="cmp-who">${themName}</span><span class="cmp-score">${fmtScore(tp)}</span>${cmpPoints(themPts)}${badge}
          </div>
        </div>`;
    }).join('');
    return `<div class="cmp-group"><h4 class="cmp-group-title">Grupo ${g}</h4>${matches}</div>`;
  }).join('');

  // --- Knockout: teams differ per user, so each row is self-contained ---
  const koLine = (km) => {
    if (!km) return '<span class="cmp-ko-line">–</span>';
    const score = (km.home != null && km.away != null) ? `${km.home} — ${km.away}` : '–';
    const pen = km.penWinner && km.home != null && km.away != null && Number(km.home) === Number(km.away)
      ? ` <span class="cmp-pen">(pên: ${km.penWinner})</span>` : '';
    return `<span class="cmp-ko-line">${flag(km.homeTeam)} ${km.homeTeam} <strong>${score}</strong> ${km.awayTeam} ${flag(km.awayTeam)}${pen}</span>`;
  };
  const koOfficial = (m) => {
    const res = results[m.id];
    if (!res || res.status !== 'finished' || res.home == null || res.away == null) return '';
    const pen = res.penWinner && Number(res.home) === Number(res.away)
      ? ` <span class="cmp-pen">(pên: ${res.penWinner})</span>` : '';
    return `<div class="cmp-row cmp-ko-row cmp-row-official"><span class="cmp-who">Resultado</span>` +
      `<span class="cmp-ko-line">${flag(res.homeTeam)} ${res.homeTeam} <strong>${res.home} — ${res.away}</strong> ${res.awayTeam} ${flag(res.awayTeam)}${pen}</span></div>`;
  };
  const rounds = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
  const koHtml = rounds.map(r => {
    const matches = KNOCKOUT[r].map(m => {
      const res = results[m.id];
      const finished = res && res.status === 'finished' && res.home != null && res.away != null;
      const mePts = finished ? matchPoints(m.id, me.preds, me.koMatches, results) : null;
      const themPts = finished ? matchPoints(m.id, them.preds, them.koMatches, results) : null;
      return `
      <div class="cmp-match cmp-ko-match">
        ${koOfficial(m)}
        <div class="cmp-row cmp-ko-row"><span class="cmp-who">${myName}</span>${koLine(me.koMatches[m.id])}${cmpPoints(mePts)}</div>
        <div class="cmp-row cmp-ko-row"><span class="cmp-who">${themName}</span>${koLine(them.koMatches[m.id])}${cmpPoints(themPts)}</div>
      </div>`;
    }).join('');
    return `<div class="cmp-group"><h4 class="cmp-group-title">${ROUND_LABELS[r]}</h4>${matches}</div>`;
  }).join('');

  detail.classList.remove('hidden');
  detail.innerHTML = `
    <div class="cmp-header">
      <h3>${myName} <span class="cmp-vs">vs</span> ${themName}</h3>
      <button class="cmp-close" type="button" aria-label="Fechar comparação">×</button>
    </div>
    <div class="cmp-champions">
      <span>Seu campeão: ${flag(me.champion)} <strong>${me.champion}</strong></span>
      <span>Campeão de ${themName}: ${flag(them.champion)} <strong>${them.champion}</strong></span>
    </div>
    <div class="cmp-tabs">
      <button class="cmp-tab active" data-panel="groups" type="button">Grupos</button>
      <button class="cmp-tab" data-panel="ko" type="button">Mata-Mata</button>
    </div>
    <div class="cmp-panel" id="cmp-panel-groups">${groupsHtml}</div>
    <div class="cmp-panel hidden" id="cmp-panel-ko">${koHtml}</div>
  `;

  detail.querySelector('.cmp-close').addEventListener('click', () => {
    detail.classList.add('hidden');
    detail.innerHTML = '';
  });
  detail.querySelectorAll('.cmp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      detail.querySelectorAll('.cmp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      detail.querySelector('#cmp-panel-groups').classList.toggle('hidden', tab.dataset.panel !== 'groups');
      detail.querySelector('#cmp-panel-ko').classList.toggle('hidden', tab.dataset.panel !== 'ko');
    });
  });

  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// -----------------------------------------------------------------------
// Leagues (private bolões)
// -----------------------------------------------------------------------
// Short, shareable codes that avoid easily-confused characters (0/O, 1/I).
function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function getActiveLeague() {
  return userLeagues.find(l => l.id === activeLeagueId) || null;
}

function activeLeagueName() {
  const l = getActiveLeague();
  return l ? l.name : 'Geral';
}

// Scope ranking/compare to the active league's members; null = everyone.
// Guests are never persisted to `users`, but filter them out defensively too.
function scopeUsers(users) {
  const real = users.filter(u => !u.isAnonymous && !u.isGuest);
  const l = getActiveLeague();
  return l ? real.filter(u => l.memberUids.includes(u.uid)) : real;
}

function restoreActiveLeague() {
  const saved = localStorage.getItem('active_league') || 'geral';
  activeLeagueId = (saved === 'geral' || userLeagues.some(l => l.id === saved)) ? saved : 'geral';
}

function setActiveLeague(id) {
  activeLeagueId = id;
  localStorage.setItem('active_league', id);
}

// Auto-join a league when the app is opened with ?join=CODE.
async function consumeJoinLink() {
  const params = new URLSearchParams(location.search);
  const code = params.get('join');
  if (!code) return;
  params.delete('join');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
  const league = await findLeagueByCode(code.toUpperCase());
  if (!league) return;
  if (!league.memberUids.includes(currentUser.uid)) {
    await joinLeague(league.id, currentUser.uid);
    league.memberUids.push(currentUser.uid);
  }
  if (!userLeagues.some(l => l.id === league.id)) userLeagues.push(league);
  setActiveLeague(league.id);
}

function leagueSwitcherHtml() {
  const opts = [{ id: 'geral', name: 'Geral' }, ...userLeagues]
    .map(l => `<option value="${l.id}"${l.id === activeLeagueId ? ' selected' : ''}>${l.name}</option>`)
    .join('');
  return `<label class="league-switch">
      <span class="league-switch-label">Liga:</span>
      <select class="league-select" aria-label="Liga ativa">${opts}</select>
    </label>`;
}

function wireLeagueSwitcher(root, onChange) {
  const sel = root.querySelector('.league-select');
  if (sel) sel.addEventListener('change', () => { setActiveLeague(sel.value); onChange(); });
}

function renderLeaguesView() {
  const container = document.getElementById('view-leagues');
  const inviteBase = location.origin + location.pathname;

  const leagueCard = (l) => {
    const isActive = l.id === activeLeagueId;
    const link = `${inviteBase}?join=${l.code}`;
    const count = l.memberUids.length;
    return `<div class="league-card${isActive ? ' active' : ''}">
        <div class="league-card-head">
          <span class="league-card-name">${l.name}</span>
          ${isActive
            ? '<span class="league-badge">Ativa</span>'
            : `<button class="league-activate" data-id="${l.id}" type="button">Ativar</button>`}
        </div>
        <div class="league-card-meta">
          <span class="league-code">Código <strong>${l.code}</strong></span>
          <span>${count} ${count === 1 ? 'membro' : 'membros'}</span>
        </div>
        <button class="league-copy" data-link="${link}" type="button">Copiar convite</button>
      </div>`;
  };

  const geralActive = activeLeagueId === 'geral';
  const geralCard = `<div class="league-card${geralActive ? ' active' : ''}">
      <div class="league-card-head">
        <span class="league-card-name">Geral</span>
        ${geralActive
          ? '<span class="league-badge">Ativa</span>'
          : '<button class="league-activate" data-id="geral" type="button">Ativar</button>'}
      </div>
      <div class="league-card-meta"><span>Todos os participantes</span></div>
    </div>`;

  container.innerHTML = `
    <div class="compare-header"><h2>Ligas</h2></div>
    <p class="league-intro">Crie uma liga privada e compartilhe o convite — o ranking e a comparação passam a contar só entre os membros dela.</p>
    <div class="league-list">
      ${geralCard}
      ${userLeagues.map(leagueCard).join('')}
    </div>
    <div class="league-actions">
      <form class="league-form" id="form-create">
        <input class="league-input" id="input-create" type="text" maxlength="30"
          placeholder="Nome da nova liga" aria-label="Nome da nova liga" required>
        <button class="league-btn" type="submit">Criar liga</button>
      </form>
      <form class="league-form" id="form-join">
        <input class="league-input league-input-code" id="input-join" type="text" maxlength="6"
          placeholder="Código do convite" aria-label="Código do convite" required>
        <button class="league-btn" type="submit">Entrar</button>
      </form>
      <p class="league-msg" id="league-msg" aria-live="polite"></p>
    </div>`;

  container.querySelectorAll('.league-activate').forEach(btn => {
    btn.addEventListener('click', () => { setActiveLeague(btn.dataset.id); renderLeaguesView(); });
  });
  container.querySelectorAll('.league-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.link); btn.textContent = 'Convite copiado!'; }
      catch { btn.textContent = btn.dataset.link; }
      setTimeout(() => { btn.textContent = 'Copiar convite'; }, 2000);
    });
  });
  container.querySelector('#form-create').addEventListener('submit', e => {
    e.preventDefault();
    const name = container.querySelector('#input-create').value.trim();
    if (name) createLeagueFlow(name);
  });
  container.querySelector('#form-join').addEventListener('submit', e => {
    e.preventDefault();
    const code = container.querySelector('#input-join').value.trim().toUpperCase();
    if (code) joinLeagueFlow(code);
  });
}

async function createLeagueFlow(name) {
  const league = {
    id: crypto.randomUUID(),
    name,
    code: generateCode(),
    ownerUid: currentUser.uid,
    memberUids: [currentUser.uid],
  };
  await createLeague(league);
  userLeagues.push(league);
  setActiveLeague(league.id);
  renderLeaguesView();
}

async function joinLeagueFlow(code) {
  const msg = document.getElementById('league-msg');
  if (userLeagues.some(l => l.code === code)) {
    setActiveLeague(userLeagues.find(l => l.code === code).id);
    renderLeaguesView();
    return;
  }
  const league = await findLeagueByCode(code);
  if (!league) { if (msg) msg.textContent = 'Liga não encontrada para esse código.'; return; }
  await joinLeague(league.id, currentUser.uid);
  if (!league.memberUids.includes(currentUser.uid)) league.memberUids.push(currentUser.uid);
  userLeagues.push(league);
  setActiveLeague(league.id);
  renderLeaguesView();
}

// -----------------------------------------------------------------------
// Ranking view
// -----------------------------------------------------------------------
// Ordered scoring rounds, used to compute per-round points and position movement.
const groupIdsByMd = md =>
  Object.values(GROUPS).flatMap(g => g.matches).filter(m => m.md === md).map(m => m.id);

const RANKING_ROUNDS = [
  { label: 'Rodada 1 (grupos)', ids: groupIdsByMd(1) },
  { label: 'Rodada 2 (grupos)', ids: groupIdsByMd(2) },
  { label: 'Rodada 3 (grupos)', ids: groupIdsByMd(3) },
  { label: ROUND_LABELS.r32, ids: KNOCKOUT.r32.map(m => m.id) },
  { label: ROUND_LABELS.r16, ids: KNOCKOUT.r16.map(m => m.id) },
  { label: ROUND_LABELS.qf, ids: KNOCKOUT.qf.map(m => m.id) },
  { label: ROUND_LABELS.sf, ids: KNOCKOUT.sf.map(m => m.id) },
  { label: 'Final / 3º lugar', ids: [...KNOCKOUT.third, ...KNOCKOUT.final].map(m => m.id) },
];

// Results restricted to every match up to and including round `idx`.
function resultsUpTo(idx) {
  const allow = new Set(RANKING_ROUNDS.slice(0, idx + 1).flatMap(r => r.ids));
  const out = {};
  Object.keys(results).forEach(id => { if (allow.has(id)) out[id] = results[id]; });
  return out;
}

function movementChip(e, hasPrev) {
  if (!hasPrev || e.prevPos == null) {
    return '<span class="rank-move rank-move-flat" aria-label="estreia">•</span>';
  }
  const d = e.prevPos - e.pos;
  if (d > 0) return `<span class="rank-move rank-move-up" aria-label="subiu ${d}">▲${d}</span>`;
  if (d < 0) return `<span class="rank-move rank-move-down" aria-label="caiu ${-d}">▼${-d}</span>`;
  return '<span class="rank-move rank-move-flat" aria-label="manteve">–</span>';
}

// Achievement chips for a ranking entry. `isLeader`/`isRoundTop` are league-relative.
function badgesFor(e, isLeader, isRoundTop) {
  const badges = [];
  if (isLeader) badges.push(['👑', 'Líder da liga']);
  if (isRoundTop) badges.push(['🎯', 'Mais cravadas na rodada']);
  if (e.streak >= 3) badges.push(['🔥', `Em chamas — ${e.streak} acertos seguidos`]);
  if (e.perfect > 0) badges.push(['✅', `Grupo perfeito${e.perfect > 1 ? ` ×${e.perfect}` : ''}`]);
  if (e.nostradamus) badges.push(['🔮', 'Nostradamus — cravou o campeão']);
  if (!badges.length) return '';
  return `<span class="ranking-badges">${badges
    .map(([icon, label]) => `<span class="ach-badge" title="${label}" aria-label="${label}">${icon}</span>`)
    .join('')}</span>`;
}

async function renderRankingView() {
  const container = document.getElementById('view-ranking');
  container.innerHTML = '<p class="loading-msg">Carregando...</p>';

  const { users: roster, preds } = await loadRoster();
  const users = scopeUsers(roster);

  // Which rounds have been (at least partially) played, in order.
  const playedIdx = RANKING_ROUNDS
    .map((r, i) => (r.ids.some(id => results[id]?.status === 'finished') ? i : -1))
    .filter(i => i >= 0);
  const lastIdx = playedIdx[playedIdx.length - 1];
  const prevIdx = playedIdx.length > 1 ? playedIdx[playedIdx.length - 2] : null;
  const hasResults = lastIdx != null;
  const prevResults = prevIdx != null ? resultsUpTo(prevIdx) : null;

  const nameCmp = (a, b) => (a.user.displayName || '').localeCompare(b.user.displayName || '');

  const entries = users.map(u => {
    const cur = scoreUser(preds[u.uid], results);
    const prev = prevResults ? scoreUser(preds[u.uid], prevResults) : null;
    return {
      user: u, ...cur, prev, prevTotal: prev ? prev.total : 0,
      roundExact: cur.exact - (prev ? prev.exact : 0),
      streak: bestStreak(preds[u.uid], results),
      perfect: perfectGroups(preds[u.uid], results),
      nostradamus: isNostradamus(preds[u.uid], results),
    };
  });

  const maxRoundExact = Math.max(0, ...entries.map(e => e.roundExact));

  const curOrder = [...entries].sort((a, b) =>
    b.total - a.total || b.exact - a.exact || b.correct - a.correct || nameCmp(a, b));
  curOrder.forEach((e, i) => { e.pos = i + 1; });

  if (prevResults) {
    const prevOrder = [...entries].sort((a, b) =>
      b.prev.total - a.prev.total || b.prev.exact - a.prev.exact ||
      b.prev.correct - a.prev.correct || nameCmp(a, b));
    prevOrder.forEach((e, i) => { e.prevPos = i + 1; });
  }

  const rowsHtml = curOrder.map(e => {
    const isMe = currentUser && e.user.uid === currentUser.uid;
    const roundPts = e.total - e.prevTotal;
    const roundBadge = hasResults && roundPts > 0
      ? `<span class="ranking-round-pts">+${roundPts}</span>` : '';
    const isLeader = hasResults && e.pos === 1 && e.total > 0;
    const isRoundTop = hasResults && maxRoundExact > 0 && e.roundExact === maxRoundExact;
    return `
      <div class="ranking-row${isMe ? ' ranking-row-me' : ''}">
        <span class="ranking-pos">${e.pos}</span>
        ${movementChip(e, !!prevResults)}
        ${avatarHtml(e.user, 'ranking-avatar')}
        <div class="ranking-info">
          <span class="ranking-name">${e.user.displayName}${isMe ? ' (eu)' : ''}</span>
          <span class="ranking-stats">${e.exact} cravadas · ${e.correct} resultados</span>
          ${badgesFor(e, isLeader, isRoundTop)}
        </div>
        <span class="ranking-points">${roundBadge}<span class="ranking-total">${e.total}<small>pts</small></span></span>
      </div>`;
  }).join('');

  const empty = hasResults ? '' :
    `<p class="ranking-empty">Os jogos ainda não começaram — o ranking aparece assim que os primeiros resultados saírem.</p>`;
  const roundNote = hasResults
    ? `<p class="ranking-round-note">Última rodada pontuada: <strong>${RANKING_ROUNDS[lastIdx].label}</strong> — o <span class="rank-move rank-move-up">▲</span>/<span class="rank-move rank-move-down">▼</span> mostra a variação desde a rodada anterior.</p>`
    : '';

  container.innerHTML = `
    <div class="compare-header"><h2>Ranking · ${activeLeagueName()}</h2>${leagueSwitcherHtml()}${refreshBtnHtml}</div>
    ${empty}
    ${roundNote}
    <div class="ranking-list">${rowsHtml}</div>
  `;

  attachAvatarFallback(container);
  wireLeagueSwitcher(container, renderRankingView);
  wireRefresh(container, renderRankingView);
}
