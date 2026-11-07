import { defineConfig } from 'vite';
import { resolve } from 'path';

// Content scripts are injected as classic scripts, so bundle everything (including the
// shared editor) into one self-contained IIFE next to the main build output.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'PramanaContent',
      fileName: () => 'content.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
  },
});
