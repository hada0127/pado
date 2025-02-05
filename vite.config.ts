import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  server: {
    open: true
  },
  build: {
    outDir: '../dist'
  }
}); 