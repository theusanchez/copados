// Decides whether a freshly-built result doc differs from what's already stored,
// so the ingester only writes (and thus only notifies live listeners about) docs
// that actually changed. `updatedAt` is intentionally ignored.

// Normalize a kickoff value (admin Timestamp, Firestore plain object, or epoch ms).
export function tsMs(t) {
  if (t == null) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (typeof t._seconds === 'number') return t._seconds * 1000;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

const FIELDS = ['status', 'home', 'away', 'homeTeam', 'awayTeam', 'penWinner', 'venue'];

export function resultChanged(existing, fresh) {
  if (!existing) return true;
  for (const k of FIELDS) {
    if ((existing[k] ?? null) !== (fresh[k] ?? null)) return true;
  }
  return tsMs(existing.kickoff) !== tsMs(fresh.kickoff);
}
