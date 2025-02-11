# Pado

나만의 Reactive 라이브러리 만들기

## 설계방향
1. 사용과 코드 작성에 간결함 유지
2. Type Safety할 것
3. 테스트가 가능할 것
4. 가급적 사용이 쉽도록
5. 성능엔 크게 중심을 두지 않는다. 일반적인 장비에서 문제가 없을 정도로만 최대한 간결하게 구현
6. Dom Update는 업데이트 되어야 하는 항목만 수동으로 명확하게 할 것
7. 풀스택 웹사이트 개발이 가능할 것

## Roadmap
### 1차 (0.1.0)
- ✅ 개발 모드 시 vite 기반 HMR 구현
- ✅ ts파일의 변수와 이벤트 핸들러를 html에 전달
- ✅ Dom의 Text 변경 구현
- ✅ Dom의 기본 속성 변경 구현
- ✅ Form 요소의 속성 변경 구현
- ✅ Dom에 업데이트는 수동으로 명확하게 할 것
- ✅ 변경된 변수만 Dom에 업데이트 가능하도록
- ✅ 평가식 구현
- ✅ `&lbrace;` 적용 제외
- ✅ loop 구현 - 배열의 요소가 변경되면 변경된 요소를 인식하여 변경
- ✅ if문 구현 - 조건이 변경되면 변경된 조건을 인식하여 변경
- ✅ 중첩된 if와 loop 구현
- ✅ loop 내에서 평가식(3항 연산자 포함) 구현
- ✅ 가능하면 vitePlugin으로 컴파일하여 미리 최적화
- ✅ vitePlugin으로 pado파일을 변경 시 마다 캐싱하고 캐싱된 데이터를 서빙

### 2차 (0.2.0)
- ✅ index.html와 app/page.pado 분리, index.ts 제거하고 page.ts 파일로 변경
- ✅ .pado 파일이 보일시 같은 이름의 .ts파일 자동 로딩
- 컴포넌트 기능 구현
- 컴포넌트의 props 기능 구현
- component.pado, component.ts 파일 구현

### 3차 (0.3.0)
- 빌드 및 Production 모드 구현
- SCSS Module 사용

### 4차 (0.4.0)
- 폴더 기반 라우팅 구현
- Tag, Script, Style 파일 구현 및 분리(page.pado, page.ts, page.scss)
- `[slug]` 기능 구현
- `(group)` 기능 구현

### 5차 (0.5.0)
- Server 동작, Client 동작 파일 분리(page.server.ts , page.ts, page.pado)

### 6차 (1.0.0)
- Server Side Rendering 구현 (page.server.pado)
- 컴포넌트의 Server Side Rendering 구현 (component.server.pado)

## 구현 현황
### 2025-02-11
- loop 구현 - 배열의 요소가 변경되면 변경된 요소를 인식하여 변경
- if문 구현 - 조건이 변경되면 변경된 조건을 인식하여 변경
- 중첩된 if와 loop 구현
- loop 내에서 평가식(3항 연산자 포함) 구현
- vitePlugin으로 pado파일을 변경 시 마다 캐싱하고 캐싱된 데이터를 서빙

### 2025-02-07
- `&lbrace;` 적용 제외
- index.html와 app/page.pado 분리, index.ts 제거하고 page.ts 파일로 변경
- .pado 파일이 보일시 같은 이름의 .ts파일 자동 로딩

### 2025-02-06
- Form 요소의 속성 변경 구현
- 평가식 구현
- 가능하면 vitePlugin으로 컴파일하여 미리 최적화

### 2025-02-05
- ts파일의 변수와 이벤트 핸들러를 html에 전달
- Dom의 Text 변경 구현
- Dom의 기본 속성 변경 구현
- Dom에 업데이트는 수동으로 명확하게 할 것
- 변경된 변수만 Dom에 업데이트 가능하도록

### 2025-02-04
- 프로젝트 생성
- 개발 모드 시 vite 기반 HMR 구현
