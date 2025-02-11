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

// 타입 정의 추가
type Loop = {
  name: string;
  arrayExpr: string;
  itemName: string;
  content: string;
};

// 캐시된 loops를 저장할 Map
const loopsMap = new Map<string, Loop>();

const pado = function(variables: Record<string, unknown>): void {
  // 캐시된 조건들 로드
  async function loadConditions() {
    try {
      const conditions = (window as any).__PADO_CONDITIONS__;
      const loops = (window as any).__PADO_LOOPS__;
      
      if (conditions) {
        conditions.forEach((condition: Condition) => {
          conditionsMap.set(condition.groupName, condition);
        });
      }
      
      if (loops) {
        loops.forEach((loop: Loop) => {
          loopsMap.set(loop.name, loop);
        });
      }
      
    } catch (error) {
      console.error('Error loading conditions and loops:', error);
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

  function evaluateExpression(expression: string, argsMap: Map<string, unknown>): unknown {
    try {
      const vars: Record<string, unknown> = {};

      // 변수들을 객체에 복사
      for (const [key, value] of argsMap.entries()) {
        vars[key] = value;
      }

      // 배열 접근 표현식 처리
      const arrayPattern = /(\w+)\[(\d+)\]/g;
      const processedExpr = expression.replace(arrayPattern, (_, name, index) => {
        const array = vars[name];
        if (Array.isArray(array)) {
          const tempVarName = `__temp_${name}_${index}`;
          vars[tempVarName] = array[Number(index)];
          return tempVarName;
        }
        return '';
      });

      // 매개변수와 표현식 안전하게 처리
      const keys = Object.keys(vars).filter((key) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key));
      const values = keys.map((key) => vars[key]);

      // 표현식 정리 및 문자열 리터럴 처리
      const cleanExpr = processedExpr
        .trim()
        .replace(/[\n\r]/g, '')
        // 문자열 리터럴 처리 (작은따옴표와 큰따옴표 모두 처리)
        .replace(/'([^']*)'|"([^"]*)"/g, (match) => {
          if (match.startsWith("'") || match.startsWith('"')) {
            return JSON.stringify(match.slice(1, -1));
          }
          return match;
        })
        // 중괄호 표현식 처리
        .replace(/\{([^}]+)\}/g, '$1');

      // 함수 생성 및 실행
      const functionBody = `try { return ${cleanExpr}; } catch(e) { return undefined; }`;

      // 안전한 함수 생성
      const func = new Function(...keys, functionBody);

      return func(...values);
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
  function processConditionalRendering(argsMap: Map<string, unknown>, updatedVars: Set<string>, root: ParentNode = document.body) {
    // 조건 평가 결과를 캐시하는 맵
    const evaluationCache = new Map<string, string>();

    // DOM 순회하면서 조건부 렌더링 처리
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_COMMENT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      const commentNode = node as Comment;
      const match = commentNode.textContent?.trim().match(/^if:([^>]+)$/);
      if (!match) continue;

      const groupName = match[1].trim();
      const condition = conditionsMap.get(groupName);
      if (!condition) continue;

      // 조건식에 사용된 변수들 수집
      const allVarsInConditions = condition.blocks
        .filter(block => block.condition)
        .map(block => getExpressionVars(block.condition!))
        .flat();

      const uniqueVars = Array.from(new Set(allVarsInConditions));
      const hasUpdatedVar = uniqueVars.some(v => updatedVars.has(v));

      if (!hasUpdatedVar) continue;

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

  // processLoopRendering 함수 수정
  function processLoopRendering(argsMap: Map<string, unknown>, updatedVars: Set<string>) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_COMMENT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      const commentNode = node as Comment;
      const match = commentNode.textContent?.trim().match(/^loop:([^>]+)$/);
      if (!match) continue;

      const name = match[1].trim();
      const loop = loopsMap.get(name);
      if (!loop) continue;

      // 배열 표현식에 사용된 변수 확인
      const arrayVars = getExpressionVars(loop.arrayExpr);
      const hasUpdatedVar = arrayVars.some(v => updatedVars.has(v));
      if (!hasUpdatedVar) continue;

      // 배열 평가
      const array = evaluateExpression(loop.arrayExpr, argsMap) as unknown[];
      if (!Array.isArray(array)) continue;

      // 기존 내용 제거
      while (commentNode.nextSibling && !(commentNode.nextSibling instanceof Comment)) {
        commentNode.nextSibling.remove();
      }

      // 새 내용 생성
      const fragment = document.createDocumentFragment();
      array.forEach((item, index) => {
        const template = document.createElement('template');
        const itemMap = new Map(argsMap);
        itemMap.set('index', index);
        itemMap.set(loop.arrayExpr, array);
        itemMap.set(`${loop.arrayExpr}[${index}]`, item);

        let content = loop.content;
        
        // itemName을 배열 인덱스 형태로 변환
        content = content.replace(
          new RegExp(`{${loop.itemName}(\\.\\w+)?}`, 'g'),
          (match) => {
            if (match.includes('.')) {
              return match.replace(`${loop.itemName}.`, `${loop.arrayExpr}[${index}].`);
            }
            return `{${loop.arrayExpr}[${index}]}`;
          }
        );

        // 중첩된 if 처리를 위한 임시 div
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;

        // 중첩된 if 처리
        const walker = document.createTreeWalker(
          tempDiv,
          NodeFilter.SHOW_COMMENT,
          null
        );

        let ifNode;
        while ((ifNode = walker.nextNode())) {
          const ifCommentNode = ifNode as Comment;
          const ifMatch = ifCommentNode.textContent?.trim().match(/^if:([^>]+)$/);
          if (ifMatch) {
            const groupName = ifMatch[1].trim();
            const condition = conditionsMap.get(groupName);
            if (condition) {
              // 모든 변수를 업데이트 대상으로 처리
              const allVars = new Set([
                ...updatedVars,
                ...Array.from(itemMap.keys()),
                ...condition.blocks
                  .filter(block => block.condition)
                  .flatMap(block => getExpressionVars(block.condition!))
              ]);
              
              // 중첩된 if 처리
              processConditionalRendering(itemMap, allVars, tempDiv);
            }
          }
        }

        // pado- 속성 처리
        const elements = tempDiv.querySelectorAll('*');
        elements.forEach(element => {
          Array.from(element.attributes)
            .filter(attr => attr.name.startsWith('pado-'))
            .forEach(attr => {
              const originalAttrName = attr.name.replace('pado-', '');
              const expr = attr.value.replace(
                new RegExp(`${loop.itemName}(\\.\\w+)?(?=}|\\s)`, 'g'),
                (match) => {
                  if (match.includes('.')) {
                    return match.replace(`${loop.itemName}.`, `${loop.arrayExpr}[${index}].`);
                  }
                  return `${loop.arrayExpr}[${index}]`;
                }
              );
              const value = evaluateExpression(expr, itemMap);

              // boolean 속성 처리
              if (['checked', 'disabled', 'readonly'].includes(originalAttrName)) {
                const boolValue = Boolean(value);
                if (boolValue) {
                  element.setAttribute(originalAttrName, '');
                } else {
                  element.removeAttribute(originalAttrName);
                }
              }
              // value 속성 처리
              else if (originalAttrName === 'value') {
                element.setAttribute(originalAttrName, String(value));
              }
              // text 속성 처리
              else if (originalAttrName === 'text') {
                element.textContent = String(value);
              }
              // 기타 속성 처리
              else {
                element.setAttribute(originalAttrName, String(value));
              }
            });
        });

        content = tempDiv.innerHTML;
        template.innerHTML = content;
        fragment.appendChild(template.content);
      });

      commentNode.after(fragment);
    }
  }

  function update() {
    const argsMap = new Map<string, unknown>(Object.entries(variables));
    const updatedVars = new Set(argsMap.keys());

    // 조건부 렌더링 처리
    processConditionalRendering(argsMap, updatedVars);

    // 반복문 처리
    processLoopRendering(argsMap, updatedVars);

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