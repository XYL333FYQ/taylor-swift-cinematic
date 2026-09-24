import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Dirent } from 'node:fs';
import { readAudioMetadata, type AudioTags, type AudioMetadataReader } from './audio-library-metadata.ts';
export { readAudioMetadata } from './audio-library-metadata.ts';
export type { AudioMetadataReader, AudioMetadataReaderResult } from './audio-library-metadata.ts';
import {
  compareAudioOrder,
  compareNaturalPath,
  createStableTrackId,
  extractDiscNumber,
  extractTrackNumber,
  matchAlbumResources,
  normalizeTitle,
  RESERVED_AUDIO_DIRECTORIES,
  slugify,
  stripTrackNumberPrefix,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_LYRIC_EXTENSIONS,
  type AudioResource,
  type ResourceFile,
  type TextResource,
  type Warn,
} from './audio-library-core.ts';

export const AUDIO_DIRECTORY = 'public/audio';
const GENERATED_FILE = 'src/data/music.generated.ts';
export const PREVIEW_CATALOG = 'preview-catalog.json';
const FALLBACK_ARTWORK = './img/taylor/stage.webp';

type LocalizedValue = string | { en?: string; zh?: string };

interface TrackOverride {
  audio: string;
  title?: string;
  artist?: string;
  lyrics?: string;
  artwork?: string;
  trackNumber?: number;
  discNumber?: number;
}

interface AlbumManifest {
  id?: string;
  name?: LocalizedValue;
  year?: string | number;
  artist?: string;
  genre?: LocalizedValue;
  description?: LocalizedValue;
  subtitle?: LocalizedValue;
  artwork?: string;
  color?: string;
  colorAccent?: string;
  tracks?: TrackOverride[];
}

interface PreviewTrackReference {
  title: string;
  file: string;
}

interface PreviewAlbumReference {
  album?: string;
  tracks?: PreviewTrackReference[];
}

export interface GeneratedTrack {
  id: string;
  title: string;
  file: string;
  kind: 'full' | 'preview';
  lyrics?: string;
  lyricsUrl?: string;
  artist?: string;
  trackNumber?: number;
  discNumber?: number;
  artwork?: string;
}

export interface GeneratedAlbum {
  id: string;
  folder: string;
  name: { en: string; zh: string };
  year: string;
  artist?: string;
  genre: { en: string; zh: string };
  description: { en: string; zh: string };
  subtitle: { en: string; zh: string };
  color: string;
  colorAccent: string;
  image: string;
  /** Lets curated era copy keep its existing image when only a track image was found. */
  artworkLevel: 'album' | 'track' | 'fallback';
}

interface ScannedAlbum extends GeneratedAlbum {
  tracks: GeneratedTrack[];
  owned: number;
}

interface ScannedAudio extends AudioResource {
  absolutePath: string;
  publicUrl: string;
  tags: AudioTags;
}

interface ScannedLyric extends TextResource {
  absolutePath: string;
}

interface ScannedImage extends ResourceFile {
  absolutePath: string;
  publicUrl: string;
}

interface ScannedResources {
  audio: ScannedAudio[];
  lyrics: ScannedLyric[];
  images: ScannedImage[];
}

interface TrackDraft {
  resource: ScannedAudio;
  title: string;
  identityTitle: string;
  artist?: string;
  trackNumber?: number;
  discNumber?: number;
  kind: 'full' | 'preview';
  lyrics?: string;
  lyricsUrl?: string;
  artwork?: string;
}

export interface ScanOptions {
  metadataReader?: AudioMetadataReader;
}

function warning(album: string, message: string): void {
  console.warn(`[audio-library] ${album} / ${message}`);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function positiveNumber(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

function encodedPath(pathname: string): string {
  return pathname.replace(/\\/g, '/').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function normalizedPathKey(value: string): string {
  return exactPathKey(value).toLowerCase();
}

function exactPathKey(value: string): string {
  return value.replace(/\\/g, '/').normalize('NFC');
}

function resourceFromPath(relativePath: string): ResourceFile {
  const posixPath = relativePath.replace(/\\/g, '/');
  const fileName = posixPath.split('/').at(-1) ?? posixPath;
  const extension = path.extname(fileName).toLowerCase();
  const stem = fileName.slice(0, fileName.length - extension.length);
  return {
    relativePath: posixPath,
    fileName,
    directory: posixPath.includes('/') ? posixPath.slice(0, posixPath.lastIndexOf('/')) : '',
    extension,
    stem,
    normalizedStem: normalizeTitle(stripTrackNumberPrefix(stem)),
    trackNumber: extractTrackNumber(posixPath),
    discNumber: extractDiscNumber(posixPath),
  };
}

async function scanResourceTree(
  directory: string,
  urlPrefix: string,
  identityPrefix: string,
  albumName: string,
): Promise<ScannedResources> {
  const results: ScannedResources = { audio: [], lyrics: [], images: [] };

  const visit = async (currentDirectory: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      const relative = path.relative(directory, currentDirectory).replace(/\\/g, '/') || '.';
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || currentDirectory !== directory) {
        warning(albumName, `${relative}: cannot read directory; skipped (${error instanceof Error ? error.message : 'I/O error'}).`);
      }
      return;
    }

    entries.sort((a, b) => compareNaturalPath(a.name, b.name));
    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const localPath = path.relative(directory, absolutePath).replace(/\\/g, '/');
      const relativePath = [identityPrefix, localPath].filter(Boolean).join('/');
      const base = resourceFromPath(relativePath);
      const publicPath = [urlPrefix, localPath].filter(Boolean).join('/');
      const publicUrl = encodedPath(publicPath);

      if (SUPPORTED_AUDIO_EXTENSIONS.has(base.extension)) {
        const parentName = base.directory.split('/').at(-1)?.trim();
        results.audio.push({
          ...base,
          absolutePath,
          publicUrl,
          file: publicUrl,
          title: stripTrackNumberPrefix(base.stem).trim() || parentName || base.stem || base.fileName,
          tags: {},
        });
      } else if (SUPPORTED_LYRIC_EXTENSIONS.has(base.extension)) {
        try {
          const text = (await fs.readFile(absolutePath, 'utf8')).replace(/^\uFEFF/, '').trim();
          if (text) results.lyrics.push({ ...base, absolutePath, text, publicUrl });
          else warning(albumName, `${relativePath}: empty lyrics file; skipped.`);
        } catch (error) {
          warning(albumName, `${relativePath}: cannot read lyrics; skipped (${error instanceof Error ? error.message : 'I/O error'}).`);
        }
      } else if (SUPPORTED_IMAGE_EXTENSIONS.has(base.extension)) {
        results.images.push({ ...base, absolutePath, publicUrl });
      }
    }
  };

  await visit(directory);
  return results;
}

async function readJson<T>(file: string, fallback: T, albumName: string): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    warning(albumName, `${path.basename(file)}: cannot read JSON; defaults used (${error instanceof Error ? error.message : 'invalid JSON'}).`);
    return fallback;
  }
}

function pair(value: LocalizedValue | undefined, fallback: string): { en: string; zh: string } {
  if (typeof value === 'string') {
    const text = value.trim() || fallback;
    return { en: text, zh: text };
  }
  const en = cleanText(value?.en) ?? fallback;
  return { en, zh: cleanText(value?.zh) ?? en };
}

function basenameWithoutExtension(file: string): string {
  return path.basename(file, path.extname(file));
}

function parseCatalogFolder(file: string): string | undefined {
  const segments = file.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments[0]?.toLowerCase() !== 'audio') return undefined;
  const folderIndex = segments[1]?.toLowerCase() === 'full' ? 2 : 1;
  const value = segments[folderIndex];
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return value; }
}

function catalogFilePath(audioRoot: string, file: string): string | undefined {
  const segments = file.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.shift()?.toLowerCase() !== 'audio' || segments.length === 0) return undefined;
  let decoded: string[];
  try { decoded = segments.map((segment) => decodeURIComponent(segment)); }
  catch { decoded = segments; }
  const resolved = path.resolve(audioRoot, ...decoded);
  const relative = path.relative(audioRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  return resolved;
}

function metadataFileLabel(audio: ScannedAudio): string {
  return `${audio.relativePath}: metadata unavailable`;
}

function filenameTitle(audio: ScannedAudio): string {
  const fromFile = stripTrackNumberPrefix(audio.stem).trim();
  if (fromFile) return fromFile;
  const parent = audio.directory.split('/').at(-1)?.trim();
  return parent || audio.stem || audio.fileName;
}

function distinctMajority(values: Array<string | undefined>, album: string, field: string): string | undefined {
  const found = values.map(cleanText).filter((value): value is string => Boolean(value));
  const byKey = new Map<string, { value: string; count: number; first: number }>();
  found.forEach((value, index) => {
    const key = value.normalize('NFKC').toLowerCase();
    const current = byKey.get(key);
    if (current) current.count += 1;
    else byKey.set(key, { value, count: 1, first: index });
  });
  const candidates = [...byKey.values()].sort((a, b) => b.count - a.count || a.first - b.first);
  if (candidates.length > 1) warning(album, `conflicting ${field} metadata; using the most common value.`);
  return candidates[0]?.value;
}

function uniformValue(values: Array<string | undefined>): string | undefined {
  const found = values.map(cleanText).filter((value): value is string => Boolean(value));
  const unique = new Map(found.map((value) => [value.normalize('NFKC').toLowerCase(), value]));
  return unique.size === 1 ? unique.values().next().value : undefined;
}

function applyMetadata(audio: ScannedAudio, tags: AudioTags): void {
  audio.tags = tags;
  audio.metadataTitle = cleanText(tags.title);
  audio.title = audio.metadataTitle || filenameTitle(audio);
  audio.artist = cleanText(tags.artist) || cleanText(tags.albumArtist);
  audio.albumArtist = cleanText(tags.albumArtist);
  audio.album = cleanText(tags.album);
  audio.year = cleanText(tags.year);
  audio.genre = cleanText(tags.genre);
  audio.trackNumber = positiveNumber(tags.trackNumber) ?? audio.trackNumber;
  audio.discNumber = positiveNumber(tags.discNumber) ?? audio.discNumber;
}

function safeManifestPath(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const normalized = value.replace(/\\/g, '/').trim().replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)
    || normalized.split('/').some((part) => part === '..' || part === '')) return undefined;
  return normalized;
}

function findManifestResource<T extends ResourceFile>(
  value: string | undefined,
  candidates: readonly T[],
  album: string,
  purpose: string,
): T | undefined {
  if (!value) return undefined;
  const safePath = safeManifestPath(value);
  if (!safePath) {
    warning(album, `${purpose} override "${value}": unsafe relative path; ignored.`);
    return undefined;
  }
  const exact = candidates.find((candidate) => exactPathKey(candidate.relativePath) === exactPathKey(safePath));
  if (exact) return exact;
  const matches = candidates.filter((candidate) => normalizedPathKey(candidate.relativePath) === normalizedPathKey(safePath));
  if (matches.length !== 1) {
    warning(album, `${purpose} override "${safePath}": ${matches.length ? 'ambiguous path' : 'file not found'}; automatic resolution used.`);
    return undefined;
  }
  return matches[0];
}

function makeTrackDraft(
  resource: ScannedAudio,
  kind: 'full' | 'preview',
  lyrics: ScannedLyric | undefined,
  artwork: ScannedImage | undefined,
  override?: TrackOverride,
  identityTitle = resource.title,
): TrackDraft {
  return {
    resource,
    title: cleanText(override?.title) || resource.title,
    identityTitle,
    artist: cleanText(override?.artist) || resource.artist,
    trackNumber: positiveNumber(override?.trackNumber) ?? resource.trackNumber,
    discNumber: positiveNumber(override?.discNumber) ?? resource.discNumber,
    kind,
    lyrics: lyrics ? undefined : resource.tags.embeddedLyrics,
    lyricsUrl: lyrics?.publicUrl,
    artwork: artwork?.publicUrl,
  };
}

function equalTitle(left: string | undefined, right: string): boolean {
  return Boolean(left && normalizeTitle(stripTrackNumberPrefix(left))
    && normalizeTitle(stripTrackNumberPrefix(left)) === normalizeTitle(stripTrackNumberPrefix(right)));
}

function compatibleTrackPosition(full: TrackDraft, preview: TrackDraft): boolean {
  return (full.discNumber == null || preview.discNumber == null || full.discNumber === preview.discNumber)
    && (full.trackNumber == null || preview.trackNumber == null || full.trackNumber === preview.trackNumber);
}

function mergePreviewTracks(
  previews: TrackDraft[],
  fullTracks: TrackDraft[],
  album: string,
): TrackDraft[] {
  const usedPreviews = new Set<number>();
  const replacements = new Map<number, number>();
  const blockedFull = new Set<number>();
  const blockedPreviews = new Set<number>();

  const pass = (label: string, predicate: (full: TrackDraft, preview: TrackDraft) => boolean) => {
    const proposals = new Map<number, number>();
    fullTracks.forEach((full, fullIndex) => {
      if (blockedFull.has(fullIndex) || replacements.has(fullIndex)) return;
      const candidates = previews.map((preview, previewIndex) => ({ preview, previewIndex }))
        .filter(({ preview, previewIndex }) => !usedPreviews.has(previewIndex)
          && !blockedPreviews.has(previewIndex) && predicate(full, preview));
      if (candidates.length === 1) proposals.set(fullIndex, candidates[0]!.previewIndex);
      else if (candidates.length > 1) {
        blockedFull.add(fullIndex);
        warning(album, `${full.resource.relativePath}: ambiguous preview replacement by ${label}; kept as a separate track.`);
      }
    });

    const counts = new Map<number, number>();
    for (const previewIndex of proposals.values()) counts.set(previewIndex, (counts.get(previewIndex) ?? 0) + 1);
    for (const [fullIndex, previewIndex] of proposals) {
      if (counts.get(previewIndex) !== 1) {
        blockedFull.add(fullIndex);
        blockedPreviews.add(previewIndex);
        warning(album, `${previews[previewIndex]?.title}: multiple full files could replace this preview; kept separately.`);
        continue;
      }
      replacements.set(fullIndex, previewIndex);
      usedPreviews.add(previewIndex);
    }
  };

  pass('metadata title', (full, preview) => compatibleTrackPosition(full, preview)
    && equalTitle(full.resource.metadataTitle, preview.title));
  pass('normalized title', (full, preview) => compatibleTrackPosition(full, preview)
    && equalTitle(full.title, preview.title));

  const previewIndexByFull = replacements;
  const fullByPreview = new Map<number, TrackDraft>();
  for (const [fullIndex, previewIndex] of previewIndexByFull) {
    const full = fullTracks[fullIndex];
    const preview = previews[previewIndex];
    if (!full || !preview) continue;
    fullByPreview.set(previewIndex, {
      ...full,
      identityTitle: preview.identityTitle,
      trackNumber: full.trackNumber ?? preview.trackNumber,
      discNumber: full.discNumber ?? preview.discNumber,
      lyrics: full.lyrics ?? preview.lyrics,
      lyricsUrl: full.lyricsUrl ?? preview.lyricsUrl,
      artwork: full.artwork ?? preview.artwork,
    });
  }
  return [
    ...previews.map((preview, index) => fullByPreview.get(index) ?? preview),
    ...fullTracks.filter((_, index) => !previewIndexByFull.has(index)).sort((a, b) => compareAudioOrder(a.resource, b.resource)),
  ];
}

function assignTrackIds(albumId: string, drafts: TrackDraft[]): GeneratedTrack[] {
  const bases = drafts.map((draft) => createStableTrackId(
    albumId,
    draft.identityTitle,
    draft.discNumber,
    draft.trackNumber,
  ));
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  const used = new Set<string>();

  return drafts.map((draft, index) => {
    const base = bases[index] ?? `${albumId}-track`;
    let id = base;
    if ((counts.get(base) ?? 0) > 1) id = `${base}-${slugify(draft.resource.relativePath) || 'file'}`;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${slugify(draft.resource.relativePath) || 'file'}-${suffix++}`;
    used.add(id);
    return {
      id,
      title: draft.title,
      file: draft.resource.file,
      kind: draft.kind,
      lyrics: draft.lyrics,
      lyricsUrl: draft.lyricsUrl,
      artist: draft.artist,
      trackNumber: draft.trackNumber,
      discNumber: draft.discNumber,
      artwork: draft.artwork,
    };
  });
}

function albumArtwork(
  manifest: AlbumManifest,
  localImages: ScannedImage[],
  tracks: TrackDraft[],
  album: string,
): { url: string; level: GeneratedAlbum['artworkLevel'] } {
  const explicit = findManifestResource(manifest.artwork, localImages, album, 'album artwork');
  if (explicit) return { url: explicit.publicUrl, level: 'album' };

  const rootImages = localImages.filter((image) => !image.directory);
  const commonRank = (name: string) => ['cover', 'front', 'folder', 'album'].indexOf(basenameWithoutExtension(name).toLowerCase());
  const preferred = rootImages.filter((image) => commonRank(image.fileName) >= 0)
    .sort((a, b) => commonRank(a.fileName) - commonRank(b.fileName)
      || compareNaturalPath(a.extension, b.extension) || compareNaturalPath(a.relativePath, b.relativePath))[0];
  if (preferred) return { url: preferred.publicUrl, level: 'album' };
  if (rootImages.length === 1) return { url: rootImages[0]!.publicUrl, level: 'album' };

  const trackArtwork = tracks.find((track) => track.artwork)?.artwork;
  if (trackArtwork) return { url: trackArtwork, level: 'track' };
  return { url: FALLBACK_ARTWORK, level: 'fallback' };
}

function parseYear(value: string | number | undefined): string | undefined {
  if (value == null) return undefined;
  const match = String(value).match(/\b\d{4}\b/);
  return match?.[0] ?? (String(value).trim() || undefined);
}

function uniqueManifestOverrides(
  manifest: AlbumManifest,
  localAudio: ScannedAudio[],
  localLyrics: ScannedLyric[],
  localImages: ScannedImage[],
  album: string,
): Map<string, { track: TrackOverride; lyric?: ScannedLyric; image?: ScannedImage }> {
  const results = new Map<string, { track: TrackOverride; lyric?: ScannedLyric; image?: ScannedImage }>();
  const duplicates = new Set<string>();
  for (const override of Array.isArray(manifest.tracks) ? manifest.tracks : []) {
    if (!override || typeof override.audio !== 'string') {
      warning(album, 'track override without an audio path; ignored.');
      continue;
    }
    const audio = findManifestResource(override.audio, localAudio, album, 'track audio');
    if (!audio) continue;
    const key = exactPathKey(audio.relativePath);
    if (results.has(key)) {
      duplicates.add(key);
      warning(album, `${audio.relativePath}: duplicate track overrides; all overrides for this file ignored.`);
      continue;
    }
    const lyric = override.lyrics ? findManifestResource(override.lyrics, localLyrics, album, 'track lyrics') : undefined;
    const image = override.artwork ? findManifestResource(override.artwork, localImages, album, 'track artwork') : undefined;
    results.set(key, { track: override, lyric, image });
  }
  for (const key of duplicates) results.delete(key);
  return results;
}

function resourceByAbsolutePath(resources: ScannedAudio[], absolutePath: string): ScannedAudio | undefined {
  const exact = resources.find((resource) => exactPathKey(path.resolve(resource.absolutePath)) === exactPathKey(path.resolve(absolutePath)));
  if (exact) return exact;
  const key = normalizedPathKey(path.resolve(absolutePath));
  const matches = resources.filter((resource) => normalizedPathKey(resource.absolutePath) === key);
  return matches.length === 1 ? matches[0] : undefined;
}

function catalogMatchesByFolder(
  catalog: Record<string, PreviewAlbumReference>,
): Map<string, { id: string; entry: PreviewAlbumReference }> {
  const matches = new Map<string, { id: string; entry: PreviewAlbumReference }>();
  for (const [id, entry] of Object.entries(catalog)) {
    if (!entry || !Array.isArray(entry.tracks)) continue;
    const folder = entry.tracks.map((track) => typeof track?.file === 'string' ? parseCatalogFolder(track.file) : undefined).find(Boolean);
    if (!folder) continue;
    const key = normalizedPathKey(folder);
    if (matches.has(key)) continue;
    matches.set(key, { id, entry });
  }
  return matches;
}

function trackDrafts(
  albumId: string,
  folder: string,
  audioRoot: string,
  manifest: AlbumManifest,
  catalogMatch: { id: string; entry: PreviewAlbumReference } | undefined,
  local: ScannedResources,
  legacyFull: ScannedResources,
  warn: Warn,
  metadataAlbum?: string,
): { tracks: GeneratedTrack[]; artwork: { url: string; level: GeneratedAlbum['artworkLevel'] }; albumName: string; year?: string; artist?: string; genre?: string } {
  const allAudio = [...local.audio, ...legacyFull.audio].sort(compareAudioOrder);
  const allLyrics = [...local.lyrics, ...legacyFull.lyrics].sort((a, b) => compareNaturalPath(a.relativePath, b.relativePath));
  const allImages = [...local.images, ...legacyFull.images].sort((a, b) => compareNaturalPath(a.relativePath, b.relativePath));
  const overrides = uniqueManifestOverrides(manifest, local.audio, local.lyrics, local.images, folder);
  const explicitLyrics = new Set([...overrides.values()].flatMap((value) => value.lyric ? [normalizedPathKey(value.lyric.relativePath)] : []));
  const explicitImages = new Set([...overrides.values()].flatMap((value) => value.image ? [normalizedPathKey(value.image.relativePath)] : []));
  const explicitAlbumImage = safeManifestPath(manifest.artwork);
  if (explicitAlbumImage) explicitImages.add(normalizedPathKey(explicitAlbumImage));
  const draftFor = (audio: ScannedAudio, kind: 'full' | 'preview', title?: string): TrackDraft => {
    const override = overrides.get(exactPathKey(audio.relativePath));
    const draft = makeTrackDraft(audio, kind, override?.lyric, override?.image, override?.track, title || audio.title);
    if (title) draft.title = cleanText(override?.track.title) || title;
    return draft;
  };

  const previewDrafts: TrackDraft[] = [];
  const previewFiles = new Set<string>();
  for (const preview of catalogMatch?.entry.tracks ?? []) {
    if (!preview || typeof preview.file !== 'string') continue;
    const absolutePath = catalogFilePath(audioRoot, preview.file);
    if (!absolutePath) continue;
    const resource = resourceByAbsolutePath(allAudio, absolutePath);
    if (!resource) continue;
    const title = cleanText(preview.title) || resource.title;
    if (previewFiles.has(exactPathKey(resource.absolutePath))) {
      warning(folder, `${resource.relativePath}: duplicate preview catalog reference; ignored.`);
      continue;
    }
    previewFiles.add(exactPathKey(resource.absolutePath));
    previewDrafts.push(draftFor(resource, 'preview', title));
  }

  const fullDrafts = allAudio.filter((audio) => !previewFiles.has(exactPathKey(audio.absolutePath)))
    .map((audio) => draftFor(audio, 'full'));
  // Resolve optional resources against the final tracks. Preview and full files
  // for the same song must not compete for a single LRC or image.
  const mergedDrafts = mergePreviewTracks(previewDrafts, fullDrafts, folder);
  const activeAudio = mergedDrafts.map((draft) => draft.resource);
  const lyricMatches = matchAlbumResources(activeAudio, allLyrics.filter((item) =>
    !explicitLyrics.has(normalizedPathKey(item.relativePath))), 'lyrics', warn);
  const albumCoverNames = new Set(['cover', 'front', 'folder', 'album']);
  const rootImages = local.images.filter((image) => !image.directory);
  const imageMatches = matchAlbumResources(activeAudio, allImages.filter((item) =>
    !explicitImages.has(normalizedPathKey(item.relativePath))
    && !(local.images.includes(item) && !item.directory
      && (rootImages.length === 1 || albumCoverNames.has(normalizeTitle(item.stem))))), 'artwork', warn);
  for (const draft of mergedDrafts) {
    const lyric = lyricMatches.get(draft.resource.relativePath);
    if (lyric && !draft.lyricsUrl) {
      draft.lyricsUrl = lyric.publicUrl;
      draft.lyrics = undefined;
    }
    if (!draft.artwork) draft.artwork = imageMatches.get(draft.resource.relativePath)?.publicUrl;
  }
  const tracks = assignTrackIds(albumId, mergedDrafts);
  const artwork = albumArtwork(manifest, local.images, mergedDrafts, folder);

  return {
    tracks,
    artwork,
    albumName: cleanText(typeof manifest.name === 'string' ? manifest.name : manifest.name?.en)
      || metadataAlbum
      || folder.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (character) => character.toUpperCase()),
    year: parseYear(manifest.year) || distinctMajority(allAudio.map((audio) => audio.year), folder, 'year'),
    artist: cleanText(manifest.artist) || distinctMajority(allAudio.map((audio) => audio.albumArtist), folder, 'album artist')
      || uniformValue(allAudio.map((audio) => audio.artist)),
    genre: typeof manifest.genre === 'string' ? cleanText(manifest.genre)
      : cleanText(manifest.genre?.en) || distinctMajority(allAudio.map((audio) => audio.genre), folder, 'genre'),
  };
}

async function readTrackTags(resources: ScannedResources, reader: AudioMetadataReader, album: string): Promise<void> {
  for (const audio of resources.audio) {
    try {
      applyMetadata(audio, await reader(audio.absolutePath));
    } catch (error) {
      warning(album, metadataFileLabel(audio) + `; filename fallback used (${error instanceof Error ? error.message : 'parser error'}).`);
      applyMetadata(audio, {});
    }
  }
}

function findDirectoryName(entries: Dirent[], name: string): string | undefined {
  return entries.find((entry) => entry.isDirectory()
    && entry.name.normalize('NFC').toLowerCase() === name.normalize('NFC').toLowerCase())?.name;
}

async function readAlbum(
  audioRoot: string,
  folder: string,
  legacyFullRootName: string | undefined,
  catalogMatch: { id: string; entry: PreviewAlbumReference } | undefined,
  reader: AudioMetadataReader,
): Promise<ScannedAlbum | undefined> {
  const albumDirectory = path.join(audioRoot, folder);
  const parsedManifest = await readJson<unknown>(path.join(albumDirectory, 'album.json'), {}, folder);
  const manifest: AlbumManifest = parsedManifest && typeof parsedManifest === 'object' && !Array.isArray(parsedManifest)
    ? parsedManifest as AlbumManifest : {};
  if (manifest.tracks != null && !Array.isArray(manifest.tracks)) {
    warning(folder, 'album.json tracks must be an array; overrides ignored.');
  }
  const local = await scanResourceTree(albumDirectory, `audio/${folder}`, '', folder);
  let legacyFull: ScannedResources = { audio: [], lyrics: [], images: [] };
  if (legacyFullRootName) {
    const fullRoot = path.join(audioRoot, legacyFullRootName);
    try {
      const fullEntries = await fs.readdir(fullRoot, { withFileTypes: true });
      const matchingFolder = findDirectoryName(fullEntries, folder);
      if (matchingFolder) {
        legacyFull = await scanResourceTree(
          path.join(fullRoot, matchingFolder),
          `audio/${legacyFullRootName}/${matchingFolder}`,
          `${legacyFullRootName}/${matchingFolder}`,
          folder,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        warning(folder, `full/${folder}: cannot read legacy full folder; skipped.`);
      }
    }
  }
  if (local.audio.length === 0 && legacyFull.audio.length === 0) return undefined;

  await readTrackTags(local, reader, folder);
  await readTrackTags(legacyFull, reader, folder);
  const metadataAlbum = distinctMajority(
    [...local.audio, ...legacyFull.audio].map((audio) => audio.album),
    folder,
    'album title',
  );
  const id = cleanText(manifest.id) || catalogMatch?.id || slugify(metadataAlbum || folder) || 'album';
  const warn: Warn = (message) => warning(folder, message);
  const built = trackDrafts(id, folder, audioRoot, manifest, catalogMatch, local, legacyFull, warn, metadataAlbum);
  const name = pair(manifest.name, built.albumName);
  const genre = pair(manifest.genre ?? built.genre, '');
  return {
    id,
    folder,
    name,
    year: built.year || '',
    artist: built.artist,
    genre,
    description: pair(manifest.description, ''),
    subtitle: pair(manifest.subtitle, ''),
    color: cleanText(manifest.color) || '#d1ba95',
    colorAccent: cleanText(manifest.colorAccent) || cleanText(manifest.color) || '#d1ba95',
    image: built.artwork.url,
    artworkLevel: built.artwork.level,
    tracks: built.tracks,
    owned: built.tracks.filter((track) => track.kind === 'full').length,
  };
}

export async function scanAudioLibrary(root: string, options: ScanOptions = {}): Promise<ScannedAlbum[]> {
  const audioRoot = path.resolve(root, AUDIO_DIRECTORY);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(audioRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      warning('.', `cannot read audio root; generated catalog is empty (${error instanceof Error ? error.message : 'I/O error'}).`);
    }
    return [];
  }

  const localFolders = entries.filter((entry) => entry.isDirectory()
    && !RESERVED_AUDIO_DIRECTORIES.has(entry.name.toLowerCase()))
    .map((entry) => entry.name).sort(compareNaturalPath);
  const legacyFullRootName = findDirectoryName(entries, 'full');
  let legacyFolders: string[] = [];
  if (legacyFullRootName) {
    try {
      legacyFolders = (await fs.readdir(path.join(audioRoot, legacyFullRootName), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      warning('.', `cannot read legacy full root; skipped (${error instanceof Error ? error.message : 'I/O error'}).`);
    }
  }
  const localKeys = new Set(localFolders.map(normalizedPathKey));
  const albumFolders = [...localFolders, ...legacyFolders.filter((folder) => !localKeys.has(normalizedPathKey(folder)))].sort(compareNaturalPath);
  const catalogPath = path.join(audioRoot, PREVIEW_CATALOG);
  const parsedCatalog = await readJson<unknown>(catalogPath, {}, '.');
  const catalog: Record<string, PreviewAlbumReference> = parsedCatalog && typeof parsedCatalog === 'object' && !Array.isArray(parsedCatalog)
    ? parsedCatalog as Record<string, PreviewAlbumReference> : {};
  const catalogByFolder = catalogMatchesByFolder(catalog);
  const metadataReader = options.metadataReader ?? readAudioMetadata;
  const albums: ScannedAlbum[] = [];
  const ids = new Map<string, string>();

  for (const folder of albumFolders) {
    const catalogMatch = catalogByFolder.get(normalizedPathKey(folder));
    const album = await readAlbum(audioRoot, folder, legacyFullRootName, catalogMatch, metadataReader);
    if (!album) continue;
    const previous = ids.get(album.id);
    if (previous) throw new Error(`Duplicate stable album id "${album.id}" for folders "${previous}" and "${folder}".`);
    ids.set(album.id, folder);
    albums.push(album);
  }

  return albums.sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999)
    || compareNaturalPath(a.folder, b.folder));
}

async function writeIfChanged(file: string, content: string): Promise<void> {
  try {
    if (await fs.readFile(file, 'utf8') === content) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

export async function generateAudioLibrary(root: string, options: ScanOptions = {}): Promise<{ total: number; owned: number; folders: number }> {
  const albums = await scanAudioLibrary(root, options);
  const albumData: GeneratedAlbum[] = albums.map((album) => ({
    id: album.id,
    folder: album.folder,
    name: album.name,
    year: album.year,
    artist: album.artist,
    genre: album.genre,
    description: album.description,
    subtitle: album.subtitle,
    color: album.color,
    colorAccent: album.colorAccent,
    image: album.image,
    artworkLevel: album.artworkLevel,
  }));
  const trackData = Object.fromEntries(albums.map((album) => [album.id, album.tracks]));
  const generated = `/** AUTO-GENERATED by plugins/audio-library.ts. DO NOT EDIT. */
export interface GeneratedTrack {
  id: string;
  title: string;
  file: string;
  kind: 'full' | 'preview';
  lyrics?: string;
  lyricsUrl?: string;
  artist?: string;
  trackNumber?: number;
  discNumber?: number;
  artwork?: string;
}
export interface GeneratedAlbum {
  id: string;
  folder: string;
  name: { en: string; zh: string };
  year: string;
  artist?: string;
  genre: { en: string; zh: string };
  description: { en: string; zh: string };
  subtitle: { en: string; zh: string };
  color: string;
  colorAccent: string;
  image: string;
  artworkLevel: 'album' | 'track' | 'fallback';
}
export const GENERATED_ALBUMS: GeneratedAlbum[] = ${JSON.stringify(albumData, null, 2)};
export const GENERATED_TRACKS: Record<string, GeneratedTrack[]> = ${JSON.stringify(trackData, null, 2)};
`;
  await writeIfChanged(path.join(root, GENERATED_FILE), generated);

  const checklist = ['# 专辑与曲目', '', '由音频扫描器自动生成。请勿手动编辑。', ''];
  for (const album of albums) {
    checklist.push(`## ${album.name.en}`, '', `public/audio/${album.folder}/ · ${album.tracks.length} 首`, '');
    for (const [index, track] of album.tracks.entries()) {
      checklist.push(`${track.kind === 'full' ? '✅' : '☐'} ${String(index + 1).padStart(2, '0')}. ${track.title}`);
    }
    checklist.push('');
  }
  await writeIfChanged(path.join(root, AUDIO_DIRECTORY, 'TRACKLIST.md'), checklist.join('\n'));
  return {
    total: albums.reduce((sum, album) => sum + album.tracks.length, 0),
    owned: albums.reduce((sum, album) => sum + album.owned, 0),
    folders: albums.length,
  };
}
