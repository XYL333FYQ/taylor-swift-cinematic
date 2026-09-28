import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { syncMusic, type MusicPrunePlan } from './music-sync-core.ts';
import { createMusicR2Store } from './music-r2-store.ts';
import { assertFullLibrarySafety, parseRemoteCatalog } from './music-remote-catalog.ts';

async function confirmPrune(plan: MusicPrunePlan): Promise<boolean> {
  console.log(`[music:sync] ${plan.objects.length} remote media object(s), ${(plan.totalBytes / 1_000_000_000).toFixed(3)} GB need manual cleanup confirmation.`);
  for (const reason of plan.reasons) console.log(`  confirmation required: ${reason}`);
  for (const object of plan.objects) console.log(`  ${object.key} — ${object.size.toLocaleString('en-US')} bytes`);
  console.log('[music:sync] The new catalog is already published; declining leaves these objects and their sync-state records pending.');
  if (!stdin.isTTY || !stdout.isTTY) {
    console.log('[music:sync] no interactive terminal; cleanup deferred.');
    return false;
  }

  const expected = `DELETE ${plan.confirmationToken}`;
  const readline = createInterface({ input: stdin, output: stdout });
  let answer = '';
  try { answer = await readline.question(`[music:sync] Type exactly ${expected} to delete these managed objects: `); }
  finally { readline.close(); }
  return answer.trim() === expected;
}

export async function runMusicSync(force = false): Promise<void> {
  const { target, store } = createMusicR2Store();

  try {
    if (force) console.log('[music:sync] --force: full-library cloud-count safety check is bypassed for this run.');
    const result = await syncMusic(process.cwd(), target, {
      async put(object) {
        await store.put(object);
        if (object.key !== 'catalog.json') console.log(`[music:sync] uploaded ${object.key}`);
      },
      head: store.head,
      delete: store.delete,
    }, {
      confirmPrune,
      onLockWait: () => console.log('[music:sync] another process is syncing this R2 target; waiting for its lock.'),
      verifyRemoteCatalog: force ? undefined : async (albums) => {
        const remote = await store.getText('catalog.json');
        if (remote) assertFullLibrarySafety(albums, parseRemoteCatalog(remote.text));
      },
    });

    console.log(`[music:sync] ${result.albums} albums; plan ${result.added} new, ${result.modified} changed, ${result.skipped} unchanged, ${result.cleanupCandidates} stale object(s); ${result.uploaded} media uploaded; catalog ${result.catalogUploaded ? 'published' : 'unchanged'}; ${result.deleted} stale media deleted.`);
    if (result.deletionDeferred) console.log(`[music:sync] cleanup deferred; ${result.pendingDeletes} managed key(s) remain pending confirmation.`);
    for (const warning of result.warnings) console.log(`[music:sync] ${warning}`);
    if (result.warnings.length > 0) console.log(`[music:sync] ${result.warnings.length} non-critical scan warning(s) were retained.`);
  } finally {
    store.close();
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    if (args.some((arg) => arg !== '--force') || args.length > 1) {
      throw new Error('Usage: pnpm music:sync [--force]');
    }
    await runMusicSync(args.includes('--force'));
  }
  catch (error) {
    console.error(`[music:sync] ${error instanceof Error ? error.message : 'Synchronization failed.'}`);
    process.exitCode = 1;
  }
}
