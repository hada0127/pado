import { defineConfig } from 'vite';
import path from 'path';
import padoPlugin from './pado/vite-plugin-pado';

export default defineConfig({
  root: 'src',
  server: {
    open: true
  },
  resolve: {
    alias: {
      '@pado': path.resolve(__dirname, 'pado/pado.ts')
    }
  },
  plugins: [padoPlugin()]
}); 