import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src',
  server: {
    open: true
  },
  build: {
    outDir: '../dist',
    lib: {
      entry: path.resolve(__dirname, 'pado/pado.ts'),
      name: 'pado',
      fileName: (format) => `pado.${format}.js`
    }
  },
  resolve: {
    alias: {
      '@pado': path.resolve(__dirname, 'pado')
    }
  }
}); 