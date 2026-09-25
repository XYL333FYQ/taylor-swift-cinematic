import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';
import { audioLibraryPlugin } from '../plugins/audio-library-vite.ts';
import { generateAudioLibrary, scanAudioLibrary } from '../plugins/audio-library.ts';
import type { AudioMetadataReader } from '../plugins/audio-library-metadata.ts';
import { SUPPORTED_AUDIO_EXTENSIONS } from '../plugins/audio-library-core.ts';

const temporaryRoots: string[] = [];
after(async () => {
  await Promise.all(temporaryRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixtureRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-library-fixture-'));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, 'audio'), { recursive: true });
  return root;
}

async function put(root: string, relativePath: string, content = 'fixture'): Promise<string> {
  const file = path.join(root, 'audio', ...relativePath.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return file;
}

function album(root: string, folder: string) {
  return scanAudioLibrary(root, { metadataReader: async () => ({}) })
    .then((albums) => albums.find((item) => item.folder === folder));
}

describe('build-time audio library discovery', () => {
  it('keeps a configured album visible when its private audio files are absent', async () => {
    const root = await fixtureRoot();
    await put(root, 'Editorial/album.json', JSON.stringify({ id: 'editorial', name: 'Editorial', releaseDate: '2026' }));
    await put(root, 'Editorial/artwork/cover.webp');
    const found = await album(root, 'Editorial');
    assert.equal(found?.tracks.length, 0);
    assert.equal(found?.releaseDate, '2026');
    assert.match(found?.artwork.presentation ?? '', /artwork\/cover\.webp$/);
  });
  it('discovers nested audio without requiring lyrics, artwork, or a manifest', async () => {
    const root = await fixtureRoot();
    await put(root, 'Audio Only/A/B/random.flac');
    const found = await album(root, 'Audio Only');
    assert.equal(found?.name.en, 'Audio Only');
    assert.equal(found?.tracks.length, 1);
    assert.equal(found?.tracks[0]?.title, 'random');
    assert.equal(found?.tracks[0]?.artist, undefined);
    assert.equal(found?.tracks[0]?.lyrics, undefined);
  });

  it('uses a reliable audio album tag for stable identity before falling back to the folder', async () => {
    const root = await fixtureRoot();
    await put(root, 'Folder Name/track.flac');
    const found = (await scanAudioLibrary(root, {
      metadataReader: async () => ({ album: 'Metadata Album' }),
    })).find((item) => item.folder === 'Folder Name');
    assert.equal(found?.id, 'metadata-album');
    assert.equal(found?.name.en, 'Metadata Album');
  });

  it('matches same-folder and separated LRC/image resources by normalized stem', async () => {
    const root = await fixtureRoot();
    await put(root, 'Same/01 Song.mp3');
    await put(root, 'Same/01 Song.lrc', '[00:00.00] same lyric');
    await put(root, 'Same/01 Song.jpg');
    await put(root, 'Nested/Song/song.flac');
    await put(root, 'Nested/Song/song.lrc', '[00:00.00] nested lyric');
    await put(root, 'Nested/Song/song.jpeg');
    await put(root, 'Split/Music/song.flac');
    await put(root, 'Split/Lyrics/song.lrc', '[00:00.00] split lyric');
    await put(root, 'Split/Artwork/song.webp');
    const same = await album(root, 'Same');
    const nested = await album(root, 'Nested');
    const split = await album(root, 'Split');
    assert.match(same?.tracks[0]?.lyricsUrl ?? '', /01%20Song\.lrc$/);
    assert.match(same?.artwork.cover ?? '', /01%20Song\.jpg$/);
    assert.equal(same?.tracks[0]?.artwork, undefined);
    assert.match(nested?.tracks[0]?.lyricsUrl ?? '', /Song\/song\.lrc$/);
    assert.match(nested?.tracks[0]?.artwork ?? '', /Song\/song\.jpeg$/);
    assert.match(split?.tracks[0]?.lyricsUrl ?? '', /Lyrics\/song\.lrc$/);
    assert.match(split?.tracks[0]?.artwork ?? '', /Artwork\/song\.webp$/);
  });

  it('uses metadata title to associate resources across unrelated nested paths', async () => {
    const root = await fixtureRoot();
    await put(root, 'Metadata/A/B/C/random.flac');
    await put(root, 'Metadata/X/Y/Z/willow.lrc', '[00:00.00] metadata lyric');
    await put(root, 'Metadata/Images/willow.jpg');
    const reader: AudioMetadataReader = async (file) => path.basename(file) === 'random.flac'
      ? { title: 'willow', artist: 'Guest' } : {};
    const found = (await scanAudioLibrary(root, { metadataReader: reader })).find((item) => item.folder === 'Metadata');
    assert.equal(found?.tracks[0]?.title, 'willow');
    assert.equal(found?.tracks[0]?.artist, 'Guest');
    assert.match(found?.tracks[0]?.lyricsUrl ?? '', /willow\.lrc$/);
    assert.match(found?.tracks[0]?.artwork ?? '', /Images\/willow\.jpg$/);
  });

  it('uses synchronized embedded lyrics when there is no LRC sidecar', async () => {
    const root = await fixtureRoot();
    await put(root, 'Embedded/track.flac');
    const reader: AudioMetadataReader = async () => ({ embeddedLyrics: '[00:01.20] embedded line' });
    const found = (await scanAudioLibrary(root, { metadataReader: reader })).find((item) => item.folder === 'Embedded');
    assert.equal(found?.tracks[0]?.lyrics, '[00:01.20] embedded line');
  });

  it('keeps ambiguous optional resources unattached and emits a warning', async () => {
    const root = await fixtureRoot();
    await put(root, 'Ambiguous/a.flac');
    await put(root, 'Ambiguous/b.flac');
    await put(root, 'Ambiguous/Lyrics/lyrics.lrc', '[00:00.00] unknown');
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
    try {
      const found = await album(root, 'Ambiguous');
      assert.equal(found?.tracks.length, 2);
      assert.ok(found?.tracks.every((track) => track.lyricsUrl === undefined));
      assert.ok(warnings.some((line) => line.includes('no unique track match')));
    } finally {
      console.warn = originalWarn;
    }
  });

  it('accepts every configured audio extension and survives metadata parser errors', async () => {
    const root = await fixtureRoot();
    for (const extension of SUPPORTED_AUDIO_EXTENSIONS) await put(root, `Formats/song${extension}`);
    await put(root, 'Broken/broken-metadata.flac');
    const reader: AudioMetadataReader = async (file) => {
      if (path.basename(file) === 'broken-metadata.flac') throw new Error('bad fixture metadata');
      return {};
    };
    const found = await scanAudioLibrary(root, { metadataReader: reader });
    assert.equal(found.find((item) => item.folder === 'Formats')?.tracks.length, SUPPORTED_AUDIO_EXTENSIONS.size);
    assert.equal(found.find((item) => item.folder === 'Broken')?.tracks[0]?.title, 'broken-metadata');
  });

  it('sorts and identifies multi-disc tracks deterministically', async () => {
    const root = await fixtureRoot();
    await put(root, 'Multi Disc/Disc 2/01/song.flac');
    await put(root, 'Multi Disc/Disc 1/01/song.flac');
    const found = await album(root, 'Multi Disc');
    assert.deepEqual(found?.tracks.map((track) => track.discNumber), [1, 2]);
    assert.notEqual(found?.tracks[0]?.id, found?.tracks[1]?.id);
  });

  it('pairs multiple tracks one-to-one and keeps a track id when its file moves', async () => {
    const root = await fixtureRoot();
    await put(root, 'Pairs/Music/a.flac');
    await put(root, 'Pairs/Music/b.flac');
    await put(root, 'Pairs/Lyrics/a.lrc', '[00:00.00] A');
    await put(root, 'Pairs/Lyrics/b.lrc', '[00:00.00] B');
    const first = await album(root, 'Pairs');
    assert.deepEqual(first?.tracks.map((track) => track.lyricsUrl?.split('/').at(-1)), ['a.lrc', 'b.lrc']);

    const oldAudio = path.join(root, 'audio', 'Pairs', 'Music', 'a.flac');
    const movedAudio = path.join(root, 'audio', 'Pairs', 'Moved', 'a.flac');
    await fs.mkdir(path.dirname(movedAudio), { recursive: true });
    await fs.rename(oldAudio, movedAudio);
    const second = await album(root, 'Pairs');
    const firstA = first?.tracks.find((track) => track.title === 'a');
    const secondA = second?.tracks.find((track) => track.title === 'a');
    assert.equal(secondA?.id, firstA?.id);
  });

  it('does not attach a different version of a song even when it is the only lyric', async () => {
    const root = await fixtureRoot();
    await put(root, 'Versions/Music/Love Story.flac');
    await put(root, 'Versions/Lyrics/Love Story Live.lrc', '[00:01.00] live');
    const found = await album(root, 'Versions');
    assert.equal(found?.tracks[0]?.lyricsUrl, undefined);
  });

  it('pairs the original and live versions one-to-one', async () => {
    const root = await fixtureRoot();
    for (const title of ['Love Story', 'Love Story Live']) {
      await put(root, `Versions/Music/${title}.flac`);
      await put(root, `Versions/Lyrics/${title}.lrc`, '[00:01.00] lyric');
    }
    const found = await album(root, 'Versions');
    assert.deepEqual(found?.tracks.map((track) => [track.title, track.lyricsUrl?.split('/').at(-1)]).sort(),
      [['Love Story', 'Love%20Story.lrc'], ['Love Story Live', 'Love%20Story%20Live.lrc']].sort());
  });

  it('does not attach a same-number lyric from another disc', async () => {
    const root = await fixtureRoot();
    await put(root, 'Discs/Disc 1/01.flac');
    await put(root, 'Discs/Lyrics/Disc 2/01.lrc', '[00:01.00] wrong disc');
    const found = await album(root, 'Discs');
    assert.equal(found?.tracks[0]?.lyricsUrl, undefined);
  });

  it('treats a single root cover as album artwork, never an exclusive track image', async () => {
    const root = await fixtureRoot();
    await put(root, 'Covers/a.flac');
    await put(root, 'Covers/b.flac');
    await put(root, 'Covers/cover.jpg');
    const found = await album(root, 'Covers');
    assert.match(found?.artwork.cover ?? '', /cover\.jpg$/);
    assert.ok(found?.tracks.every((track) => track.artwork === undefined));
  });

  it('recognizes a unique non-WebP presentation image separately from the cover', async () => {
    const root = await fixtureRoot();
    await put(root, 'Presentation/01-song.flac');
    await put(root, 'Presentation/Artwork/cover.png');
    await put(root, 'Presentation/Artwork/presentation.jpg');
    const found = await album(root, 'Presentation');
    assert.match(found?.artwork.cover ?? '', /cover\.png$/);
    assert.match(found?.artwork.presentation ?? '', /presentation\.jpg$/);
  });

  it('keeps presentation.webp as the preferred file when alternate formats coexist', async () => {
    const root = await fixtureRoot();
    await put(root, 'Presentation WebP/01-song.flac');
    await put(root, 'Presentation WebP/Artwork/presentation.webp');
    await put(root, 'Presentation WebP/Artwork/presentation.png');
    const found = await album(root, 'Presentation WebP');
    assert.match(found?.artwork.presentation ?? '', /presentation\.webp$/);
  });

  it('does not guess between multiple presentation formats without the preferred WebP', async () => {
    const root = await fixtureRoot();
    await put(root, 'Ambiguous Presentation/01-song.flac');
    await put(root, 'Ambiguous Presentation/Artwork/cover.webp');
    await put(root, 'Ambiguous Presentation/Artwork/presentation.jpg');
    await put(root, 'Ambiguous Presentation/Artwork/presentation.png');
    const found = await album(root, 'Ambiguous Presentation');
    assert.match(found?.artwork.cover ?? '', /cover\.webp$/);
    assert.equal(found?.artwork.presentation, found?.artwork.cover);
  });

  it('keeps a metadata-identified track id after moving it deeper', async () => {
    const root = await fixtureRoot();
    const original = await put(root, 'Stable/A/song.flac');
    const reader: AudioMetadataReader = async () => ({ title: 'Song', discNumber: 2, trackNumber: 7 });
    const before = (await scanAudioLibrary(root, { metadataReader: reader }))[0]?.tracks[0];
    const moved = path.join(root, 'audio', 'Stable', 'B', 'C', 'song.flac');
    await fs.mkdir(path.dirname(moved), { recursive: true });
    await fs.rename(original, moved);
    const afterMove = (await scanAudioLibrary(root, { metadataReader: reader }))[0]?.tracks[0];
    assert.equal(afterMove?.id, before?.id);
  });

  it('encodes special characters in audio and lyric URLs', async () => {
    const root = await fixtureRoot();
    await put(root, "Special/'tis the damn season #1.flac");
    await put(root, "Special/'tis the damn season #1.lrc", '[00:01.00] lyric');
    const found = await album(root, 'Special');
    assert.match(found?.tracks[0]?.file ?? '', /%23/);
    assert.match(found?.tracks[0]?.lyricsUrl ?? '', /%23/);
    assert.equal(found?.tracks[0]?.file.includes('#'), false);
  });

  it('generates a lyric URL without embedding the LRC text or an absolute path', async () => {
    const root = await fixtureRoot();
    await put(root, 'Lazy/song.flac');
    await put(root, 'Lazy/song.lrc', '[00:01.00] unique fixture lyric');
    await generateAudioLibrary(root, { metadataReader: async () => ({}) });
    const source = await fs.readFile(path.join(root, 'catalog.json'), 'utf8');
    assert.match(source, /"lyricsUrl": "audio\/Lazy\/song\.lrc"/);
    assert.doesNotMatch(source, /unique fixture lyric/);
    assert.equal(source.includes(root), false);
  });

  it('does not replace a preview with a same-number live recording', async () => {
    const root = await fixtureRoot();
    await put(root, 'Legacy/01-Love Story.m4a');
    await put(root, 'FULL/Legacy/01-Love Story Live.flac');
    await put(root, 'preview-catalog.json', JSON.stringify({
      legacy: { tracks: [{ title: 'Love Story', file: 'audio/Legacy/01-Love Story.m4a' }] },
    }));
    const found = await album(root, 'Legacy');
    assert.deepEqual(found?.tracks.map((track) => track.kind), ['preview', 'full']);
  });

  it('does not replace a preview from another disc despite an identical title', async () => {
    const root = await fixtureRoot();
    await put(root, 'Legacy/Disc 1/01-Love Story.m4a');
    await put(root, 'FULL/Legacy/Disc 2/01-Love Story.flac');
    await put(root, 'preview-catalog.json', JSON.stringify({
      legacy: { tracks: [{ title: 'Love Story', file: 'audio/Legacy/Disc 1/01-Love Story.m4a' }] },
    }));
    const found = await album(root, 'Legacy');
    assert.deepEqual(found?.tracks.map((track) => track.kind), ['preview', 'full']);
  });

  it('replaces a numbered preview when its full title agrees', async () => {
    const root = await fixtureRoot();
    await put(root, 'Legacy/01-willow.m4a');
    await put(root, 'FULL/Legacy/other-name.flac');
    await put(root, 'preview-catalog.json', JSON.stringify({
      legacy: { tracks: [{ title: '01 willow', file: 'audio/Legacy/01-willow.m4a' }] },
    }));
    const reader: AudioMetadataReader = async (file) => file.endsWith('.flac') ? { title: 'willow' } : {};
    const found = (await scanAudioLibrary(root, { metadataReader: reader }))[0];
    assert.equal(found?.tracks.length, 1);
    assert.equal(found?.tracks[0]?.kind, 'full');
  });

  it('loads optional manifest fields and explicit track-to-lyrics mappings', async () => {
    const root = await fixtureRoot();
    await put(root, 'Manifest/recording.flac');
    await put(root, 'Manifest/Lyrics/custom.lrc', '[00:00.00] mapped');
    await put(root, 'Manifest/Images/cover.png');
    await put(root, 'Manifest/album.json', JSON.stringify({
      id: 'stable-manifest-id',
      name: { en: 'Manifest Album', zh: '清单专辑' },
      year: 2020,
      artwork: 'Images/cover.png',
      tracks: [{ audio: 'recording.flac', title: 'Explicit Title', lyrics: 'Lyrics/custom.lrc', artist: 'Explicit Artist' }],
    }));
    const found = await album(root, 'Manifest');
    assert.equal(found?.id, 'stable-manifest-id');
    assert.deepEqual(found?.name, { en: 'Manifest Album', zh: '清单专辑' });
    assert.equal(found?.releaseDate, '2020');
    assert.equal(found?.tracks[0]?.title, 'Explicit Title');
    assert.equal(found?.tracks[0]?.artist, 'Explicit Artist');
    assert.match(found?.tracks[0]?.lyricsUrl ?? '', /Lyrics\/custom\.lrc$/);
    assert.match(found?.artwork.cover ?? '', /Images\/cover\.png$/);
  });

  it('preserves manifest album id after renaming its folder', async () => {
    const root = await fixtureRoot();
    await put(root, 'Before/song.flac');
    await put(root, 'Before/album.json', JSON.stringify({ id: 'fixed-album' }));
    const first = await album(root, 'Before');
    await fs.rename(path.join(root, 'audio', 'Before'), path.join(root, 'audio', 'After'));
    const second = await album(root, 'After');
    assert.equal(first?.id, 'fixed-album');
    assert.equal(second?.id, first?.id);
    assert.equal(second?.tracks[0]?.id, first?.tracks[0]?.id);
  });

  it('rejects manifest paths outside the album and survives malformed optional fields', async () => {
    const root = await fixtureRoot();
    await put(root, 'Outside/secret.lrc', '[00:01.00] outside');
    await put(root, 'Safe/song.flac');
    await put(root, 'Safe/album.json', JSON.stringify({
      artwork: '../../Outside/cover.jpg',
      tracks: [{ audio: 'song.flac', lyrics: '../../Outside/secret.lrc' }, null],
    }));
    const found = await album(root, 'Safe');
    assert.equal(found?.tracks[0]?.lyricsUrl, undefined);
    assert.equal(found?.artwork.cover, './theme/taylor/finale.webp');
    await put(root, 'Safe/album.json', JSON.stringify({ tracks: 'bad shape' }));
    assert.equal((await album(root, 'Safe'))?.tracks.length, 1);
    await put(root, 'preview-catalog.json', 'null');
    assert.equal((await album(root, 'Safe'))?.tracks.length, 1);
  });

  it('retains the legacy preview/full replacement and stable track id', async () => {
    const root = await fixtureRoot();
    await put(root, 'Legacy/song-preview.m4a');
    await put(root, 'preview-catalog.json', JSON.stringify({
      'legacy-id': { album: 'Legacy', tracks: [{ title: 'Song', file: 'audio/Legacy/song-preview.m4a' }] },
    }));
    const reader: AudioMetadataReader = async (file) => path.basename(file).includes('song')
      ? { title: 'Song', trackNumber: 1 } : {};
    const before = (await scanAudioLibrary(root, { metadataReader: reader })).find((item) => item.folder === 'Legacy');
    assert.equal(before?.tracks.length, 1);
    assert.equal(before?.tracks[0]?.kind, 'preview');
    await put(root, 'FULL/legacy/song-full.flac');
    await put(root, 'Legacy/Song.lrc', '[00:01.00] shared');
    const afterFull = (await scanAudioLibrary(root, { metadataReader: reader })).find((item) => item.folder === 'Legacy');
    assert.equal(afterFull?.tracks.length, 1);
    assert.equal(afterFull?.tracks[0]?.kind, 'full');
    assert.equal(afterFull?.tracks[0]?.id, before?.tracks[0]?.id);
    assert.match(afterFull?.tracks[0]?.lyricsUrl ?? '', /Song\.lrc$/);
    assert.match(afterFull?.tracks[0]?.file ?? '', /audio\/FULL\/legacy\/song-full\.flac$/i);
  });

  it('discovers a legacy full-only album without a matching top-level directory', async () => {
    const root = await fixtureRoot();
    await put(root, 'FULL/Only Full/song.flac');
    const found = (await scanAudioLibrary(root, { metadataReader: async () => ({}) }))[0];
    assert.equal(found?.folder, 'Only Full');
    assert.equal(found?.tracks[0]?.kind, 'full');
    assert.match(found?.tracks[0]?.file ?? '', /audio\/FULL\/Only%20Full\/song\.flac$/);
  });

  it('adds, renames, and removes discovered albums without source changes', async () => {
    const root = await fixtureRoot();
    await put(root, 'Temporary/01-old.mp3');
    assert.equal((await album(root, 'Temporary'))?.tracks.length, 1);
    await fs.rename(path.join(root, 'audio', 'Temporary'), path.join(root, 'audio', 'Renamed Album'));
    const afterRename = await scanAudioLibrary(root);
    assert.equal(afterRename.some((item) => item.folder === 'Temporary'), false);
    assert.equal(afterRename.some((item) => item.folder === 'Renamed Album'), true);
    await fs.rm(path.join(root, 'audio', 'Renamed Album'), { recursive: true });
    assert.equal((await scanAudioLibrary(root)).some((item) => item.folder === 'Renamed Album'), false);
  });
});

describe('Vite watcher rescans the complete audio tree', () => {
  it('updates the generated catalog after nested resource and album changes', async () => {
    const root = await fixtureRoot();
    await fs.mkdir(path.join(root, 'src', 'data'), { recursive: true });
    await put(root, 'Initial/start.flac');
    const scanMessages: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      if (String(args[0] ?? '').includes('文件变化后扫描')) scanMessages.push(args.join(' '));
      originalLog(...args);
    };
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [audioLibraryPlugin()],
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    try {
      const generatedFile = path.join(root, 'catalog.json');
      const waitFor = async (predicate: (source: string) => boolean) => {
        const expires = Date.now() + 12000;
        while (Date.now() < expires) {
          try {
            const source = await fs.readFile(generatedFile, 'utf8');
            if (predicate(source)) return source;
          } catch { /* first scan may not have written its output yet */ }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error('Timed out waiting for the generated catalog to change.');
      };
      const waitForRescan = async (previousCount: number) => {
        const expires = Date.now() + 12000;
        while (Date.now() < expires) {
          if (scanMessages.length > previousCount) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error('Timed out waiting for the audio-library watcher to rescan.');
      };

      await waitFor((source) => source.includes('start'));
      await put(root, 'Initial/Nested/temporary.flac');
      await waitFor((source) => source.includes('temporary.flac'));
      await fs.rm(path.join(root, 'audio', 'Initial', 'Nested', 'temporary.flac'));
      const withoutTemporary = await waitFor((source) => source.includes('start.flac') && !source.includes('temporary.flac'));
      assert.equal(withoutTemporary.includes('temporary.flac'), false);

      await put(root, 'New Album/Nested/song.flac');
      await waitFor((source) => source.includes('New Album') && source.includes('Nested/song.flac'));
      await put(root, 'New Album/Lyrics/song.lrc', '[00:00.00] first');
      await waitFor((source) => source.includes('Lyrics/song.lrc'));
      const lyricScans = scanMessages.length;
      await fs.writeFile(path.join(root, 'audio', 'New Album', 'Lyrics', 'song.lrc'), '[00:00.00] edited');
      await waitForRescan(lyricScans);
      await put(root, 'New Album/Artwork/song.jpg');
      await waitFor((source) => source.includes('Artwork/song.jpg'));
      const priorScans = scanMessages.length;
      await fs.writeFile(path.join(root, 'audio', 'New Album', 'Artwork', 'song.jpg'), 'updated fixture image');
      await waitForRescan(priorScans);

      await fs.writeFile(path.join(root, 'audio', 'New Album', 'album.json'), JSON.stringify({ id: 'stable-new-album', name: 'Named Album' }));
      await waitFor((source) => source.includes('stable-new-album') && source.includes('Named Album'));
      const originalAlbum = path.join(root, 'audio', 'New Album');
      const movedAlbum = path.join(root, 'audio', 'Moved Album');
      await fs.cp(originalAlbum, movedAlbum, { recursive: true });
      await fs.rm(originalAlbum, { recursive: true });
      const moved = await waitFor((source) => source.includes('stable-new-album')
        && source.includes('Moved Album') && !source.includes('New Album'));
      assert.equal(moved.includes('New Album'), false);
      await fs.rm(path.join(root, 'audio', 'Moved Album'), { recursive: true });
      const removed = await waitFor((source) => source.includes('stable-new-album') === false);
      assert.equal(removed.includes('Moved Album'), false);
    } finally {
      await server.close();
      console.log = originalLog;
    }
  });
});
