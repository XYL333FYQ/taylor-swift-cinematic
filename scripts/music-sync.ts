import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { syncMusic, type MusicPrunePlan, type ObjectUpload } from './music-sync-core.ts';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. See .env.example and docs/cloudflare-r2-setup.md.`);
  return value;
};

const missingObject = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const response = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return response.$metadata?.httpStatusCode === 404 || response.name === 'NotFound' || response.name === 'NoSuchKey';
};

const safeRequestError = (operation: string, key: string, error: unknown): Error => {
  const response = error as { $metadata?: { httpStatusCode?: number } };
  const status = response?.$metadata?.httpStatusCode;
  return new Error(`R2 ${operation} failed${status ? ` (HTTP ${status})` : ''} for ${key}.`);
};

async function confirmPrune(plan: MusicPrunePlan): Promise<boolean> {
  console.log(`[music:sync] ${plan.objects.length} remote media object(s), ${(plan.totalBytes / 1_000_000_000).toFixed(3)} GB need manual cleanup confirmation.`);
  for (const reason of plan.reasons) console.log(`  confirmation required: ${reason}`);
  for (const object of plan.objects) console.log(`  ${object.key} — ${object.size.toLocaleString('en-US')} bytes`);
  console.log('[music:sync] The new catalog is already published; declining leaves these objects and their sync-state records pending.');
  if (!stdin.isTTY || !stdout.isTTY) {
    console.log('[music:sync] no interactive terminal; cleanup deferred.');
    return false;
  }

  const expected = `DELETE ${plan.confirmationToken}`;
  const readline = createInterface({ input: stdin, output: stdout });
  let answer = '';
  try { answer = await readline.question(`[music:sync] Type exactly ${expected} to delete these managed objects: `); }
  finally { readline.close(); }
  return answer.trim() === expected;
}

export async function runMusicSync(): Promise<void> {
  const endpoint = process.env.R2_ENDPOINT?.trim()
    || `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
  const bucket = required('R2_BUCKET_NAME');
  const client = new S3Client({
    endpoint,
    region: 'auto',
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });

  try {
    const result = await syncMusic(process.cwd(), `${endpoint}|${bucket}`, {
      async put(object: ObjectUpload) {
        try {
          await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: object.key,
            Body: object.body,
            ContentLength: object.contentLength,
            ContentType: object.contentType,
            CacheControl: object.cacheControl,
          }));
        } catch (error) { throw safeRequestError('PutObject', object.key, error); }
        if (object.key !== 'catalog.json') console.log(`[music:sync] uploaded ${object.key}`);
      },
      async head(key: string) {
        try {
          const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          return { contentLength: response.ContentLength };
        } catch (error) {
          if (missingObject(error)) return null;
          throw safeRequestError('HeadObject', key, error);
        }
      },
      async delete(key: string) {
        try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
        catch (error) { throw safeRequestError('DeleteObject', key, error); }
      },
    }, { confirmPrune });

    console.log(`[music:sync] ${result.albums} albums; plan ${result.added} new, ${result.modified} changed, ${result.skipped} unchanged, ${result.cleanupCandidates} stale object(s); ${result.uploaded} media uploaded; catalog ${result.catalogUploaded ? 'published' : 'unchanged'}; ${result.deleted} stale media deleted.`);
    if (result.deletionDeferred) console.log(`[music:sync] cleanup deferred; ${result.pendingDeletes} managed key(s) remain pending confirmation.`);
    if (result.warnings.length > 0) console.log(`[music:sync] ${result.warnings.length} scan warning(s) require manual cleanup confirmation.`);
  } finally {
    client.destroy();
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try { await runMusicSync(); }
  catch (error) {
    console.error(`[music:sync] ${error instanceof Error ? error.message : 'Synchronization failed.'}`);
    process.exitCode = 1;
  }
}
