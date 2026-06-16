// One-off migration: collapse the legacy one-doc-per-match prediction layout
// (`predictions/{uid}/matches/{matchId}`) into a single doc per user
// (`predictions/{uid}` with a `matches` map). This is what cuts ranking/compare
// reads from N×104 down to N.
//
// Run (same credentials as the ingester — see README):
//   FIREBASE_SERVICE_ACCOUNT='{...}' node migrate-preds.js [--dry-run] [--cleanup]
//
//   (default)    copy-only: write the `matches` map, leave the subcollection intact.
//                Idempotent and safe to re-run (use it to reconcile stragglers).
//   --dry-run    print what would change, write nothing.
//   --cleanup    after copying, delete the legacy subcollection docs.

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');
const CLEANUP = process.argv.includes('--cleanup');

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')));
  }
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS (path).');
}

admin.initializeApp({ credential: loadCredential() });
const db = admin.firestore();

async function main() {
  // listDocuments() returns refs even for parent docs that don't exist yet but
  // have a `matches` subcollection — exactly the legacy layout.
  const refs = await db.collection('predictions').listDocuments();
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Found ${refs.length} prediction doc(s). cleanup=${CLEANUP}`);

  let migrated = 0;
  let deleted = 0;

  for (const ref of refs) {
    const subSnap = await ref.collection('matches').get();
    if (subSnap.empty) continue;

    const matches = {};
    subSnap.forEach(d => { matches[d.id] = d.data(); });
    const ids = Object.keys(matches);

    console.log(`  ${ref.id}: ${ids.length} match(es)${CLEANUP ? ' (will delete subcollection)' : ''}`);

    if (DRY_RUN) { migrated++; continue; }

    await ref.set({ matches, migratedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    migrated++;

    if (CLEANUP) {
      // Batched deletes, chunked to stay under Firestore's 500-op batch limit.
      for (let i = 0; i < subSnap.docs.length; i += 450) {
        const batch = db.batch();
        subSnap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      deleted += subSnap.size;
    }
  }

  console.log(`Done. migrated=${migrated}${CLEANUP ? ` deletedDocs=${deleted}` : ''}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
