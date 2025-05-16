import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait()
  ],
  server: {
    host: '0.0.0.0',
    port: 12000,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    cors: true,
    allowedHosts: true
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['wasm-feature-detect']
  }
});