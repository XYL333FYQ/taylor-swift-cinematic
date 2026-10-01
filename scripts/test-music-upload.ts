import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { uploadMusic, discoverUploadCandidates } from './music-upload-core.ts';
import { runMusicCheck } from './music-check.ts';
import { assertFullLibrarySafety } from './music-remote-catalog.ts';
import { parseUploadArgs } from './music-upload.ts';
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
  assert.equal(await runMusicCheck(root), true); // A song batch can select its existing album at upload time.
}));

async function seedAlbum(root: string) {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  const remote = fakeR2();
  await uploadMusic(root, target, remote.store, { confirm: approve });
  remote.writes.length = 0;
  return remote;
}

async function addSongFolder(root: string, number: number, variant = number) {
  const folder = `New song ${number}`;
  const directory = path.join(root, 'incoming', folder);
  await fs.mkdir(directory, { recursive: true });
  const stem = `${String(number).padStart(2, '0')} song ${number}`;
  await fs.writeFile(path.join(directory, `${stem}.wav`), wav(variant));
  return { folder, directory, stem };
}

test('four song folders select one cloud album without local manifests or cover; preserve catalog and archive layout', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const before = JSON.parse(remote.objects.get('catalog.json')!.toString());
  await fs.writeFile(path.join(root, 'incoming', '.gitkeep'), '');
  for (let number = 2; number <= 5; number++) {
    const song = await addSongFolder(root, number);
    if (number === 2) {
      await fs.writeFile(path.join(song.directory, `${song.stem}.lrc`), '[00:00.00]New lyric');
      await fs.writeFile(path.join(song.directory, `${song.stem}.jpg`), 'single artwork');
    }
  }
  assert.equal(await runMusicCheck(root), true);
  let selections = 0;
  const report = await uploadMusic(root, target, remote.store, {
    chooseAlbum: async (albums) => { selections++; assert.equal(albums[0]!.id, 'album-a'); return albums[0]!.id; },
    confirm: async (plan) => {
      assert.equal(plan.targetAlbum?.id, 'album-a');
      assert.equal(plan.newAlbums.length, 0);
      assert.equal(plan.newTracks.length, 4);
      assert.deepEqual(remote.writes, []);
      return true;
    },
  });
  const after = JSON.parse(remote.objects.get('catalog.json')!.toString());
  assert.equal(selections, 1);
  assert.equal(after.albums.length, 1);
  assert.equal(after.albums[0].tracks.length, 5);
  assert.deepEqual(after.albums[0].tracks[0], before.albums[0].tracks[0]);
  assert.deepEqual({ ...after.albums[0], tracks: [] }, { ...before.albums[0], tracks: [] });
  assert.ok(after.albums[0].tracks[1].lyricsUrl);
  assert.ok(after.albums[0].tracks[1].artwork);
  assert.equal(remote.writes.some((key) => key.includes('/artwork/cover')), false);
  assert.equal(report.archived.length, 4);
  for (let number = 2; number <= 5; number++) {
    await fs.stat(path.join(root, 'uploaded', `New song ${number}`, `${String(number).padStart(2, '0')} song ${number}.wav`));
  }
  assert.deepEqual(await fs.readdir(path.join(root, 'incoming')), ['.gitkeep']);
}));

test('raw audio dry-run, unknown target, and cancellation never publish or archive', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const songFile = path.join(root, 'incoming', '02 song 2.wav');
  await fs.writeFile(songFile, wav(2));
  const original = remote.objects.get('catalog.json')!.toString();
  const report = await uploadMusic(root, target, remote.store, { albumId: 'album-a', dryRun: true });
  assert.equal(report.newTracks.length, 1);
  assert.equal(report.archived.length, 0);
  await assert.rejects(uploadMusic(root, target, remote.store, { albumId: 'missing', confirm: approve }), /没有创建新专辑/);
  await assert.rejects(uploadMusic(root, target, remote.store, { chooseAlbum: async () => null }), /尚未选择/);
  await assert.rejects(uploadMusic(root, target, remote.store, { albumId: 'album-a', confirm: async () => false }), /用户取消/);
  assert.deepEqual(remote.writes, []);
  assert.equal(remote.objects.get('catalog.json')!.toString(), original);
  await fs.stat(songFile);
}));

test('song-batch failure preserves inputs and published catalog; retry skips verified files', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  await addSongFolder(root, 2);
  await addSongFolder(root, 3);
  const original = remote.objects.get('catalog.json')!.toString();
  const preview = await uploadMusic(root, target, remote.store, { albumId: 'album-a', dryRun: true });
  remote.failKey = preview.mediaUploads[1];
  await assert.rejects(uploadMusic(root, target, remote.store, { albumId: 'album-a', confirm: approve }), /simulated failure/);
  assert.equal(remote.objects.get('catalog.json')!.toString(), original);
  await fs.stat(path.join(root, 'incoming', 'New song 2'));
  await fs.stat(path.join(root, 'incoming', 'New song 3'));
  remote.failKey = undefined;
  remote.writes.length = 0;
  const recovered = await uploadMusic(root, target, remote.store, { albumId: 'album-a', confirm: approve });
  assert.equal(recovered.mediaUploads.length, 1);
  assert.equal(catalog(remote.objects).albums[0]!.tracks.length, 3);
  assert.equal(recovered.archived.length, 2);
}));

test('song-batch duplicates skip writes and changed song requires explicit replacement', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const song = await addSongFolder(root, 1);
  const original = remote.objects.get('catalog.json')!.toString();
  const duplicate = await uploadMusic(root, target, remote.store, { albumId: 'album-a', confirm: approve });
  assert.equal(duplicate.duplicates.length, 1);
  assert.deepEqual(remote.writes, []);
  await fs.rm(path.join(root, 'uploaded', song.folder), { recursive: true });
  await addSongFolder(root, 1, 99);
  const skipped = await uploadMusic(root, target, remote.store, { albumId: 'album-a', confirm: approve });
  assert.equal(skipped.changed.length, 1);
  assert.equal(skipped.replacements.length, 0);
  assert.equal(remote.objects.get('catalog.json')!.toString(), original);
  assert.deepEqual(skipped.archived, []);
  await fs.stat(song.directory);
  const replaced = await uploadMusic(root, target, remote.store, {
    albumId: 'album-a', confirm: approve, chooseReplacement: async () => 'replace',
  });
  assert.equal(replaced.replacements.length, 1);
  assert.equal(catalog(remote.objects).albums[0]!.tracks.length, 1);
}));

test('song batches require an existing catalog and block archive collisions before publication', async () => inTemporaryRoot(async (root) => {
  const song = await addSongFolder(root, 2);
  const empty = fakeR2();
  await assert.rejects(uploadMusic(root, target, empty.store, { albumId: 'album-a', confirm: approve }), /云端还没有/);
  assert.deepEqual(empty.writes, []);
  await fs.rm(song.directory, { recursive: true });
  const remote = await seedAlbum(root);
  await addSongFolder(root, 2);
  await fs.mkdir(path.join(root, 'uploaded', song.folder));
  await fs.writeFile(path.join(root, 'uploaded', song.folder, `${song.stem}.wav`), 'different archived content');
  await assert.rejects(uploadMusic(root, target, remote.store, { albumId: 'album-a', confirm: approve }), /归档冲突/);
  assert.deepEqual(remote.writes, []);
}));

test('upload arguments accept album selection and reject malformed or duplicated flags', () => {
  assert.deepEqual(parseUploadArgs(['--', '--dry-run', '--album', 'album-a']), { dryRun: true, albumId: 'album-a' });
  for (const args of [['--album'], ['--album', '--dry-run'], ['--dry-run', '--dry-run'], ['--yes'], ['--album', 'album-a', '--album', 'album-a']]) {
    assert.throws(() => parseUploadArgs(args), /用法/);
  }
});

test('loose audio pairs root lyrics and single artwork without treating the image as an album cover', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  await fs.writeFile(path.join(root, 'incoming', '02 song 2.wav'), wav(2));
  await fs.writeFile(path.join(root, 'incoming', '02 song 2.lrc'), '[00:00.00]Root lyric');
  await fs.writeFile(path.join(root, 'incoming', '02 song 2.jpg'), 'root single artwork');
  const report = await uploadMusic(root, target, remote.store, { albumId: 'album-a', confirm: approve });
  const after = JSON.parse(remote.objects.get('catalog.json')!.toString());
  assert.ok(after.albums[0].tracks[1].lyricsUrl);
  assert.ok(after.albums[0].tracks[1].artwork);
  assert.equal(report.mediaUploads.length, 3);
  assert.equal(report.archived.length, 3);
  await fs.stat(path.join(root, 'uploaded', '02 song 2.wav'));
}));

test('adding a new-album manifest during target selection cannot silently switch modes', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const song = await addSongFolder(root, 2);
  await assert.rejects(uploadMusic(root, target, remote.store, {
    chooseAlbum: async () => {
      await fs.writeFile(path.join(song.directory, 'album.json'), JSON.stringify({
        id: 'surprise-new-album', name: 'Surprise', releaseDate: '2026', color: '#123456',
      }));
      return 'album-a';
    }, confirm: approve,
  }), /结构发生变化/);
  assert.deepEqual(remote.writes, []);
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

test('explicit new-album selection creates the first catalog and ignores invalid unselected albums', async () => inTemporaryRoot(async (root) => {
  await addAlbum(root, 'album-a', [{ number: 1 }]);
  await addAlbum(root, 'album-b', [{ number: 2 }], { color: undefined });
  const candidates = await discoverUploadCandidates(root, 'albums');
  assert.equal(candidates.find((item) => item.path === 'album-a')!.trackCount, 1);
  assert.ok(candidates.find((item) => item.path === 'album-b')!.issues.some((issue) => issue.level === 'error'));
  const remote = fakeR2();
  await uploadMusic(root, target, remote.store, { mode: 'albums', selectedPaths: ['album-a'], confirm: approve });
  assert.deepEqual(catalog(remote.objects).albums.map((album) => album.id), ['album-a']);
  await fs.stat(path.join(root, 'incoming', 'album-b', 'album.json'));
  await fs.stat(path.join(root, 'uploaded', 'album-a', 'album.json'));
}));

test('new-album mode rejects existing cloud IDs before any write', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  await fs.rm(path.join(root, 'uploaded', 'album-a'), { recursive: true });
  await addAlbum(root, 'album-a', [{ number: 2 }]);
  await assert.rejects(uploadMusic(root, target, remote.store, { mode: 'albums', selectedPaths: ['album-a'], confirm: approve }), /给已有专辑追加歌曲/);
  assert.deepEqual(remote.writes, []);
  await fs.stat(path.join(root, 'incoming', 'album-a'));
}));

test('selecting two of four song folders preserves unselected songs and cloud album details', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const before = JSON.parse(remote.objects.get('catalog.json')!.toString());
  for (let number = 2; number <= 5; number++) {
    const song = await addSongFolder(root, number);
    await fs.writeFile(path.join(song.directory, '歌曲信息.txt'), `Notes ${number}`);
  }
  const candidates = await discoverUploadCandidates(root, 'tracks');
  assert.equal(candidates.length, 4);
  const report = await uploadMusic(root, target, remote.store, {
    mode: 'tracks', selectedPaths: [candidates[0]!.path, candidates[2]!.path], albumId: 'album-a', confirm: approve,
  });
  assert.equal(report.newTracks.length, 2);
  assert.equal(report.selectedTrackCount, 2);
  assert.equal(report.mediaUploads.length, 2);
  const after = JSON.parse(remote.objects.get('catalog.json')!.toString());
  assert.equal(after.albums[0].tracks.length, 3);
  assert.deepEqual(after.albums[0].tracks[0], before.albums[0].tracks[0]);
  assert.deepEqual({ ...after.albums[0], tracks: [] }, { ...before.albums[0], tracks: [] });
  for (const number of [2, 4]) {
    await fs.stat(path.join(root, 'uploaded', `New song ${number}`, '歌曲信息.txt'));
    await assert.rejects(fs.stat(path.join(root, 'incoming', `New song ${number}`)));
  }
  for (const number of [3, 5]) await fs.stat(path.join(root, 'incoming', `New song ${number}`));
}));

async function sharedSongBatch(root: string) {
  const folder = path.join(root, 'incoming', 'Batch');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'a.wav'), wav(2));
  await fs.writeFile(path.join(folder, 'b.wav'), wav(3));
  await fs.writeFile(path.join(folder, 'shared.jpg'), 'shared artwork');
  await fs.writeFile(path.join(folder, 'shared.lrc'), '[00:00.00]Shared lyric');
  await fs.writeFile(path.join(folder, 'notes.txt'), 'Original notes');
  await fs.writeFile(path.join(folder, 'album.json'), JSON.stringify({ tracks: [
    { audio: 'a.wav', title: 'Song A', trackNumber: 2, artwork: 'shared.jpg', lyrics: 'shared.lrc' },
    { audio: 'b.wav', title: 'Song B', trackNumber: 3, artwork: 'shared.jpg', lyrics: 'shared.lrc' },
  ] }));
  return folder;
}

test('partial song folder archives exclusive files, copies shared resources and supports a second batch', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const folder = await sharedSongBatch(root);
  const first = await uploadMusic(root, target, remote.store, { mode: 'tracks', selectedPaths: ['Batch/a.wav'], albumId: 'album-a', confirm: approve });
  assert.equal(first.newTracks.length, 1);
  assert.ok(first.newTracks[0]!.includes('Song A'));
  assert.equal(first.mediaUploads.length, 3);
  assert.ok(first.archivePaths!.some((file) => file.includes('shared.jpg') && file.includes('复制')));
  await assert.rejects(fs.stat(path.join(folder, 'a.wav')));
  for (const file of ['b.wav', 'shared.jpg', 'shared.lrc', 'album.json', 'notes.txt']) await fs.stat(path.join(folder, file));
  for (const file of ['a.wav', 'shared.jpg', 'shared.lrc']) await fs.stat(path.join(root, 'uploaded', 'Batch', file));
  await assert.rejects(fs.stat(path.join(root, 'uploaded', 'Batch', 'notes.txt')));
  const second = await uploadMusic(root, target, remote.store, { mode: 'tracks', selectedPaths: ['Batch/b.wav'], albumId: 'album-a', confirm: approve });
  assert.equal(second.newTracks.length, 1);
  assert.ok(second.newTracks[0]!.includes('Song B'));
  assert.equal(catalog(remote.objects).albums[0]!.tracks.length, 3);
  await assert.rejects(fs.stat(folder));
  for (const file of ['a.wav', 'b.wav', 'shared.jpg', 'shared.lrc', 'album.json', 'notes.txt']) await fs.stat(path.join(root, 'uploaded', 'Batch', file));
}));

test('unselected malformed metadata cannot block a valid song selection', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const good = await addSongFolder(root, 2);
  const bad = await addSongFolder(root, 3);
  await fs.writeFile(path.join(bad.directory, 'album.json'), '{bad json');
  const candidates = await discoverUploadCandidates(root, 'tracks');
  assert.equal(candidates.find((item) => item.path.startsWith(good.folder))!.issues.some((issue) => issue.level === 'error'), false);
  assert.ok(candidates.find((item) => item.path.startsWith(bad.folder))!.issues.some((issue) => issue.level === 'error'));
  await uploadMusic(root, target, remote.store, { mode: 'tracks', selectedPaths: [`${good.folder}/${good.stem}.wav`], albumId: 'album-a', confirm: approve });
  await fs.stat(path.join(bad.directory, 'album.json'));
  assert.equal(catalog(remote.objects).albums[0]!.tracks.length, 2);
}));

test('selected dry-run and final cancellation preserve every input and write nothing', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  await sharedSongBatch(root);
  const options = { mode: 'tracks' as const, selectedPaths: ['Batch/a.wav'], albumId: 'album-a' };
  const preview = await uploadMusic(root, target, remote.store, { ...options, dryRun: true });
  assert.equal(preview.newTracks.length, 1);
  await assert.rejects(uploadMusic(root, target, remote.store, { ...options, confirm: async () => false }), /用户取消/);
  assert.deepEqual(remote.writes, []);
  assert.deepEqual((await fs.readdir(path.join(root, 'incoming', 'Batch'))).sort(), ['a.wav', 'album.json', 'b.wav', 'notes.txt', 'shared.jpg', 'shared.lrc']);
}));

test('archive conflicts and source changes during confirmation fail before cloud writes', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const song = await addSongFolder(root, 2);
  const options = { mode: 'tracks' as const, selectedPaths: [`${song.folder}/${song.stem}.wav`], albumId: 'album-a' };
  await assert.rejects(uploadMusic(root, target, remote.store, { ...options, confirm: async () => {
    await fs.mkdir(path.join(root, 'uploaded', song.folder));
    await fs.writeFile(path.join(root, 'uploaded', song.folder, `${song.stem}.wav`), wav(99));
    return true;
  } }), /归档冲突/);
  assert.deepEqual(remote.writes, []);
  await fs.rm(path.join(root, 'uploaded', song.folder), { recursive: true });
  await assert.rejects(uploadMusic(root, target, remote.store, { ...options, confirm: async () => {
    await fs.writeFile(path.join(song.directory, `${song.stem}.wav`), wav(99));
    return true;
  } }), /归档文件发生变化/);
  assert.deepEqual(remote.writes, []);
}));

test('selected upload failure retries only selected tracks and keeps the other songs incoming', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  for (let number = 2; number <= 4; number++) await addSongFolder(root, number);
  const options = { mode: 'tracks' as const, selectedPaths: ['New song 2/02 song 2.wav', 'New song 3/03 song 3.wav'], albumId: 'album-a' };
  const preview = await uploadMusic(root, target, remote.store, { ...options, dryRun: true });
  remote.failKey = preview.mediaUploads[1];
  await assert.rejects(uploadMusic(root, target, remote.store, { ...options, confirm: approve }), /simulated failure/);
  for (let number = 2; number <= 4; number++) await fs.stat(path.join(root, 'incoming', `New song ${number}`));
  assert.equal(catalog(remote.objects).albums[0]!.tracks.length, 1);
  remote.failKey = undefined;
  const retried = await uploadMusic(root, target, remote.store, { ...options, confirm: approve });
  assert.equal(retried.mediaUploads.length, 1);
  assert.equal(retried.archived.length, 2);
  await fs.stat(path.join(root, 'incoming', 'New song 4'));
}));

test('song IDs are assigned before filtering the selected paths', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  for (const directory of ['Version A', 'Version B']) {
    await fs.mkdir(path.join(root, 'incoming', directory));
    await fs.writeFile(path.join(root, 'incoming', directory, '02 same song.wav'), wav(2));
  }
  const all = await uploadMusic(root, target, remote.store, { mode: 'tracks', albumId: 'album-a', dryRun: true });
  assert.equal(all.newTracks.length, 2);
  const selected = await uploadMusic(root, target, remote.store, { mode: 'tracks', selectedPaths: ['Version B/02 same song.wav'], albumId: 'album-a', confirm: approve });
  assert.equal(selected.newTracks.length, 1);
  assert.ok(catalog(remote.objects).albums[0]!.tracks[1]!.id.includes('version-b'));
}));

test('duplicate-only batch verifies the catalog is unchanged before archival', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const song = await addSongFolder(root, 1);
  await assert.rejects(uploadMusic(root, target, remote.store, {
    mode: 'tracks', selectedPaths: [`${song.folder}/${song.stem}.wav`], albumId: 'album-a',
    confirm: async () => {
      const next = catalog(remote.objects);
      next.albums[0]!.tracks = [];
      remote.objects.set('catalog.json', Buffer.from(JSON.stringify(next)));
      return true;
    },
  }), /归档前校验失败/);
  assert.deepEqual(remote.writes, []);
  await fs.stat(song.directory);
}));

test('dry-run previews an explicitly chosen replacement without uploading or archiving', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const song = await addSongFolder(root, 1, 99);
  const original = remote.objects.get('catalog.json')!.toString();
  const report = await uploadMusic(root, target, remote.store, {
    mode: 'tracks', selectedPaths: [`${song.folder}/${song.stem}.wav`], albumId: 'album-a', dryRun: true,
    chooseReplacement: async () => 'replace',
    confirm: async () => { assert.fail('dry-run must not ask for upload confirmation'); },
  });
  assert.equal(report.replacements.length, 1);
  assert.equal(report.mediaUploads.length, 1);
  assert.deepEqual(remote.writes, []);
  assert.equal(remote.objects.get('catalog.json')!.toString(), original);
  await fs.stat(song.directory);
}));

test('song mode retains the scanner rule that duplicated overrides are ignored', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const song = await addSongFolder(root, 2);
  await fs.writeFile(path.join(song.directory, 'album.json'), JSON.stringify({ tracks: [
    { audio: `${song.stem}.wav`, title: 'First override' },
    { audio: `${song.stem}.wav`, title: 'Second override' },
  ] }));
  const report = await uploadMusic(root, target, remote.store, {
    mode: 'tracks', selectedPaths: [`${song.folder}/${song.stem}.wav`], albumId: 'album-a', dryRun: true,
  });
  assert.ok(report.issues.some((issue) => issue.message.includes('duplicate track overrides')));
  assert.ok(report.newTracks[0]!.endsWith('/ song 2'));
  assert.deepEqual(remote.writes, []);
}));

test('selected media must pass HeadObject verification before publishing the catalog or archiving', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const song = await addSongFolder(root, 2);
  const original = remote.objects.get('catalog.json')!.toString();
  await assert.rejects(uploadMusic(root, target, { ...remote.store, head: async () => ({ contentLength: 1 }) }, {
    mode: 'tracks', selectedPaths: [`${song.folder}/${song.stem}.wav`], albumId: 'album-a', confirm: approve,
  }), /上传校验失败/);
  assert.equal(remote.objects.get('catalog.json')!.toString(), original);
  assert.equal(remote.writes.includes('catalog.json'), false);
  await fs.stat(song.directory);
}));

test('selected append refuses a concurrent catalog update and can retry with the new version', async () => inTemporaryRoot(async (root) => {
  const remote = await seedAlbum(root);
  const song = await addSongFolder(root, 2);
  const options = { mode: 'tracks' as const, selectedPaths: [`${song.folder}/${song.stem}.wav`], albumId: 'album-a' };
  await assert.rejects(uploadMusic(root, target, remote.store, { ...options, confirm: async () => {
    const next = catalog(remote.objects);
    next.albums[0]!.name.en = 'Concurrent cloud title';
    remote.objects.set('catalog.json', Buffer.from(JSON.stringify(next)));
    return true;
  } }), /HTTP 412/);
  await fs.stat(song.directory);
  assert.equal(catalog(remote.objects).albums[0]!.name.en, 'Concurrent cloud title');
  assert.equal(catalog(remote.objects).albums[0]!.tracks.length, 1);
  const retry = await uploadMusic(root, target, remote.store, { ...options, confirm: approve });
  assert.equal(retry.mediaUploads.length, 0);
  assert.equal(catalog(remote.objects).albums[0]!.name.en, 'Concurrent cloud title');
  assert.equal(catalog(remote.objects).albums[0]!.tracks.length, 2);
  assert.equal(retry.archived.length, 1);
}));
