import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zip from 'vite-plugin-zip-pack';
import manifest from './src/manifest.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [crx({ manifest }), zip({ outDir: 'release', outFileName: 'weread-v2.zip' })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    cors: {
      origin: [/chrome-extension:\/\//, /moz-extension:\/\//],
    },
  },
});
