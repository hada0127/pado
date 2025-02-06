type PadoFunction = {
  (variables: Record<string, unknown>): void;
}

const pado = function(variables: Record<string, unknown>): void {
  

  // 이벤트 핸들러 처리 함수
  async function processEventHandlers() {
    try {
      const scripts = document.querySelectorAll('script[type="module"]');
      for (const script of scripts) {
        const src = script.getAttribute('src');
        if (src) {
          // 현재 URL을 기준으로 절대 경로 생성
          const absoluteUrl = new URL(src, window.location.href).href;
          
          // 동적 import 실행
          const module = await import(/* @vite-ignore */ absoluteUrl);
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
      const parentElement = node.parentNode as HTMLElement;
      if (!parentElement) return;

      // HTML 엔티티가 파싱된 텍스트 얻기
      const convert: { [key: string]: string } = {
        "&": "&amp;amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      console.log(parentElement.innerHTML);;
      // 먼저 기본 HTML 엔티티 변환
      let text = parentElement.innerHTML
        .trim()
        .replace(
          /(?!&[a-z0-9]+;|&l(?:brace|t|gt);|&r(?:brace|t|gt);|&(?:plus|minus|times|divide);)[&<>"']/g,
          (match) => convert[match]
        );
      
      // &lbrace;와 &rbrace;를 {와 }로 변환
      // text = text
      //   .replace(/&lbrace;/g, '{')
      //   .replace(/&rbrace;/g, '}');

      console.log(text);
      
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
      console.log(fn(...values));
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

    // 평가식에서 사용된 변수들을 찾는 함수
    function getExpressionVars(expr: string): string[] {
      return Array.from(new Set(
        expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
      ));
    }    

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
          const expression = match.slice(1, -1);
          
          // 표현식 처리 (예: a + 1 또는 단순 변수)
          if (
            expression.includes("+") ||
            expression.includes("-") ||
            expression.includes("*") ||
            expression.includes("/") ||
            expression.includes("%") ||
            expression.includes("!") ||
            expression.includes("?") ||
            expression.includes("=") ||
            expression.includes("&") ||
            expression.includes("|")
          ) {
            shouldUpdate = true;
            const value = evaluateExpression(expression, argsMap);
            result = result.replace(match, String(value));
          } else {
            // 단순 변수 처리
            const baseVar = expression.split('.')[0];
            if (argsMap.has(baseVar)) {
              shouldUpdate = true;
              if (expression.includes('.')) {
                const [name, prop] = expression.split('.');
                const value = argsMap.get(name);
                if (typeof value === 'object' && value !== null) {
                  result = result.replace(match, String((value as Record<string, unknown>)[prop]));
                }
              } else {
                const value = argsMap.get(expression);
                result = result.replace(match, String(value));
              }
            }
          }
        });
      }
      
      if (shouldUpdate) {
        element.innerHTML = result;
      }
    });

    // 모든 pado- 접두사 속성 처리
    elements = document.querySelectorAll('*');
    elements.forEach((element: Element) => {
      Array.from(element.attributes)
        .filter(attr => 
          attr.name.startsWith("pado-") &&
          attr.name !== "pado-text" &&
          attr.name !== "pado-init"
        )
        .forEach((attr) => {
          const originalAttrName = attr.name.replace("pado-", "");
          let bindingValue = attr.value;
          
          if (bindingValue.startsWith('{') && bindingValue.endsWith('}')) {
            bindingValue = bindingValue.slice(1, -1);
          }
          
          // 평가식 처리 (예: radioValue === 1 또는 disabledValue)
          if (
            bindingValue.includes("+") ||
            bindingValue.includes("-") ||
            bindingValue.includes("*") ||
            bindingValue.includes("/") ||
            bindingValue.includes("%") ||
            bindingValue.includes("!") ||
            bindingValue.includes("?") ||
            bindingValue.includes("=") ||
            bindingValue.includes("!") ||
            bindingValue.includes("&") ||
            bindingValue.includes("|") ||
            typeof argsMap.get(bindingValue) === "boolean"  // boolean 타입 체크 추가
          ) {
            
            // 평가식에서 사용된 모든 변수 추출
            const vars = getExpressionVars(bindingValue);
            // 평가식에 사용된 변수 중 하나라도 업데이트되었다면 처리
            if (vars.some(v => updatedVars.has(v))) {
              const value = evaluateExpression(bindingValue, argsMap);

              // boolean 속성 처리 (checked, disabled, readonly)
              if (
                originalAttrName === "checked" ||
                originalAttrName === "disabled" ||
                originalAttrName === "readonly"
              ) {
                const boolValue = Boolean(value);
                if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                  if (originalAttrName === "readonly") {
                    //element.readOnly = boolValue;
                    
                    if (boolValue) {
                      element.setAttribute("readonly", "");
                    } else {
                      element.removeAttribute("readonly");
                    }
                  } else if (originalAttrName === "disabled") {
                    element.disabled = boolValue;
                    if (boolValue) {
                      element.setAttribute("disabled", "");
                    } else {
                      element.removeAttribute("disabled");
                    }
                  } else if (element instanceof HTMLInputElement && originalAttrName === "checked") {
                    element.checked = boolValue;
                    if (boolValue) {
                      element.setAttribute("checked", "");
                    } else {
                      element.removeAttribute("checked");
                    }
                  }
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
          } else {
            // 단순 바인딩 처리
            const baseVar = bindingValue.split(".")[0];
            if (updatedVars.has(baseVar)) {
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
                  if (element instanceof HTMLInputElement) {
                    // 라디오 버튼의 경우 value와 비교하여 checked 설정
                    if (element.type === 'radio') {
                      const isChecked = Boolean(value);
                      element.checked = isChecked;
                      if (isChecked) {
                        element.setAttribute(originalAttrName, "");
                      } else {
                        element.removeAttribute(originalAttrName);
                      }
                    } else {
                      // 다른 input 요소들 처리
                      element.checked = Boolean(value);
                      if (value) {
                        element.setAttribute(originalAttrName, "");
                      } else {
                        element.removeAttribute(originalAttrName);
                      }
                    }
                  } else {
                    // input 이외의 요소들 처리
                    if (value) {
                      element.setAttribute(originalAttrName, "");
                    } else {
                      element.removeAttribute(originalAttrName);
                    }
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