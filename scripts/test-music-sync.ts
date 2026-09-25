import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import {
  planMusicPrune,
  syncMusic,
  type MusicPrunePlan,
  type ObjectUpload,
  type Uploader,
} from './music-sync-core.ts';
import { createSerializedSyncQueue, waitForStableAudioTree } from './music-watch.ts';
import { scanAudioLibrary } from '../plugins/audio-library.ts';
import { withTargetSyncLock } from './music-sync-lock.ts';

interface Event { type: 'put' | 'head' | 'delete'; key: string }
interface FakeR2Options {
  failPut?: string;
  failDelete?: string;
  omitAfterPut?: string;
  wrongLength?: string;
}

function wav(variant = 0): Buffer {
  const samples = 8000;
  const output = Buffer.alloc(44 + samples * 2);
  output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(8000, 24); output.writeUInt32LE(16000, 28);
  output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36); output.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    output.writeInt16LE(Math.round(Math.sin(index / 20 + variant) * 1000), 44 + index * 2);
  }
  return output;
}

async function addAlbum(
  root: string,
  folder: string,
  id: string,
  options: { tracks?: number; lyrics?: boolean; trackArtwork?: boolean } = {},
): Promise<string> {
  const directory = path.join(root, 'audio', folder);
  await fs.mkdir(path.join(directory, 'artwork'), { recursive: true });
  await fs.writeFile(path.join(directory, 'album.json'), JSON.stringify({
    id, name: { en: id, zh: id }, releaseDate: '2020-01-01',
  }));
  await fs.writeFile(path.join(directory, 'artwork', 'cover.webp'), 'test cover');
  await fs.writeFile(path.join(directory, 'artwork', 'presentation.webp'), 'test presentation');
  for (let index = 1; index <= (options.tracks ?? 1); index++) {
    await addTrack(directory, index, options);
  }
  return directory;
}

async function addTrack(
  albumDirectory: string,
  index: number,
  options: { lyrics?: boolean; trackArtwork?: boolean } = {},
): Promise<void> {
  const stem = `${String(index).padStart(2, '0')} song ${index}`;
  await fs.writeFile(path.join(albumDirectory, `${stem}.wav`), wav(index));
  if (options.lyrics !== false) await fs.writeFile(path.join(albumDirectory, `${stem}.lrc`), `[00:00.00]Track ${index}\n`);
  if (options.trackArtwork !== false) await fs.writeFile(path.join(albumDirectory, `${stem}.webp`), `test artwork ${index}`);
}

function fakeR2(options: FakeR2Options = {}) {
  const remote = new Map<string, Buffer>();
  const events: Event[] = [];
  let failPut = options.failPut;
  let failDelete = options.failDelete;
  let omitAfterPut = options.omitAfterPut;
  let wrongLength = options.wrongLength;
  const uploader: Uploader = {
    async put(object: ObjectUpload) {
      events.push({ type: 'put', key: object.key });
      if (object.key === failPut) throw new Error(`simulated PutObject failure for ${object.key}`);
      const chunks: Buffer[] = [];
      if (Buffer.isBuffer(object.body)) chunks.push(object.body);
      else for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      assert.equal(body.length, object.contentLength);
      if (object.key !== omitAfterPut) remote.set(object.key, body);
    },
    async head(key) {
      events.push({ type: 'head', key });
      const body = remote.get(key);
      if (!body) return null;
      return { contentLength: body.length + (key === wrongLength ? 1 : 0) };
    },
    async delete(key) {
      events.push({ type: 'delete', key });
      if (key === failDelete) throw new Error(`simulated DeleteObject failure for ${key}`);
      remote.delete(key);
    },
  };
  return {
    remote, events, uploader,
    set failPut(value: string | undefined) { failPut = value; },
    set failDelete(value: string | undefined) { failDelete = value; },
    set omitAfterPut(value: string | undefined) { omitAfterPut = value; },
    set wrongLength(value: string | undefined) { wrongLength = value; },
  };
}

function albumKeys(remote: Map<string, Buffer>, id: string): string[] {
  return [...remote.keys()].filter((key) => key.startsWith(`albums/${id}/`)).sort();
}

function stateShape(text: string): { files: Record<string, unknown>; pendingDeletes?: string[] } {
  return JSON.parse(text) as { files: Record<string, unknown>; pendingDeletes?: string[] };
}

async function readState(root: string): Promise<{ files: Record<string, unknown>; pendingDeletes?: string[] }> {
  return stateShape(await fs.readFile(path.join(root, '.music-cache', 'sync-state.json'), 'utf8'));
}

function assertMediaVerifiedBeforeCatalog(events: Event[]): void {
  const catalogIndex = events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json');
  assert.ok(catalogIndex >= 0, 'expected a catalog publication');
  for (let index = 0; index < catalogIndex; index++) {
    const event = events[index];
    if (event.type === 'put' && event.key !== 'catalog.json') {
      assert.deepEqual(events[index + 1], { type: 'head', key: event.key });
    }
  }
  assert.ok(events.slice(0, catalogIndex).every((event) => event.type !== 'delete'));
}

test('one sync uploads additions and modifications, publishes catalog, then removes a deleted album', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-unified-'));
  const r2 = fakeR2();
  try {
    const keptAlbum = await addAlbum(root, 'local-one', 'stable-one', { tracks: 2 });
    await addAlbum(root, 'local-two', 'stable-two');
    const first = await syncMusic(root, 'mock|bucket', r2.uploader);
    assert.equal(first.albums, 2);
    assert.equal(first.uploaded, albumKeys(r2.remote, 'stable-one').length + albumKeys(r2.remote, 'stable-two').length);
    assert.doesNotMatch(first.catalog, /[A-Z]:\\|public\/audio|localhost|R2_ACCESS_KEY|R2_SECRET_ACCESS_KEY/i);
    assertMediaVerifiedBeforeCatalog(r2.events);
    assert.equal(r2.events.at(-1)?.key, 'catalog.json');

    r2.events.length = 0;
    const unchanged = await syncMusic(root, 'mock|bucket', r2.uploader);
    assert.equal(unchanged.uploaded, 0);
    assert.equal(unchanged.catalogUploaded, false);
    assert.equal(r2.events.some((event) => event.type === 'put' || event.type === 'delete'), false);

    const modifiedTrack = path.join(keptAlbum, '01 song 1.wav');
    await fs.writeFile(modifiedTrack, wav(77));
    const future = new Date(Date.now() + 20_000);
    await fs.utimes(modifiedTrack, future, future);
    await addTrack(keptAlbum, 3);
    const deletedAlbumKeys = albumKeys(r2.remote, 'stable-two');
    await fs.rm(path.join(root, 'audio', 'local-two'), { recursive: true });
    const previousCatalog = r2.remote.get('catalog.json')?.toString() ?? '';
    r2.events.length = 0;
    let confirmedPlan: MusicPrunePlan | undefined;
    let pendingStateDuringConfirmation = false;
    const result = await syncMusic(root, 'mock|bucket', r2.uploader, {
      async confirmPrune(plan) {
        confirmedPlan = plan;
        const state = await readState(root);
        pendingStateDuringConfirmation = deletedAlbumKeys.every((key) => key in state.files && state.pendingDeletes?.includes(key));
        assert.equal(r2.remote.get('catalog.json')?.toString().includes('albums/stable-two/'), false);
        assert.notEqual(r2.remote.get('catalog.json')?.toString(), previousCatalog);
        return true;
      },
    });

    assert.equal(result.uploaded, 4); // changed audio plus the new track's audio, lyrics, and artwork
    assert.equal(result.deleted, deletedAlbumKeys.length);
    assert.equal(result.deletionDeferred, false);
    assert.ok(pendingStateDuringConfirmation);
    assert.ok(confirmedPlan?.requiresConfirmation);
    assert.match(confirmedPlan?.reasons.join('\n') ?? '', /entire album/);
    assert.ok(r2.events.some((event) => event.type === 'put' && event.key.startsWith('albums/stable-one/tracks/')));
    assert.ok(r2.events.some((event) => event.type === 'put' && event.key.startsWith('albums/stable-one/lyrics/')));
    assert.ok(r2.events.some((event) => event.type === 'put' && event.key.startsWith('albums/stable-one/artwork/tracks/')));
    const catalogIndex = r2.events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json');
    const firstDeleteIndex = r2.events.findIndex((event) => event.type === 'delete');
    assert.ok(catalogIndex >= 0 && catalogIndex < firstDeleteIndex);
    assert.ok(r2.events.slice(0, catalogIndex).every((event) => event.type !== 'delete'));
    assert.equal(r2.remote.get('catalog.json')?.toString().includes('albums/stable-two/'), false);
    assert.equal(albumKeys(r2.remote, 'stable-two').length, 0);
    const state = await readState(root);
    assert.ok(Object.keys(state.files).every((key) => key.startsWith('albums/stable-one/')));
    assert.deepEqual(state.pendingDeletes, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('deleting one track removes its audio, lyrics, and artwork only after catalog publication', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-track-delete-'));
  const r2 = fakeR2();
  try {
    const directory = await addAlbum(root, 'album', 'one-album', { tracks: 3 });
    await syncMusic(root, 'mock|bucket', r2.uploader);
    const before = JSON.parse(r2.remote.get('catalog.json')!.toString()) as { albums: Array<{ tracks: Array<{ title: string; file: string; lyricsUrl?: string; artwork?: string }> }> };
    const removed = before.albums[0].tracks.find((track) => track.title.includes('song 3'))!;
    const removedKeys = [removed.file, removed.lyricsUrl, removed.artwork]
      .filter((key): key is string => Boolean(key)).map((key) => key.split('?')[0]);
    assert.equal(removedKeys.length, 3);
    await fs.rm(path.join(directory, '03 song 3.wav'));
    await fs.rm(path.join(directory, '03 song 3.lrc'));
    await fs.rm(path.join(directory, '03 song 3.webp'));
    r2.events.length = 0;
    let asked = false;
    let confirmationReasons: string[] = [];
    const result = await syncMusic(root, 'mock|bucket', r2.uploader, {
      async confirmPrune(plan) { asked = true; confirmationReasons = plan.reasons; assert.equal(plan.objects.length, 3); return true; },
    });
    assert.equal(asked, true);
    assert.equal(result.deleted, 3);
    assert.ok(confirmationReasons.some((reason) => reason.includes('delete ratio')));
    for (const key of removedKeys) assert.equal(r2.remote.has(key), false);
    const catalog = r2.remote.get('catalog.json')!.toString();
    for (const key of removedKeys) assert.equal(catalog.includes(key), false);
    const catalogIndex = r2.events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json');
    const firstDeleteIndex = r2.events.findIndex((event) => event.type === 'delete');
    assert.ok(catalogIndex >= 0 && catalogIndex < firstDeleteIndex);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('small cleanup is automatic and prune remains a read-only preview', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-small-cleanup-'));
  const r2 = fakeR2();
  try {
    const directory = await addAlbum(root, 'album', 'many-tracks', { tracks: 25, lyrics: false, trackArtwork: false });
    await fs.writeFile(path.join(directory, '01 song 1.webp'), 'one optional track artwork');
    await syncMusic(root, 'mock|bucket', r2.uploader);
    const artworkKey = [...r2.remote.keys()].find((key) => key.startsWith('albums/many-tracks/artwork/tracks/'))!;
    await fs.rm(path.join(directory, '01 song 1.webp'));
    r2.events.length = 0;
    let asked = false;
    const result = await syncMusic(root, 'mock|bucket', r2.uploader, {
      async confirmPrune() { asked = true; return false; },
    });
    assert.equal(result.deleted, 1);
    assert.equal(asked, false);
    assert.equal(r2.remote.has(artworkKey), false);
    assert.ok(r2.events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json')
      < r2.events.findIndex((event) => event.type === 'delete'));

    const retained = await addAlbum(root, 'will-remove', 'will-remove');
    await syncMusic(root, 'mock|bucket', r2.uploader);
    const managedKeys = albumKeys(r2.remote, 'will-remove');
    await fs.rm(retained, { recursive: true });
    const beforeState = await fs.readFile(path.join(root, '.music-cache', 'sync-state.json'), 'utf8');
    r2.events.length = 0;
    const preview = await planMusicPrune(root, 'mock|bucket', r2.uploader);
    assert.deepEqual(preview.objects.map(({ key }) => key).sort(), managedKeys);
    assert.equal(r2.events.some((event) => event.type === 'head'), true);
    assert.equal(r2.events.some((event) => event.type === 'put' || event.type === 'delete'), false);
    assert.equal(await fs.readFile(path.join(root, '.music-cache', 'sync-state.json'), 'utf8'), beforeState);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('upload or catalog failure blocks every remote deletion and preserves pending history for retry', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-publish-failure-'));
  const r2 = fakeR2();
  try {
    const kept = await addAlbum(root, 'keep', 'keep-album');
    await addAlbum(root, 'remove', 'remove-album');
    await syncMusic(root, 'mock|bucket', r2.uploader);
    const oldCatalog = r2.remote.get('catalog.json')!.toString();
    const removedKeys = albumKeys(r2.remote, 'remove-album');
    const changedAudio = path.join(kept, '01 song 1.wav');
    await fs.writeFile(changedAudio, wav(99));
    const future = new Date(Date.now() + 30_000);
    await fs.utimes(changedAudio, future, future);
    const changedKey = [...r2.remote.keys()].find((key) => key.startsWith('albums/keep-album/tracks/'))!;
    await fs.rm(path.join(root, 'audio', 'remove'), { recursive: true });

    r2.events.length = 0;
    r2.failPut = changedKey;
    await assert.rejects(syncMusic(root, 'mock|bucket', r2.uploader, { async confirmPrune() { return true; } }), /simulated PutObject failure/);
    assert.equal(r2.remote.get('catalog.json')?.toString(), oldCatalog);
    assert.equal(r2.events.some((event) => event.type === 'delete'), false);
    let state = await readState(root);
    assert.ok(removedKeys.every((key) => key in state.files && state.pendingDeletes?.includes(key)));

    r2.events.length = 0;
    r2.failPut = 'catalog.json';
    await assert.rejects(syncMusic(root, 'mock|bucket', r2.uploader, { async confirmPrune() { return true; } }), /simulated PutObject failure/);
    assert.equal(r2.remote.get('catalog.json')?.toString(), oldCatalog);
    assert.equal(r2.events.some((event) => event.type === 'delete'), false);
    state = await readState(root);
    assert.ok(removedKeys.every((key) => key in state.files && state.pendingDeletes?.includes(key)));

    r2.failPut = undefined;
    r2.events.length = 0;
    const retry = await syncMusic(root, 'mock|bucket', r2.uploader, { async confirmPrune() { return true; } });
    assert.equal(retry.uploaded, 0); // the changed media was verified and recorded before catalog publication failed
    assert.equal(retry.deleted, removedKeys.length);
    assert.equal(albumKeys(r2.remote, 'remove-album').length, 0);
    assert.ok(r2.events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json')
      < r2.events.findIndex((event) => event.type === 'delete'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('uploaded media must pass HeadObject existence and size verification before catalog or cleanup', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-head-check-'));
  const r2 = fakeR2();
  try {
    const kept = await addAlbum(root, 'keep', 'keep-album');
    await addAlbum(root, 'remove', 'remove-album');
    await syncMusic(root, 'mock|bucket', r2.uploader);
    const oldCatalog = r2.remote.get('catalog.json')!.toString();
    await addTrack(kept, 2);
    await fs.rm(path.join(root, 'audio', 'remove'), { recursive: true });
    const scanned = await scanAudioLibrary(root);
    const newTrack = scanned.find((album) => album.id === 'keep-album')?.tracks.find((track) => track.title.includes('song 2'));
    assert.ok(newTrack);
    const newTrackKey = `albums/keep-album/tracks/${newTrack.id}.wav`;

    r2.omitAfterPut = newTrackKey;
    r2.events.length = 0;
    await assert.rejects(syncMusic(root, 'mock|bucket', r2.uploader, { async confirmPrune() { return true; } }), /not found during verification/);
    assert.equal(r2.events.some((event) => event.type === 'put' && event.key === 'catalog.json'), false);
    assert.equal(r2.events.some((event) => event.type === 'delete'), false);
    assert.equal(r2.remote.get('catalog.json')?.toString(), oldCatalog);

    r2.omitAfterPut = undefined;
    r2.wrongLength = newTrackKey;
    r2.events.length = 0;
    await assert.rejects(syncMusic(root, 'mock|bucket', r2.uploader, { async confirmPrune() { return true; } }), /ContentLength mismatch/);
    assert.equal(r2.events.some((event) => event.type === 'put' && event.key === 'catalog.json'), false);
    assert.equal(r2.events.some((event) => event.type === 'delete'), false);
    assert.equal(r2.remote.get('catalog.json')?.toString(), oldCatalog);

    r2.wrongLength = undefined;
    r2.events.length = 0;
    const result = await syncMusic(root, 'mock|bucket', r2.uploader, { async confirmPrune() { return true; } });
    assert.equal(result.uploaded, 3);
    assert.ok(r2.events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json')
      < r2.events.findIndex((event) => event.type === 'delete'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('partial deletion keeps all managed history and retries safely without reuploading media', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-delete-retry-'));
  const r2 = fakeR2();
  try {
    await addAlbum(root, 'keep', 'keep-album');
    await addAlbum(root, 'remove', 'remove-album');
    await syncMusic(root, 'mock|bucket', r2.uploader);
    const removedKeys = albumKeys(r2.remote, 'remove-album');
    await fs.rm(path.join(root, 'audio', 'remove'), { recursive: true });
    r2.failDelete = removedKeys[1];
    r2.events.length = 0;
    await assert.rejects(syncMusic(root, 'mock|bucket', r2.uploader, { async confirmPrune() { return true; } }), /simulated DeleteObject failure/);
    const failedState = await readState(root);
    assert.ok(removedKeys.every((key) => key in failedState.files && failedState.pendingDeletes?.includes(key)));
    assert.ok(removedKeys.some((key) => !r2.remote.has(key)));
    assert.ok(r2.events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json')
      < r2.events.findIndex((event) => event.type === 'delete'));

    r2.failDelete = undefined;
    r2.events.length = 0;
    const stillPresent = removedKeys.filter((key) => r2.remote.has(key)).length;
    const retry = await syncMusic(root, 'mock|bucket', r2.uploader, { async confirmPrune() { return true; } });
    assert.equal(retry.uploaded, 0);
    assert.equal(retry.deleted, stillPresent);
    assert.equal(r2.events.some((event) => event.type === 'put' && event.key !== 'catalog.json'), false);
    assert.ok(r2.events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json')
      < r2.events.findIndex((event) => event.type === 'delete'));
    assert.equal(albumKeys(r2.remote, 'remove-album').length, 0);
    const finalState = await readState(root);
    assert.ok(Object.keys(finalState.files).every((key) => key.startsWith('albums/keep-album/')));
    assert.deepEqual(finalState.pendingDeletes, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('large deletions and scan warnings require confirmation; declining leaves history pending', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-confirm-'));
  const r2 = fakeR2();
  try {
    const directory = await addAlbum(root, 'album', 'confirm-album');
    await syncMusic(root, 'mock|bucket', r2.uploader);
    const lyricKey = [...r2.remote.keys()].find((key) => key.startsWith('albums/confirm-album/lyrics/'))!;
    await fs.writeFile(path.join(directory, '01 song 1.lrc'), '');
    r2.events.length = 0;
    let plan: MusicPrunePlan | undefined;
    const result = await syncMusic(root, 'mock|bucket', r2.uploader, {
      async confirmPrune(candidate) { plan = candidate; return false; },
    });
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings.every((warning) => warning.startsWith('[audio-library][warning]')));
    assert.ok(plan?.requiresConfirmation);
    assert.ok(plan?.reasons.some((reason) => reason.includes('warning')));
    assert.equal(result.deletionDeferred, true);
    assert.equal(r2.remote.has(lyricKey), true);
    assert.ok((await readState(root)).pendingDeletes?.includes(lyricKey));
    assert.ok(r2.events.findIndex((event) => event.type === 'put' && event.key === 'catalog.json') >= 0);
    assert.equal(r2.events.some((event) => event.type === 'delete'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('invalid manifests and unreadable required audio stop before any R2 request', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-critical-scan-'));
  const r2 = fakeR2();
  try {
    const albumDirectory = await addAlbum(root, 'album', 'critical-album');
    await syncMusic(root, 'mock|critical', r2.uploader);
    const originalCatalog = r2.remote.get('catalog.json')?.toString();

    await fs.writeFile(path.join(albumDirectory, 'album.json'), '{ not valid JSON');
    r2.events.length = 0;
    await assert.rejects(syncMusic(root, 'mock|critical', r2.uploader), /Critical audio scan issue.*refusing to publish/);
    assert.equal(r2.events.length, 0);
    assert.equal(r2.remote.get('catalog.json')?.toString(), originalCatalog);

    await fs.writeFile(path.join(albumDirectory, 'album.json'), JSON.stringify({
      id: 'critical-album',
      tracks: [{ audio: 'missing-required-track.wav' }],
    }));
    r2.events.length = 0;
    await assert.rejects(syncMusic(root, 'mock|critical', r2.uploader), /Critical audio scan issue.*track audio override/);
    assert.equal(r2.events.length, 0);
    assert.equal(r2.remote.get('catalog.json')?.toString(), originalCatalog);

    await fs.writeFile(path.join(albumDirectory, 'album.json'), JSON.stringify({ id: 'critical-album' }));
    r2.events.length = 0;
    await assert.rejects(syncMusic(root, 'mock|critical', r2.uploader, {
      async verifyReadableFile(file) {
        if (path.extname(file) === '.wav') throw new Error('simulated unreadable audio');
        const handle = await fs.open(file, 'r');
        await handle.close();
      },
    }), /Critical audio scan issue.*required audio/);
    assert.equal(r2.events.length, 0);
    assert.equal(r2.remote.get('catalog.json')?.toString(), originalCatalog);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('scan results with an album but no readable audio track cannot publish', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-incomplete-scan-'));
  const r2 = fakeR2();
  try {
    const directory = path.join(root, 'audio', 'empty-album');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'album.json'), JSON.stringify({ id: 'empty-album', name: 'Empty' }));
    await assert.rejects(syncMusic(root, 'mock|incomplete', r2.uploader), /Critical scan result.*without readable audio tracks/);
    assert.equal(r2.events.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('target lock serializes two independent Node processes', async () => {
  const target = 'mock|cross-process-lock';
  const lockUrl = pathToFileURL(path.resolve('scripts/music-sync-lock.ts')).href;
  const childSource = `
    import { withTargetSyncLock } from ${JSON.stringify(lockUrl)};
    await withTargetSyncLock(${JSON.stringify(target)}, async () => {
      console.log('child-entered');
      await new Promise((resolve) => setTimeout(resolve, 350));
      console.log('child-released:' + Date.now());
    });
  `;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', childSource], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let transcript = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { transcript += chunk; });
  child.stderr.on('data', (chunk: string) => { transcript += chunk; });
  const exited = new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code ?? -1));
  });
  const started = new Promise<void>((resolveStart, rejectStart) => {
    const poll = setInterval(() => {
      if (transcript.includes('child-entered')) { clearInterval(poll); resolveStart(); }
    }, 5);
    child.once('exit', (code) => {
      clearInterval(poll);
      if (!transcript.includes('child-entered')) rejectStart(new Error(`Lock child exited early (${code}): ${transcript}`));
    });
  });

  try {
    await started;
    let parentEntered = false;
    let parentWaitNotified = false;
    let parentEnteredAt = 0;
    await withTargetSyncLock(target, async () => { parentEntered = true; parentEnteredAt = Date.now(); }, {
      pollMs: 10,
      onWaiting() { parentWaitNotified = true; },
    });
    assert.equal(parentEntered, true);
    assert.equal(parentWaitNotified, true);
    assert.equal(await exited, 0, transcript);
    const childReleasedAt = Number(/child-released:(\d+)/.exec(transcript)?.[1]);
    assert.ok(transcript.indexOf('child-entered') < transcript.indexOf('child-released:'));
    assert.ok(parentEnteredAt >= childReleasedAt);
  } finally {
    if (child.exitCode === null) child.kill();
  }
});

test('missing or empty audio refuses sync before any remote request', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-empty-'));
  const r2 = fakeR2();
  try {
    await assert.rejects(syncMusic(root, 'mock|bucket', r2.uploader), /audio\/ is missing/);
    await fs.mkdir(path.join(root, 'audio'));
    await assert.rejects(syncMusic(root, 'mock|bucket', r2.uploader), /No albums found/);
    assert.equal(r2.events.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('invalid or mismatched sync state is never overwritten and cannot trigger remote changes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-sync-state-guard-'));
  const r2 = fakeR2();
  try {
    await addAlbum(root, 'album', 'state-album');
    await syncMusic(root, 'mock|bucket', r2.uploader);
    const statePath = path.join(root, '.music-cache', 'sync-state.json');
    const original = await fs.readFile(statePath, 'utf8');
    const altered = JSON.parse(original) as { target: string };
    altered.target = 'different-endpoint|different-bucket';
    const mismatched = JSON.stringify(altered, null, 2) + '\n';
    await fs.writeFile(statePath, mismatched);
    r2.events.length = 0;
    await assert.rejects(syncMusic(root, 'mock|bucket', r2.uploader), /different R2 bucket/);
    assert.equal(r2.events.length, 0);
    assert.equal(await fs.readFile(statePath, 'utf8'), mismatched);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('watch queue debounces bursts and serializes a change that arrives during sync', async () => {
  let runCount = 0;
  let active = 0;
  let maxActive = 0;
  let startFirst!: () => void;
  let finishFirst!: () => void;
  let startSecond!: () => void;
  const firstStarted = new Promise<void>((resolveStart) => { startFirst = resolveStart; });
  const releaseFirst = new Promise<void>((resolveFinish) => { finishFirst = resolveFinish; });
  const secondStarted = new Promise<void>((resolveStart) => { startSecond = resolveStart; });
  const queue = createSerializedSyncQueue({
    debounceMs: 10,
    async waitForStable() {},
    async runSync() {
      runCount++;
      active++;
      maxActive = Math.max(maxActive, active);
      if (runCount === 1) { startFirst(); await releaseFirst; }
      if (runCount === 2) startSecond();
      active--;
    },
    onError(error) { assert.fail(String(error)); },
  });

  queue.notify();
  await firstStarted;
  queue.notify(); queue.notify(); queue.notify();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 35));
  finishFirst();
  await secondStarted;
  await queue.close();
  assert.equal(runCount, 2);
  assert.equal(maxActive, 1);
});

test('watch waits for a changing audio tree to remain stable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-watch-stable-'));
  const audio = path.join(root, 'audio');
  const controller = new AbortController();
  try {
    await fs.mkdir(audio);
    const file = path.join(audio, 'large.wav');
    await fs.writeFile(file, 'part one');
    const startedAt = Date.now();
    const stable = waitForStableAudioTree(audio, controller.signal, { pollMs: 10, stableIntervals: 3 });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
    await fs.appendFile(file, 'part two');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    await fs.appendFile(file, 'part three');
    await stable;
    assert.ok(Date.now() - startedAt >= 55);
  } finally {
    controller.abort();
    await fs.rm(root, { recursive: true, force: true });
  }
});
