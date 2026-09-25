import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { audioLibraryPlugin } from './plugins/audio-library-vite';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  // Dev serves local audio outside public; production fetches the R2 catalog at runtime.
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
