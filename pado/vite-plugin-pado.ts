import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { transformWithEsbuild } from 'vite';
import { publicMimeTypes } from './settings/publicMimeTypes';

// 캐시 디렉토리 경로를 전역으로 설정
const cacheDir = path.resolve('pado/cache');

// HTML 특수문자 이스케이프 함수
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char] || char)
  );
}

// 공통 컨텐츠 변환 함수
function transformContent(content: string): string {
  // 1. 속성 변환 (중괄호 표현식을 pado- 속성으로 변환)
  let transformed = content.replace(
    /(\s)(\w+)=(?:["']\{([^}]+)\}["']|[\{]([^}]+)[\}])/g,
    (match, space, attr, expr1, expr2) => {
      if (attr.startsWith('on')) return match;
      const expr = (expr1 || expr2).trim();
      return `${space}pado-${attr}="${expr}"`;
    }
  );

  // 2. 텍스트 노드 변환
  transformed = transformed.replace(
    /(<[^>]*>)([^<]+)(<\/[^>]*>)/g,
    (match, openTag, text, closeTag) => {
      if (text && text.includes('{') && text.includes('}')) {
        const escapedText = escapeHtml(text.trim());
        return `${openTag.replace(/>$/, ` pado-text="${escapedText}">`)}${closeTag}`;
      }
      return match;
    }
  );

  return transformed;
}

// 가장 바깥쪽 if문부터 처리하는 재귀 함수
function processNestedConditionals(content: string, fileId: string, counter: { value: number }): {
  html: string;
  conditions: Array<{
    groupName: string;
    blocks: Array<{
      type: 'if' | 'elseif' | 'else';
      condition?: string;
      content: string;
    }>;
  }>;
} {
  const conditions: Array<{
    groupName: string;
    blocks: Array<{
      type: 'if' | 'elseif' | 'else';
      condition?: string;
      content: string;
    }>;
  }> = [];

  let result = content;
  let startIndex = 0;

  while (startIndex < result.length) {
    // if 시작 위치 찾기
    const ifStart = result.indexOf('{@if(', startIndex);
    if (ifStart === -1) break;

    // 해당 if문의 끝 위치 찾기
    let depth = 1;
    let ifEnd = ifStart;
    let searchIndex = ifStart + 5;  // '{@if('.length

    while (depth > 0 && searchIndex < result.length) {
      if (result.startsWith('{@if(', searchIndex)) {
        depth++;
        searchIndex += 5;
      } else if (result.startsWith('{/if}', searchIndex)) {
        depth--;
        if (depth === 0) {
          ifEnd = searchIndex + 5;  // '{/if}'.length
          break;
        }
        searchIndex += 5;
      } else {
        searchIndex++;
      }
    }

    if (depth === 0) {
      // 완전한 if 블록을 찾음
      const fullMatch = result.substring(ifStart, ifEnd);
      const ifConditionMatch = fullMatch.match(/{@if\(([^)]+)\)}/);
      if (ifConditionMatch) {
        const ifCondition = ifConditionMatch[1];
        const innerContent = fullMatch.substring(ifConditionMatch[0].length, fullMatch.length - 5);  // -5 for '{/if}'

        const groupName = `${fileId}_if_${counter.value++}`;
        const blocks: Array<{
          type: 'if' | 'elseif' | 'else';
          condition?: string;
          content: string;
        }> = [];

        // 내부 if문 먼저 처리
        const { html: processedInnerContent, conditions: innerConditions } = processNestedConditionals(innerContent, fileId, counter);
        conditions.push(...innerConditions);

        // if/elseif/else 블록 분리
        const parts = processedInnerContent.split(/(?={@elseif\()|(?={@else})/);
        
        // if 블록
        blocks.push({
          type: 'if',
          condition: ifCondition.trim(),
          content: transformContent(parts[0].trim())
        });

        // elseif/else 블록들
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (part.startsWith('{@elseif(')) {
            const elseifMatch = part.match(/{@elseif\s*\(([^)]+)\)}([\s\S]*)/);
            if (elseifMatch) {
              blocks.push({
                type: 'elseif',
                condition: elseifMatch[1].trim(),
                content: transformContent(elseifMatch[2].trim())
              });
            }
          } else if (part.startsWith('{@else}')) {
            blocks.push({
              type: 'else',
              content: transformContent(part.slice(7).trim())  // 7 is '{@else}'.length
            });
          }
        }

        conditions.push({ groupName, blocks });
        result = result.substring(0, ifStart) + `<!-- if:${groupName} -->` + result.substring(ifEnd);
      }
    }
    startIndex = ifStart + 1;
  }

  return { html: result, conditions };
}

function findScssImports(code: string): string[] {
  const imports: string[] = [];
  const regex = /import\s+(\w+)\s+from\s+['"](.+\.scss)(\?module)?['"]/g;
  let match;
  
  while ((match = regex.exec(code)) !== null) {
    imports.push(match[1]); // 스타일 변수명 저장
  }
  
  return imports;
}

// uniqueId를 파일 경로 기반으로 생성하는 함수
function generateUniqueId(filePath: string): string {
  const basePath = filePath.replace(/\.(pado|ts|module\.scss)$/, '');
  let hash = 0;
  for (let i = 0; i < basePath.length; i++) {
    const char = basePath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 6);
}

// transformPadoContent 함수 수정
function transformPadoContent(content: string, padoPath: string): string {
  const uniqueId = generateUniqueId(padoPath);
  const cache = {
    html: '',
    conditions: [] as any[],
    loops: [] as any[],
    timestamp: Date.now()
  };

  function processContent(content: string): string {
    let processedContent = content;

    // pado-class를 class로 변환하고 고유 ID 추가
    processedContent = processedContent.replace(
      /<div\s+pado-class="([^"]+)"/g,
      (match, className) => {
        const [obj, prop] = className.split('.');
        return `<div class="_${prop}_${uniqueId}"`;
      }
    );

    // 가장 바깥쪽 if/loop를 찾아서 처리
    function findOutermostMatch(str: string, start: number, type: 'if' | 'loop'): { start: number; end: number } | null {
      const startTag = type === 'if' ? '{@if' : '{@loop';
      const endTag = type === 'if' ? '{/if}' : '{/loop}';
      
      const tagStart = str.indexOf(startTag, start);
      if (tagStart === -1) return null;

      let depth = 1;
      let pos = tagStart + startTag.length;
      
      while (depth > 0 && pos < str.length) {
        if (str.startsWith(startTag, pos)) {
          depth++;
          pos += startTag.length;
        } else if (str.startsWith(endTag, pos)) {
          depth--;
          if (depth === 0) {
            return { start: tagStart, end: pos + endTag.length };
          }
          pos += endTag.length;
        } else {
          pos++;
        }
      }
      return null;
    }

    // if 구문 처리
    let currentPos = 0;
    while (true) {
      const match = findOutermostMatch(processedContent, currentPos, 'if');
      if (!match) break;

      const { start: ifStart, end: ifEnd } = match;
      const fullMatch = processedContent.substring(ifStart, ifEnd);
      const ifId = `page_if_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const blocks: Array<{
        type: 'if' | 'elseif' | 'else';
        condition?: string;
        content: string;
      }> = [];

      // 내부 중첩 구조 먼저 처리
      const innerContent = processContent(fullMatch.substring(fullMatch.indexOf('}') + 1, fullMatch.lastIndexOf('{/if}')));
      
      // if/elseif/else 블록 처리
      const parts = innerContent.split(/(?={@elseif)|(?={@else})/);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === 0) {
          // if 블록
          const match = fullMatch.match(/\{@if\s*\(\s*(.*?)\s*\)}/);
          if (match) {
            blocks.push({
              type: 'if',
              condition: match[1].trim(),
              content: transformContent(part).trim()
            });
          }
        } else if (part.startsWith('{@elseif')) {
          // elseif 블록
          const match = part.match(/\{@elseif\s*\(\s*(.*?)\s*\)}([\s\S]*)/);
          if (match) {
            blocks.push({
              type: 'elseif',
              condition: match[1].trim(),
              content: transformContent(match[2]).trim()
            });
          }
        } else if (part.startsWith('{@else}')) {
          // else 블록
          blocks.push({
            type: 'else',
            content: transformContent(part.substring(7)).trim()
          });
        }
      }

      cache.conditions.push({ groupName: ifId, blocks });
      processedContent = processedContent.substring(0, ifStart) + `<!-- if:${ifId} -->` + processedContent.substring(ifEnd);
      currentPos = ifStart + 1;
    }

    // loop 구문도 동일한 방식으로 처리
    currentPos = 0;
    while (true) {
      const match = findOutermostMatch(processedContent, currentPos, 'loop');
      if (!match) break;

      const { start: loopStart, end: loopEnd } = match;
      const fullMatch = processedContent.substring(loopStart, loopEnd);
      const loopMatch = fullMatch.match(/{@loop\s+(\w+)\s+as\s+(\w+)}/);
      
      if (loopMatch) {
        const [, arrayExpr, itemName] = loopMatch;
        const loopId = `page_loop_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        
        // 내부 중첩 구조 처리
        const innerContent = processContent(fullMatch.substring(fullMatch.indexOf('}') + 1, fullMatch.lastIndexOf('{/loop}')));
        
        cache.loops.push({
          name: loopId,
          arrayExpr,
          itemName,
          content: transformContent(innerContent).trim()
        });

        processedContent = processedContent.substring(0, loopStart) + `<!-- loop:${loopId} -->` + processedContent.substring(loopEnd);
      }
      currentPos = loopStart + 1;
    }

    return processedContent;
  }

  // 전체 내용 처리
  cache.html = transformContent(processContent(content));
  return JSON.stringify(cache, null, 2);
}

// SCSS 파일 캐싱 함수 수정
async function handleScssCache(filePath: string, content: string, styleId: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  if (relativePath.startsWith('src/app')) {
    const cachePath = path.join(
      cacheDir,
      relativePath.replace(/^src\/app/, 'app').replace(/\.module\.scss$/, '.json')
    );

    try {
      // 전달받은 styleId 사용
      const modulizedCss = content.replace(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g, (match, className) => {
        return `._${className}_${styleId}`;
      });

      // 캐시 파일 업데이트
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        cache.styles = modulizedCss;
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      } else {
        const cache = {
          html: '',
          conditions: [],
          loops: [],
          styles: modulizedCss,
          timestamp: Date.now()
        };
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      }
    } catch (error) {
      console.error(`Error processing SCSS file ${filePath}:`, error);
    }
  }
}

// TS 파일 처리 및 컴파일 함수
async function handleTsCache(filePath: string, code: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  if (relativePath.startsWith('src/app')) {
    const jsPath = path.join(
      cacheDir,
      relativePath.replace(/^src\/app/, 'app').replace(/\.ts$/, '.js')
    );

    try {
      // @pado import 경로 수정
      const modifiedCode = code.replace(
        /from\s+['"]@pado['"]/g,
        'from "/pado/pado.js"'
      );

      // TS를 JS로 변환
      const result = await transformWithEsbuild(modifiedCode, filePath, {
        loader: 'ts',
        target: 'es2020',
        format: 'esm',
        minify: true,
        treeShaking: true
      });

      // JS 파일 저장
      fs.mkdirSync(path.dirname(jsPath), { recursive: true });
      fs.writeFileSync(jsPath, result.code);
    } catch (error) {
      console.error(`Error processing TypeScript file ${filePath}:`, error);
    }
  }
}

// 캐시 파일 생성/삭제 함수
function handleCache(filePath: string, content?: string, styleId?: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  if (relativePath.startsWith('src/app')) {
    const cachePath = path.join(
      cacheDir,
      relativePath.replace(/^src\/app/, 'app').replace(/\.[^.]+$/, '.json')
    );

    // 파일이 삭제된 경우
    if (!content) {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
        const cacheDir = path.dirname(cachePath);
        if (fs.readdirSync(cacheDir).length === 0) {
          fs.rmdirSync(cacheDir);
        }
      }
      return null;
    }

    // 파일이 생성/수정된 경우
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    
    // styleId가 있는 경우 HTML의 클래스 이름 업데이트
    if (styleId) {
      const cache = JSON.parse(content);
      cache.html = cache.html.replace(
        /pado-class="([^"]+)"/g,
        (match, className) => {
          const [obj, prop] = className.split('.');
          return `class="_${prop}_${styleId}"`;
        }
      );
      content = JSON.stringify(cache, null, 2);
    }

    fs.writeFileSync(cachePath, content);
    return cachePath;
  }
  return null;
}

// 연관 파일 처리 함수 수정
async function handleRelatedFiles(filePath: string) {
  // 변경된 파일의 디렉토리 경로 찾기
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath).replace(/\.(pado|ts|module\.scss)$/, '');
  
  // page.pado 파일 찾기
  const padoPath = path.join(dir, 'page.pado');
  const tsPath = path.join(dir, 'page.ts');
  const scssPath = path.join(dir, 'page.module.scss');

  // 캐시 파일 경로 생성
  const relativePath = path.relative(path.join(process.cwd(), 'src/app'), padoPath);
  const cachePath = path.join(
    cacheDir,
    'app',
    path.dirname(relativePath),
    'page.json'
  ).replace(/\\/g, '/');

  // .pado 파일이 존재하는 경우에만 처리
  if (fs.existsSync(padoPath)) {
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      const styleId = generateUniqueId(scssPath);

      // 1. .pado 파일 처리
      const padoContent = fs.readFileSync(padoPath, 'utf-8');
      const transformedContent = transformPadoContent(padoContent, padoPath);
      handleCache(padoPath, transformedContent, styleId);

      // 2. .scss 파일 처리
      if (fs.existsSync(scssPath)) {
        const scssContent = fs.readFileSync(scssPath, 'utf-8');
        await handleScssCache(scssPath, scssContent, styleId);
      }

      // 3. .ts 파일 처리
      if (fs.existsSync(tsPath)) {
        const tsContent = fs.readFileSync(tsPath, 'utf-8');
        await handleTsCache(tsPath, tsContent);
      }

    } catch (error) {
      console.error(`Error processing related files for ${dir}:`, error);
    }
  }
}

async function replaceAsync(str: string, regex: RegExp, asyncFn: (match: string, ...args: any[]) => Promise<string>) {
  const promises: Promise<string>[] = [];
  str.replace(regex, (match, ...args) => {
    promises.push(asyncFn(match, ...args));
    return match;
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift() || '');
}

// 동적 라우팅 파라미터를 저장할 타입 정의
type RouteParams = {
  [key: string]: string;
};

// URL 경로를 실제 파일 경로로 변환하는 함수 수정
function getActualPath(urlPath: string): { path: string; params: RouteParams } {
  const appDir = path.join(process.cwd(), 'src/app');
  
  // URL에서 쿼리 스트링 제거
  const [pathWithoutQuery] = urlPath.split('?');
  const segments = pathWithoutQuery.split('/').filter(Boolean);
  const params: RouteParams = {};
  
  // 쿼리 스트링 파싱하여 params에 추가
  const queryString = urlPath.split('?')[1];
  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }

  // 루트 경로(/) 처리
  if (segments.length === 0) {
    const defaultPath = path.join(appDir, 'page.pado');
    if (fs.existsSync(defaultPath)) {
      return { path: 'src/app', params };
    }
  }
  
  // 직접 경로 확인
  const directPath = path.join(appDir, ...segments);
  if (fs.existsSync(directPath)) {
    return { path: path.join('src/app', ...segments), params };
  }

  // 괄호 경로와 동적 라우팅 검색
  const findInDirectory = (dir: string, remainingSegments: string[]): { path: string; params: RouteParams } | null => {
    if (remainingSegments.length === 0) {
      // 현재 디렉토리에 page.pado가 있는지 확인
      const pagePath = path.join(dir, 'page.pado');
      if (fs.existsSync(pagePath)) {
        return { 
          path: path.join('src/app', path.relative(appDir, dir)),
          params 
        };
      }
      return null;
    }
    
    const items = fs.readdirSync(dir);
    const segment = remainingSegments[0];
    const nextSegments = remainingSegments.slice(1);

    // 정확한 매칭 먼저 시도
    if (items.includes(segment)) {
      const fullPath = path.join(dir, segment);
      if (fs.statSync(fullPath).isDirectory()) {
        const found = findInDirectory(fullPath, nextSegments);
        if (found) return found;
      }
    }

    // 그 다음 동적 라우팅과 괄호 매칭 시도
    for (const item of items) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        // 동적 라우팅 매칭 ([id] 형태)
        if (item.startsWith('[') && item.endsWith(']')) {
          const paramName = item.slice(1, -1);
          params[paramName] = segment;
          const found = findInDirectory(fullPath, nextSegments);
          if (found) return found;
          delete params[paramName]; // 매칭 실패시 파라미터 제거
        }
        
        // 괄호 디렉토리 매칭
        if (item.startsWith('(') && item.endsWith(')')) {
          const found = findInDirectory(fullPath, remainingSegments);
          if (found) return found;
        }
      }
    }
    return null;
  };

  const found = findInDirectory(appDir, segments);
  return found || { path: '', params: {} };
}

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
      const watcher = server.watcher;
      
      // 파일 변경 감지 통합
      watcher.on('change', async (file) => {
        if (file.match(/\.(pado|ts|module\.scss)$/)) {
          await handleRelatedFiles(file);
          // 모듈 캐시 초기화
          server.moduleGraph.invalidateAll();
          // 현재 페이지 새로고침
          server.ws.send({
            type: 'full-reload',
            path: '*'
          });
        }
      });

      // 파일 삭제/추가 감지도 동일하게 처리
      watcher.on('unlink', async (file) => {
        if (file.match(/\.(pado|ts|module\.scss)$/)) {
          await handleRelatedFiles(file);
          server.moduleGraph.invalidateAll();
          server.ws.send({
            type: 'full-reload'
          });
        }
      });

      watcher.on('add', async (file) => {
        if (file.match(/\.(pado|ts|module\.scss)$/)) {
          await handleRelatedFiles(file);
          server.moduleGraph.invalidateAll();
          server.ws.send({
            type: 'full-reload'
          });
        }
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

              if (fs.existsSync(cachePath)) {
                const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
                
                // HTML 응답 생성
                const styleContent = cache.styles ? `<style>${cache.styles}</style>` : '';
                const scriptPath = cachePath.replace(/\.json$/, '.js');
                const scriptContent = fs.existsSync(scriptPath) 
                  ? `<script type="module" src="/cache${scriptPath.split('cache')[1]}"></script>`
                  : '';
                const conditionsScript = `<script>
                  window.__PADO_CONDITIONS__ = ${JSON.stringify(cache.conditions)};
                  window.__PADO_LOOPS__ = ${JSON.stringify(cache.loops)};
                  window.__PADO_PARAMS__ = ${JSON.stringify(params)}; // 라우팅 파라미터 전달
                </script>`;

                const html = `
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <meta charset="UTF-8">
                      <title>Pado</title>
                      <base href="/">
                      ${styleContent}
                      ${conditionsScript}
                    </head>
                    <body>
                      ${cache.html}
                      <script type="module">
                        import '/@vite/client'
                      </script>
                      ${scriptContent}
                    </body>
                  </html>
                `;

                // HTML 응답
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

            if (fs.existsSync(cachePath)) {
              const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
              let content = cache.html;

              // 스타일 태그 추가
              const styleContent = cache.styles ? `<style>${cache.styles}</style>` : '';

              // script 태그에 conditions와 loops 데이터 추가
              const conditionsScript = `<script>
                window.__PADO_CONDITIONS__ = ${JSON.stringify(cache.conditions)};
                window.__PADO_LOOPS__ = ${JSON.stringify(cache.loops)};
              </script>`;
              
              // 캐시된 JS 파일 경로 설정
              const scriptPath = cachePath.replace(/\.json$/, '.js');
              const scriptContent = fs.existsSync(scriptPath) 
                ? `<script type="module" src="/cache${scriptPath.split('cache')[1]}"></script>`
                : '';

              content = `${styleContent}\n${conditionsScript}\n${scriptContent}\n${content}`;
              return content;
            }
          }
          return '';
        }
      );
    },
  };
} 