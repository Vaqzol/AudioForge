import { defineConfig } from 'vite';

export default defineConfig({
  // Dev server config
  server: {
    headers: {
      // Required for SharedArrayBuffer (multi-threaded ffmpeg)
      // Not strictly needed for single-thread core, but good practice
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Build optimization
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  // Optimize dependencies
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
