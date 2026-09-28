import { createHash } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ObjectUpload, Uploader } from './music-sync-core.ts';

export interface RemoteText { text: string; etag?: string }
export interface RemoteHash { hash: string; size: number }
export interface MusicR2Store extends Uploader {
  getText(key: string): Promise<RemoteText | null>;
  hash(key: string): Promise<RemoteHash | null>;
  close(): void;
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. See .env.example and docs/CLOUDFLARE_R2.md.`);
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
  if (status === 412 && key === 'catalog.json') return new Error('R2 catalog.json 在上传期间发生变化；没有覆盖新版目录。请重新运行 music:upload 预览并重试。');
  return new Error(`R2 ${operation} failed${status ? ` (HTTP ${status})` : ''} for ${key}.`);
};

export function createMusicR2Store(): { target: string; store: MusicR2Store } {
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
  const store: MusicR2Store = {
    async put(object: ObjectUpload) {
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: object.key,
          Body: object.body,
          ContentLength: object.contentLength,
          ContentType: object.contentType,
          CacheControl: object.cacheControl,
          IfMatch: object.ifMatch,
          IfNoneMatch: object.ifNoneMatch,
        }));
      } catch (error) { throw safeRequestError('PutObject', object.key, error); }
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
    async getText(key: string) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if ((response.ContentLength ?? 0) > 10_000_000) throw new Error('Catalog exceeds the 10 MB safety limit.');
        if (!response.Body) throw new Error('Object response has no body.');
        return { text: await response.Body.transformToString(), etag: response.ETag };
      } catch (error) {
        if (missingObject(error)) return null;
        if (error instanceof Error && (error.message.includes('10 MB safety limit') || error.message.includes('no body'))) throw error;
        throw safeRequestError('GetObject', key, error);
      }
    },
    async hash(key: string) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!response.Body) throw new Error('Object response has no body.');
        const hash = createHash('sha256');
        let size = 0;
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          hash.update(chunk);
          size += chunk.length;
        }
        if (response.ContentLength !== undefined && response.ContentLength !== size) {
          throw new Error('Remote object length changed while reading.');
        }
        return { hash: hash.digest('hex'), size };
      } catch (error) {
        if (missingObject(error)) return null;
        throw safeRequestError('GetObject', key, error);
      }
    },
    async delete(key: string) {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
      catch (error) { throw safeRequestError('DeleteObject', key, error); }
    },
    close() { client.destroy(); },
  };
  return { target: `${endpoint}|${bucket}`, store };
}
