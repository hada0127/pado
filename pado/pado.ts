type PadoFunction = {
  (variables: Record<string, unknown>): void;
}

// 조건부 렌더링을 위한 타입 정의
type Condition = {
  groupName: string;
  blocks: Array<{
    type: 'if' | 'elseif' | 'else';
    condition?: string;
    content: string;
  }>;
};

// 캐시된 조건들을 저장할 Map - 타입 수정
const conditionsMap = new Map<string, Condition>();

const pado = function(variables: Record<string, unknown>): void {
  // 캐시된 조건들 로드
  async function loadConditions() {
    try {
      const conditions = (window as any).__PADO_CONDITIONS__;
      console.log('Loading conditions raw:', (window as any).__PADO_CONDITIONS__);
      console.log('Loading conditions parsed:', conditions);
      if (conditions) {
        conditions.forEach((condition: Condition) => {
          console.log('Setting condition:', condition.groupName, condition);
          conditionsMap.set(condition.groupName, condition);
        });
      }
      console.log('Final conditionsMap:', {
        size: conditionsMap.size,
        keys: Array.from(conditionsMap.keys()),
        entries: Array.from(conditionsMap.entries())
      });
    } catch (error) {
      console.error('Error loading conditions:', error);
    }
  }

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

  // 조건부 렌더링 처리
  function processConditionalRendering(argsMap: Map<string, unknown>, updatedVars: Set<string>) {
    // 조건 평가 결과를 캐시하는 맵
    const evaluationCache = new Map<string, string>();

    // 재귀적으로 조건부 렌더링 처리
    function processNode(commentNode: Comment): string | null {
      const match = commentNode.textContent?.trim().match(/^if:([^>]+)$/);
      if (!match) return null;

      const groupName = match[1].trim();
      const condition = conditionsMap.get(groupName);
      if (!condition) return null;

      // 조건식에 사용된 변수들 수집
      const allVarsInConditions = condition.blocks
        .filter(block => block.condition)
        .map(block => getExpressionVars(block.condition!))
        .flat();

      const uniqueVars = Array.from(new Set(allVarsInConditions));
      const hasUpdatedVar = uniqueVars.some(v => updatedVars.has(v));

      if (!hasUpdatedVar) {
        // 캐시된 결과가 있으면 사용
        const cachedContent = evaluationCache.get(groupName);
        if (cachedContent) return cachedContent;
        return null;
      }

      let content = '';
      let matched = false;

      // 조건 평가
      for (const block of condition.blocks) {
        if (block.type === 'if' || block.type === 'elseif') {
          const result = evaluateExpression(block.condition!, argsMap);
          if (result) {
            content = block.content;
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        const elseBlock = condition.blocks.find(block => block.type === 'else');
        if (elseBlock) {
          content = elseBlock.content;
        }
      }

      // 결과 캐시
      evaluationCache.set(groupName, content);
      return content;
    }

    // DOM 순회하면서 조건부 렌더링 처리
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_COMMENT,
      null
    );

    const nodesToProcess: { node: Comment; content: string }[] = [];
    let node;

    while ((node = walker.nextNode())) {
      const commentNode = node as Comment;
      const content = processNode(commentNode);
      
      if (content !== null) {
        // 기존 내용 제거
        while (commentNode.nextSibling && !(commentNode.nextSibling instanceof Comment)) {
          commentNode.nextSibling.remove();
        }

        // 새 내용 삽입
        if (content) {
          const template = document.createElement('template');
          template.innerHTML = content.trim();
          commentNode.after(template.content);
        }
      }
    }
  }

  function update() {
    const argsMap = new Map<string, unknown>(Object.entries(variables));
    const updatedVars = new Set(argsMap.keys());

    // 조건부 렌더링 처리
    processConditionalRendering(argsMap, updatedVars);

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

  // 최초 실행시에만 템플릿을 변환하고 조건들을 로드
  if (!document.querySelector('[pado-init]')) {
    loadConditions().then(() => {
      processEventHandlers();
      document.body.setAttribute('pado-init', '');
      update();
    });
  } else {
    update();
  }
} as PadoFunction;

export default pado; 