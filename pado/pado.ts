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

  // 평가식에서 사용된 변수들을 찾는 함수
  function getExpressionVars(expr: string): string[] {
    // 먼저 문자열 리터럴을 임시 토큰으로 대체
    const stringLiterals: string[] = [];
    const exprWithoutStrings = expr.replace(/(['"])((?:\\\1|.)*?)\1/g, (match) => {
      stringLiterals.push(match);
      return `__STR${stringLiterals.length - 1}__`;
    });

    // 변수명 매칭을 위한 정규식
    const varPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    const matches = exprWithoutStrings.matchAll(varPattern);
    
    return Array.from(new Set(
      Array.from(matches, m => m[1])
    )).filter(name => 
      // JavaScript 예약어와 임시 토큰 제외
      !['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'].includes(name) &&
      !name.startsWith('__STR')
    );
  }

  function evaluateExpression(expression: string, variables: Map<string, unknown>): unknown {
    // 변수들을 객체로 변환
    const context: Record<string, unknown> = {};
    
    // 평가식에서 사용된 변수들만 추출
    const usedVars = getExpressionVars(expression);
    
    // 평가식에 사용된 변수가 모두 있는지 확인
    const hasAllVars = usedVars.every(v => variables.has(v));
    if (!hasAllVars) {
      return undefined;
    }

    // 실제 사용된 변수만 context에 추가
    usedVars.forEach(varName => {
      context[varName] = variables.get(varName);
    });

    try {
      // 표현식 정리 및 문자열 처리
      const processedExpr = expression
        .replace(/\s+/g, ' ')  // 연속된 공백을 하나로
        .replace(/(['"])((?:\\\1|.)*?)\1/g, match => {  // 문자열 리터럴 처리
          return match.startsWith("'") ? `"${match.slice(1, -1)}"` : match;
        })
        .trim();

        // 표현식이 비어있거나 불완전한 경우 처리
        if (!processedExpr || processedExpr.endsWith('===') || processedExpr.endsWith('==') || 
            processedExpr.endsWith('!==') || processedExpr.endsWith('!=')) {
          return undefined;
        }

        const keys = Object.keys(context);
        const values = Object.values(context);
        const fn = new Function(...keys, `return ${processedExpr};`);
        const result = fn(...values);
        return result;
    } catch (error) {
      console.error('Error evaluating expression:', expression, error);
      return undefined;
    }
  }

  // 평가식 처리를 위한 공통 함수
  function processExpression(expression: string | null, argsMap: Map<string, unknown>, updatedVars: Set<string>): {
    value: unknown;
    shouldUpdate: boolean;
  } {
    if (!expression) {
      return { value: undefined, shouldUpdate: false };
    }
    // 중괄호로 감싸진 평가식 처리
    let expr = expression;
    if (expr.startsWith('{') && expr.endsWith('}')) {
      expr = expr.slice(1, -1);
    }
    

    // 평가식에서 사용된 변수들 추출
    const usedVars = getExpressionVars(expr);
    
    // 사용된 변수 중 하나라도 업데이트되었는지 확인
    const shouldUpdate = usedVars.some(v => updatedVars.has(v));
    if (!shouldUpdate) {
      return { value: undefined, shouldUpdate: false };
    }

    // 평가식 실행
    const value = evaluateExpression(expr, argsMap);
    // console.log('Processing expression:', expr, value);

    return { value, shouldUpdate: true };
  }

  // 변수명에 해당하는 모든 DOM 요소 업데이트
  function update() {
    const argsMap = new Map<string, unknown>(Object.entries(variables));
    const updatedVars = new Set(argsMap.keys());

    // 조건부 렌더링 처리
    const ifGroups = new Set(
      Array.from(document.querySelectorAll('[pado-if]')).map(el => 
        el.getAttribute('pado-ifgroup')
      )
    );

    ifGroups.forEach(groupName => {
      if (!groupName) return;
      
      const groupElements = document.querySelectorAll(`[pado-ifgroup="${groupName}"]`);
      
      // 그룹의 조건식에 전달된 변수가 있는지 확인
      const hasUpdatedVar = Array.from(groupElements).some(element => {
        const condition = element.getAttribute('pado-if') || element.getAttribute('pado-elseif');
        if (!condition) return;
        
        const vars = getExpressionVars(condition);
        return vars.some(v => argsMap.has(v));
      });

      // 전달된 변수가 없으면 처리하지 않음
      if (!hasUpdatedVar) return;

      let conditionMet = false;

      // 모든 요소를 먼저 숨김
      groupElements.forEach(element => {
        (element as HTMLElement).style.display = 'none';
      });

      // if와 elseif 조건 검사
      for (const element of groupElements) {
        const ifCondition = element.getAttribute('pado-if');
        const elseifCondition = element.getAttribute('pado-elseif');
        
        if (ifCondition || elseifCondition) {
          const condition = ifCondition || elseifCondition;
          if (!condition) continue;
          
          const value = evaluateExpression(condition, argsMap);
          if (value) {
            (element as HTMLElement).style.display = 'inline';
            conditionMet = true;
            break;
          }
        }
      }

      // else 처리
      if (!conditionMet) {
        const elseElement = Array.from(groupElements).find(el => el.hasAttribute('pado-else'));
        if (elseElement) {
          (elseElement as HTMLElement).style.display = 'inline';
        }
      }
    });

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
          const { value, shouldUpdate: exprShouldUpdate } = processExpression(expression, argsMap, updatedVars);

          // console.log('Processing expression:', expression, value);
          if (exprShouldUpdate) {
            shouldUpdate = true;
            result = result.replace(match, String(value));
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
        .filter(
          (attr) =>
            attr.name.startsWith("pado-") &&
            attr.name !== "pado-text" &&
            attr.name !== "pado-init" &&
            attr.name !== "pado-if" &&
            attr.name !== "pado-elseif" &&
            attr.name !== "pado-else"
        )
        .forEach((attr) => {
          const originalAttrName = attr.name.replace("pado-", "");
          const { value, shouldUpdate } = processExpression(attr.value, argsMap, updatedVars);
          
          if (!shouldUpdate || value === undefined) return;

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
        });
    });
  }

  // 최초 실행시에만 템플릿을 변환
  if (!document.querySelector('[pado-init]')) {
    processEventHandlers();
    document.body.setAttribute('pado-init', '');
  }

  // DOM 업데이트 실행
  update();


} as PadoFunction;



export default pado; 