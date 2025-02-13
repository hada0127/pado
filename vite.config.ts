import { defineConfig } from 'vite';
import padoDevPlugin from './pado/vite/viteDevPlugin';
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
  plugins: [padoDevPlugin()]
}); 