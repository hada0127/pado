import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

// HTML 특수문자 이스케이프 함수
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char));
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
      const fullMatch = result.slice(ifStart, ifEnd);
      const ifConditionMatch = fullMatch.match(/{@if\(([^)]+)\)}/);
      if (ifConditionMatch) {
        const ifCondition = ifConditionMatch[1];
        const innerContent = fullMatch.slice(ifConditionMatch[0].length, -5);  // -5 for '{/if}'

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
            const elseifMatch = part.match(/{@elseif\(([^)]+)\)}([\s\S]*)/);
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
        result = result.slice(0, ifStart) + `<!-- if:${groupName} -->` + result.slice(ifEnd);
      }
    }
    startIndex = ifStart + 1;
  }

  return { html: result, conditions };
}

// 기존 processConditionals 함수 수정
function processConditionals(html: string, filePath: string): {
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
  const relativePath = path.relative(path.join(process.cwd(), 'src', 'app'), filePath);
  const fileId = relativePath.replace(/\.pado$/, '').replace(/[\\/]/g, '_');
  
  return processNestedConditionals(html, fileId, { value: 0 });
}

// 타입 정의 추가
type Loop = {
  name: string;
  arrayExpr: string;
  itemName: string;
  content: string;
};

function processLoops(content: string, fileId: string, counter: { value: number }): {
  html: string;
  loops: Array<Loop>;
} {
  const loops: Array<Loop> = [];
  let result = content;
  let startIndex = 0;

  while (startIndex < result.length) {
    const loopStart = result.indexOf('{@loop ', startIndex);
    if (loopStart === -1) break;

    // loop 끝 위치 찾기
    const loopEnd = result.indexOf('{/loop}', loopStart);
    if (loopEnd === -1) break;

    // loop 구문 파싱
    const fullMatch = result.slice(loopStart, loopEnd + 7);
    const loopMatch = fullMatch.match(/{@loop\s+([^}\s]+)\s+as\s+([^}\s]+)}/);
    
    if (loopMatch) {
      const [, arrayExpr, itemName] = loopMatch;
      const innerContent = fullMatch.slice(loopMatch[0].length, -7).trim();

      // 내부 컨텐츠 처리
      const processedContent = transformContent(innerContent);

      // if와 동일한 패턴으로 이름 생성 (상대 경로 사용)
      const name = `${fileId.replace(/^.*?src\/app\//, '').split('.')[0]}_loop_${counter.value++}`;
      loops.push({
        name,
        arrayExpr,
        itemName,
        content: processedContent
      });

      // loop 블록을 주석으로 대체
      result = result.slice(0, loopStart) + `<!-- loop:${name} -->` + result.slice(loopEnd + 7);
    }

    startIndex = loopStart + 1;
  }

  return { html: result, loops };
}

export default function padoPlugin(): Plugin {
  // 캐시 디렉토리 생성
  const cacheDir = path.resolve('pado/cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // pado 파일 전체 변환 처리
  function transformPadoContent(content: string, filePath: string): string {
    // 1. 조건부 렌더링 처리
    const { html: processedContent, conditions } = processConditionals(content, filePath);

    // 2. 반복문 처리
    const { html: processedWithLoops, loops } = processLoops(processedContent, filePath, { value: conditions.length });

    // 3. 전체 컨텐츠 변환
    const transformedHtml = transformContent(processedWithLoops);

    return JSON.stringify({
      html: transformedHtml,
      conditions,
      loops,
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