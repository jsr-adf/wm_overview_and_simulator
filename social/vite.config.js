import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/social/',
  build: {
    outDir: '../social-dist',
    emptyOutDir: true,
  },
});
