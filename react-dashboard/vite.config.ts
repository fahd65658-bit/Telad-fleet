import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.NODE_ENV === 'production' ? 'https://api.fna.sa' : 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.NODE_ENV === 'production' ? 'https://api.fna.sa' : 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
