import { loginWithGoogle, logout, onAuthChange, saveUser, savePred, loadPreds, loadAllUsers, loadUserPreds } from './db.js';
import { GROUPS, FLAGS, KNOCKOUT, ROUND_LABELS } from './data.js';
import { groupStandings, computeAdvancing, buildKnockoutMatches } from './engine.js';

// -----------------------------------------------------------------------
// State
// -----------------------------------------------------------------------
let currentUser = null;
let predictions = {};       // { matchId: { home, away, penWinner? } }
let viewingUser = null;     // uid of user being viewed in compare mode (null = self)

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function flag(team) {
  return FLAGS[team] || '';
}


function getEffectivePreds() {
  return predictions;
}

function recomputeAll() {
  const preds = getEffectivePreds();
  const adv = computeAdvancing(preds);
  const koResults = {};
  Object.keys(KNOCKOUT).forEach(round => {
    KNOCKOUT[round].forEach(m => {
      const p = preds[m.id];
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
    predictions = await loadPreds(user.uid);
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
function showLogin() {
  document.getElementById('view-login').classList.remove('hidden');
  document.getElementById('view-app').classList.add('hidden');
}

function showApp() {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-app').classList.remove('hidden');
  switchMainView('groups');
}

function switchMainView(view) {
  ['groups', 'knockout', 'compare'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  if (view === 'compare') renderCompareView();
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
    ? `<img src="${currentUser.photoURL}" alt="${currentUser.displayName}" class="avatar">`
    : '';
  el.innerHTML = `${photo}<span class="user-name">${currentUser.displayName}</span>`;
}

// -----------------------------------------------------------------------
// Save prediction
// -----------------------------------------------------------------------
async function savePrediction(matchId, field, value) {
  if (!currentUser || viewingUser) return;
  if (!predictions[matchId]) predictions[matchId] = {};
  predictions[matchId][field] = value === '' ? null : Number(value);
  await savePred(currentUser.uid, matchId, predictions[matchId]);
  // Rerender live standings for group stage
  const groupKey = Object.keys(GROUPS).find(g =>
    GROUPS[g].matches.some(m => m.id === matchId)
  );
  if (groupKey) {
    renderGroupStandings(groupKey);
    refreshKnockoutTeams();
  } else {
    refreshKnockoutTeams();
  }
}

async function savePenWinner(matchId, team) {
  if (!currentUser || viewingUser) return;
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
  const readonly = viewingUser ? 'readonly' : '';
  const tabindex = viewingUser ? 'tabindex="-1"' : '';

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
            ${pred.penWinner === hTeam ? 'checked' : ''}
            ${viewingUser ? 'disabled' : ''}
            class="pen-radio" data-match-id="${match.id}">
          <span>${flag(hTeam)} ${hTeam}</span>
        </label>
        <label class="pen-option">
          <input type="radio" name="pen-${match.id}" value="${aTeam}"
            ${pred.penWinner === aTeam ? 'checked' : ''}
            ${viewingUser ? 'disabled' : ''}
            class="pen-radio" data-match-id="${match.id}">
          <span>${flag(aTeam)} ${aTeam}</span>
        </label>
      </div>`;
  }

  return `
    <div class="match-card" id="match-${match.id}">
      <div class="match-body">
        <div class="team home-team">
          <span class="team-name">${hTeam}</span>
          <span class="team-flag">${flag(hTeam)}</span>
        </div>
        <div class="score-area">
          <input type="number" min="0" max="20" class="score-input"
            data-match-id="${match.id}" data-side="home"
            value="${hVal}" ${readonly} ${tabindex} aria-label="Placar ${hTeam}">
          <span class="score-sep">×</span>
          <input type="number" min="0" max="20" class="score-input"
            data-match-id="${match.id}" data-side="away"
            value="${aVal}" ${readonly} ${tabindex} aria-label="Placar ${aTeam}">
        </div>
        <div class="team away-team">
          <span class="team-flag">${flag(aTeam)}</span>
          <span class="team-name">${aTeam}</span>
        </div>
      </div>
      ${penHtml}
    </div>`;
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
  const rounds = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];

  const tabsHtml = rounds.map((r, i) =>
    `<button class="ko-tab${i === 0 ? ' active' : ''}" data-round="${r}">${ROUND_LABELS[r]}</button>`
  ).join('');

  const panelsHtml = rounds.map((r, i) =>
    `<div class="ko-panel${i === 0 ? '' : ' hidden'}" id="ko-panel-${r}"></div>`
  ).join('');

  container.innerHTML = `
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
      if (homeFlagEl) homeFlagEl.textContent = flag(km.homeTeam);
      if (awayFlagEl) awayFlagEl.textContent = flag(km.awayTeam);

      // Also update pen radio labels
      const radios = card.querySelectorAll('.pen-radio');
      if (radios.length === 2) {
        radios[0].value = km.homeTeam;
        radios[0].name = `pen-${m.id}`;
        radios[0].dataset.matchId = m.id;
        const label0 = radios[0].closest('label');
        if (label0) label0.querySelector('span').textContent = `${flag(km.homeTeam)} ${km.homeTeam}`;

        radios[1].value = km.awayTeam;
        radios[1].name = `pen-${m.id}`;
        radios[1].dataset.matchId = m.id;
        const label1 = radios[1].closest('label');
        if (label1) label1.querySelector('span').textContent = `${flag(km.awayTeam)} ${km.awayTeam}`;
      }
    });
  });
}

// -----------------------------------------------------------------------
// Compare view
// -----------------------------------------------------------------------
async function renderCompareView() {
  const container = document.getElementById('view-compare');
  container.innerHTML = '<p class="loading-msg">Carregando...</p>';

  const users = await loadAllUsers();

  // For each user, load their predictions to get their champion
  const userChampions = await Promise.all(users.map(async u => {
    const preds = await loadUserPreds(u.uid);
    const adv = computeAdvancing(preds);
    const koResults = {};
    Object.keys(KNOCKOUT).forEach(round => {
      KNOCKOUT[round].forEach(m => {
        if (preds[m.id]) koResults[m.id] = preds[m.id];
      });
    });
    const koMatches = buildKnockoutMatches(adv, koResults);
    const finalMatch = koMatches['FINAL'];
    let champion = '?';
    if (finalMatch && finalMatch.home != null && finalMatch.away != null) {
      const h = Number(finalMatch.home), a = Number(finalMatch.away);
      if (!isNaN(h) && !isNaN(a)) {
        if (h > a) champion = finalMatch.homeTeam;
        else if (a > h) champion = finalMatch.awayTeam;
        else if (finalMatch.penWinner) champion = finalMatch.penWinner;
      }
    }
    return { user: u, champion, preds };
  }));

  const cardsHtml = userChampions.map(({ user, champion }) => {
    const photo = user.photoURL
      ? `<img src="${user.photoURL}" alt="${user.displayName}" class="compare-avatar">`
      : `<div class="compare-avatar-placeholder">${user.displayName?.[0] || '?'}</div>`;
    const isMe = currentUser && user.uid === currentUser.uid;
    return `
      <button class="compare-card${isMe ? ' compare-card-me' : ''}"
        data-uid="${user.uid}" aria-label="Ver palpites de ${user.displayName}">
        ${photo}
        <div class="compare-name">${user.displayName}${isMe ? ' (eu)' : ''}</div>
        <div class="compare-champion">
          <span class="champion-flag">${flag(champion)}</span>
          <span class="champion-name">${champion}</span>
        </div>
        <div class="compare-label">Campeão previsto</div>
      </button>`;
  }).join('');

  container.innerHTML = `
    <div class="compare-header">
      <h2>Palpites dos participantes</h2>
      ${viewingUser ? `<button id="btn-back-to-mine" class="btn-secondary">Voltar aos meus palpites</button>` : ''}
    </div>
    <div class="compare-grid">${cardsHtml}</div>
    <div id="compare-user-view" class="compare-user-view ${viewingUser ? '' : 'hidden'}"></div>
  `;

  if (viewingUser) {
    const target = userChampions.find(u => u.user.uid === viewingUser);
    if (target) renderUserPredictions(target.user, target.preds);
  }

  container.querySelectorAll('.compare-card').forEach(card => {
    card.addEventListener('click', async () => {
      const uid = card.dataset.uid;
      if (uid === currentUser?.uid) {
        // Show own predictions (editable)
        viewingUser = null;
        predictions = await loadPreds(currentUser.uid);
        renderGroupsView();
        renderKnockoutView();
        switchMainView('groups');
      } else {
        viewingUser = uid;
        const target = userChampions.find(u => u.user.uid === uid);
        if (target) {
          // Temporarily swap predictions for read-only view
          const savedPreds = predictions;
          predictions = target.preds;
          renderGroupsView();
          renderKnockoutView();
          predictions = savedPreds;
          switchMainView('groups');
          // Add back notice
          const notice = document.createElement('div');
          notice.className = 'viewing-notice';
          notice.innerHTML = `
            Visualizando palpites de <strong>${target.user.displayName}</strong>
            <button id="btn-exit-view" class="btn-secondary btn-small">Sair</button>
          `;
          document.getElementById('view-app').insertBefore(notice, document.querySelector('header').nextSibling);
          document.getElementById('btn-exit-view').addEventListener('click', async () => {
            viewingUser = null;
            predictions = await loadPreds(currentUser.uid);
            notice.remove();
            renderGroupsView();
            renderKnockoutView();
          });
        }
      }
    });
  });

  const backBtn = document.getElementById('btn-back-to-mine');
  if (backBtn) {
    backBtn.addEventListener('click', async () => {
      viewingUser = null;
      predictions = await loadPreds(currentUser.uid);
      renderGroupsView();
      renderKnockoutView();
      switchMainView('groups');
      document.querySelector('.viewing-notice')?.remove();
    });
  }
}

function renderUserPredictions(user, preds) {
  const el = document.getElementById('compare-user-view');
  if (!el) return;
  const savedPreds = predictions;
  const savedViewingUser = viewingUser;
  viewingUser = user.uid;
  predictions = preds;

  const groupKeys = Object.keys(GROUPS);
  const groupsHtml = groupKeys.map(g => {
    const matches = GROUPS[g].matches;
    return `
      <div class="compare-group">
        <h4>Grupo ${g}</h4>
        ${matches.map(m => renderMatchCard(m, false)).join('')}
      </div>`;
  }).join('');

  el.innerHTML = `
    <h3>Palpites de ${user.displayName}</h3>
    <div class="compare-groups-grid">${groupsHtml}</div>
  `;

  predictions = savedPreds;
  viewingUser = savedViewingUser;
}
