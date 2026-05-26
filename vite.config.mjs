import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname, 'public'),
  envDir: __dirname,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020'
  },
  server: {
    port: 3334,
    host: true,
    proxy: {
      '/api': 'http://localhost:3333',
      '/ws': { target: 'ws://localhost:3333', ws: true }
    }
  }
});
