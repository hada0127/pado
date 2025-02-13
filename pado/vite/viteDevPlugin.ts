import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { transformWithEsbuild } from 'vite';
import { publicMimeTypes } from '../settings/publicMimeTypes';
import { cacheDir, handleRelatedFiles } from './makeCaches';
import { getHtmlFromCache } from './getHtmlFromCache';
import { getActualPath, replaceAsync } from './utils';

export default function padoPlugin(): Plugin {
  // 캐시 디렉토리 생성
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  return {
    name: 'vite-plugin-pado',
    buildStart() {
      // 초기 실행시 캐시 디렉토리 생성
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
    },
    configureServer(server) {
      // 파일 변경 감지
      const watcher = server.watcher;
      const doFileWatchAction = async (file: string) => {
        if (file.match(/\.(pado|ts|module\.scss)$/)) {
          await handleRelatedFiles(file);
          server.moduleGraph.invalidateAll();
          server.ws.send({
            type: 'full-reload'
          });
        }
      };
      watcher.on('change', async (file) => {
        doFileWatchAction(file);
      });

      watcher.on('unlink', async (file) => {
        doFileWatchAction(file);
      });

      watcher.on('add', async (file) => {
        doFileWatchAction(file);
      });

      // 라우팅 처리 추가
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.method === 'GET') {
          // pado.js 파일 요청 처리
          if (req.url === '/pado/pado.js') {
            const padoTsPath = path.join(process.cwd(), 'pado/pado.ts');
            if (fs.existsSync(padoTsPath)) {
              try {
                const content = fs.readFileSync(padoTsPath, 'utf-8');
                const result = await transformWithEsbuild(content, padoTsPath, {
                  loader: 'ts',
                  target: 'es2020',
                  format: 'esm',
                  minify: true
                });
                res.setHeader('Content-Type', 'application/javascript');
                res.end(result.code);
                return;
              } catch (error) {
                console.error('Error compiling pado.ts:', error);
              }
            }
          }

          // 미들웨어에서 Content-Type 헤더 설정
          if (req.url.startsWith('/@vite/')) {
            // Vite 내부 모듈 요청은 그대로 통과
            next();
            return;
          }

          if (req.url.startsWith('/cache/')) {
            const jsPath = path.join(cacheDir, req.url.replace('/cache/', ''));
            if (fs.existsSync(jsPath)) {
              const content = fs.readFileSync(jsPath, 'utf-8');
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
              res.end(content);
              return;
            }
          }

          // public 폴더 내 파일 요청 처리
          const publicPath = path.join(process.cwd(), 'public', req.url);
          if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
            const ext = path.extname(publicPath).toLowerCase();
            const contentType = publicMimeTypes[ext] || 'application/octet-stream';
            
            res.setHeader('Content-Type', contentType);
            fs.createReadStream(publicPath).pipe(res);
            return;
          }

          // 기존 .pado 파일 처리
          const urlPath = req.url === '/' ? '/page' : req.url;
          const { path: actualPath, params } = getActualPath(urlPath);
          
          if (actualPath) {
            const padoPath = path.join(process.cwd(), actualPath, 'page.pado');
            
            if (fs.existsSync(padoPath)) {
              const cachePath = path.join(
                cacheDir,
                'app',
                actualPath.replace(/^src\/app\/?/, ''),
                'page.json'
              ).replace(/\\/g, '/');

              // 캐시 파일이 없으면 생성
              if (!fs.existsSync(cachePath)) {
                await handleRelatedFiles(padoPath);
              }
              console.log('middleware', cachePath);

              if (fs.existsSync(cachePath)) {
                // 헬퍼 함수를 사용하여 전체 HTML 문서 생성 (params 포함)
                const html = getHtmlFromCache(cachePath, { fullPage: true, params });
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(html);
                return;
              }
            }
          }
        }
        next();
      });
    },
    
    async transformIndexHtml(html: string, { filename }) {
      return replaceAsync(
        html,
        /<!--\s*@pado\s+src="([^"]+)"\s*-->/g,
        async (_, src) => {
          const padoPath = path.resolve(path.dirname(filename), src);
          const relativePath = path.relative(process.cwd(), padoPath);
          
          if (relativePath.startsWith('src/app')) {
            const cachePath = path.join(
              cacheDir,
              relativePath.replace(/^src\/app/, 'app').replace(/\.[^.]+$/, '.json')
            );
            if (!fs.existsSync(cachePath)) {
              await handleRelatedFiles(padoPath);
            }
            console.log('transformIndexHtml', cachePath);

            if (fs.existsSync(cachePath)) {
              // 헬퍼 함수를 사용하여 HTML 조각 반환 (fullPage 미포함)
              return getHtmlFromCache(cachePath);
            }
          }
          return '';
        }
      );
    },
  };
} 