type PadoFunction = {
  (variables: Record<string, unknown>): void;
}

const pado = function(variables: Record<string, unknown>): void {
  

  // 이벤트 핸들러 처리 함수
  async function processEventHandlers() {
    try {
      // 모든 스크립트 태그를 찾아서 모듈 import
      const scripts = document.querySelectorAll('script[type="module"]');
      for (const script of scripts) {
        const src = script.getAttribute('src');
        if (src) {
          // @vite-ignore를 사용하여 경고 제거
          const module = await import(/* @vite-ignore */ src);
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
    while ((node = walker.nextNode() as Text)) {
      const parentElement = node.parentNode as HTMLElement;
      const text = node.textContent?.trim() || '';
      
      // 중괄호가 있는 텍스트만 처리하고, 나머지는 그대로 유지
      if (parentElement && text.includes('{') && text.includes('}')) {
        nodesToProcess.push({ node });
      }
    }

    // 텍스트 노드 처리
    nodesToProcess.forEach(({ node }) => {
      const text = node.textContent?.trim() || '';
      const parentElement = node.parentNode as HTMLElement;
      if (!parentElement) return;

      // 기존 템플릿이 있다면 그대로 사용
      if (!parentElement.hasAttribute('pado-text')) {
        const template = text.replace(/\{([^}]+)\}/g, (match) => {
          const varName = match.slice(1, -1);
          return `{${varName}}`;
        });

        if (template.includes('{')) {
          parentElement.setAttribute('pado-text', template);
        }
      }

      // 텍스트 노드가 비어있지 않은 경우에만 제거
      if (text) {
        node.parentNode?.removeChild(node);
      }
    });

    // pado-text를 제외한 모든 속성의 중괄호 바인딩을 pado- 접두사로 변환
    const elements = document.querySelectorAll("*");
    elements.forEach((element) => {
      Array.from(element.attributes)
        .filter(
          (attr) =>
            !attr.name.startsWith("pado-") // 이미 pado- 접두사가 붙은 속성은 제외
        )
        .forEach((attr) => {
          const value = attr.value;
          if (value.startsWith("{") && value.endsWith("}")) {
            const varName = value.slice(1, -1);
            // pado- 접두사가 붙은 새 속성 추가
            element.setAttribute(`pado-${attr.name}`, varName);
            // 원래 속성 제거 (checked와 같은 boolean 속성의 경우)
            if (attr.name === 'checked' || attr.name === 'selected' || attr.name === 'disabled') {
              element.removeAttribute(attr.name);
            }
          }
        });
    });
    
    // pado-init 속성 추가
    document.body.setAttribute("pado-init", "");
  }

  function evaluateExpression(expression: string, variables: Map<string, unknown>): unknown {
    // 변수들을 객체로 변환
    const context: Record<string, unknown> = {};
    variables.forEach((value, key) => {
      context[key] = value;
    });

    try {
      // Function 생성자를 사용하여 평가식 실행
      const keys = Object.keys(context);
      const values = Object.values(context);
      const fn = new Function(...keys, `return ${expression};`);
      return fn(...values);
    } catch (error) {
      console.error('Error evaluating expression:', expression, error);
      return false;
    }
  }

  // 변수명에 해당하는 모든 DOM 요소 업데이트
  function update() {
    const argsMap = new Map<string, unknown>(Object.entries(variables));
    const updatedVars = new Set(argsMap.keys());

    // pado-text 처리
    let elements = document.querySelectorAll('[pado-text]');
    elements.forEach(element => {
      const template = element.getAttribute('pado-text');
      if (!template) return;

      let shouldUpdate = false;
      let result = template;
      const matches = template.match(/\{([^}]+)\}/g);
      
      if (matches) {
        matches.forEach(match => {
          const varName = match.slice(1, -1);
          const baseVar = varName.split('.')[0];
          
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
        // HTML 태그를 허용하도록 innerHTML 사용
        element.innerHTML = result;
      }
    });

    // 모든 pado- 접두사 속성 처리
    elements = document.querySelectorAll('*');
    elements.forEach((element: Element) => {
      Array.from(element.attributes)
        .filter(
          (attr) =>
            attr.name.startsWith("pado-") &&
            attr.name !== "pado-text" &&
            attr.name !== "pado-init"
        )
        .forEach((attr) => {
          const originalAttrName = attr.name.replace("pado-", "");
          let bindingValue = attr.value;
          
          // 중괄호로 감싸진 평가식 처리
          if (bindingValue.startsWith('{') && bindingValue.endsWith('}')) {
            bindingValue = bindingValue.slice(1, -1);
          }

          const baseVar = bindingValue.split(".")[0];
          
          // 업데이트된 변수와 관련된 바인딩만 처리
          if (!updatedVars.has(baseVar)) {
            return;
          }

          let value: unknown;

          // 평가식 처리 (예: radioValue === 1)
          if (
            bindingValue.includes("+") ||
            bindingValue.includes("-") ||
            bindingValue.includes("*") ||
            bindingValue.includes("/") ||
            bindingValue.includes("%") ||
            bindingValue.includes("!") ||
            bindingValue.includes("?") ||
            bindingValue.includes("===") ||
            bindingValue.includes("!==") ||
            bindingValue.includes("&&") ||
            bindingValue.includes("||")
          ) {
            value = evaluateExpression(bindingValue, argsMap);
          }
          // 기존 단순 바인딩 처리
          else if (argsMap.has(baseVar)) {
            value = argsMap.get(baseVar);
            // 객체의 속성 접근 처리 (예: c.name)
            if (bindingValue.includes(".")) {
              const [_, prop] = bindingValue.split(".");
              if (typeof value === "object" && value !== null) {
                value = (value as Record<string, unknown>)[prop];
              }
            }
          }

          // value가 undefined가 아닌 경우에만 처리
          if (value !== undefined) {
            // boolean 속성 처리 (checked, selected, disabled)
            if (
              originalAttrName === "checked" ||
              originalAttrName === "selected" ||
              originalAttrName === "disabled"
            ) {
              if (value) {
                (element as HTMLInputElement).checked = true;
                element.setAttribute(originalAttrName, "");
              } else {
                (element as HTMLInputElement).checked = false;
                element.removeAttribute(originalAttrName);
              }
            }
            // value 속성은 특별 처리
            else if (
              (originalAttrName === "value" &&
                (element instanceof HTMLInputElement ||
                  element instanceof HTMLTextAreaElement)) ||
              element instanceof HTMLSelectElement
            ) {
              element.value = String(value);
            }
            // 나머지 속성들은 setAttribute로 처리
            else {
              element.setAttribute(originalAttrName, String(value));
            }
          }
        });
    });
  }

  // 최초 실행시에만 템플릿을 변환
  if (!document.querySelector('[pado-init]')) {
    init();
    processEventHandlers();
  }

  // DOM 업데이트 실행
  update();


} as PadoFunction;

export default pado; 