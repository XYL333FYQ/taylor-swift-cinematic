import * as path from 'node:path';
import type { Plugin } from 'vite';
import {
  AUDIO_DIRECTORY,
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
    async buildStart() { await scan('构建前扫描'); },
    async configureServer(server) {
      const audioRoot = path.resolve(root, AUDIO_DIRECTORY);
      server.watcher.add(audioRoot);
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

      const onFile = (file: string) => onChange(file);
      const onDirectory = (directory: string) => onChange(directory, true);
      for (const event of ['add', 'unlink', 'change'] as const) server.watcher.on(event, onFile);
      for (const event of ['addDir', 'unlinkDir'] as const) server.watcher.on(event, onDirectory);
      server.httpServer?.once('close', () => {
        clearTimeout(timer);
        for (const event of ['add', 'unlink', 'change'] as const) server.watcher.off(event, onFile);
        for (const event of ['addDir', 'unlinkDir'] as const) server.watcher.off(event, onDirectory);
      });
    },
  };
}
