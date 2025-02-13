import fs from 'fs';
import path from 'path';
import { transformWithEsbuild } from 'vite';


// 캐시 디렉토리 경로를 전역으로 설정
export const cacheDir = path.resolve('pado/cache');


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

// 연관 파일 처리 함수
export async function handleRelatedFiles(filePath: string) {
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