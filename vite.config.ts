import { defineConfig } from 'vite';
import pado from './pado/vite-plugin-pado';
import path from 'path';

export default defineConfig({
  root: 'src',
  base: '/',
  server: {
    open: true
  },
  resolve: {
    alias: [
      {
        find: '@pado',
        replacement: path.resolve(__dirname, 'pado/pado.ts')
      }
    ]
  },
  plugins: [pado()]
}); 