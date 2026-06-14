// Measures how fresh football-data.org's data is on our current plan.
// Polls live WC matches repeatedly and reports, per poll:
//   - lag      = realMinute - apiMinute  (how many minutes the API trails reality)
//   - lastUpd  = seconds since the API last refreshed that match record
//   - CHANGED  = whether score/minute/status moved since the previous poll
// Run in CI (it needs FOOTBALL_DATA_TOKEN). No Firebase, no npm deps — just fetch.
//
// Env: ITER (polls, default 10), GAP_S (seconds between polls, default 20).

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const URL = 'https://api.football-data.org/v4/competitions/WC/matches';
const ITER = Number(process.env.ITER || 10);
const GAP = Number(process.env.GAP_S || 20) * 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clock = t => new Date(t).toISOString().slice(11, 19);
const summary = [];
function out(line) {
  console.log(line);
  summary.push(line);
}

async function poll() {
  const res = await fetch(URL, { headers: { 'X-Auth-Token': TOKEN } });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 120)}`);
  return (await res.json()).matches || [];
}

async function main() {
  if (!TOKEN) throw new Error('Missing FOOTBALL_DATA_TOKEN.');
  out(`Benchmark football-data.org — ${ITER} polls, ${GAP / 1000}s apart\n`);

  const prev = {};        // matchId -> last "score|minute|status"
  const lags = [];        // collected lag samples (min)
  const updAges = [];     // collected lastUpdated ages (s)
  let sawLive = false;

  for (let i = 1; i <= ITER; i++) {
    const now = Date.now();
    let matches;
    try {
      matches = await poll();
    } catch (e) {
      out(`[${clock(now)}] poll ${i}/${ITER} FAILED: ${e.message}`);
      if (i < ITER) await sleep(GAP);
      continue;
    }
    const live = matches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
    if (!live.length) {
      out(`[${clock(now)}] poll ${i}/${ITER}: no live match right now`);
    } else {
      sawLive = true;
      for (const m of live) {
        const ko = new Date(m.utcDate).getTime();
        const realMin = Math.floor((now - ko) / 60000);
        const apiMin = m.minute ?? null;
        const lag = apiMin != null ? realMin - apiMin : null;
        const upd = m.lastUpdated ? Math.round((now - new Date(m.lastUpdated).getTime()) / 1000) : null;
        const score = `${m.score?.fullTime?.home ?? '-'}-${m.score?.fullTime?.away ?? '-'}`;
        const key = `${score}|${apiMin}|${m.status}`;
        const changed = prev[m.id] && prev[m.id] !== key ? '  <-- CHANGED' : '';
        prev[m.id] = key;
        if (lag != null) lags.push(lag);
        if (upd != null) updAges.push(upd);
        const name = `${m.homeTeam?.tla || m.homeTeam?.shortName || '??'} x ${m.awayTeam?.tla || m.awayTeam?.shortName || '??'}`;
        out(`[${clock(now)}] ${name} ${score} ${m.status} | apiMin=${apiMin ?? '—'} realMin=${realMin} ` +
            `lag=${lag != null ? lag + 'min' : '—'} lastUpd=${upd != null ? upd + 's' : '—'}${changed}`);
      }
    }
    if (i < ITER) await sleep(GAP);
  }

  const avg = a => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  out('\n--- Verdict ---');
  if (!sawLive) {
    out('No live match during the run. Trigger this again while a game is on.');
  } else {
    out(`Score/minute lag vs real time:  avg ${avg(lags)} min  (min ${Math.min(...lags)}, max ${Math.max(...lags)})`);
    out(`API record freshness (lastUpdated age): avg ${avg(updAges)}s`);
    out('Rule of thumb: lag ≤ ~2-3 min and lastUpd refreshing each poll = good enough,');
    out('a free 1-min trigger would feel "live". Big lag / never-changing = pay for the live tier.');
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import('node:fs');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## football-data.org freshness benchmark\n\n```\n' + summary.join('\n') + '\n```\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
