import { watch as watchDirectory, type FSWatcher } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runMusicSync } from './music-sync.ts';

export interface SerializedSyncQueue {
  notify(): void;
  close(): Promise<void>;
}

export function createSerializedSyncQueue(options: {
  runSync: () => Promise<unknown>;
  waitForStable: (signal: AbortSignal) => Promise<void>;
  debounceMs?: number;
  onError: (error: unknown) => void;
}): SerializedSyncQueue {
  const debounceMs = options.debounceMs ?? 1000;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let closed = false;
  let pending = false;
  let activeController: AbortController | undefined;
  const closeWaiters: Array<() => void> = [];

  const finishCloseWaiters = () => {
    if (running) return;
    while (closeWaiters.length > 0) closeWaiters.pop()?.();
  };

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void drain();
    }, debounceMs);
  };

  const drain = async () => {
    if (closed || running || !pending) return;
    running = true;
    pending = false;
    const controller = new AbortController();
    activeController = controller;
    try {
      await options.waitForStable(controller.signal);
      // Events received while settling restart the debounce/stability window.
      if (!closed && !pending) await options.runSync();
    } catch (error) {
      if (!closed) options.onError(error);
    } finally {
      activeController = undefined;
      running = false;
      if (pending && !closed) schedule();
      finishCloseWaiters();
    }
  };

  return {
    notify() {
      if (closed) return;
      pending = true;
      schedule();
    },
    close() {
      closed = true;
      pending = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      activeController?.abort();
      if (!running) return Promise.resolve();
      return new Promise<void>((resolveClose) => closeWaiters.push(resolveClose));
    },
  };
}

async function audioTreeSnapshot(audioRoot: string): Promise<string> {
  const records: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        records.push(`d:${path.relative(audioRoot, fullPath)}`);
        await visit(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          records.push(`f:${path.relative(audioRoot, fullPath)}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  };
  await visit(audioRoot);
  return records.sort().join('\n');
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveDelay, rejectDelay) => {
    if (signal.aborted) { rejectDelay(new Error('Watch stopped.')); return; }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolveDelay();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      rejectDelay(new Error('Watch stopped.'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function waitForStableAudioTree(
  audioRoot: string,
  signal: AbortSignal,
  options: { pollMs?: number; stableIntervals?: number } = {},
): Promise<void> {
  const pollMs = options.pollMs ?? 1000;
  const stableIntervals = options.stableIntervals ?? 5;
  let previous = await audioTreeSnapshot(audioRoot);
  let stable = 0;
  while (stable < stableIntervals) {
    await delay(pollMs, signal);
    if (signal.aborted) return;
    const current = await audioTreeSnapshot(audioRoot);
    if (current === previous) stable++;
    else { previous = current; stable = 0; }
  }
}

function closeWatcher(watcher: FSWatcher): void {
  watcher.close();
}

export async function runMusicWatch(): Promise<void> {
  const audioRoot = path.join(process.cwd(), 'audio');
  const stat = await fs.stat(audioRoot).catch(() => undefined);
  if (!stat?.isDirectory()) throw new Error('audio/ is missing or unreadable; music:watch cannot start.');

  const watcherRef: { current?: FSWatcher } = {};
  let stopping = false;
  let resolveStopped: (() => void) | undefined;
  const stopped = new Promise<void>((resolveStop) => { resolveStopped = resolveStop; });
  const queue = createSerializedSyncQueue({
    runSync: runMusicSync,
    waitForStable: (signal) => waitForStableAudioTree(audioRoot, signal),
    debounceMs: 1000,
    onError(error) {
      console.error(`[music:watch] ${error instanceof Error ? error.message : 'Synchronization failed.'}`);
    },
  });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (watcherRef.current) closeWatcher(watcherRef.current);
    void queue.close().finally(() => resolveStopped?.());
  };
  const activeWatcher = watchDirectory(audioRoot, { recursive: true }, () => queue.notify());
  watcherRef.current = activeWatcher;
  activeWatcher.on('error', (error) => {
    console.error(`[music:watch] filesystem watcher failed: ${error.message}`);
    process.exitCode = 1;
    stop();
  });
  const onInterrupt = () => {
    console.log('[music:watch] stopping; waiting for the current sync to finish safely.');
    stop();
  };
  process.once('SIGINT', onInterrupt);
  console.log('[music:watch] watching audio/; changes are debounced and sync runs one at a time. Press Ctrl+C to stop.');
  queue.notify(); // Reconcile changes that may have happened since the previous watch session.
  await stopped;
  process.off('SIGINT', onInterrupt);
  console.log('[music:watch] stopped.');
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule) {
  try { await runMusicWatch(); }
  catch (error) {
    console.error(`[music:watch] ${error instanceof Error ? error.message : 'Watcher failed.'}`);
    process.exitCode = 1;
  }
}
