import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import type { Plugin } from 'vite';
import {
  AUDIO_DIRECTORY,
  CATALOG_FILE,
  generateAudioLibrary,
  PREVIEW_CATALOG,
} from './audio-library.ts';
import {
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_LYRIC_EXTENSIONS,
} from './audio-library-core.ts';

/** Vite lifecycle and watcher adapter for the build-time catalog scanner. */
export function audioLibraryPlugin(): Plugin {
  let root = process.cwd();
  let devServer: import('vite').ViteDevServer | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scanPromise: Promise<void> | undefined;
  let scanAgain = false;
  let nextLabel = '文件更新';

  const scan = async (label: string): Promise<void> => {
    if (scanPromise) {
      scanAgain = true;
      nextLabel = label;
      return scanPromise;
    }
    scanPromise = (async () => {
      let currentLabel = label;
      do {
        scanAgain = false;
        try {
          const result = await generateAudioLibrary(root);
          console.log(`[audio-library] ${currentLabel}: ${result.folders} 张专辑，${result.total} 首曲目（完整音频 ${result.owned} 首）`);
          devServer?.ws.send({ type: 'custom', event: 'catalog-updated' });
        } catch (error) {
          console.error('[audio-library] 扫描失败:', error);
          // A newer filesystem event may have removed the cause of this failure.
          // Keep the dirty pass instead of dropping it with the failed scan.
          if (!scanAgain) throw error;
        }
        currentLabel = nextLabel;
      } while (scanAgain);
    })();
    try {
      await scanPromise;
    } finally {
      scanPromise = undefined;
    }
  };

  return {
    name: 'ts-audio-library',
    configResolved(config) { root = config.root; },
    async configureServer(server) {
      devServer = server;
      const audioRoot = path.resolve(root, AUDIO_DIRECTORY);
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (pathname === `/${CATALOG_FILE}`) {
          try {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(await fsp.readFile(path.join(root, CATALOG_FILE)));
          } catch { res.statusCode = 404; res.end(); }
          return;
        }
        if (!pathname?.startsWith('/audio/')) return next();
        try {
          const parts = pathname.slice('/audio/'.length).split('/').map(decodeURIComponent);
          if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('/'))) throw new Error('Invalid media path');
          const candidate = path.resolve(audioRoot, ...parts);
          const realRoot = await fsp.realpath(audioRoot);
          const realFile = await fsp.realpath(candidate);
          if (!realFile.startsWith(realRoot + path.sep)) throw new Error('Outside audio directory');
          const stat = await fsp.stat(realFile);
          if (!stat.isFile()) throw new Error('Not a file');
          const mime: Record<string, string> = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.lrc': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.avif': 'image/avif' };
          res.setHeader('Content-Type', mime[path.extname(realFile).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('Accept-Ranges', 'bytes');
          const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
          let start = range?.[1] ? Number(range[1]) : 0;
          let end = range?.[2] ? Number(range[2]) : stat.size - 1;
          if (range && !range[1] && range[2]) { start = Math.max(0, stat.size - Number(range[2])); end = stat.size - 1; }
          if (start < 0 || end < start || start >= stat.size || end >= stat.size) { res.statusCode = 416; res.end(); return; }
          if (range) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`); }
          res.setHeader('Content-Length', end - start + 1);
          if (req.method === 'HEAD') { res.end(); return; }
          fs.createReadStream(realFile, { start, end }).pipe(res);
        } catch { res.statusCode = 404; res.end(); }
      });
      await scan('开发服务器启动扫描');

      const onChange = (changedPath: string, isDirectory = false) => {
        const absolutePath = path.resolve(changedPath);
        const relative = path.relative(audioRoot, absolutePath);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
        if (!isDirectory) {
          const extension = path.extname(changedPath).toLowerCase();
          const base = path.basename(changedPath).toLowerCase();
          const relevant = SUPPORTED_AUDIO_EXTENSIONS.has(extension)
            || SUPPORTED_LYRIC_EXTENSIONS.has(extension)
            || SUPPORTED_IMAGE_EXTENSIONS.has(extension)
            || base === 'album.json' || base === PREVIEW_CATALOG;
          if (!relevant) return;
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          void scan('文件变化后扫描').catch(() => undefined);
        }, 250);
      };

      // A single recursive watcher avoids Windows EBUSY when a large audio file
      // is still being copied and Vite tries to watch that unfinished file.
      await fsp.mkdir(audioRoot, { recursive: true });
      const audioWatcher = fs.watch(audioRoot, { recursive: true }, (_event, filename) => {
        if (filename) {
          const changed = filename.toString();
          onChange(path.join(audioRoot, changed), !path.extname(changed));
        }
        else onChange(audioRoot, true);
      });
      audioWatcher.on('error', (error) => {
        console.error('[audio-library] audio directory watcher failed:', error);
      });
      server.httpServer?.once('close', () => {
        devServer = undefined;
        clearTimeout(timer);
        audioWatcher.close();
      });
    },
  };
}
