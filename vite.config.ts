import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { audioLibraryPlugin } from './plugins/audio-library-vite';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  // audioLibraryPlugin 会在启动与构建前扫描 public/audio，自动生成曲目清单。
  // 往 public/audio/<专辑名>/ 里丢歌即可，不需要跑命令、不需要改代码。
  plugins: [audioLibraryPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
