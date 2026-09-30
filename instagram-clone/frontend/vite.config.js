import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Frontend calls /api/* which Vite forwards to the instagram-clone API
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Backend-served uploaded media (local-disk fallback when Cloudinary is off)
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
