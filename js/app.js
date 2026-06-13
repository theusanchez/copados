import { loginWithGoogle, logout, onAuthChange, saveUser, savePred, loadPreds, loadAllUsers, loadUserPreds, loadResults } from './db.js';
import { GROUPS, FLAGS, KNOCKOUT, ROUND_LABELS } from './data.js';
import { groupStandings, computeAdvancing, buildKnockoutMatches, resolveKnockout, scoreUser, matchPoints, groupsComplete } from './engine.js';

// -----------------------------------------------------------------------
// State
// -----------------------------------------------------------------------
let currentUser = null;
let predictions = {};       // { matchId: { home, away, penWinner? } }
let results = {};           // { matchId: { home, away, status, kickoff, ... } } actual results
let currentUserKo = {};     // resolved knockout for `predictions` (set before each render)
let koFillLocked = true;     // true while the group stage is incomplete (blocks knockout filling)

const KNOCKOUT_IDS = new Set(Object.values(KNOCKOUT).flat().map(m => m.id));

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function flag(team) {
  const code = FLAGS[team];
  if (!code) return '';
  return `<img class="flag-icon" src="https://flagcdn.com/${code}.svg" alt="" loading="lazy">`;
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
  if (r.status === 'live' || r.status === 'finished') return true;
  if (r.kickoff != null) {
    const ms = typeof r.kickoff?.toMillis === 'function' ? r.kickoff.toMillis() : Number(r.kickoff);
    if (!isNaN(ms) && Date.now() >= ms) return true;
  }
  return false;
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

// A user is "complete" when every group and knockout match has both scores.
function predsComplete(preds) {
  const filled = m => {
    const p = preds[m.id];
    return p && p.home != null && p.away != null;
  };
  return Object.values(GROUPS).flatMap(g => g.matches).every(filled) &&
    Object.values(KNOCKOUT).flat().every(filled);
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
onAuthChange(async user => {
  if (user) {
    currentUser = user;
    await saveUser(user);
    [predictions, results] = await Promise.all([loadPreds(user.uid), loadResults()]);
    showApp();
    renderUserInfo();
    renderGroupsView();
    renderKnockoutView();
  } else {
    currentUser = null;
    predictions = {};
    showLogin();
  }
});

document.getElementById('btn-login').addEventListener('click', () => {
  loginWithGoogle().catch(err => console.error('Login error', err));
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
  switchMainView(predsComplete(predictions) ? 'compare' : 'groups');
}

function switchMainView(view) {
  ['groups', 'knockout', 'compare', 'ranking'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  if (view === 'compare') renderCompareView();
  if (view === 'ranking') renderRankingView();
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
  if (KNOCKOUT_IDS.has(matchId) && !groupsComplete(predictions)) return;
  if (!predictions[matchId]) predictions[matchId] = {};
  predictions[matchId][field] = value === '' ? null : Number(value);
  await savePred(currentUser.uid, matchId, predictions[matchId]);
  // Rerender live standings for group stage
  const groupKey = Object.keys(GROUPS).find(g =>
    GROUPS[g].matches.some(m => m.id === matchId)
  );
  if (groupKey) {
    renderGroupStandings(groupKey);
    // If this save flipped group-stage completion, re-render the knockout to
    // (un)lock its inputs; otherwise just refresh the resolved team names.
    if (groupsComplete(predictions) === koFillLocked) renderKnockoutView();
    else refreshKnockoutTeams();
  } else {
    refreshKnockoutTeams();
  }
}

async function savePenWinner(matchId, team) {
  if (!currentUser || isMatchLocked(matchId)) return;
  if (KNOCKOUT_IDS.has(matchId) && !groupsComplete(predictions)) return;
  if (!predictions[matchId]) predictions[matchId] = {};
  predictions[matchId].penWinner = team;
  await savePred(currentUser.uid, matchId, predictions[matchId]);
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
  const koLocked = isKnockout && !groupsComplete(predictions);
  const locked = isMatchLocked(match.id) || koLocked;
  const lockAttrs = locked ? 'readonly tabindex="-1"' : '';
  const r = results[match.id];
  const pts = r && r.status === 'finished' && r.home != null && r.away != null
    ? matchPoints(match.id, predictions, currentUserKo, results)
    : null;
  const resultClass = pts == null ? ''
    : pts === 5 ? ' result-exact' : pts === 3 ? ' result-partial' : ' result-miss';

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
    <div class="match-card${locked ? ' locked' : ''}${resultClass}" id="match-${match.id}">
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
  koFillLocked = !groupsComplete(predictions);
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
// Compare view
// -----------------------------------------------------------------------
let compareEntries = [];   // [{ user, preds, koMatches, champion, complete }]

async function renderCompareView() {
  const container = document.getElementById('view-compare');
  container.innerHTML = '<p class="loading-msg">Carregando...</p>';

  const users = await loadAllUsers();
  compareEntries = await Promise.all(users.map(async u => {
    const preds = await loadUserPreds(u.uid);
    const koMatches = resolveKnockout(preds);
    // No champion until the group stage is complete — the bracket is otherwise
    // resolved from partial standings and would show a bogus winner.
    const champion = groupsComplete(preds) ? championOf(koMatches) : '?';
    return {
      user: u,
      preds,
      koMatches,
      champion,
      complete: predsComplete(preds),
    };
  }));

  const byName = (a, b) => (a.user.displayName || '').localeCompare(b.user.displayName || '');
  const complete = compareEntries.filter(e => e.complete).sort(byName);
  const incomplete = compareEntries.filter(e => !e.complete).sort(byName);

  const section = (title, entries) => entries.length ? `
    <section class="compare-section">
      <h3 class="compare-section-title">${title} <span class="compare-count">(${entries.length})</span></h3>
      <div class="compare-grid">${entries.map(compareCardHtml).join('')}</div>
    </section>` : '';

  container.innerHTML = `
    <div class="compare-header"><h2>Palpites dos participantes</h2></div>
    ${section('✓ Finalizados', complete)}
    ${section('⏳ Em andamento', incomplete)}
    <div id="compare-detail" class="compare-detail hidden"></div>
  `;

  attachAvatarFallback(container);

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
      return `
        <div class="cmp-match">
          <div class="cmp-fixture">
            <span class="cmp-fx-team">${flag(m.home)} ${m.home}</span>
            <span class="cmp-fx-x">×</span>
            <span class="cmp-fx-team">${m.away} ${flag(m.away)}</span>
          </div>
          <div class="cmp-row"><span class="cmp-who">${myName}</span><span class="cmp-score">${fmtScore(mp)}</span></div>
          <div class="cmp-row${same ? ' cmp-row-ok' : (bothFilled ? ' cmp-row-diff' : '')}">
            <span class="cmp-who">${themName}</span><span class="cmp-score">${fmtScore(tp)}</span>${badge}
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
  const rounds = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
  const koHtml = rounds.map(r => {
    const matches = KNOCKOUT[r].map(m => `
      <div class="cmp-match cmp-ko-match">
        <div class="cmp-row cmp-ko-row"><span class="cmp-who">${myName}</span>${koLine(me.koMatches[m.id])}</div>
        <div class="cmp-row cmp-ko-row"><span class="cmp-who">${themName}</span>${koLine(them.koMatches[m.id])}</div>
      </div>`).join('');
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
// Ranking view
// -----------------------------------------------------------------------
async function renderRankingView() {
  const container = document.getElementById('view-ranking');
  container.innerHTML = '<p class="loading-msg">Carregando...</p>';

  const hasResults = Object.values(results).some(r => r.status === 'finished');
  const users = await loadAllUsers();
  const rows = (await Promise.all(users.map(async u => {
    const preds = await loadUserPreds(u.uid);
    return { user: u, ...scoreUser(preds, results) };
  }))).sort((a, b) =>
    b.total - a.total || b.exact - a.exact || b.correct - a.correct ||
    (a.user.displayName || '').localeCompare(b.user.displayName || '')
  );

  const rowsHtml = rows.map((r, i) => {
    const isMe = currentUser && r.user.uid === currentUser.uid;
    return `
      <div class="ranking-row${isMe ? ' ranking-row-me' : ''}">
        <span class="ranking-pos">${i + 1}</span>
        ${avatarHtml(r.user, 'ranking-avatar')}
        <div class="ranking-info">
          <span class="ranking-name">${r.user.displayName}${isMe ? ' (eu)' : ''}</span>
          <span class="ranking-stats">${r.exact} cravadas · ${r.correct} resultados</span>
        </div>
        <span class="ranking-points">${r.total}<small>pts</small></span>
      </div>`;
  }).join('');

  const empty = hasResults ? '' :
    `<p class="ranking-empty">Os jogos ainda não começaram — o ranking aparece assim que os primeiros resultados saírem.</p>`;

  container.innerHTML = `
    <div class="compare-header"><h2>Ranking</h2></div>
    ${empty}
    <div class="ranking-list">${rowsHtml}</div>
  `;

  attachAvatarFallback(container);
}
