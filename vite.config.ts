import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Extension pages and the background worker. The content script is built separately
// (vite.content.config.ts) because it must be a single classic script with no imports.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        dashboard: resolve(__dirname, 'src/dashboard/index.html'),
        editor: resolve(__dirname, 'src/editor/index.html'),
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
        recorder: resolve(__dirname, 'src/recorder/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return '[name].js';
          if (['popup', 'dashboard', 'editor', 'offscreen', 'recorder'].includes(chunkInfo.name)) return `src/${chunkInfo.name}/[name].js`;
          return 'src/shared/[name].js';
        },
        chunkFileNames: 'src/shared/[name]-[hash].js',
        assetFileNames: 'src/shared/[name]-[hash].[ext]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
