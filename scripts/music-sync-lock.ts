import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

interface LockOwner { pid: number; token: string }

const LOCK_POLL_MS = 200;
const MALFORMED_LOCK_GRACE_MS = 10_000;

function lockFileForTarget(target: string): string {
  const targetHash = createHash('sha256').update(target).digest('hex');
  return path.join(os.tmpdir(), 'taylor-swift-cinematic-sync-locks', `${targetHash}.lock`);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function removeDeadLock(lockPath: string): Promise<void> {
  let observed: Buffer;
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    [observed, stat] = await Promise.all([fs.readFile(lockPath), fs.stat(lockPath)]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  let owner: LockOwner | undefined;
  try {
    const parsed = JSON.parse(observed.toString('utf8')) as Partial<LockOwner>;
    if (Number.isSafeInteger(parsed.pid) && typeof parsed.token === 'string') owner = parsed as LockOwner;
  } catch {
    // A process may have created the exclusive file but not written its owner yet.
  }
  if (owner && processIsAlive(owner.pid)) return;
  if (!owner && Date.now() - stat.mtimeMs < MALFORMED_LOCK_GRACE_MS) return;

  try {
    const current = await fs.readFile(lockPath);
    if (current.equals(observed)) await fs.unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function withTargetSyncLock<T>(
  target: string,
  action: () => Promise<T>,
  options: { onWaiting?: () => void; pollMs?: number } = {},
): Promise<T> {
  const lockPath = lockFileForTarget(target);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const token = randomUUID();
  let waiting = false;
  let ownsLock = false;

  while (!ownsLock) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: Date.now() })); }
      finally { await handle.close(); }
      ownsLock = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await removeDeadLock(lockPath);
      if (!waiting) {
        waiting = true;
        options.onWaiting?.();
      }
      await delay(options.pollMs ?? LOCK_POLL_MS);
    }
  }

  try {
    return await action();
  } finally {
    try {
      const owner = JSON.parse(await fs.readFile(lockPath, 'utf8')) as Partial<LockOwner>;
      if (owner.token === token) await fs.unlink(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[music:sync] could not release target lock: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
  }
}
