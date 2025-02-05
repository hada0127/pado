type PadoFunction = {
  (...args: unknown[]): void;
}

const pado = function(...args: unknown[]): void {
  

  // 이벤트 핸들러 처리 함수
  async function processEventHandlers() {
    try {
      // 모든 스크립트 태그를 찾아서 모듈 import
      const scripts = document.querySelectorAll('script[type="module"]');
      for (const script of scripts) {
        const src = script.getAttribute('src');
        if (src) {
          const module = await import(src);
          Object.entries(module).forEach(([key, value]) => {
            if (typeof value === 'function') {
              (window as any)[key] = value;
            }
          });
        }
      }
    } catch (error) {
      console.error('Error loading handlers:', error);
    }

    // 이벤트 속성 처리
    const elements = document.querySelectorAll('*');
    elements.forEach(element => {
      Array.from(element.attributes).forEach(attr => {
        if (attr.name.startsWith('on')) {
          const value = attr.value;
          if (value.includes('{') && value.includes('}')) {
            const handlerExpression = value.slice(1, -1);
            const hasParams = handlerExpression.includes('(');
            
            if (hasParams) {
              const [handlerName, params] = handlerExpression.split('(');
              const cleanParams = params.slice(0, -1);
              element.setAttribute(attr.name, `${handlerName}(${cleanParams})`);
            } else {
              element.setAttribute(attr.name, `${handlerExpression}()`);
            }
          }
        }
      });
    });
  }

  // 초기화
  function init() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    // 텍스트 노드 찾기
    const nodesToProcess: { node: Text }[] = [];
    let node: Text | null;
    while (node = walker.nextNode() as Text) {
      nodesToProcess.push({ node });
    }

    // 텍스트 노드 처리
    nodesToProcess.forEach(({ node }) => {
      const text = node.textContent || '';
      const parentElement = node.parentNode as HTMLElement;
      if (!parentElement) return;

      const existingTemplate = parentElement.getAttribute('pado') || '';
      const newTemplate = text.replace(/\{([^}]+)\}/g, match => {
        const varName = match.slice(1, -1);
        return `{${varName}}`;
      });

      const template = existingTemplate ? `${existingTemplate} ${newTemplate}` : newTemplate;
      parentElement.setAttribute('pado', template);
      
      node.parentNode?.removeChild(node);
    });
    // value={변수명}을 찾아 pado-value="변수명"으로 변환
    const elements = document.querySelectorAll('[value]');
    elements.forEach(element => {
      const value = element.getAttribute('value');
      if (value) {
        element.setAttribute('pado-value', value.slice(1, -1));
      }
    });
  }

  // 변수명에 해당하는 모든 DOM 요소 업데이트
  function update() {
    // 전달된 인자를 변수명으로 매핑
    const argsMap = new Map<string, unknown>();
    for (let i = 0; i < args.length; i++) {
      if (args[i] !== undefined) {
        const varName = String.fromCharCode(97 + i);
        argsMap.set(varName, args[i]);
      }
    }

    const elements = document.querySelectorAll('[pado]');
    elements.forEach(element => {
      const template = element.getAttribute('pado');
      if (!template) return;

      let shouldUpdate = false;
      let result = template;
      const matches = template.match(/\{([^}]+)\}/g);
      
      if (matches) {
        matches.forEach(match => {
          const varName = match.slice(1, -1);
          const baseVar = varName.split('.')[0];
          
          // 전달된 인자에 있는 변수만 업데이트
          if (argsMap.has(baseVar)) {
            shouldUpdate = true;
            if (varName.includes('.')) {
              const [name, prop] = varName.split('.');
              const value = argsMap.get(name);
              if (typeof value === 'object' && value !== null) {
                result = result.replace(match, String((value as Record<string, unknown>)[prop]));
              }
            } else {
              const value = argsMap.get(varName);
              result = result.replace(match, String(value));
            }
          }
        });
      }
      
      if (shouldUpdate) {
        element.textContent = result;
      }
    });

    // pado-value 속성 처리
    const inputs = document.querySelectorAll('[pado-value]');
    inputs.forEach((input: Element) => {
      const padoValue = input.getAttribute('pado-value');
      if (padoValue && argsMap.has(padoValue)) {
        (input as HTMLInputElement).value = String(argsMap.get(padoValue));
      }
    });
  }

  // 최초 실행시에만 템플릿을 변환
  if (!document.querySelector('[pado]') && !document.querySelector('[pado-value]')) {
    init();
    processEventHandlers();
  }

  // DOM 업데이트 실행
  update();


} as PadoFunction;

export default pado; 