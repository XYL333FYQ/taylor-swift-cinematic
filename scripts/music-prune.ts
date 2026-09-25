import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { planMusicPrune } from './music-sync-core.ts';

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

const safeRequestError = (key: string, error: unknown): Error => {
  const response = error as { $metadata?: { httpStatusCode?: number } };
  const status = response?.$metadata?.httpStatusCode;
  return new Error(`R2 HeadObject failed${status ? ` (HTTP ${status})` : ''} for ${key}.`);
};

export async function runMusicPrunePreview(): Promise<void> {
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
    const plan = await planMusicPrune(process.cwd(), `${endpoint}|${bucket}`, {
      async head(key) {
        try {
          const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          return { contentLength: response.ContentLength };
        } catch (error) {
          if (missingObject(error)) return null;
          throw safeRequestError(key, error);
        }
      },
    });
    console.log(`[music:prune] scanned ${plan.albums} albums; ${plan.objects.length} remote media object(s), ${(plan.totalBytes / 1_000_000_000).toFixed(3)} GB may be stale.`);
    for (const object of plan.objects) console.log(`  ${object.key} — ${object.size.toLocaleString('en-US')} bytes`);
    if (plan.alreadyAbsent > 0) console.log(`[music:prune] ${plan.alreadyAbsent} historical managed object(s) are already absent.`);
    console.log('[music:prune] read-only preview; no R2 objects or catalog changed. Use music:sync to apply safe cleanup.');
  } finally {
    client.destroy();
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try { await runMusicPrunePreview(); }
  catch (error) {
    console.error(`[music:prune] ${error instanceof Error ? error.message : 'Preview failed.'}`);
    process.exitCode = 1;
  }
}
