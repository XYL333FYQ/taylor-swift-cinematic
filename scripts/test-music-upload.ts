import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { uploadMusic } from './music-upload-core.ts';
import { runMusicCheck } from './music-check.ts';
import { assertFullLibrarySafety } from './music-remote-catalog.ts';
import type { ObjectUpload } from './music-sync-core.ts';

function wav(variant = 0): Buffer {
  const samples = 8000;
  const output = Buffer.alloc(44 + samples * 2);
  output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8); output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(8000, 24); output.writeUInt32LE(16000, 28);
  output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36); output.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) output.writeInt16LE(Math.round(Math.sin(index / 20 + variant) * 1000), 44 + index * 2);
  return output;
}
async function addAlbum(root: string, id: string, tracks: Array<{ number: number; variant?: number }>, manifest: Record<string, unknown> = {}) {
  const directory = path.join(root, 'incoming', id);
  await fs.mkdir(path.join(directory, 'artwork'), { recursive: true });
  await fs.writeFile(path.join(directory, 'album.json'), JSON.stringify({
    id, name: { en: id, zh: id }, releaseDate: '2020-01-01', color: '#abcdef',
    ...manifest,
  }));
  await fs.writeFile(path.join(directory, 'artwork', 'cover.webp'), 'cover');
  for (const track of tracks) {
    const stem = `${String(track.number).padStart(2, '0')} song ${track.number}`;
    await fs.writeFile(path.join(directory, `${stem}.wav`), wav(track.variant ?? track.number));
  }
  return directory;
}
function fakeR2() {
  const objects = new Map<string, Buffer>();
  const writes: string[] = [];
  let failKey: string | undefined;
  const store = {
    async put(object: ObjectUpload) {
      writes.push(object.key);
      if (failKey === object.key) throw new Error(`simulated failure: ${object.key}`);
      const current = objects.get(object.key);
      if (object.ifNoneMatch === '*' && current) throw new Error('HTTP 412');
      if (object.ifMatch && (!current || `"${createHash('md5').update(current).digest('hex')}"` !== object.ifMatch)) throw new Error('HTTP 412');
      const chunks: Buffer[] = [];
      if (Buffer.isBuffer(object.body)) chunks.push(object.body);
      else for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      assert.equal(body.length, object.contentLength);
      objects.set(object.key, body);
    },
    async head(key: string) { const body = objects.get(key); return body ? { contentLength: body.length } : null; },
    async getText(key: string) {
      const body = objects.get(key);
      return body ? { text: body.toString('utf8'), etag: `"${createHash('md5').update(body).digest('hex')}"` } : null;
    },
    async hash(key: string) {
      const body = objects.get(key);
      return body ? { hash: createHash('sha256').update(body).digest('hex'), size: body.length } : null;
    },
  };
  return { objects, writes, store, set failKey(value: string | undefined) { failKey = value; } };
}
async function inTemporaryRoot(action: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-upload-test-'));
  try { await action(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
const approve = async () => true;
const target = 'test-upload-target';
const catalog = (objects: Map<string, Buffer>) => JSON.parse(objects.get('catalog.json')!.toString('utf8')) as { albums: Array<{ id: string; name: { en: string }; tracks: Array<{ id: string; file: string }> }> };

test('new album uploads media before catalog and archives incoming', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'new-album', [{ number: 1 }]);
  await fs.writeFile(path.join(root, 'incoming', 'new-album', '01 song 1.lrc'), '[00:00.00]Test lyric\n');
  await fs.mkdir(path.join(root, 'incoming', 'new-album', 'Disc 1'));
  await fs.writeFile(path.join(root, 'incoming', 'new-album', 'Disc 1', 'notes.txt'), 'keep nested files');
  const remote = fakeR2();
  const phases: string[] = [];
  const store = { ...remote.store, async put(object: ObjectUpload) {
    if (object.key === 'catalog.json') { assert.equal(object.ifNoneMatch, '*'); assert.equal(object.ifMatch, undefined); }
    await remote.store.put(object);
  } };
  const report = await uploadMusic(root, target, store, {
    onReport: (_, phase) => { phases.push(phase); assert.deepEqual(remote.writes, []); },
    confirm: async () => { assert.deepEqual(phases, ['preflight', 'plan']); return true; },
  });
  assert.deepEqual(report.newAlbums, ['new-album']);
  const published = catalog(remote.objects);
  assert.equal(published.albums.length, 1);
  const album = published.albums[0]! as typeof published.albums[number] & { releaseDate: string; color: string; colorAccent: string; artist?: string; artwork: { cover: string; presentation: string }; genre: { en: string; zh: string } };
  assert.equal(album.id, 'new-album');
  assert.equal(album.name.en, 'new-album');
  assert.equal(album.releaseDate, '2020-01-01');
  assert.equal(album.color, '#abcdef');
  assert.equal(typeof album.colorAccent, 'string');
  assert.equal(typeof album.artwork.cover, 'string');
  assert.equal(typeof album.artwork.presentation, 'string');
  assert.equal(typeof album.genre.en, 'string');
  assert.equal(album.tracks.length, 1);
  assert.equal(typeof album.tracks[0]!.id, 'string');
  assert.equal(typeof album.tracks[0]!.file, 'string');
  assert.equal(typeof (album.tracks[0] as { lyricsUrl?: string }).lyricsUrl, 'string');
  assert.equal(remote.writes.at(-1), 'catalog.json');
  assert.deepEqual(report.archived, [path.join(root, 'uploaded', 'new-album')]);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'uploaded', 'new-album', 'album.json'), 'utf8')).id, 'new-album');
  assert.equal(await fs.readFile(path.join(root, 'uploaded', 'new-album', 'artwork', 'cover.webp'), 'utf8'), 'cover');
  assert.equal(await fs.readFile(path.join(root, 'uploaded', 'new-album', '01 song 1.lrc'), 'utf8'), '[00:00.00]Test lyric\n');
  assert.equal(await fs.readFile(path.join(root, 'uploaded', 'new-album', 'Disc 1', 'notes.txt'), 'utf8'), 'keep nested files');
  await assert.rejects(fs.stat(path.join(root, 'incoming', 'new-album')));
}));

test('existing album appends a track and preserves cloud album metadata and old track', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  const remote = fakeR2();
  await uploadMusic(root, target, remote.store, { confirm: approve });
  const before = catalog(remote.objects);
  before.albums[0]!.name.en = 'Cloud-owned title';
  const oldTrack = structuredClone(before.albums[0]!.tracks[0]);
  remote.objects.set('catalog.json', Buffer.from(JSON.stringify(before)));
  await fs.rm(path.join(root, 'uploaded', 'album-a'), { recursive: true });
  await addAlbum(root, 'album-a', [{ number: 2 }], { name: { en: 'Incoming title', zh: 'New' } });
  const report = await uploadMusic(root, target, remote.store, { confirm: approve });
  const after = catalog(remote.objects);
  assert.equal(after.albums[0]!.name.en, 'Cloud-owned title');
  assert.deepEqual(after.albums[0]!.tracks[0], oldTrack);
  assert.equal(after.albums[0]!.tracks.length, 2);
  assert.equal(report.newTracks.length, 1);
}));

test('identical duplicate skips upload; changed ID needs replace choice', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  const remote = fakeR2();
  await uploadMusic(root, target, remote.store, { confirm: approve });
  const original = remote.objects.get('catalog.json')!.toString('utf8');
  remote.writes.length = 0;
  await fs.rm(path.join(root, 'uploaded', 'album-a'), { recursive: true });
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  const duplicate = await uploadMusic(root, target, remote.store, { confirm: approve });
  assert.equal(duplicate.duplicates.length, 1);
  assert.deepEqual(remote.writes, []);
  await fs.rm(path.join(root, 'uploaded', 'album-a'), { recursive: true });
  await addAlbum(root, 'album-a', [{ number: 1, variant: 99 }]);
  const skipped = await uploadMusic(root, target, remote.store, { confirm: approve, chooseReplacement: async () => 'skip' });
  assert.equal(skipped.changed.length, 1);
  assert.equal(remote.objects.get('catalog.json')!.toString('utf8'), original);
  await fs.rm(path.join(root, 'uploaded', 'album-a'), { recursive: true });
  await addAlbum(root, 'album-a', [{ number: 1, variant: 99 }]);
  const replaced = await uploadMusic(root, target, remote.store, { confirm: approve, chooseReplacement: async () => 'replace' });
  assert.equal(replaced.replacements.length, 1);
  assert.notEqual(remote.objects.get('catalog.json')!.toString('utf8'), original);
}));

test('failed media upload leaves catalog and incoming unchanged, retry completes', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  const remote = fakeR2();
  remote.failKey = 'albums/album-a/artwork/cover.webp';
  await assert.rejects(uploadMusic(root, target, remote.store, { confirm: approve }), /simulated failure/);
  assert.equal(remote.objects.has('catalog.json'), false);
  await fs.stat(path.join(root, 'incoming', 'album-a'));
  remote.failKey = undefined;
  await uploadMusic(root, target, remote.store, { confirm: approve });
  assert.equal(catalog(remote.objects).albums.length, 1);
}));

test('replacement writes a new object key and leaves published audio intact if catalog upload fails', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  const remote = fakeR2();
  await uploadMusic(root, target, remote.store, { confirm: approve });
  const before = remote.objects.get('catalog.json')!.toString('utf8');
  const oldKey = catalog(remote.objects).albums[0]!.tracks[0]!.file.split('?')[0]!;
  const oldAudio = Buffer.from(remote.objects.get(oldKey)!);
  await fs.rm(path.join(root, 'uploaded', 'album-a'), { recursive: true });
  await addAlbum(root, 'album-a', [{ number: 1, variant: 99 }]);
  remote.failKey = 'catalog.json';
  await assert.rejects(uploadMusic(root, target, remote.store, { confirm: approve, chooseReplacement: async () => 'replace' }), /simulated failure/);
  assert.equal(remote.objects.get('catalog.json')!.toString('utf8'), before);
  assert.deepEqual(remote.objects.get(oldKey), oldAudio);
  await fs.stat(path.join(root, 'incoming', 'album-a'));
  remote.failKey = undefined;
  await uploadMusic(root, target, remote.store, { confirm: approve, chooseReplacement: async () => 'replace' });
  assert.notEqual(catalog(remote.objects).albums[0]!.tracks[0]!.file.split('?')[0], oldKey);
}));

test('existing uploaded album name blocks before any cloud request or write', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  await fs.mkdir(path.join(root, 'uploaded', 'album-a'), { recursive: true });
  await fs.writeFile(path.join(root, 'uploaded', 'album-a', 'keep.txt'), 'unchanged');
  const remote = fakeR2();
  let issue = '';
  await assert.rejects(uploadMusic(root, target, remote.store, {
    onReport: (report) => { issue = report.issues.find((item) => item.message.includes('已存在'))?.message ?? ''; },
  }), /上传检查未通过/);
  assert.match(issue, /uploaded\/album-a/);
  assert.deepEqual(remote.writes, []);
  assert.equal(await fs.readFile(path.join(root, 'uploaded', 'album-a', 'keep.txt'), 'utf8'), 'unchanged');
  await fs.stat(path.join(root, 'incoming', 'album-a'));
}));

test('music:check uses only local incoming preflight', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  assert.equal(await runMusicCheck(root), true);
  await fs.rm(path.join(root, 'incoming', 'album-a', 'album.json'));
  assert.equal(await runMusicCheck(root), false);
}));

test('concurrent catalog update is not overwritten and incoming remains available', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  const remote = fakeR2();
  await uploadMusic(root, target, remote.store, { confirm: approve });
  await addAlbum(root, 'album-b', [{ number: 1 }]);
  await assert.rejects(uploadMusic(root, target, remote.store, {
    confirm: approve,
    onReport: () => {
      const changed = catalog(remote.objects);
      changed.albums[0]!.name.en = 'Concurrent update';
      remote.objects.set('catalog.json', Buffer.from(JSON.stringify(changed)));
    },
  }), /HTTP 412/);
  assert.equal(catalog(remote.objects).albums[0]!.name.en, 'Concurrent update');
  await fs.stat(path.join(root, 'incoming', 'album-b'));
}));

test('preflight blocks missing required fields but only warns on optional resources', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }], { color: undefined });
  const remote = fakeR2();
  let errors = 0;
  await assert.rejects(uploadMusic(root, target, remote.store, { onReport: (report) => { errors = report.issues.filter((issue) => issue.level === 'error').length; } }));
  assert.ok(errors > 0);
  assert.equal(remote.writes.length, 0);
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  const report = await uploadMusic(root, target, remote.store, { dryRun: true });
  assert.equal(report.issues.some((issue) => issue.level === 'error'), false);
  assert.ok(report.issues.some((issue) => issue.level === 'warning' && issue.message.includes('没有歌词')));
  assert.equal(remote.writes.length, 0);
  await fs.stat(path.join(root, 'incoming', 'album-a'));
}));

test('full-library safety blocks missing cloud album and major track drop', () => {
  const minimal = (id: string, tracks: number) => ({ id, tracks: Array.from({ length: tracks }, (_, index) => ({ id: `track-${index}` })) });
  assert.throws(() => assertFullLibrarySafety([minimal('album-a', 1) as never], { albums: [minimal('album-a', 1), minimal('album-b', 1)] as never }), /--force/);
  assert.throws(() => assertFullLibrarySafety([minimal('album-a', 1) as never], { albums: [minimal('album-a', 5)] as never }), /--force/);
});
