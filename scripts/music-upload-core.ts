import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isValidAlbumManifest, scanAudioLibrary, scanIncomingTracks, type CatalogAlbum, type CatalogTrack } from '../plugins/audio-library.ts';
import { buildCatalog, CATALOG_CACHE, MEDIA_CACHE, type MediaFile, type ObjectUpload } from './music-sync-core.ts';
import { withTargetSyncLock } from './music-sync-lock.ts';
import { mediaKeysForTrack, parseRemoteCatalog, referencedMediaKey, type PublishedAlbum, type PublishedCatalog } from './music-remote-catalog.ts';
import type { MusicR2Store } from './music-r2-store.ts';
import { incomingFiles, incomingPath, planSongArchive, verifySongArchive, archiveSongs } from './music-upload-archive.ts';
import { SUPPORTED_AUDIO_EXTENSIONS } from '../plugins/audio-library-core.ts';

type UploadStore = Pick<MusicR2Store, 'getText' | 'hash' | 'head' | 'put'>;
export interface UploadIssue { album: string; level: 'error' | 'warning'; message: string }
export interface UploadConflict { album: string; track: string; id: string }
export interface UploadReport {
  selectedSources?: string[];
  selectedTrackCount?: number;
  archivePaths?: string[];
  targetAlbum?: { id: string; name: string };
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
  mode?: 'albums' | 'tracks';
  selectedPaths?: string[];
  albumId?: string;
  chooseAlbum?: (albums: PublishedAlbum[]) => Promise<string | null>;
  dryRun?: boolean;
  onReport?: (report: UploadReport, phase: 'preflight' | 'plan') => void;
  confirm?: (report: UploadReport) => Promise<boolean>;
  chooseReplacement?: (conflict: UploadConflict) => Promise<'replace' | 'skip'>;
  onLockWait?: () => void;
  onUpload?: (key: string) => void;
}

export interface UploadCandidate { path: string; title: string; trackCount: number; issues: UploadIssue[] }
interface InspectionOptions { mode?: 'albums' | 'tracks'; selectedPaths?: string[] }
const appliesTo = (source: string | undefined, selected: string[]) => !source || source === '.'
  || selected.some((file) => file === source || file.startsWith(source + '/'));

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

export async function inspectIncoming(root: string, existingAlbum?: PublishedAlbum, options: InspectionOptions = {}): Promise<{
  albums: CatalogAlbum[]; issues: UploadIssue[]; trackImport?: boolean; allTracks?: CatalogTrack[];
}> {
  const directory = path.join(root, 'incoming');
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const folders = entries.filter((entry) => entry.isDirectory()
    && (options.mode !== 'albums' || !options.selectedPaths || options.selectedPaths.includes(entry.name)));
  const assets = entries.filter((entry) => entry.name !== '.gitkeep');
  if (!assets.length) throw new Error('incoming/ 没有待上传内容。请先放入解压后的歌曲或专辑文件夹。');
  const manifests = await Promise.all(folders.map(async (folder) => {
    try { await fs.lstat(path.join(directory, folder.name, 'album.json')); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }));
  const issues: UploadIssue[] = [];
  const report = (album: string, level: UploadIssue['level'], message: string) => issues.push({ album, level, message });
  if (options.mode === 'tracks' || (options.mode !== 'albums' && !manifests.some(Boolean))) {
    for (const entry of options.selectedPaths || options.mode === 'tracks' ? [] : assets) {
      if (entry.name.toLowerCase().endsWith('.zip')) report('incoming/', 'error', `${entry.name} 尚未解压；请先解压 ZIP，再检查歌曲。`);
      if (entry.name === 'album.json') report('incoming/', 'error', '新专辑的 album.json 应放在 incoming/专辑文件夹/ 内。');
    }
    const allTracks = await scanIncomingTracks(root, existingAlbum ?? { id: 'incoming-tracks' }, {
      onIssue: (issue, source) => {
        if (!options.selectedPaths || appliesTo(source, options.selectedPaths))
          report('扫描器', issue.includes('[critical]') ? 'error' : 'warning', issue);
      },
    });
    const tracks = options.selectedPaths ? allTracks.filter((track) => options.selectedPaths!.includes(incomingPath(track.file))) : allTracks;
    for (const selected of options.selectedPaths ?? []) {
      if (!tracks.some((track) => incomingPath(track.file) === selected)) report('incoming/', 'error', `所选音频不存在或无法读取：${selected}`);
    }
    if (!tracks.length) report('incoming/', 'error', '没有找到可读取的音频；请放入音频文件或包含音频的歌曲文件夹。');
    for (const track of tracks) {
      if (!track.lyricsUrl && !track.lyrics) report('incoming/', 'warning', `${track.title} 没有歌词，将不显示同步歌词。`);
      if (!track.artwork) report('incoming/', 'warning', `${track.title} 没有单曲图片，将沿用专辑的默认显示策略。`);
    }
    const album: CatalogAlbum = existingAlbum ? { ...existingAlbum, folder: '.', tracks } : {
      id: 'incoming-tracks', folder: '.', name: { en: '待追加歌曲', zh: '待追加歌曲' }, releaseDate: '',
      genre: { en: '', zh: '' }, description: { en: '', zh: '' }, tagline: { en: '', zh: '' }, quote: { en: '', zh: '' },
      color: '', colorAccent: '', artwork: { cover: './theme/taylor/finale.webp', presentation: './theme/taylor/finale.webp' }, tracks,
    };
    return { albums: [album], issues, trackImport: true, allTracks };
  }
  if (options.mode === 'albums' && !folders.length) report('incoming/', 'error', '没有选中可上传的专辑文件夹。');
  for (const entry of options.mode === 'albums' ? [] : assets.filter((entry) => !entry.isDirectory())) {
    report('incoming/', 'error', `${entry.name} 位于专辑文件夹之外；请将完整专辑与散装歌曲分批上传。`);
  }
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
      folders: options.mode === 'albums' ? folders.map((folder) => folder.name) : undefined,
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

export async function discoverUploadCandidates(root: string, mode: 'albums' | 'tracks'): Promise<UploadCandidate[]> {
  if (mode === 'albums') {
    const entries = await fs.readdir(path.join(root, 'incoming'), { withFileTypes: true });
    const candidates: UploadCandidate[] = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const inspected = await inspectIncoming(root, undefined, { mode, selectedPaths: [entry.name] });
      candidates.push({ path: entry.name, title: inspected.albums[0]?.name.en ?? entry.name,
        trackCount: inspected.albums[0]?.tracks.length ?? 0, issues: inspected.issues });
    }
    return candidates;
  }
  const issues: Array<{ source?: string; issue: UploadIssue }> = [];
  const tracks = await scanIncomingTracks(root, { id: 'incoming-tracks' }, {
    onIssue: (message, source) => issues.push({ source, issue: { album: source ?? '扫描器', level: message.includes('[critical]') ? 'error' : 'warning', message } }),
  });
  const files = (await incomingFiles(root)).filter((file) => SUPPORTED_AUDIO_EXTENSIONS.has(path.posix.extname(file).toLowerCase()));
  return files.map((file) => {
    const track = tracks.find((item) => incomingPath(item.file) === file);
    const localIssues = issues.filter((issue) => appliesTo(issue.source, [file])).map((issue) => issue.issue);
    if (!track) localIssues.push({ album: file, level: 'error', message: '音频无法读取，暂时不能上传。' });
    return { path: file, title: track?.title ?? path.posix.basename(file), trackCount: 1, issues: localIssues };
  });
}

export async function uploadMusic(root: string, target: string, store: UploadStore, options: UploadOptions = {}): Promise<UploadReport> {
  return withTargetSyncLock(target, async () => {
    const inspectionOptions = { mode: options.mode, selectedPaths: options.selectedPaths };
    let inspection = await inspectIncoming(root, undefined, inspectionOptions);
    let { albums, issues } = inspection;
    const report: UploadReport = {
      issues, newAlbums: [], newTracks: [], duplicates: [], changed: [], replacements: [],
      mediaUploads: [], archived: [], catalogChanged: false, dryRun: Boolean(options.dryRun),
      selectedSources: options.selectedPaths,
      selectedTrackCount: albums.reduce((sum, album) => sum + album.tracks.length, 0),
    };
    if (issues.some((issue) => issue.level === 'error')) {
      options.onReport?.(report, 'preflight');
      throw new Error('上传检查未通过；请修复上方 error 后重试。');
    }
    const remoteObject = await store.getText('catalog.json');
    const remote: PublishedCatalog = remoteObject ? parseRemoteCatalog(remoteObject.text) : { albums: [] };
    if (inspection.trackImport) {
      if (!remote.albums.length) throw new Error('云端还没有可追加歌曲的专辑；首次上传请按新专辑方式准备 album.json。');
      const albumId = options.albumId ?? await options.chooseAlbum?.(structuredClone(remote.albums));
      if (!albumId) throw new Error('尚未选择目标专辑；请在交互式终端运行 music:upload，或使用 --album <云端专辑ID>。');
      const existing = remote.albums.find((album) => album.id === albumId);
      if (!existing) throw new Error(`云端没有 ID 为 ${albumId} 的专辑；没有创建新专辑，请重新选择。`);
      inspection = await inspectIncoming(root, existing, inspectionOptions);
      if (!inspection.trackImport) throw new Error('选择专辑期间 incoming/ 的结构发生变化；请重新运行并检查上传方式。');
      ({ albums, issues } = inspection);
      report.selectedTrackCount = albums.reduce((sum, album) => sum + album.tracks.length, 0);
      report.issues = issues;
      report.targetAlbum = { id: existing.id, name: existing.name.en };
      if (issues.some((issue) => issue.level === 'error')) {
        options.onReport?.(report, 'preflight');
        throw new Error('上传检查未通过；请修复上方 error 后重试。');
      }
    } else if (options.albumId) {
      throw new Error('--album 用于没有 album.json 的歌曲批次；当前专辑文件夹会按各自 album.json 的 ID 上传，请勿混用。');
    }
    const built = await buildCatalog(root, albums, 'incoming', { preserveAlbumArtwork: inspection.trackImport });
    const incoming = parseRemoteCatalog(built.catalog);
    const merged: PublishedCatalog = structuredClone(remote);
    const selected = new Set<string>();
    const trackChanges = new Map<string, Set<string>>();
    const newAlbumIds = new Set<string>();
    const handledTracks = new Set<string>();
    const conflicts: Array<{ oldAlbum: PublishedAlbum; oldTrack: CatalogTrack; newTrack: CatalogTrack; conflict: UploadConflict }> = [];
    for (const album of incoming.albums) {
      const existing = merged.albums.find((item) => item.id === album.id);
      if (existing && options.mode === 'albums') throw new Error(`专辑「${existing.name.en}」已存在（${album.id}）；请返回并选择“给已有专辑追加歌曲”。`);
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
          handledTracks.add(track.id);
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
          handledTracks.add(track.id);
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
      if ((await options.chooseReplacement?.(item.conflict)) !== 'replace') continue;
      // Retain published metadata and optional assets unless a new optional asset was supplied.
      const replacement = { ...item.oldTrack, file: item.newTrack.file,
        lyricsUrl: item.newTrack.lyricsUrl ?? item.oldTrack.lyricsUrl,
        artwork: item.newTrack.artwork ?? item.oldTrack.artwork };
      item.oldAlbum.tracks[item.oldAlbum.tracks.indexOf(item.oldTrack)] = replacement;
      trackChanges.get(item.oldAlbum.id)!.add(item.newTrack.id);
      report.replacements.push(`${item.oldAlbum.name.en} / ${item.newTrack.title}`);
      handledTracks.add(item.newTrack.id);
      for (const key of mediaKeysForTrack(item.newTrack)) selected.add(key);
    }
    const archive = inspection.trackImport ? await planSongArchive(root, inspection.allTracks ?? albums[0]!.tracks,
      albums[0]!.tracks.filter((track) => handledTracks.has(track.id))) : undefined;
    report.archivePaths = archive ? archive.map((file) => `uploaded/${file.relative}${file.keep ? '（复制，原文件保留）' : ''}`)
      : albums.map((album) => `uploaded/${album.folder}/`);
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
    if (archive) await verifySongArchive(root, archive);
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
    let publishedCatalog = remoteObject?.text;
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
      publishedCatalog = catalog;
    }
    // Even a duplicate-only batch must still exist in the current cloud catalog before local archival.
    const published = await store.getText('catalog.json');
    if (published?.text !== publishedCatalog) throw new Error('catalog 发布或归档前校验失败；incoming/ 保留，请检查 R2 后重试。');
    const destination = path.join(root, 'uploaded');
    if (archive) {
      report.archived = await archiveSongs(root, archive);
      return report;
    }
    await fs.mkdir(destination, { recursive: true });
    for (const entry of albums.map((album) => album.folder)) {
      const source = path.join(root, 'incoming', entry);
      const targetFolder = path.join(destination, entry);
      try {
        await fs.lstat(targetFolder);
        throw new Error(`uploaded/${entry} 已存在；云端已发布，本地 incoming/ 保留，请手动整理。`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await fs.rename(source, targetFolder);
      report.archived.push(targetFolder);
    }
    return report;
  }, { onWaiting: options.onLockWait });
}
