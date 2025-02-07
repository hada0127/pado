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

// 조건부 렌더링 처리 함수
function processConditionals(html: string): string {
  const timestamp = Date.now();
  let groupCounter = 0;

  // 중첩된 if 블록을 찾아서 처리
  function processNestedIf(content: string): string {
    const ifStartPattern = /{@if\(([^)]+)\)}/;
    const ifEndPattern = /{\/if}/;
    
    const startMatch = content.match(ifStartPattern);
    if (!startMatch) return content;

    // 첫 번째 if 시작 위치
    const startIndex = startMatch.index!;
    const condition = startMatch[1];
    let depth = 1;
    let endIndex = startIndex;

    // 대응되는 마지막 /if 찾기
    for (let i = startIndex + startMatch[0].length; i < content.length; i++) {
      if (content.slice(i).startsWith('{@if')) {
        depth++;
      } else if (content.slice(i).startsWith('{/if}')) {
        depth--;
        if (depth === 0) {
          endIndex = i + 5; // '{/if}'.length = 5
          break;
        }
      }
    }

    // 첫 번째 if 이전 내용
    const prevHtml = content.slice(0, startIndex);
    // 마지막 /if 이후 내용
    const nextHtml = content.slice(endIndex);
    // if 블록 내부 내용
    const innerContent = content.slice(startIndex + startMatch[0].length, endIndex - 5);

    // 내부 if 블록 재귀 처리
    const processedInner = processNestedIf(innerContent);
    
    // 처리된 if 블록 생성
    const processedIf = `{@if(${condition})}${processedInner}{/if}`;

    // 전체 내용 합치기
    return prevHtml + processedIf + processNestedIf(nextHtml);
  }

  // 중첩된 if 처리 후 최종 변환
  const processedHtml = processNestedIf(html);
  
  // 최종 if 블록 변환
  return processedHtml.replace(
    /{@if\(([^)]+)\)}([\s\S]*?)(?:{@elseif\(([^)]+)\)}([\s\S]*?))*(?:{@else}([\s\S]*?))?{\/if}/g,
    (match, ifCondition, ifContent, elseifCondition, elseifContent, elseContent) => {
      const groupName = `ifgroup_${timestamp}_${groupCounter++}`;
      const style = 'display: none;padding: 0; margin: 0;';
      let result = '';

      // 문자열 리터럴 처리
      const processCondition = (cond: string) => {
        return cond.replace(/(['"])((?:\\\1|.)*?)\1/g, match => {
          return match.startsWith("'") ? `"${match.slice(1, -1)}"` : match;
        });
      };

      // if 블록 처리
      result = `<div pado-if="${processCondition(ifCondition)}" pado-ifgroup="${groupName}" style="${style}">${ifContent}</div>`;

      // elseif 블록들 처리
      if (elseifCondition) {
        result += `<div pado-elseif="${processCondition(elseifCondition)}" pado-ifgroup="${groupName}" style="${style}">${elseifContent}</div>`;
      }

      // else 블록 처리
      if (elseContent) {
        result += `<div pado-else pado-ifgroup="${groupName}" style="${style}">${elseContent}</div>`;
      }

      return result;
    }
  );
}

export default function padoPlugin(): Plugin {
  return {
    name: 'vite-plugin-pado',
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.pado')) {
        server.ws.send({
          type: 'full-reload',
          path: '*'
        });
        return [];
      }
    },
    transformIndexHtml(html: string, { filename }) {
      // .pado 파일 내용 로드 및 변환
      html = html.replace(
        /<!--\s*@pado\s+src="([^"]+)"\s*-->/g,
        (_, src) => {
          const padoPath = path.resolve(path.dirname(filename), src);
          if (fs.existsSync(padoPath)) {
            let padoContent = fs.readFileSync(padoPath, 'utf-8');
            
            // 조건부 렌더링 처리
            padoContent = processConditionals(padoContent);

            // .ts 파일 자동 로드
            const tsPath = padoPath.replace(/\.pado$/, '.ts');
            if (fs.existsSync(tsPath)) {
              const relativePath = '/' + path.relative('src', tsPath).replace(/\\/g, '/');
              padoContent = `<script type="module" src="${relativePath}"></script>\n${padoContent}`;
            }

            return padoContent;
          }
          return '';
        }
      );

      // 속성 및 텍스트 노드 변환
      let processedHtml = html.replace(
        /(\s)(\w+)=["']?\{([^}]+)\}["']?/g,
        (match, space, attr, expr) => {
          if (attr.startsWith('on')) return match;
          
          const processedExpr = expr
            .replace(/\s+/g, ' ')
            .replace(/\"/g, "'")
            .trim();
          
          return `${space}pado-${attr}="${processedExpr}"`;
        }
      );

      return processedHtml.replace(
        /(<[^>]*>)([^<]+)(<\/[^>]*>)/g,
        (match, openTag, text, closeTag) => {
          if (text && text.includes('{') && text.includes('}')) {
            const escapedText = escapeHtml(text.trim());
            return `${openTag.replace(/>$/, ` pado-text="${escapedText}">`)}${closeTag}`;
          }
          return match;
        }
      );
    }
  };
} 