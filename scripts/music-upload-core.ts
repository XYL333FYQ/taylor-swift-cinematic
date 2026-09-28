import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isValidAlbumManifest, scanAudioLibrary, type CatalogAlbum, type CatalogTrack } from '../plugins/audio-library.ts';
import { buildCatalog, CATALOG_CACHE, MEDIA_CACHE, type MediaFile, type ObjectUpload } from './music-sync-core.ts';
import { withTargetSyncLock } from './music-sync-lock.ts';
import { mediaKeysForTrack, parseRemoteCatalog, referencedMediaKey, type PublishedAlbum, type PublishedCatalog } from './music-remote-catalog.ts';
import type { MusicR2Store } from './music-r2-store.ts';

type UploadStore = Pick<MusicR2Store, 'getText' | 'hash' | 'head' | 'put'>;
export interface UploadIssue { album: string; level: 'error' | 'warning'; message: string }
export interface UploadConflict { album: string; track: string; id: string }
export interface UploadReport {
  issues: UploadIssue[];
  newAlbums: string[];
  newTracks: string[];
  duplicates: string[];
  changed: UploadConflict[];
  replacements: string[];
  mediaUploads: string[];
  archived: string[];
  catalogChanged: boolean;
  dryRun: boolean;
}
export interface UploadOptions {
  dryRun?: boolean;
  onReport?: (report: UploadReport, phase: 'preflight' | 'plan') => void;
  confirm?: (report: UploadReport) => Promise<boolean>;
  chooseReplacement?: (conflict: UploadConflict) => Promise<'replace' | 'skip'>;
  onLockWait?: () => void;
  onUpload?: (key: string) => void;
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasText = (value: unknown): boolean => typeof value === 'string' ? Boolean(value.trim())
  : record(value) && (typeof value.en === 'string' && Boolean(value.en.trim()) || typeof value.zh === 'string' && Boolean(value.zh.trim()));
const sha = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function content(file: MediaFile): Promise<{ hash: string; size: number; mtimeMs?: number }> {
  if (file.source) {
    const stat = await fs.stat(file.source);
    return { hash: await hashFile(file.source), size: stat.size, mtimeMs: stat.mtimeMs };
  }
  const buffer = Buffer.from(file.text ?? '', 'utf8');
  return { hash: sha(buffer), size: buffer.length };
}
interface Revision { key: string; hash: string }
function version(url: string | undefined, revisions: Map<string, Revision>): string | undefined {
  if (!url) return undefined;
  const key = referencedMediaKey(url);
  const revision = key ? revisions.get(key) : undefined;
  return revision ? `${revision.key}?v=${revision.hash.slice(0, 16)}` : url;
}
function versionTrack(track: CatalogTrack, revisions: Map<string, Revision>): CatalogTrack {
  return { ...track, file: version(track.file, revisions)!, lyricsUrl: version(track.lyricsUrl, revisions), artwork: version(track.artwork, revisions) };
}
function ownMedia(album: PublishedAlbum): string[] {
  return [album.artwork.cover, album.artwork.presentation, ...album.tracks.flatMap(mediaKeysForTrack)]
    .flatMap((url) => { const key = referencedMediaKey(url); return key ? [key] : []; });
}

export async function inspectIncoming(root: string): Promise<{ albums: CatalogAlbum[]; issues: UploadIssue[] }> {
  const directory = path.join(root, 'incoming');
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const folders = entries.filter((entry) => entry.isDirectory());
  if (!folders.length) throw new Error('incoming/ 没有待上传专辑。请先把专辑文件夹放入 incoming/。');
  const issues: UploadIssue[] = [];
  const report = (album: string, level: UploadIssue['level'], message: string) => issues.push({ album, level, message });
  for (const folder of folders) {
    const file = path.join(directory, folder.name, 'album.json');
    let manifest: unknown;
    try { manifest = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) {
      report(folder.name, 'error', (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? '缺少 album.json；上传专辑需要明确的展示信息。'
        : 'album.json 无法读取或 JSON 格式有误，请修复后重试。');
      continue;
    }
    if (!isValidAlbumManifest(manifest)) {
      report(folder.name, 'error', 'album.json 字段类型不符合当前项目格式，请对照 docs/ALBUM_METADATA.md。');
      continue;
    }
    if (typeof manifest.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id))
      report(folder.name, 'error', 'album.json 的 id 必须是稳定的小写字母/数字连字符 ID，用于云端专辑路径。');
    if (!hasText(manifest.name)) report(folder.name, 'error', 'album.json 缺少 name；网页标题和播放器需要专辑名称。');
    if (!((typeof manifest.releaseDate === 'string' && /^\d{4}(?:-\d{2}-\d{2})?$/.test(manifest.releaseDate))
      || (typeof manifest.year === 'number' && Number.isInteger(manifest.year) && manifest.year >= 1000 && manifest.year <= 9999)
      || (typeof manifest.year === 'string' && /^\d{4}$/.test(manifest.year))))
      report(folder.name, 'error', 'album.json 缺少有效 releaseDate 或 year；网页需要年份进行展示和排序。');
    if (typeof manifest.color !== 'string' || !manifest.color.trim())
      report(folder.name, 'error', 'album.json 缺少 color；该字段用于网页的专辑主题色。');
    for (const [field, purpose] of [
      ['artist', '专辑艺人及图片说明'], ['genre', '流派文案'], ['description', '专辑介绍'],
      ['tagline', '短文案'], ['quote', '卡片引用文案'], ['colorAccent', '强调色（可回退到 color）'],
    ] as const) {
      if (!hasText(manifest[field]) && !(field === 'tagline' && hasText(manifest.subtitle)))
        report(folder.name, 'warning', `建议填写 ${field}，用于${purpose}；缺失时沿用扫描器的默认策略。`);
    }
  }
  const scanIssues: string[] = [];
  let albums: CatalogAlbum[] = [];
  try {
    albums = await scanAudioLibrary(root, {
      audioDirectory: 'incoming',
      verifyReadableFile: async (file) => { const handle = await fs.open(file, 'r'); await handle.close(); },
      onIssue: (issue) => scanIssues.push(issue),
    });
  } catch (error) {
    report('incoming/', 'error', `扫描失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
  for (const issue of scanIssues) report('扫描器', issue.includes('[critical]') ? 'error' : 'warning', issue);
  for (const album of albums) {
    if (!album.tracks.length) report(album.folder, 'error', '没有找到可读取的音频；音频是上传的必需资源。');
    if (!album.artwork.cover.startsWith(`incoming/${album.folder}/`))
      report(album.folder, 'error', '缺少专辑封面；请在 artwork/ 中提供 cover 图片，或在 album.json 中指定 artwork。');
    if (album.artwork.presentation === album.artwork.cover)
      report(album.folder, 'warning', '没有独立展示图，网页将复用专辑封面。');
    for (const track of album.tracks) {
      if (!track.lyricsUrl && !track.lyrics) report(album.folder, 'warning', `${track.title} 没有歌词，将不显示同步歌词。`);
      if (!track.artwork) report(album.folder, 'warning', `${track.title} 没有单曲图片，将使用默认策略。`);
    }
    const archive = path.join(root, 'uploaded', album.folder);
    try {
      await fs.lstat(archive);
      report(album.folder, 'error', `uploaded/${album.folder}/ 已存在；请先整理该目录，上传后才能按原名归档。`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return { albums, issues };
}

export async function uploadMusic(root: string, target: string, store: UploadStore, options: UploadOptions = {}): Promise<UploadReport> {
  return withTargetSyncLock(target, async () => {
    const { albums, issues } = await inspectIncoming(root);
    const report: UploadReport = {
      issues, newAlbums: [], newTracks: [], duplicates: [], changed: [], replacements: [],
      mediaUploads: [], archived: [], catalogChanged: false, dryRun: Boolean(options.dryRun),
    };
    if (issues.some((issue) => issue.level === 'error')) {
      options.onReport?.(report, 'preflight');
      throw new Error('上传检查未通过；请修复上方 error 后重试。');
    }
    const built = await buildCatalog(root, albums, 'incoming');
    const incoming = parseRemoteCatalog(built.catalog);
    const remoteObject = await store.getText('catalog.json');
    const remote: PublishedCatalog = remoteObject ? parseRemoteCatalog(remoteObject.text) : { albums: [] };
    const merged: PublishedCatalog = structuredClone(remote);
    const selected = new Set<string>();
    const trackChanges = new Map<string, Set<string>>();
    const newAlbumIds = new Set<string>();
    const conflicts: Array<{ oldAlbum: PublishedAlbum; oldTrack: CatalogTrack; newTrack: CatalogTrack; conflict: UploadConflict }> = [];
    for (const album of incoming.albums) {
      const existing = merged.albums.find((item) => item.id === album.id);
      if (!existing) {
        merged.albums.push(album);
        newAlbumIds.add(album.id);
        report.newAlbums.push(album.name.en);
        for (const key of ownMedia(album)) selected.add(key);
        continue;
      }
      const selectedTracks = new Set<string>();
      for (const track of album.tracks) {
        const old = existing.tracks.find((item) => item.id === track.id);
        if (!old) {
          existing.tracks.push(track);
          selectedTracks.add(track.id);
          report.newTracks.push(`${existing.name.en} / ${track.title}`);
          for (const key of mediaKeysForTrack(track)) selected.add(key);
          continue;
        }
        const localKey = referencedMediaKey(track.file);
        const localFile = built.files.find((file) => file.key === localKey);
        if (!localFile) throw new Error(`无法读取 ${track.title} 的本地音频。`);
        const oldKey = referencedMediaKey(old.file);
        const [localHash, oldHash] = await Promise.all([content(localFile), oldKey ? store.hash(oldKey) : Promise.resolve(null)]);
        if (oldHash && oldHash.hash === localHash.hash) {
          report.duplicates.push(`${existing.name.en} / ${track.title}`);
          continue;
        }
        const conflict = { album: existing.name.en, track: track.title, id: track.id };
        report.changed.push(conflict);
        conflicts.push({ oldAlbum: existing, oldTrack: old, newTrack: track, conflict });
      }
      trackChanges.set(album.id, selectedTracks);
    }
    options.onReport?.(report, 'preflight');
    for (const item of conflicts) {
      if (options.dryRun || (await options.chooseReplacement?.(item.conflict)) !== 'replace') continue;
      // Retain published metadata and optional assets unless a new optional asset was supplied.
      const replacement = { ...item.oldTrack, file: item.newTrack.file,
        lyricsUrl: item.newTrack.lyricsUrl ?? item.oldTrack.lyricsUrl,
        artwork: item.newTrack.artwork ?? item.oldTrack.artwork };
      item.oldAlbum.tracks[item.oldAlbum.tracks.indexOf(item.oldTrack)] = replacement;
      trackChanges.get(item.oldAlbum.id)!.add(item.newTrack.id);
      report.replacements.push(`${item.oldAlbum.name.en} / ${item.newTrack.title}`);
      for (const key of mediaKeysForTrack(item.newTrack)) selected.add(key);
    }
    const files = new Map(built.files.map((file) => [file.key, file]));
    const planned: Array<{ file: MediaFile; hash: string; size: number; mtimeMs?: number }> = [];
    const revisions = new Map<string, Revision>();
    const referenced = new Set(remote.albums.flatMap(ownMedia));
    for (const key of selected) {
      const file = files.get(key);
      if (!file) throw new Error(`计划上传的资源不存在：${key}`);
      const stamp = await content(file);
      const cloud = await store.hash(key);
      // Never overwrite bytes still used by the published catalog, even before a replacement's catalog commit.
      const uploadKey = cloud && cloud.hash !== stamp.hash && referenced.has(key)
        ? key.replace(/(\.[^.]+)$/, `-${stamp.hash.slice(0, 16)}$1`) : key;
      revisions.set(key, { key: uploadKey, hash: stamp.hash });
      const uploadCloud = uploadKey === key ? cloud : await store.hash(uploadKey);
      if (uploadCloud?.hash === stamp.hash) continue;
      if (uploadCloud) throw new Error(`R2 资源键已存在且内容不同：${uploadKey}；请人工检查后重试。`);
      planned.push({ file: { ...file, key: uploadKey }, ...stamp });
      report.mediaUploads.push(uploadKey);
    }
    for (const album of merged.albums) {
      if (newAlbumIds.has(album.id)) {
        album.artwork = { cover: version(album.artwork.cover, revisions)!, presentation: version(album.artwork.presentation, revisions)! };
        album.tracks = album.tracks.map((track) => versionTrack(track, revisions));
      } else {
        album.tracks = album.tracks.map((track) => trackChanges.get(album.id)?.has(track.id) ? versionTrack(track, revisions) : track);
      }
    }
    report.catalogChanged = JSON.stringify(merged) !== JSON.stringify(remote);
    options.onReport?.(report, 'plan');
    if (options.dryRun) return report;
    if (!(await options.confirm?.(report))) throw new Error('用户取消；云端与本地均未修改。');
    for (const item of planned) {
      const current = await content(item.file);
      if (current.hash !== item.hash || current.size !== item.size || current.mtimeMs !== item.mtimeMs)
        throw new Error(`上传前文件发生变化：${item.file.key}。请重新运行。`);
      const body = item.file.source ? createReadStream(item.file.source) : Buffer.from(item.file.text ?? '', 'utf8');
      const closed = Buffer.isBuffer(body) ? undefined : new Promise<void>((resolve) => body.once('close', resolve));
      try {
        await store.put({ key: item.file.key, body, contentLength: item.size, contentType: item.file.mime, cacheControl: MEDIA_CACHE });
      } finally {
        if (!Buffer.isBuffer(body) && !body.closed) { body.destroy(); await closed; }
      }
      const head = await store.head(item.file.key);
      if (head?.contentLength !== item.size) throw new Error(`上传校验失败：${item.file.key}。catalog 未发布，可直接重试。`);
      options.onUpload?.(item.file.key);
    }
    if (report.catalogChanged) {
      if (remoteObject && !remoteObject.etag) throw new Error('R2 catalog.json 缺少 ETag，无法安全更新；媒体已上传，可重试。');
      const catalog = JSON.stringify(merged, null, 2) + '\n';
      const data = Buffer.from(catalog, 'utf8');
      const upload: ObjectUpload = {
        key: 'catalog.json', body: data, contentLength: data.length,
        contentType: 'application/json; charset=utf-8', cacheControl: CATALOG_CACHE,
        ...(remoteObject ? { ifMatch: remoteObject.etag } : { ifNoneMatch: '*' }),
      };
      await store.put(upload);
      const published = await store.getText('catalog.json');
      if (published?.text !== catalog) throw new Error('catalog 发布后校验失败；incoming/ 保留，请检查 R2 后重试。');
    }
    const destination = path.join(root, 'uploaded');
    await fs.mkdir(destination, { recursive: true });
    for (const album of albums) {
      const source = path.join(root, 'incoming', album.folder);
      const targetFolder = path.join(destination, album.folder);
      try {
        await fs.lstat(targetFolder);
        throw new Error(`uploaded/${album.folder}/ 已存在；云端已发布，本地 incoming/ 保留，请手动整理。`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await fs.rename(source, targetFolder);
      report.archived.push(targetFolder);
    }
    return report;
  }, { onWaiting: options.onLockWait });
}
