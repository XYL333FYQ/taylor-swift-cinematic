import * as fs from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { SUPPORTED_AUDIO_EXTENSIONS } from '../plugins/audio-library-core.ts';
import type { CatalogTrack } from '../plugins/audio-library.ts';

export function incomingPath(url: string): string {
  if (!url.startsWith('incoming/')) throw new Error(`不是本地上传文件：${url}`);
  const parts = url.slice('incoming/'.length).split('/').map(decodeURIComponent);
  if (parts.some((part) => !part || part === '.' || part === '..' || /[\\/]/.test(part))) throw new Error('上传文件路径无效。');
  return parts.join('/');
}

export async function incomingFiles(root: string, inaccessible: string[] = []): Promise<string[]> {
  const result: string[] = [];
  const visit = async (relative: string) => {
    const entries = await fs.readdir(path.join(root, 'incoming', relative), { withFileTypes: true }).catch((error: unknown) => {
      if (!relative) throw error;
      inaccessible.push(relative);
      return [];
    });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.gitkeep') continue;
      const file = [relative, entry.name].filter(Boolean).join('/');
      if (entry.isSymbolicLink()) { inaccessible.push(file); continue; } // Never archive their targets.
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) result.push(file);
    }
  };
  await visit('');
  return result;
}

async function digest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export interface ArchiveFile { relative: string; keep: boolean; hash: string }
const resources = (track: CatalogTrack) => [track.file, track.lyricsUrl, track.artwork]
  .filter((url): url is string => Boolean(url)).map(incomingPath);

async function safeSource(root: string, relative: string): Promise<string> {
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[\\:]/.test(part))) throw new Error('归档源路径无效。');
  for (let index = 0; index <= parts.length; index++) {
    const current = path.join(root, 'incoming', ...parts.slice(0, index));
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || (index < parts.length ? !stat.isDirectory() : !stat.isFile()))
      throw new Error(`归档源路径发生变化：incoming/${relative}，请重新运行。`);
  }
  return path.join(root, 'incoming', ...parts);
}

async function safeDestination(root: string, relative: string): Promise<string> {
  const archiveRoot = path.join(root, 'uploaded');
  const parts = relative.split('/');
  for (let index = 0; index <= parts.length; index++) {
    const current = path.join(archiveRoot, ...parts.slice(0, index));
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || (index < parts.length && !stat.isDirectory())) throw new Error(`归档路径不可用：uploaded/${relative}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return path.join(archiveRoot, ...parts);
}

async function checkDestination(root: string, file: ArchiveFile): Promise<boolean> {
  const destination = await safeDestination(root, file.relative);
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isFile() || await digest(destination) !== file.hash)
      throw new Error(`归档冲突：uploaded/${file.relative} 已存在且内容不同，请先整理该文件。`);
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return false; }
}

/** Plan only handled songs; retained songs protect any resources they still reference. */
export async function planSongArchive(root: string, allTracks: CatalogTrack[], handled: CatalogTrack[]): Promise<ArchiveFile[]> {
  const inaccessible: string[] = [];
  const files = await incomingFiles(root, inaccessible);
  const handledAudio = new Set(handled.map((track) => incomingPath(track.file)));
  const retained = new Set(allTracks.filter((track) => !handledAudio.has(incomingPath(track.file))).flatMap(resources));
  const selected = new Set(handled.flatMap(resources));
  const audioFiles = files.filter((file) => SUPPORTED_AUDIO_EXTENSIONS.has(path.posix.extname(file).toLowerCase()));
  // Fully processed song subtrees also retain their original notes and other support files.
  const completeDirectories = new Set<string>();
  for (const audio of handledAudio) {
    let directory = path.posix.dirname(audio);
    while (directory !== '.') {
      if (!inaccessible.some((file) => file === directory || file.startsWith(directory + '/'))
        && audioFiles.filter((file) => file.startsWith(directory + '/')).every((file) => handledAudio.has(file))) completeDirectories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  for (const file of files) {
    if ([...completeDirectories].some((directory) => file.startsWith(directory + '/'))) selected.add(file);
  }
  const plan: ArchiveFile[] = [];
  for (const relative of [...selected].sort()) {
    const file = { relative, keep: retained.has(relative), hash: await digest(await safeSource(root, relative)) };
    await checkDestination(root, file);
    plan.push(file);
  }
  return plan;
}

export async function verifySongArchive(root: string, plan: ArchiveFile[]): Promise<void> {
  for (const file of plan) {
    if (await digest(await safeSource(root, file.relative)) !== file.hash) throw new Error(`归档文件发生变化：${file.relative}，请重新运行。`);
    await checkDestination(root, file);
  }
}

export async function archiveSongs(root: string, plan: ArchiveFile[]): Promise<string[]> {
  await verifySongArchive(root, plan);
  for (const file of plan) {
    const source = await safeSource(root, file.relative);
    const destination = await safeDestination(root, file.relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (!await checkDestination(root, file)) {
      try { await fs.copyFile(source, destination, constants.COPYFILE_EXCL); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    // Exclusive copies protect existing archives; readback precedes removing the source.
    await checkDestination(root, file);
    if (await digest(source) !== file.hash) throw new Error(`归档期间文件发生变化：${file.relative}；原文件已保留。`);
    if (!file.keep) await fs.unlink(await safeSource(root, file.relative));
  }
  const directories = new Set(plan.flatMap((file) => {
    const result: string[] = [];
    let directory = path.posix.dirname(file.relative);
    while (directory !== '.') { result.push(directory); directory = path.posix.dirname(directory); }
    return result;
  }));
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    try { await fs.rmdir(path.join(root, 'incoming', directory)); }
    catch (error) { if (!['ENOTEMPTY', 'ENOENT', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
  }
  return [...new Set(plan.map((file) => path.join(root, 'uploaded', file.relative.split('/')[0]!)))];
}
