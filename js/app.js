import { loginWithGoogle, logout, onAuthChange, loginAsGuest, registerWithEmail, loginWithEmail, sendMagicLink, completeMagicLinkIfPresent, upgradeGuest, upgradeGuestWithGoogle, saveUser, savePred, loadPreds, loadAllUsers, loadUserPreds, loadResults, watchResults, createLeague, findLeagueByCode, joinLeague, loadUserLeagues } from './db.js';
import { GROUPS, FLAGS, KNOCKOUT, ROUND_LABELS } from './data.js';
import { venueLabel } from './venues.js';
import { FEATURES } from './features.js';
import { t, tTeam, lang, setLang, applyStaticI18n } from './i18n.js';
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
let fixturesScrollPending = false; // login opened Jogos before results loaded; scroll once they arrive

const KNOCKOUT_IDS = new Set(Object.values(KNOCKOUT).flat().map(m => m.id));

// Admin gate (cosmetic, client-side): only these uids see the Admin dashboard tab.
// Everything the dashboard shows is already readable by any signed-in user
// (see firestore.rules), so this only hides the tab — it is NOT a security boundary.
// An `admin_uids` localStorage value overrides the list (used by E2E / manual debug).
const ADMIN_UIDS = (() => {
  try {
    const override = localStorage.getItem('admin_uids');
    if (override) return override.split(',').map(s => s.trim()).filter(Boolean);
  } catch { /* no localStorage */ }
  return ['bYoZHDauDMYgHSomEPh12v0Ern53'];
})();

function isAdmin() {
  return !!currentUser && ADMIN_UIDS.includes(currentUser.uid);
}

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

const KICKOFF_FMT = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short', day: '2-digit', month: 'short',
  hour: '2-digit', minute: '2-digit',
});

function formatKickoff(kickoff) {
  const ms = kickoffMs(kickoff);
  if (ms == null) return '';
  return KICKOFF_FMT.format(new Date(ms)).replace(/\./g, '');
}

// Escape user-controlled text (display names, league names) before it goes into
// innerHTML — prevents stored XSS from a malicious displayName / league name.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Google/Firebase avatars 403 when a Referer is sent — no-referrer + initials fallback.
function avatarHtml(user, cls) {
  const initial = escapeHtml(user.displayName?.[0] || '?');
  return user.photoURL
    ? `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(user.displayName)}" class="${cls}"
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
    ? `<div class="progress-row"><span class="progress-msg">${t('progress.complete')}</span></div>`
    : `<div class="progress-row">
        <span class="progress-msg">${t('progress.remaining', { done: total - done, total })}</span>
        <span class="progress-detail">${t('progress.detail', { group: c.group, groupTotal: c.groupTotal, ko: c.ko, koTotal: c.koTotal })}</span>
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
const GUEST_LOCKED_VIEWS = ['ranking', 'leagues'];

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

  // A single read of the whole results collection is the source of truth on boot.
  // The real-time listener is attached on demand (syncLiveListener) only while a
  // match is on/imminent — not held open 24/7 re-reading the collection. Best-effort
  // and async so a slow Firestore never freezes the loading screen.
  loadResults()
    .then(r => { results = r || {}; onResultsLoaded(); })
    .catch(err => console.error('loadResults failed', err));

  if (!guest) {
    loadUserLeagues(user.uid)
      .then(l => { userLeagues = l || []; restoreActiveLeague(); })
      .catch(err => console.error('loadUserLeagues failed', err));
    consumeJoinLink().catch(err => console.error('consumeJoinLink failed', err));
  }
});

// "New version available" prompt. The SW registration in index.html dispatches
// `sw-waiting` (and stashes `window.__swWaiting`) when a new build is installed and
// waiting; we show a toast and apply it on tap (SKIP_WAITING → controllerchange →
// reload, handled in index.html).
function initUpdatePrompt() {
  if (window.__swWaiting) showUpdateToast(window.__swWaiting);
  window.addEventListener('sw-waiting', e => showUpdateToast(e.detail));
}

function showUpdateToast(worker) {
  const el = document.getElementById('update-toast');
  if (!el || !worker) return;
  el.innerHTML = `
    <span class="update-toast-text">${t('update.text')}</span>
    <button class="update-toast-action" type="button">${t('update.action')}</button>
    <button class="update-toast-close" type="button" aria-label="${t('update.dismiss')}">×</button>`;
  el.classList.remove('hidden');
  el.querySelector('.update-toast-action').addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
  el.querySelector('.update-toast-close').addEventListener('click', () => {
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
  const key = 'err.' + (err?.code || '');
  const msg = t(key);
  return msg === key ? t('err.generic') : msg;
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
    await sendMagicLink(email, name || email.split('@')[0]);
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
// Theme picker
// -----------------------------------------------------------------------
// The saved theme is applied before paint by an inline script in index.html;
// here we keep the PWA status-bar color and the swatch "pressed" state in sync,
// and persist changes. Theme = device preference (localStorage), no Firestore.
const THEME_COLORS = {
  classico: '#0d1117',
  copa: '#0a1a10',
  sunset: '#2b0f47',
  neon: '#0b0f1f',
  claro: '#ffffff',
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch { /* private mode */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && THEME_COLORS[theme]) meta.content = THEME_COLORS[theme];
  document.querySelectorAll('.theme-swatch').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.themeValue === theme)));
}

document.querySelectorAll('.theme-swatch').forEach(btn =>
  btn.addEventListener('click', () => applyTheme(btn.dataset.themeValue)));

// Sync status-bar color + pressed state with whatever the boot script applied.
applyTheme(document.documentElement.dataset.theme || 'classico');

// -----------------------------------------------------------------------
// Language
// -----------------------------------------------------------------------
// Translate the static markup on boot, then wire the PT/EN switcher. Changing the
// language reloads the page so every rendered view picks up the new strings — it's a
// rare action and far simpler/safer than re-running every render function.
document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
applyStaticI18n();
initUpdatePrompt();
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  btn.addEventListener('click', () => {
    if (btn.dataset.lang === lang) return;
    setLang(btn.dataset.lang);
    location.reload();
  });
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
  const start = predsComplete(predictions) ? 'fixtures' : 'groups';
  switchMainView(start);
}

// Dim the social tabs a guest can't open yet, and reveal the Admin tab to admins.
function applyGuestUi() {
  const guest = isGuest();
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('locked', guest && GUEST_LOCKED_VIEWS.includes(tab.dataset.view));
  });
  document.querySelector('.nav-tab-admin')?.classList.toggle('hidden', !isAdmin());
}

function switchMainView(view) {
  // Non-admins can never land on the admin view (the tab is hidden, but guard anyway).
  if (view === 'admin' && !isAdmin()) view = 'groups';
  // Optional chaining so a stale cached index.html (missing a newly-added view,
  // e.g. view-admin) can't crash the boot — the SW serves fresh HTML on next load.
  ['fixtures', 'groups', 'knockout', 'ranking', 'leagues', 'admin'].forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  if (isGuest() && GUEST_LOCKED_VIEWS.includes(view)) {
    renderGuestGate(document.getElementById(`view-${view}`), view);
    return;
  }
  if (view === 'fixtures') renderFixturesView({ scroll: true });
  if (view === 'ranking') renderRankingView();
  if (view === 'leagues') renderLeaguesView();
  if (view === 'admin') renderAdminView();
}

// Shown to a guest in place of a locked social view: a sign-up prompt that
// promotes the anonymous account (keeping their predictions).
function renderGuestGate(container, view) {
  const what = view === 'ranking' ? t('guest.ranking')
    : view === 'leagues' ? t('guest.leagues') : t('guest.compare');
  container.innerHTML = `
    <div class="guest-gate">
      <span class="guest-gate-icon" aria-hidden="true">🔒</span>
      <h2>${t('guest.heading', { what })}</h2>
      <p>${t('guest.body')}</p>
      <form class="email-form guest-upgrade-form" novalidate>
        <input class="login-input" type="text" autocomplete="name" placeholder="${t('login.name')}" aria-label="${t('login.name')}" />
        <input class="login-input" type="email" autocomplete="email" placeholder="${t('login.email')}" aria-label="${t('login.email')}" required />
        <input class="login-input" type="password" autocomplete="new-password" placeholder="${t('guest.password')}" aria-label="${t('guest.password')}" />
        <button class="btn-upgrade" type="submit">${t('guest.create')}</button>
        <button class="btn-magic" type="button" data-google>${t('guest.google')}</button>
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
    if (!email || !password) { msg.textContent = t('guest.fill'); return; }
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
    ? `<img src="${escapeHtml(currentUser.photoURL)}" alt="${escapeHtml(currentUser.displayName)}" class="avatar" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  el.innerHTML = `${photo}<span class="user-name">${escapeHtml(currentUser.displayName)}</span>`;
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
        <h3 class="matchday-label">${t('groups.matchday', { n: md })}</h3>
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
        <span class="pen-label">${t('pens.label')}</span>
        <label class="pen-option">
          <input type="radio" name="pen-${match.id}" value="${hTeam}"
            ${pred.penWinner === hTeam ? 'checked' : ''} ${locked ? 'disabled' : ''}
            class="pen-radio" data-match-id="${match.id}">
          <span>${flag(hTeam)} ${tTeam(hTeam)}</span>
        </label>
        <label class="pen-option">
          <input type="radio" name="pen-${match.id}" value="${aTeam}"
            ${pred.penWinner === aTeam ? 'checked' : ''} ${locked ? 'disabled' : ''}
            class="pen-radio" data-match-id="${match.id}">
          <span>${flag(aTeam)} ${tTeam(aTeam)}</span>
        </label>
      </div>`;
  }

  return `
    <div class="match-card${locked ? ' locked' : ''}${live ? ' live' : ''}${live && r?.status === 'paused' ? ' paused' : ''}${resultClass}" id="match-${match.id}">
      ${headerHtml}
      <div class="match-body">
        <div class="team home-team">
          <span class="team-name">${tTeam(hTeam)}</span>
          <span class="team-flag">${flag(hTeam)}</span>
        </div>
        <div class="score-area">
          <input type="number" min="0" max="20" class="score-input"
            data-match-id="${match.id}" data-side="home"
            value="${hVal}" ${lockAttrs} aria-label="${t('aria.score', { team: tTeam(hTeam) })}">
          <span class="score-sep">×</span>
          <input type="number" min="0" max="20" class="score-input"
            data-match-id="${match.id}" data-side="away"
            value="${aVal}" ${lockAttrs} aria-label="${t('aria.score', { team: tTeam(aTeam) })}">
        </div>
        <div class="team away-team">
          <span class="team-flag">${flag(aTeam)}</span>
          <span class="team-name">${tTeam(aTeam)}</span>
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
    ? `${flag(r.homeTeam)} ${tTeam(r.homeTeam)} ${h} × ${a} ${tTeam(r.awayTeam)} ${flag(r.awayTeam)}`
    : `${h} × ${a}`;
  return `<div class="match-live${paused ? ' paused' : ''}">
      <span class="live-dot" aria-hidden="true"></span>
      <span class="live-label">${paused ? t('live.half') : t('live.now')}</span>
      <span class="live-score">${score}</span>
    </div>`;
}

// A match is "in play" (showing a live scoreline) while live or at halftime.
// Gated by the liveScores flag — the free data source's live data is unreliable.
//
// Sanity guard: a match lasts ~2h (≤~3h with extra time + penalties in the
// knockout). The free feed sometimes never reports FINISHED — and the cron is
// flaky — so a doc can stay stuck on 'live'/'paused' indefinitely, leaving a
// long-finished game showing "AO VIVO". Past this margin from kickoff we stop
// trusting the live status regardless of what the feed says.
const LIVE_MAX_MS = 3.5 * 60 * 60 * 1000;
function isInPlay(r) {
  if (!FEATURES.liveScores) return false;
  if (r?.status !== 'live' && r?.status !== 'paused') return false;
  const ms = kickoffMs(r?.kickoff);
  if (ms != null && Date.now() - ms > LIVE_MAX_MS) return false;
  return true;
}

// Real result + points earned, shown once a match is finished.
function renderMatchResult(r, isKnockout, pts) {
  if (pts == null) return '';
  const ptsClass = pts === 5 ? 'pts-exact' : pts === 3 ? 'pts-partial' : 'pts-zero';
  const badge = `<span class="result-pts ${ptsClass}">+${pts}</span>`;
  const score = isKnockout
    ? `${flag(r.homeTeam)} ${tTeam(r.homeTeam)} ${r.home} × ${r.away} ${tTeam(r.awayTeam)} ${flag(r.awayTeam)}`
    : `${r.home} × ${r.away}`;
  return `<div class="match-result"><span class="result-label">${t('result.label')}</span> ${score} ${badge}</div>`;
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
      <td class="team-cell">${flag(s.team)} ${tTeam(s.team)}</td>
      <td>${s.played}</td>
      <td>${s.gf}</td>
      <td>${s.gd >= 0 ? '+' : ''}${s.gd}</td>
      <td class="pts-cell">${s.pts}</td>
    </tr>`;
  }).join('');

  return `
    <table class="standings-table" aria-label="${t('standings.aria', { group: groupKey })}">
      <thead>
        <tr>
          <th>#</th>
          <th>${t('standings.team')}</th>
          <th title="${t('std.playedT')}">${t('std.played')}</th>
          <th title="${t('std.gfT')}">${t('std.gf')}</th>
          <th title="${t('std.gdT')}">${t('std.gd')}</th>
          <th title="${t('std.ptsT')}">${t('std.pts')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="standings-legend">
      <span class="legend-dot rank-1st-dot"></span> ${t('std.q1')}
      <span class="legend-dot rank-2nd-dot"></span> ${t('std.q2')}
      <span class="legend-dot rank-3rd-dot"></span> ${t('std.q3')}
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

  // The main bracket is the tree r32 → r16 → qf → sf → final, laid out as
  // horizontally-scrollable columns (each column's nodes spread with space-around so
  // they align against their feeders in the previous column). Third place is a
  // consolation match, shown separately below the tree.
  const treeRounds = ['r32', 'r16', 'qf', 'sf', 'final'];
  const colsHtml = treeRounds.map(r =>
    `<div class="ko-col" data-round="${r}">
       <div class="ko-col-head">${t('round.' + r)}</div>
       <div class="ko-col-body" id="ko-col-${r}"></div>
     </div>`
  ).join('');

  const lockNotice = koFillLocked
    ? `<div class="ko-locked-notice">${t('ko.locked')}</div>` : '';

  container.innerHTML = `
    ${lockNotice}
    <div class="ko-hint">${t('ko.hint')}</div>
    <div class="ko-bracket-scroll">
      <div class="ko-bracket">${colsHtml}</div>
    </div>
    <div class="ko-third">
      <div class="ko-col-head ko-third-head">${t('round.third')}</div>
      <div class="ko-col-body" id="ko-col-third"></div>
    </div>
  `;

  rounds.forEach(r => renderKnockoutRound(r));
}

function renderKnockoutRound(round) {
  const panel = document.getElementById(`ko-col-${round}`);
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
      // Display uses the active language; pen-radio VALUE stays the canonical pt name
      // (it's the identity compared by the scoring engine).
      if (homeNameEl) homeNameEl.textContent = tTeam(km.homeTeam);
      if (awayNameEl) awayNameEl.textContent = tTeam(km.awayTeam);
      if (homeFlagEl) homeFlagEl.innerHTML = flag(km.homeTeam);
      if (awayFlagEl) awayFlagEl.innerHTML = flag(km.awayTeam);

      // Also update pen radio labels
      const radios = card.querySelectorAll('.pen-radio');
      if (radios.length === 2) {
        radios[0].value = km.homeTeam;
        radios[0].name = `pen-${m.id}`;
        radios[0].dataset.matchId = m.id;
        const label0 = radios[0].closest('label');
        if (label0) label0.querySelector('span').innerHTML = `${flag(km.homeTeam)} ${tTeam(km.homeTeam)}`;

        radios[1].value = km.awayTeam;
        radios[1].name = `pen-${m.id}`;
        radios[1].dataset.matchId = m.id;
        const label1 = radios[1].closest('label');
        if (label1) label1.querySelector('span').innerHTML = `${flag(km.awayTeam)} ${tTeam(km.awayTeam)}`;
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
  if (key === today) return t('fx.today');
  if (key === tomorrow) return t('fx.tomorrow');
  const fmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short',
  });
  return fmt.format(new Date(ms)).replace(/\./g, '');
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

// The fixture to surface when opening Jogos: the one in play now, else the next
// to start. items are sorted by kickoff, so the first non-finished match is it.
function focusFixtureId(items) {
  const next = items.find(it => results[it.match.id]?.status !== 'finished');
  return next ? next.match.id : null;
}

function renderFixturesView({ scroll = false } = {}) {
  const container = document.getElementById('view-fixtures');
  currentUserKo = resolveKnockout(predictions);
  const items = fixtureList();

  if (!items.length) {
    // Schedule not loaded yet (results still arriving on login): remember to scroll
    // to the current/next match once the fixtures land, via applyResultsUpdate.
    if (scroll) fixturesScrollPending = true;
    container.innerHTML = `
      <div class="compare-header"><h2>${t('nav.fixtures')}</h2></div>
      <p class="ranking-empty">${t('fx.empty')}</p>`;
    return;
  }

  if (scroll) fixturesScrollPending = false;
  const focusId = scroll ? focusFixtureId(items) : null;

  const buckets = [];
  items.forEach(it => {
    const label = dayLabel(it.ms);
    let b = buckets[buckets.length - 1];
    if (!b || b.label !== label) { b = { label, items: [] }; buckets.push(b); }
    b.items.push(it);
  });

  container.innerHTML = `
    <div class="compare-header"><h2>${t('nav.fixtures')}</h2></div>
    ${buckets.map(b => `
      <div class="fx-day">
        <h3 class="fx-day-label">${b.label}</h3>
        ${b.items.map(it => renderFixtureCard(it, it.match.id === focusId)).join('')}
      </div>`).join('')}`;

  container.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('blur', () => {
      const { matchId, side } = input.dataset;
      savePrediction(matchId, side, input.value);
    });
  });

  if (focusId) {
    container.querySelector(`#fx-match-${focusId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function renderFixtureCard(it, focused = false) {
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
    <div class="match-card fx-card${locked ? ' locked' : ''}${live ? ' live' : ''}${live && r?.status === 'paused' ? ' paused' : ''}${focused ? ' fx-focus' : ''}${resultClass}" id="fx-match-${match.id}">
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

// Re-render whichever results-dependent tab is currently open. Groups/knockout
// keep their sub-tab state, so they refresh on reentry, not here.
function renderActiveResultsView() {
  const active = document.querySelector('.nav-tab.active')?.dataset.view;
  if (active === 'fixtures') renderFixturesView({ scroll: fixturesScrollPending });
  else if (active === 'ranking') renderRankingView();
  else if (active === 'admin') renderAdminView();
}

// Initial results read (loadResults on boot) landed: render everything that
// depends on results, then start the live listener if a match is on/imminent.
function onResultsLoaded() {
  renderProgress();
  renderGroupsView();
  renderKnockoutView();
  renderActiveResultsView();
  syncLiveListener();
}

// Live results arrive via a Firestore real-time listener (watchResults): instant
// updates, billed per changed doc, so live scores/badges and finished results show
// up without a reload and without polling cost.
function applyResultsUpdate(fresh) {
  const changed = resultsSignature(fresh) !== resultsSignature(results);
  results = fresh;
  if (!changed) return;
  // Never rebuild a card the user is currently typing into.
  if (document.activeElement?.classList?.contains('score-input')) return;
  renderActiveResultsView();
}

// Start listening to results ~2h before a kickoff and keep it up to ~3.5h after,
// covering pre-match, the ~2h game, and a delayed FINISHED status from the ingester.
// Closing the window (after the last match) is handled by the periodic re-check
// below, not from the listener callback — re-attaching there would recurse, since
// the fake backend invokes the snapshot callback synchronously on subscribe.
const LIVE_WINDOW_BEFORE = 2 * 60 * 60 * 1000;
const LIVE_WINDOW_AFTER = 3.5 * 60 * 60 * 1000;

// True when a match is in play or close enough in time that live updates matter.
function liveWindowOpen() {
  const now = Date.now();
  return Object.values(results).some(r => {
    if (r?.status === 'live' || r?.status === 'paused') return true;
    if (r?.status === 'finished') return false;
    const ms = kickoffMs(r?.kickoff);
    return ms != null && ms <= now + LIVE_WINDOW_BEFORE && ms >= now - LIVE_WINDOW_AFTER;
  });
}

// Attach the real-time results listener only when it can actually do something:
// live scores enabled, tab visible, and a match on/near now. Otherwise detach.
// This is what stops idle/backgrounded tabs from re-reading the whole results
// collection around the clock (the overnight read baseline).
function syncLiveListener() {
  const wanted = FEATURES.liveScores
    && (typeof document === 'undefined' || document.visibilityState === 'visible')
    && liveWindowOpen();
  if (wanted && !unsubscribeResults) {
    unsubscribeResults = watchResults(applyResultsUpdate);
  } else if (!wanted && unsubscribeResults) {
    unsubscribeResults();
    unsubscribeResults = null;
  }
}

// Re-evaluate the live window when the tab is shown/hidden and periodically (to
// catch a scheduled match entering the window without any user interaction).
document.addEventListener('visibilitychange', syncLiveListener);
setInterval(syncLiveListener, 5 * 60 * 1000);

// Tick the fixtures lock countdowns once a minute (time-based, no data fetch).
setInterval(() => {
  const v = document.getElementById('view-fixtures');
  if (v && !v.classList.contains('hidden') && !v.contains(document.activeElement)) {
    renderFixturesView();
  }
}, 60000);

// -----------------------------------------------------------------------
// Shared roster cache (ranking + comparison modal)
// -----------------------------------------------------------------------
// In-memory roster cache: { users, preds: { uid: preds } }. Ranking + comparison share it
// so switching tabs or a live score update re-renders WITHOUT re-reading every user's
// predictions from Firestore — that re-read on every navigation/update is what burned
// the daily read quota. Refilled only on first use, on an explicit "Atualizar", or with
// the user's own edits (updated locally, no read). Cleared on auth changes.
let rosterCache = null;

async function loadRoster({ force = false } = {}) {
  if (force) rosterCache = null;
  if (!rosterCache) {
    // Guard against legacy docs saved with a null/empty displayName so the UI never
    // renders the literal string "null" for them. The user list is cheap (one read
    // per user); predictions are the expensive part and are fetched lazily below.
    const users = (await loadAllUsers()).map(u => ({ ...u, displayName: u.displayName || 'Sem nome' }));
    rosterCache = { users, preds: {} };
  }
  // Only the users actually shown (the active league's scope) need their predictions
  // read. Cached per uid, so switching leagues fetches just the newly-scoped users
  // and a re-render never re-reads what's already loaded.
  const scoped = scopeUsers(rosterCache.users);
  await Promise.all(scoped.map(async u => {
    if (!rosterCache.preds[u.uid]) rosterCache.preds[u.uid] = await loadUserPreds(u.uid);
  }));
  return rosterCache;
}

// Reflect the current user's own edits into the shared cache without a read.
function syncOwnPredsToRoster() {
  if (rosterCache && currentUser) rosterCache.preds[currentUser.uid] = { ...predictions };
}

const refreshBtnHtml =
  `<button class="btn-refresh" type="button" aria-label="${t('common.refreshAria')}">${t('common.refresh')}</button>`;

function wireRefresh(container, rerender) {
  const btn = container.querySelector('.btn-refresh');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await loadRoster({ force: true });
    rerender();
  });
}

// Open the comparison modal for "me vs them", building both entries from the
// already-loaded roster + preds map. Reused by the ranking cards. Comparing
// yourself (or an unknown uid) is a no-op.
function openComparison(uid, roster, predsByUid) {
  if (!uid || uid === currentUser?.uid) return;
  const entryFor = (u) => {
    const preds = predsByUid[u.uid] || {};
    const koMatches = resolveKnockout(preds);
    // No champion until the group stage is complete — the bracket would otherwise
    // resolve from partial standings and show a bogus winner.
    return {
      user: u,
      preds,
      koMatches,
      champion: groupStageReady(preds) ? championOf(koMatches) : '?',
      complete: predsComplete(preds),
    };
  };
  const them = roster.find(u => u.uid === uid);
  const me = roster.find(u => u.uid === currentUser?.uid);
  if (them && me) renderComparison(entryFor(me), entryFor(them));
}

// -----------------------------------------------------------------------
// Comparison modal: "you vs them", stacked rows per match
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

function closeCmpModal() {
  const modal = document.getElementById('cmp-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.querySelector('.cmp-modal-body').innerHTML = '';
  document.removeEventListener('keydown', cmpEscHandler);
}

function cmpEscHandler(e) {
  if (e.key === 'Escape') closeCmpModal();
}

function renderComparison(me, them) {
  const modal = document.getElementById('cmp-modal');
  if (!modal) return;
  const detail = modal.querySelector('.cmp-modal-body');
  const myName = t('compare.you');
  const themName = escapeHtml(them.user.displayName);

  // --- Groups: shared fixtures, two stacked score rows ---
  const groupsHtml = Object.keys(GROUPS).map(g => {
    const matches = GROUPS[g].matches.map(m => {
      const mp = me.preds[m.id], tp = them.preds[m.id];
      const bothFilled = mp && tp && mp.home != null && mp.away != null && tp.home != null && tp.away != null;
      const same = bothFilled && Number(mp.home) === Number(tp.home) && Number(mp.away) === Number(tp.away);
      const badge = bothFilled
        ? (same ? `<span class="cmp-badge cmp-ok">${t('cmp.same')}</span>` : `<span class="cmp-badge cmp-diff">${t('cmp.diff')}</span>`)
        : '';
      const r = results[m.id];
      const finished = r && r.status === 'finished' && r.home != null && r.away != null;
      const mePts = finished ? matchPoints(m.id, me.preds, me.koMatches, results) : null;
      const themPts = finished ? matchPoints(m.id, them.preds, them.koMatches, results) : null;
      const officialRow = finished
        ? `<div class="cmp-row cmp-row-official"><span class="cmp-who">${t('cmp.result')}</span><span class="cmp-score">${r.home} — ${r.away}</span></div>`
        : '';
      return `
        <div class="cmp-match">
          <div class="cmp-fixture">
            <span class="cmp-fx-team">${flag(m.home)} ${tTeam(m.home)}</span>
            <span class="cmp-fx-x">×</span>
            <span class="cmp-fx-team">${tTeam(m.away)} ${flag(m.away)}</span>
          </div>
          ${officialRow}
          <div class="cmp-row"><span class="cmp-who">${myName}</span><span class="cmp-score">${fmtScore(mp)}</span>${cmpPoints(mePts)}</div>
          <div class="cmp-row${same ? ' cmp-row-ok' : (bothFilled ? ' cmp-row-diff' : '')}">
            <span class="cmp-who">${themName}</span><span class="cmp-score">${fmtScore(tp)}</span>${cmpPoints(themPts)}${badge}
          </div>
        </div>`;
    }).join('');
    return `<div class="cmp-group"><h4 class="cmp-group-title">${t('cmp.group', { g })}</h4>${matches}</div>`;
  }).join('');

  // --- Knockout: teams differ per user, so each row is self-contained ---
  const koLine = (km) => {
    if (!km) return '<span class="cmp-ko-line">–</span>';
    const score = (km.home != null && km.away != null) ? `${km.home} — ${km.away}` : '–';
    const pen = km.penWinner && km.home != null && km.away != null && Number(km.home) === Number(km.away)
      ? ` <span class="cmp-pen">${t('compare.pen', { team: tTeam(km.penWinner) })}</span>` : '';
    return `<span class="cmp-ko-line">${flag(km.homeTeam)} ${tTeam(km.homeTeam)} <strong>${score}</strong> ${tTeam(km.awayTeam)} ${flag(km.awayTeam)}${pen}</span>`;
  };
  const koOfficial = (m) => {
    const res = results[m.id];
    if (!res || res.status !== 'finished' || res.home == null || res.away == null) return '';
    const pen = res.penWinner && Number(res.home) === Number(res.away)
      ? ` <span class="cmp-pen">${t('compare.pen', { team: tTeam(res.penWinner) })}</span>` : '';
    return `<div class="cmp-row cmp-ko-row cmp-row-official"><span class="cmp-who">${t('cmp.result')}</span>` +
      `<span class="cmp-ko-line">${flag(res.homeTeam)} ${tTeam(res.homeTeam)} <strong>${res.home} — ${res.away}</strong> ${tTeam(res.awayTeam)} ${flag(res.awayTeam)}${pen}</span></div>`;
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
    return `<div class="cmp-group"><h4 class="cmp-group-title">${t('round.' + r)}</h4>${matches}</div>`;
  }).join('');

  modal.classList.remove('hidden');
  detail.innerHTML = `
    <div class="cmp-header">
      <h3>${myName} <span class="cmp-vs">vs</span> ${themName}</h3>
      <button class="cmp-close" type="button" aria-label="${t('compare.closeAria')}">×</button>
    </div>
    <div class="cmp-champions">
      <span>${t('compare.yourChampion', { flag: flag(me.champion), champion: tTeam(me.champion) })}</span>
      <span>${t('compare.theirChampion', { name: themName, flag: flag(them.champion), champion: tTeam(them.champion) })}</span>
    </div>
    <div class="cmp-tabs">
      <button class="cmp-tab active" data-panel="groups" type="button">${t('compare.tabGroups')}</button>
      <button class="cmp-tab" data-panel="ko" type="button">${t('compare.tabKnockout')}</button>
    </div>
    <div class="cmp-panel" id="cmp-panel-groups">${groupsHtml}</div>
    <div class="cmp-panel hidden" id="cmp-panel-ko">${koHtml}</div>
  `;

  detail.querySelector('.cmp-close').addEventListener('click', closeCmpModal);
  modal.querySelector('.cmp-modal-backdrop').addEventListener('click', closeCmpModal);
  document.addEventListener('keydown', cmpEscHandler);
  detail.querySelectorAll('.cmp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      detail.querySelectorAll('.cmp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      detail.querySelector('#cmp-panel-groups').classList.toggle('hidden', tab.dataset.panel !== 'groups');
      detail.querySelector('#cmp-panel-ko').classList.toggle('hidden', tab.dataset.panel !== 'ko');
    });
  });

  detail.scrollTop = 0;
}

// -----------------------------------------------------------------------
// Leagues (private bolões)
// -----------------------------------------------------------------------
// Short, shareable codes that avoid easily-confused characters (0/O, 1/I).
function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

function getActiveLeague() {
  return userLeagues.find(l => l.id === activeLeagueId) || null;
}

function activeLeagueName() {
  const l = getActiveLeague();
  return l ? l.name : t('leagues.geral');
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
  const opts = [{ id: 'geral', name: t('leagues.geral') }, ...userLeagues]
    .map(l => `<option value="${l.id}"${l.id === activeLeagueId ? ' selected' : ''}>${escapeHtml(l.name)}</option>`)
    .join('');
  return `<label class="league-switch">
      <span class="league-switch-label">${t('leagues.label')}</span>
      <select class="league-select" aria-label="${t('leagues.activeAria')}">${opts}</select>
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
          <span class="league-card-name">${escapeHtml(l.name)}</span>
          ${isActive
            ? `<span class="league-badge">${t('leagues.active')}</span>`
            : `<button class="league-activate" data-id="${l.id}" type="button">${t('leagues.activate')}</button>`}
        </div>
        <div class="league-card-meta">
          <span class="league-code">${t('leagues.code', { code: l.code })}</span>
          <span>${count} ${count === 1 ? t('leagues.member') : t('leagues.members')}</span>
        </div>
        <button class="league-copy" data-link="${link}" type="button">${t('leagues.copy')}</button>
      </div>`;
  };

  const geralActive = activeLeagueId === 'geral';
  const geralCard = `<div class="league-card${geralActive ? ' active' : ''}">
      <div class="league-card-head">
        <span class="league-card-name">${t('leagues.geral')}</span>
        ${geralActive
          ? `<span class="league-badge">${t('leagues.active')}</span>`
          : `<button class="league-activate" data-id="geral" type="button">${t('leagues.activate')}</button>`}
      </div>
      <div class="league-card-meta"><span>${t('leagues.everyone')}</span></div>
    </div>`;

  container.innerHTML = `
    <div class="compare-header"><h2>${t('nav.leagues')}</h2></div>
    <p class="league-intro">${t('leagues.intro')}</p>
    <div class="league-list">
      ${geralCard}
      ${userLeagues.map(leagueCard).join('')}
    </div>
    <div class="league-actions">
      <form class="league-form" id="form-create">
        <input class="league-input" id="input-create" type="text" maxlength="30"
          placeholder="${t('leagues.createPlaceholder')}" aria-label="${t('leagues.createPlaceholder')}" required>
        <button class="league-btn" type="submit">${t('leagues.create')}</button>
      </form>
      <form class="league-form" id="form-join">
        <input class="league-input league-input-code" id="input-join" type="text" maxlength="6"
          placeholder="${t('leagues.joinPlaceholder')}" aria-label="${t('leagues.joinPlaceholder')}" required>
        <button class="league-btn" type="submit">${t('leagues.join')}</button>
      </form>
      <p class="league-msg" id="league-msg" aria-live="polite"></p>
    </div>`;

  container.querySelectorAll('.league-activate').forEach(btn => {
    btn.addEventListener('click', () => { setActiveLeague(btn.dataset.id); renderLeaguesView(); });
  });
  container.querySelectorAll('.league-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btn.dataset.link); btn.textContent = t('leagues.copied'); }
      catch { btn.textContent = btn.dataset.link; }
      setTimeout(() => { btn.textContent = t('leagues.copy'); }, 2000);
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
  if (!league) { if (msg) msg.textContent = t('leagues.notFound'); return; }
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
  { label: 'rank.round1', ids: groupIdsByMd(1) },
  { label: 'rank.round2', ids: groupIdsByMd(2) },
  { label: 'rank.round3', ids: groupIdsByMd(3) },
  { label: 'round.r32', ids: KNOCKOUT.r32.map(m => m.id) },
  { label: 'round.r16', ids: KNOCKOUT.r16.map(m => m.id) },
  { label: 'round.qf', ids: KNOCKOUT.qf.map(m => m.id) },
  { label: 'round.sf', ids: KNOCKOUT.sf.map(m => m.id) },
  { label: 'rank.finalThird', ids: [...KNOCKOUT.third, ...KNOCKOUT.final].map(m => m.id) },
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
  if (isLeader) badges.push(['👑', t('badge.leader')]);
  if (isRoundTop) badges.push(['🎯', t('badge.roundTop')]);
  if (e.streak >= 3) badges.push(['🔥', t('badge.streak', { n: e.streak })]);
  if (e.perfect > 0) badges.push(['✅', e.perfect > 1 ? t('badge.perfectN', { n: e.perfect }) : t('badge.perfect')]);
  if (e.nostradamus) badges.push(['🔮', t('badge.nostradamus')]);
  if (!badges.length) return '';
  return `<span class="ranking-badges">${badges
    .map(([icon, label]) => `<span class="ach-badge" title="${label}" aria-label="${label}">${icon}</span>`)
    .join('')}</span>`;
}

async function renderRankingView() {
  const container = document.getElementById('view-ranking');
  container.innerHTML = `<p class="loading-msg">${t('common.loading')}</p>`;

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

  const roundBadgeFor = (e) => {
    const roundPts = e.total - e.prevTotal;
    return hasResults && roundPts > 0
      ? `<span class="ranking-round-pts">+${roundPts}</span>` : '';
  };
  const isLeaderOf = (e) => hasResults && e.pos === 1 && e.total > 0;
  const isRoundTopOf = (e) => hasResults && maxRoundExact > 0 && e.roundExact === maxRoundExact;

  // Every card but your own opens the comparison modal (you vs them).
  const clickAttrs = (e, isMe) => isMe ? '' :
    ` data-uid="${e.user.uid}" role="button" tabindex="0" aria-label="${t('compare.with', { name: escapeHtml(e.user.displayName) })}"`;

  // Top 3 are shown on a podium (champion raised in the middle); everyone else
  // is a list row below. Before any result, it's a plain list (no podium).
  const podiumCard = (e) => {
    const isMe = currentUser && e.user.uid === currentUser.uid;
    const medal = ['🥇', '🥈', '🥉'][e.pos - 1] || '';
    return `
      <div class="podium-card podium-${e.pos}${isMe ? ' podium-me' : ' rank-clickable'}" data-pos="${e.pos}"${clickAttrs(e, isMe)}>
        <span class="podium-medal" aria-hidden="true">${medal}</span>
        ${avatarHtml(e.user, 'podium-avatar')}
        <span class="podium-name">${escapeHtml(e.user.displayName)}${isMe ? t('rank.me') : ''}</span>
        <span class="podium-total">${e.total}<small>pts</small></span>
        <span class="podium-meta">${movementChip(e, !!prevResults)}${roundBadgeFor(e)}</span>
        ${badgesFor(e, isLeaderOf(e), isRoundTopOf(e))}
      </div>`;
  };

  const rowEntry = (e) => {
    const isMe = currentUser && e.user.uid === currentUser.uid;
    return `
      <div class="ranking-row${isMe ? ' ranking-row-me' : ' rank-clickable'}"${clickAttrs(e, isMe)}>
        <span class="ranking-pos">${e.pos}</span>
        ${movementChip(e, !!prevResults)}
        ${avatarHtml(e.user, 'ranking-avatar')}
        <div class="ranking-info">
          <span class="ranking-name">${escapeHtml(e.user.displayName)}${isMe ? t('rank.me') : ''}</span>
          <span class="ranking-stats">${t('rank.stats', { exact: e.exact, correct: e.correct })}</span>
          ${badgesFor(e, isLeaderOf(e), isRoundTopOf(e))}
        </div>
        <span class="ranking-points">${roundBadgeFor(e)}<span class="ranking-total">${e.total}<small>pts</small></span></span>
      </div>`;
  };

  const usePodium = hasResults && curOrder.length > 0;
  const top = usePodium ? curOrder.slice(0, 3) : [];
  const rest = usePodium ? curOrder.slice(3) : curOrder;
  const podiumHtml = top.length
    ? `<div class="podium" data-count="${top.length}">${top.map(podiumCard).join('')}</div>`
    : '';
  const rowsHtml = rest.map(rowEntry).join('');

  const empty = hasResults ? '' :
    `<p class="ranking-empty">${t('rank.empty')}</p>`;
  const roundNote = hasResults
    ? `<p class="ranking-round-note">${t('rank.note', { round: t(RANKING_ROUNDS[lastIdx].label) })}</p>`
    : '';

  container.innerHTML = `
    <div class="compare-header"><h2>${t('nav.ranking')} · ${activeLeagueName()}</h2>${leagueSwitcherHtml()}${refreshBtnHtml}</div>
    ${empty}
    ${roundNote}
    ${podiumHtml}
    ${rowsHtml ? `<div class="ranking-list">${rowsHtml}</div>` : ''}
  `;

  attachAvatarFallback(container);
  wireLeagueSwitcher(container, renderRankingView);
  wireRefresh(container, renderRankingView);

  container.querySelectorAll('.rank-clickable[data-uid]').forEach(card => {
    const open = () => openComparison(card.dataset.uid, users, preds);
    card.addEventListener('click', open);
    card.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
    });
  });
}

// -----------------------------------------------------------------------
// Admin dashboard (gated to ADMIN_UIDS). Shows only data already readable by
// any signed-in user (see firestore.rules) — aggregates, not a security boundary.
// -----------------------------------------------------------------------
function timeAgo(ms) {
  if (ms == null) return '—';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return t('admin.now');
  if (min < 60) return t('admin.minAgo', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('admin.hAgo', { n: h });
  return t('admin.dAgo', { n: Math.round(h / 24) });
}

async function renderAdminView() {
  const container = document.getElementById('view-admin');
  if (!isAdmin()) { container.innerHTML = ''; return; }
  container.innerHTML = `<p class="loading-msg">${t('common.loading')}</p>`;

  const { users: roster, preds } = await loadRoster();
  const users = scopeUsers(roster);

  // --- 0) Last 15 registered users (from the roster already loaded — no extra read) ---
  const recent = [...roster]
    .filter(u => kickoffMs(u.createdAt) != null)
    .sort((a, b) => kickoffMs(b.createdAt) - kickoffMs(a.createdAt))
    .slice(0, 15);
  const recentHtml = `
    <div class="admin-card">
      <h3 class="admin-card-title">${t('admin.recent')}</h3>
      ${recent.length
        ? `<ol class="admin-recent">${recent.map(u =>
            `<li><span class="admin-recent-name">${escapeHtml(u.displayName)}</span><span class="admin-muted">${timeAgo(kickoffMs(u.createdAt))}</span></li>`).join('')}</ol>`
        : `<p class="admin-muted">${t('admin.recentEmpty')}</p>`}
    </div>`;

  // --- 1) System health (from the results collection) ---
  const resList = Object.values(results);
  const byStatus = { scheduled: 0, live: 0, paused: 0, finished: 0 };
  let lastUpdate = null;
  const liveNow = [];
  resList.forEach(r => {
    if (byStatus[r.status] != null) byStatus[r.status]++;
    const up = kickoffMs(r.updatedAt);
    if (up != null && (lastUpdate == null || up > lastUpdate)) lastUpdate = up;
    if (r.status === 'live' || r.status === 'paused') liveNow.push(r);
  });
  const liveCount = byStatus.live + byStatus.paused;
  const stale = liveCount > 0 && lastUpdate != null && (Date.now() - lastUpdate) > 10 * 60 * 1000;

  const healthHtml = `
    <div class="admin-card">
      <h3 class="admin-card-title">${t('admin.health')}</h3>
      <div class="admin-stats">
        <div class="admin-stat"><span class="admin-stat-num">${byStatus.scheduled}</span><span class="admin-stat-lbl">${t('admin.scheduled')}</span></div>
        <div class="admin-stat"><span class="admin-stat-num">${liveCount}</span><span class="admin-stat-lbl">${t('admin.live')}</span></div>
        <div class="admin-stat"><span class="admin-stat-num">${byStatus.finished}</span><span class="admin-stat-lbl">${t('admin.finished')}</span></div>
        <div class="admin-stat"><span class="admin-stat-num">${resList.length}</span><span class="admin-stat-lbl">${t('admin.docs')}</span></div>
      </div>
      <p class="admin-line${stale ? ' admin-alert' : ''}">${t('admin.lastUpdate')}: <strong>${timeAgo(lastUpdate)}</strong>${stale ? ` ⚠️ ${t('admin.staleWarn')}` : ''}</p>
      ${liveNow.length
        ? `<ul class="admin-live">${liveNow.map(r =>
            `<li>${flag(r.homeTeam)} ${tTeam(r.homeTeam)} <strong>${r.home ?? '–'}–${r.away ?? '–'}</strong> ${tTeam(r.awayTeam)} ${flag(r.awayTeam)} <span class="admin-badge">${r.status === 'paused' ? t('live.half') : t('live.now')}</span></li>`).join('')}</ul>`
        : `<p class="admin-muted">${t('admin.noLive')}</p>`}
    </div>`;

  // --- 2) Engagement (per scoped user) ---
  const eng = users.map(u => {
    const cf = countFilled(preds[u.uid] || {});
    const filled = cf.group + cf.ko, total = cf.groupTotal + cf.koTotal;
    return {
      user: u, filled, total,
      pct: Math.round((filled / total) * 100),
      koDone: predsComplete(preds[u.uid] || {}),
      updated: kickoffMs((preds[u.uid] || {}).updatedAt),
    };
  }).sort((a, b) => (b.updated || 0) - (a.updated || 0));

  const engHtml = `
    <div class="admin-card">
      <h3 class="admin-card-title">${t('admin.engagement')} <span class="admin-count">(${users.length})</span></h3>
      <table class="admin-table">
        <thead><tr><th>${t('admin.user')}</th><th>${t('admin.progress')}</th><th>${t('admin.ko')}</th><th>${t('admin.lastEdit')}</th></tr></thead>
        <tbody>${eng.map(e => `
          <tr>
            <td>${escapeHtml(e.user.displayName)}${e.user.uid === currentUser?.uid ? t('rank.me') : ''}</td>
            <td><div class="admin-bar"><span style="width:${e.pct}%"></span></div><span class="admin-bar-lbl">${e.filled}/${e.total}</span></td>
            <td>${e.koDone ? '✅' : '⏳'}</td>
            <td class="admin-muted">${timeAgo(e.updated)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;

  // --- 3) Read estimate (client-side proxy; NOT the official Firestore counter) ---
  const perBoot = resList.length + roster.length + users.length;
  const readsHtml = `
    <div class="admin-card">
      <h3 class="admin-card-title">${t('admin.reads')}</h3>
      <p class="admin-line"><code>${t('admin.readsFormula')}</code></p>
      <p class="admin-line">${t('admin.readsBoot')}: <strong>${perBoot}</strong>
        <span class="admin-muted">(${resList.length} ${t('admin.results')} + ${roster.length} ${t('admin.users')} + ${users.length} ${t('admin.preds')})</span></p>
      <p class="admin-muted">${t('admin.readsNote')}</p>
    </div>`;

  // --- 4) Pool overview: ranking + predicted champions ---
  const scored = users.map(u => {
    const p = preds[u.uid] || {};
    return {
      user: u,
      total: scoreUser(p, results).total,
      champion: groupStageReady(p) ? championOf(resolveKnockout(p)) : '?',
    };
  }).sort((a, b) => b.total - a.total);
  const champCount = {};
  scored.forEach(s => { if (s.champion && s.champion !== '?') champCount[s.champion] = (champCount[s.champion] || 0) + 1; });
  const champDist = Object.entries(champCount).sort((a, b) => b[1] - a[1]);

  const overviewHtml = `
    <div class="admin-card">
      <h3 class="admin-card-title">${t('admin.overview')}</h3>
      <ol class="admin-rank">${scored.map(s =>
        `<li><span class="admin-rank-name">${escapeHtml(s.user.displayName)}</span><span class="admin-muted">${flag(s.champion)} ${tTeam(s.champion)}</span><strong>${s.total}<small>pts</small></strong></li>`).join('')}</ol>
      ${champDist.length
        ? `<div class="admin-champs"><h4>${t('admin.champDist')}</h4>${champDist.map(([team, n]) =>
            `<span class="admin-chip">${flag(team)} ${tTeam(team)} <strong>${n}</strong></span>`).join('')}</div>`
        : ''}
    </div>`;

  container.innerHTML = `
    <div class="compare-header"><h2>${t('nav.admin')} · ${activeLeagueName()}</h2>${refreshBtnHtml}</div>
    <div class="admin-grid">
      ${healthHtml}
      ${readsHtml}
      ${recentHtml}
      ${engHtml}
      ${overviewHtml}
    </div>`;

  attachAvatarFallback(container);
  wireRefresh(container, renderAdminView);
}
