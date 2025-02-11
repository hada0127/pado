import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

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


export default function padoPlugin(): Plugin {
  // 캐시 디렉토리 생성
  const cacheDir = path.resolve('pado/cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // pado 파일 전체 변환 처리
  function transformPadoContent(content: string, padoPath: string): string {
    const cache = {
      html: '',
      conditions: [] as any[],
      loops: [] as any[]
    };

    // 중첩된 구조를 재귀적으로 처리하는 함수
    function processContent(content: string): string {
      let processedContent = content;

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

    // 결과 반환
    return JSON.stringify({
      ...cache,
      timestamp: Date.now()
    }, null, 2);
  }

  // 캐시 파일 생성 함수
  function createCache(filePath: string, content: string) {
    const relativePath = path.relative(process.cwd(), filePath);
    if (relativePath.startsWith('src/app')) {
      const cachePath = path.join(
        cacheDir,
        relativePath.replace(/^src\/app/, 'app').replace(/\.[^.]+$/, '.json')
      );

      // 캐시 디렉토리 생성
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });

      // 변환된 내용 저장
      fs.writeFileSync(cachePath, content);

      return cachePath;
    }
    return null;
  }

  return {
    name: 'vite-plugin-pado',
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.pado') || file.endsWith('.ts')) {
        if (file.endsWith('.pado')) {
          const padoContent = fs.readFileSync(file, 'utf-8');
          const transformedContent = transformPadoContent(padoContent, file);
          createCache(file, transformedContent);
        }

        server.ws.send({
          type: 'full-reload',
          path: '*'
        });
        return [];
      }
    },
    transformIndexHtml(html: string, { filename }) {
      return html.replace(
        /<!--\s*@pado\s+src="([^"]+)"\s*-->/g,
        (_, src) => {
          const padoPath = path.resolve(path.dirname(filename), src);
          const relativePath = path.relative(process.cwd(), padoPath);
          
          if (relativePath.startsWith('src/app')) {
            const cachePath = path.join(
              cacheDir,
              relativePath.replace(/^src\/app/, 'app').replace(/\.[^.]+$/, '.json')
            );

            if (fs.existsSync(cachePath)) {
              const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
              let content = cache.html;

              // script 태그에 conditions와 loops 데이터 추가
              const conditionsScript = `<script>
window.__PADO_CONDITIONS__ = ${JSON.stringify(cache.conditions)};
window.__PADO_LOOPS__ = ${JSON.stringify(cache.loops)};
</script>`;
              
              const tsPath = padoPath.replace(/\.pado$/, '.ts');
              if (fs.existsSync(tsPath)) {
                const relativePath = '/' + path.relative('src', tsPath).replace(/\\/g, '/');
                content = `${conditionsScript}\n<script type="module" src="${relativePath}"></script>\n${content}`;
              } else {
                content = `${conditionsScript}\n${content}`;
              }

              return content;
            }
          }

          if (fs.existsSync(padoPath)) {
            const padoContent = fs.readFileSync(padoPath, 'utf-8');
            const transformedContent = transformPadoContent(padoContent, padoPath);
            createCache(padoPath, transformedContent);

            let finalContent = transformedContent;
            const tsPath = padoPath.replace(/\.pado$/, '.ts');
            if (fs.existsSync(tsPath)) {
              const relativePath = '/' + path.relative('src', tsPath).replace(/\\/g, '/');
              finalContent = `<script type="module" src="${relativePath}"></script>\n${finalContent}`;
            }

            return finalContent;
          }
          return '';
        }
      );
    }
  };
} 