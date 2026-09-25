import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { scanAudioLibrary, type CatalogAlbum } from '../plugins/audio-library.ts';

export interface ObjectUpload {
  key: string;
  body: Buffer | ReturnType<typeof createReadStream>;
  contentLength: number;
  contentType: string;
  cacheControl: string;
}
export interface RemoteObjectInfo { contentLength?: number }
export interface Uploader {
  put(object: ObjectUpload): Promise<void>;
  head(key: string): Promise<RemoteObjectInfo | null>;
  delete(key: string): Promise<void>;
}
export interface MusicPruneObject { key: string; size: number }
export interface MusicPrunePlan {
  albums: number;
  objects: MusicPruneObject[];
  alreadyAbsent: number;
  totalBytes: number;
  confirmationToken: string;
  requiresConfirmation: boolean;
  reasons: string[];
}
interface FileStamp { source: string; size: number; mtimeMs: number; hash: string }
interface SyncState {
  target: string;
  files: Record<string, FileStamp>;
  pendingDeletes?: string[];
  catalogHash?: string;
}
interface MediaFile { key: string; source?: string; text?: string; mime: string }
export interface MusicSyncOptions {
  confirmPrune?: (plan: MusicPrunePlan) => Promise<boolean>;
}
const MEDIA_CACHE = 'public, max-age=31536000, immutable';
const CATALOG_CACHE = 'public, max-age=60, must-revalidate';
const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.wav': 'audio/wav', '.lrc': 'text/plain; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.avif': 'image/avif', '.json': 'application/json; charset=utf-8',
};

function sha(buffer: Buffer): string { return createHash('sha256').update(buffer).digest('hex'); }
async function shaFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function safeId(value: string, label: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}
async function sourceFile(root: string, url: string): Promise<string> {
  if (!url.startsWith('audio/')) throw new Error(`Expected local audio path: ${url}`);
  const segments = url.split('/').map(decodeURIComponent);
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/]/.test(segment))) throw new Error(`Unsafe local media path: ${url}`);
  const audioRoot = await fs.realpath(path.join(root, 'audio'));
  const candidate = await fs.realpath(path.join(root, ...segments));
  if (!candidate.startsWith(audioRoot + path.sep)) throw new Error(`Media outside audio/: ${url}`);
  if (!(await fs.stat(candidate)).isFile()) throw new Error(`Media is not a file: ${url}`);
  return candidate;
}

async function buildCatalog(root: string, albums: CatalogAlbum[]): Promise<{ catalog: string; files: MediaFile[] }> {
  const files = new Map<string, MediaFile>();
  const add = async (url: string, key: string): Promise<string> => {
    if (url.replace(/^\.\//, '').startsWith('theme/')) return url;
    const source = await sourceFile(root, url);
    const extension = path.extname(source).toLowerCase();
    const mime = MIME[extension];
    if (!mime) throw new Error(`Unsupported media type: ${source}`);
    const existing = files.get(key);
    if (existing && existing.source !== source) throw new Error(`Remote object key collision: ${key}`);
    files.set(key, { key, source, mime });
    return key;
  };
  const published: Array<Omit<CatalogAlbum, 'folder'>> = [];
  for (const album of albums) {
    const id = safeId(album.id, 'album id');
    const prefix = `albums/${id}`;
    const coverSource = album.artwork.cover;
    const cover = await add(coverSource, `${prefix}/artwork/cover${path.extname(coverSource).toLowerCase()}`);
    const presentationSource = album.artwork.presentation;
    const presentation = presentationSource === coverSource ? cover
      : await add(presentationSource, `${prefix}/artwork/presentation${path.extname(presentationSource).toLowerCase()}`);
    const tracks = [];
    const trackIds = new Set<string>();
    for (const track of album.tracks) {
      const trackId = safeId(track.id, 'track id');
      if (trackIds.has(trackId)) throw new Error(`Duplicate track id in ${id}: ${trackId}`);
      trackIds.add(trackId);
      const file = await add(track.file, `${prefix}/tracks/${trackId}${path.extname(track.file).toLowerCase()}`);
      let lyricsUrl = track.lyricsUrl
        ? await add(track.lyricsUrl, `${prefix}/lyrics/${trackId}.lrc`) : undefined;
      if (!lyricsUrl && track.lyrics) {
        const key = `${prefix}/lyrics/${trackId}.lrc`;
        files.set(key, { key, text: track.lyrics, mime: MIME['.lrc'] });
        lyricsUrl = key;
      }
      const artwork = track.artwork
        ? await add(track.artwork, `${prefix}/artwork/tracks/${trackId}${path.extname(track.artwork).toLowerCase()}`)
        : undefined;
      // Embedded lyrics become a separate LRC object; no lyrics body enters catalog.json.
      const { lyrics: _embedded, ...publicTrack } = track;
      void _embedded;
      tracks.push({ ...publicTrack, file, lyricsUrl, artwork });
    }
    const { folder: _localFolder, ...publicAlbum } = album;
    void _localFolder;
    published.push({ ...publicAlbum, artwork: { cover, presentation }, tracks });
  }
  if (published.length === 0) throw new Error('No local albums found; refusing to publish an empty catalog.');
  const ids = new Set(published.map((album) => album.id));
  if (ids.size !== published.length) throw new Error('Duplicate album IDs in catalog.');
  return { catalog: JSON.stringify({ albums: published }, null, 2) + '\n', files: [...files.values()] };
}

function versionCatalog(catalog: string, revisions: Map<string, string>): string {
  return catalog.replace(/"albums\/[a-z0-9/-]+\.[a-z0-9]+"/g, (quoted) => {
    const key = quoted.slice(1, -1);
    const revision = revisions.get(key);
    if (!revision) throw new Error(`Catalog references unplanned object: ${key}`);
    return `"${key}?v=${revision}"`;
  });
}

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const MANAGED_MEDIA_KEY = new RegExp(
  `^albums/${SLUG}/(?:tracks/${SLUG}\\.(?:mp3|flac|m4a|aac|ogg|opus|wav)|lyrics/${SLUG}\\.lrc|artwork/(?:cover|presentation)\\.(?:webp|jpg|jpeg|png|avif)|artwork/tracks/${SLUG}\\.(?:webp|jpg|jpeg|png|avif))$`,
);
const MAX_AUTO_DELETE_OBJECTS = 3;
const MAX_AUTO_DELETE_RATIO = 0.05;

function validateState(value: unknown, target: string): SyncState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Sync state is invalid; refusing to overwrite its managed object history.');
  const state = value as Partial<SyncState>;
  if (state.target !== target) throw new Error('Sync state targets a different R2 bucket; refusing to overwrite its managed object history.');
  const managedFiles = state.files;
  if (!managedFiles || typeof managedFiles !== 'object' || Array.isArray(managedFiles)) throw new Error('Sync state has no valid managed object history.');
  for (const [key, stamp] of Object.entries(managedFiles)) {
    if (!MANAGED_MEDIA_KEY.test(key)) throw new Error('Sync state contains a key outside the managed media namespace; refusing to continue.');
    if (!stamp || typeof stamp.source !== 'string' || !Number.isSafeInteger(stamp.size) || stamp.size < 0
      || !Number.isFinite(stamp.mtimeMs) || !/^[a-f0-9]{64}$/.test(stamp.hash)) {
      throw new Error('Sync state contains an invalid managed media record; refusing to continue.');
    }
  }
  const pendingDeletes = state.pendingDeletes ?? [];
  if (!Array.isArray(pendingDeletes) || pendingDeletes.some((key) => typeof key !== 'string'
    || !MANAGED_MEDIA_KEY.test(key) || !Object.hasOwn(managedFiles, key))) {
    throw new Error('Sync state contains invalid pending deletions; refusing to continue.');
  }
  if (state.catalogHash !== undefined && !/^[a-f0-9]{64}$/.test(state.catalogHash)) {
    throw new Error('Sync state contains an invalid catalog hash; refusing to continue.');
  }
  return { target, files: managedFiles, pendingDeletes: [...new Set(pendingDeletes)], catalogHash: state.catalogHash };
}

async function readStateFile(file: string, target: string): Promise<{ state?: SyncState; exists: boolean; error?: Error }> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('Sync state is invalid; refusing to overwrite its managed object history.'); }
    return { state: validateState(parsed, target), exists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false };
    return { exists: true, error: error instanceof Error ? error : new Error('Sync state is invalid.') };
  }
}

async function readState(root: string, target: string): Promise<SyncState> {
  const statePath = path.join(root, '.music-cache', 'sync-state.json');
  // A complete .next file is left behind only if a process stopped between
  // writing state and replacing the primary file. Prefer it to avoid losing a
  // newer pending-delete ledger.
  const next = await readStateFile(`${statePath}.next`, target);
  if (next.state) return next.state;
  const current = await readStateFile(statePath, target);
  if (current.state) return current.state;
  if (!next.exists && !current.exists) return { target, files: {}, pendingDeletes: [] };
  throw next.error ?? current.error ?? new Error('No valid sync state remains; refusing to overwrite its managed object history.');
}

async function writeState(root: string, state: SyncState): Promise<void> {
  const directory = path.join(root, '.music-cache');
  await fs.mkdir(directory, { recursive: true });
  const statePath = path.join(directory, 'sync-state.json');
  const nextPath = `${statePath}.next`;
  const text = JSON.stringify(state, null, 2) + '\n';
  await fs.writeFile(nextPath, text, 'utf8');
  try {
    await fs.rename(nextPath, statePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error;
    // Windows may reject rename-over-existing. The complete .next copy remains
    // available for recovery if direct replacement is interrupted.
    await fs.writeFile(statePath, text, 'utf8');
    await fs.rm(nextPath, { force: true });
  }
}

interface AudioScan {
  albums: CatalogAlbum[];
  warnings: string[];
}

async function scanAudio(root: string): Promise<AudioScan> {
  let audioStat;
  try { audioStat = await fs.stat(path.join(root, 'audio')); }
  catch { throw new Error('audio/ is missing or unreadable; refusing to sync or clean up.'); }
  if (!audioStat.isDirectory()) throw new Error('audio/ is not a directory; refusing to sync or clean up.');

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
  let albums: CatalogAlbum[];
  try { albums = await scanAudioLibrary(root); }
  catch { throw new Error('Audio library scan failed; refusing to sync or clean up.'); }
  finally { console.warn = originalWarn; }
  if (albums.length === 0) throw new Error('No albums found; refusing to publish an empty catalog or clean up.');
  return { albums, warnings };
}

function getStaleKeys(state: SyncState, currentKeys: Set<string>): string[] {
  return Object.keys(state.files).filter((key) => !currentKeys.has(key)).sort();
}

function buildPlan(
  target: string,
  catalog: string,
  albums: CatalogAlbum[],
  state: SyncState,
  staleKeys: string[],
  objects: MusicPruneObject[],
  alreadyAbsent: number,
  warnings: string[],
): MusicPrunePlan {
  const currentAlbumIds = new Set(albums.map((album) => album.id));
  const deletedAlbums = new Set(objects.flatMap(({ key }) => {
    const albumId = /^albums\/([^/]+)\//.exec(key)?.[1];
    return albumId && !currentAlbumIds.has(albumId) ? [albumId] : [];
  }));
  const reasons: string[] = [];
  if (deletedAlbums.size > 0) reasons.push(`entire album(s) removed: ${[...deletedAlbums].sort().join(', ')}`);
  if (objects.length > MAX_AUTO_DELETE_OBJECTS) reasons.push(`delete count ${objects.length} exceeds the automatic limit of ${MAX_AUTO_DELETE_OBJECTS}`);
  const managedCount = Object.keys(state.files).length;
  if (objects.length > 0 && objects.length / Math.max(managedCount, 1) > MAX_AUTO_DELETE_RATIO) {
    reasons.push(`delete ratio ${(objects.length / Math.max(managedCount, 1) * 100).toFixed(1)}% exceeds the automatic limit of ${MAX_AUTO_DELETE_RATIO * 100}%`);
  }
  if (warnings.length > 0) reasons.push(`audio scan reported ${warnings.length} warning(s)`);
  const totalBytes = objects.reduce((sum, object) => sum + object.size, 0);
  const confirmationToken = createHash('sha256')
    .update(target).update('\n').update(catalog).update('\n')
    .update(JSON.stringify(staleKeys)).update('\n')
    .update(JSON.stringify(objects)).update('\n')
    .update(JSON.stringify(reasons)).digest('hex').slice(0, 12);
  return {
    albums: albums.length, objects, alreadyAbsent, totalBytes, confirmationToken,
    requiresConfirmation: reasons.length > 0, reasons,
  };
}

async function inspectStaleObjects(
  staleKeys: string[],
  state: SyncState,
  store: Pick<Uploader, 'head'>,
): Promise<{ objects: MusicPruneObject[]; alreadyAbsent: number }> {
  const objects: MusicPruneObject[] = [];
  let alreadyAbsent = 0;
  for (const key of staleKeys) {
    if (!MANAGED_MEDIA_KEY.test(key) || key === 'catalog.json') throw new Error(`Unsafe managed object key ${key}; refusing to clean up.`);
    const remote = await store.head(key);
    if (!remote) { alreadyAbsent++; continue; }
    const recordedSize = state.files[key]?.size;
    if (remote.contentLength === undefined || remote.contentLength !== recordedSize) {
      throw new Error(`Remote size differs from sync history for ${key}; refusing to clean up.`);
    }
    objects.push({ key, size: remote.contentLength });
  }
  return { objects, alreadyAbsent };
}

async function buildMusicPrunePlan(
  root: string,
  target: string,
  store: Pick<Uploader, 'head'>,
): Promise<MusicPrunePlan> {
  const { albums, warnings } = await scanAudio(root);
  if (warnings.length > 0) throw new Error(`Audio library scan reported ${warnings.length} warning(s); refusing to build a prune preview.`);
  const { catalog, files } = await buildCatalog(root, albums);
  const state = await readState(root, target);
  const currentKeys = new Set(files.map((file) => file.key));
  const staleKeys = getStaleKeys(state, currentKeys);
  const { objects, alreadyAbsent } = await inspectStaleObjects(staleKeys, state, store);
  return buildPlan(target, catalog, albums, state, staleKeys, objects, alreadyAbsent, []);
}

export async function planMusicPrune(
  root: string,
  target: string,
  store: Pick<Uploader, 'head'>,
): Promise<MusicPrunePlan> {
  return buildMusicPrunePlan(root, target, store);
}

export async function syncMusic(
  root: string,
  target: string,
  uploader: Uploader,
  options: MusicSyncOptions = {},
): Promise<{
  albums: number;
  uploaded: number;
  skipped: number;
  catalogUploaded: boolean;
  catalog: string;
  deleted: number;
  deletionDeferred: boolean;
  pendingDeletes: number;
  added: number;
  modified: number;
  cleanupCandidates: number;
  warnings: string[];
}> {
  const { albums, warnings } = await scanAudio(root);
  const { catalog, files } = await buildCatalog(root, albums);
  const state = await readState(root, target);
  const currentKeys = new Set(files.map((file) => file.key));
  const staleKeys = getStaleKeys(state, currentKeys);
  const nextPending = staleKeys;
  let stateDirty = JSON.stringify(state.pendingDeletes ?? []) !== JSON.stringify(nextPending);
  state.pendingDeletes = nextPending;
  const mediaPlan: Array<{ media: MediaFile; stamp: FileStamp; buffer?: Buffer; change: 'add' | 'modify' | 'unchanged' }> = [];
  const revisions = new Map<string, string>();
  for (const media of files) {
    const source = media.source;
    const buffer = source ? undefined : Buffer.from(media.text ?? '', 'utf8');
    const stat = source ? await fs.stat(source) : undefined;
    const size = stat?.size ?? buffer?.length ?? 0;
    const mtimeMs = stat?.mtimeMs ?? 0;
    const stamp: FileStamp = { source: source ?? '<generated>', size, mtimeMs, hash: '' };
    const previous = state.files[media.key];
    const sameStamp = previous?.source === stamp.source && previous.size === size && previous.mtimeMs === mtimeMs;
    const hash = sameStamp ? previous.hash : source ? await shaFile(source) : sha(buffer!);
    stamp.hash = hash;
    revisions.set(media.key, hash.slice(0, 16));
    if (previous?.hash === hash) {
      if (previous.source !== stamp.source || previous.size !== size || previous.mtimeMs !== mtimeMs) {
        state.files[media.key] = stamp;
        stateDirty = true;
      }
      mediaPlan.push({ media, stamp, buffer, change: 'unchanged' });
    } else {
      mediaPlan.push({ media, stamp, buffer, change: previous ? 'modify' : 'add' });
    }
  }

  // The complete add/modify/skip/delete plan is known before any remote
  // mutation. Persist pending deletions before starting the upload phase.
  if (stateDirty) await writeState(root, state);

  let uploaded = 0;
  let skipped = 0;
  let added = 0;
  let modified = 0;
  for (const item of mediaPlan) {
    if (item.change === 'unchanged') { skipped++; continue; }
    const { media, stamp, buffer } = item;
    if (media.source) {
      const beforeUpload = await fs.stat(media.source);
      if (beforeUpload.size !== stamp.size || beforeUpload.mtimeMs !== stamp.mtimeMs) {
        throw new Error(`Local media changed after the sync plan was built: ${media.key}.`);
      }
    }

    await uploader.put({ key: media.key, body: media.source ? createReadStream(media.source) : buffer!, contentLength: stamp.size, contentType: media.mime, cacheControl: MEDIA_CACHE });
    const remote = await uploader.head(media.key);
    if (!remote) throw new Error(`Uploaded media object not found during verification: ${media.key}.`);
    if (remote.contentLength !== stamp.size) throw new Error(`ContentLength mismatch for ${media.key}: expected ${stamp.size} bytes, received ${remote.contentLength ?? 'unknown'} bytes.`);
    if (media.source) {
      const afterUpload = await fs.stat(media.source);
      if (afterUpload.size !== stamp.size || afterUpload.mtimeMs !== stamp.mtimeMs) {
        throw new Error(`Local media changed while uploading: ${media.key}.`);
      }
    }
    state.files[media.key] = stamp;
    await writeState(root, state);
    uploaded++;
    if (item.change === 'add') added++;
    else modified++;
  }

  const staleBeforePublish = getStaleKeys(state, currentKeys);
  if (staleBeforePublish.some((key) => currentKeys.has(key))) {
    throw new Error('A cleanup candidate is still referenced by the current catalog; refusing to continue.');
  }
  // Only after every changed media object has passed HeadObject verification do
  // we inspect stale history and prepare the catalog publication.
  const { objects, alreadyAbsent } = await inspectStaleObjects(staleBeforePublish, state, uploader);
  const plan = buildPlan(target, catalog, albums, state, staleBeforePublish, objects, alreadyAbsent, warnings);
  // The catalog is re-published whenever stale keys exist. This makes every
  // cleanup attempt prove that the catalog without those keys reached R2.
  const versioned = versionCatalog(catalog, revisions);
  const catalogHash = sha(Buffer.from(versioned));
  const shouldPublishCatalog = catalogHash !== state.catalogHash || staleBeforePublish.length > 0;
  let catalogUploaded = false;
  if (shouldPublishCatalog) {
    const body = Buffer.from(versioned);
    await uploader.put({ key: 'catalog.json', body, contentLength: body.length, contentType: MIME['.json'], cacheControl: CATALOG_CACHE });
    state.catalogHash = catalogHash;
    await writeState(root, state);
    catalogUploaded = true;
  }

  // A strict key namespace plus the exact set used to build this catalog keeps
  // cleanup away from catalog.json and anything still referenced by it.
  if (staleBeforePublish.some((key) => currentKeys.has(key))) {
    throw new Error('A cleanup candidate is still referenced by the published catalog; refusing to clean up.');
  }
  let deleted = 0;
  let deletionDeferred = false;
  if (objects.length > 0) {
    const approved = !plan.requiresConfirmation
      || (options.confirmPrune ? await options.confirmPrune(plan) : false);
    if (!approved) {
      deletionDeferred = true;
    } else {
      for (const object of objects) {
        if (object.key === 'catalog.json' || !MANAGED_MEDIA_KEY.test(object.key) || currentKeys.has(object.key)) {
          throw new Error(`Unsafe or referenced cleanup candidate ${object.key}; refusing to clean up.`);
        }
        const latest = await uploader.head(object.key);
        if (!latest) continue;
        if (latest.contentLength !== object.size) throw new Error(`Remote size changed for ${object.key}; refusing to clean up.`);
        await uploader.delete(object.key);
        deleted++;
      }
    }
  }

  if (!deletionDeferred && staleBeforePublish.length > 0) {
    for (const key of staleBeforePublish) delete state.files[key];
    state.pendingDeletes = [];
    await writeState(root, state);
  }
  return {
    albums: albums.length, uploaded, skipped, catalogUploaded, catalog: versioned,
    deleted, deletionDeferred, pendingDeletes: deletionDeferred ? staleBeforePublish.length : 0,
    added, modified, cleanupCandidates: objects.length, warnings,
  };
}
