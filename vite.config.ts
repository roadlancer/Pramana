import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/icons',
          dest: 'icons',
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        dashboard: resolve(__dirname, 'src/dashboard/index.html'),
        editor: resolve(__dirname, 'src/editor/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'popup') return 'src/popup/[name].js';
          if (chunkInfo.name === 'dashboard') return 'src/dashboard/[name].js';
          if (chunkInfo.name === 'editor') return 'src/editor/[name].js';
          if (chunkInfo.name === 'background') return '[name].js';
          if (chunkInfo.name === 'content') return '[name].js';
          return 'src/shared/[name].js';
        },
        chunkFileNames: 'src/shared/[name]-[hash].js',
        assetFileNames: 'src/shared/[name]-[hash].[ext]',
        manualChunks(id) {
          if (id.includes('shared/editor') && id.endsWith('.ts') && !id.includes('types')) {
            return undefined;
          }
        },
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
