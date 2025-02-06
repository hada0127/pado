import type { Plugin, IndexHtmlTransformContext } from 'vite';
import { JSDOM } from 'jsdom';

// Plugin 타입 확장
interface PadoPlugin extends Plugin {
  order?: 'pre' | 'post';
  transformIndexHtml?: {
    order?: 'pre' | 'post';
    handler: (html: string, ctx: IndexHtmlTransformContext) => string | undefined;
  };
}

export default function padoPlugin(): PadoPlugin {
  return {
    name: 'vite-plugin-pado',
    order: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html, { filename }) {
        // .html 또는 .pado 파일만 처리
        if (!filename?.endsWith('.html') && !filename?.endsWith('.pado')) {
          return html;
        }

        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const { NodeFilter } = dom.window;
        
        // 텍스트 노드 처리
        const walker = doc.createTreeWalker(
          doc.body,
          NodeFilter.SHOW_TEXT,
          null
        );

        // 텍스트 노드 찾기
        const nodesToProcess: Node[] = [];
        let node;
        while ((node = walker.nextNode())) {
          const parentElement = node.parentNode;
          const text = node.textContent?.trim() || '';
          
          if (parentElement && text.includes('{') && text.includes('}')) {
            nodesToProcess.push(node);
          }
        }

        // 텍스트 노드 처리
        nodesToProcess.forEach((node) => {
          const parentElement = node.parentNode as HTMLElement;
          if (!parentElement) return;

          const text = parentElement.innerHTML
            .trim()
            .replace(
              /(?!&[a-z0-9]+;|&l(?:brace|t|gt);|&r(?:brace|t|gt);|&(?:plus|minus|times|divide);)[&<>"']/g,
              match => ({
                '&': '&amp;amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
              }[match] || match)
            );

          if (!parentElement.hasAttribute('pado-text')) {
            const template = text.replace(/\{([^}]+)\}/g, (match) => {
              const varName = match.slice(1, -1);
              return `{${varName}}`;
            });

            if (template.includes('{')) {
              parentElement.setAttribute('pado-text', template);
            }
          }

          if (text) {
            node.parentNode?.removeChild(node);
          }
        });

        // 속성 처리
        const elements = doc.body.querySelectorAll('*');
        elements.forEach((element) => {
          Array.from(element.attributes)
            .filter(attr => !attr.name.startsWith('pado-') && !attr.name.startsWith('on'))
            .forEach((attr) => {
              const value = attr.value;
              if (value.startsWith('{') && value.endsWith('}')) {
                const varName = value.slice(1, -1);
                element.setAttribute(`pado-${attr.name}`, varName);
                // 원래 속성 제거 (checked와 같은 boolean 속성의 경우)
                if (
                  attr.name === "checked" ||
                  attr.name === "selected" ||
                  attr.name === "disabled" ||
                  attr.name === "value"
                ) {
                  element.removeAttribute(attr.name);
                }
              }
            });
        });

        // 변환된 HTML 반환
        return doc.documentElement.innerHTML;
      }
    },
    // HTML 파일을 에셋으로 처리
    config(config) {
      config.assetsInclude = config.assetsInclude || [];
      if (Array.isArray(config.assetsInclude)) {
        config.assetsInclude.push('**/*.html', '**/*.pado');
      }
      return config;
    }
  };
} 