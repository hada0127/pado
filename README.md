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
### 완료
- 개발 모드 시 vite 기반 HMR 구현
- ts파일의 변수와 이벤트 핸들러를 html에 전달
- Dom의 Text 변경 구현
- Dom의 기본 속성 변경 구현
- Form 요소의 속성 변경 구현
- Dom에 업데이트는 수동으로 명확하게 할 것
- 변경된 변수만 Dom에 업데이트 가능하도록
- 평가식 구현
- `&lbrace;` 적용 제외
- loop 구현 - 배열의 요소가 변경되면 변경된 요소를 인식하여 변경
- if문 구현 - 조건이 변경되면 변경된 조건을 인식하여 변경
- 중첩된 if와 loop 구현
- loop 내에서 평가식(3항 연산자 포함) 구현
- 가능하면 vitePlugin으로 컴파일하여 미리 최적화
- vitePlugin으로 pado파일을 변경 시 마다 캐싱하고 캐싱된 데이터를 서빙
- index.html와 app/page.pado 분리, index.ts 제거하고 page.ts 파일로 변경
- .pado 파일이 보일시 같은 이름의 .ts파일 자동 로딩
- SCSS Module 사용 (page.scss)
- SCSS 캐싱
- page.ts를 컴파일하여 캐싱
- src/app 폴더 기반 라우팅 구현
- `(group)` 기능 구현
- `[slug]` 기능 구현
- 쿼리 스트링 전달 기능 구현
- 정적 파일 서빙 (이미지 등)

### 미완료
- title 및 메타 태그 구현
- global.scss, mixin.scss 구현
- layout.pado, layout.scss, layout.ts 구현
- Server Side Script 구현 - client보다 먼저 실행 (page.server.ts)
- 컴포넌트 기능(component.pado, component.ts, component.scss) 및 컴포넌트 import 구현
- 컴포넌트의 props 기능 구현
- 빌드 및 실행 구현

## 구현 현황
### 2025-02-13
- 정적 파일 서빙 (이미지 등)
- 폴더 구조 변경 및 분할

### 2025-02-12
- page.ts를 컴파일하여 캐싱
- src/app 폴더 기반 라우팅 구현
- `(group)` 기능 구현
- `[slug]` 기능 구현
- 쿼리 스트링 전달 기능 구현


### 2025-02-11
- loop 구현 - 배열의 요소가 변경되면 변경된 요소를 인식하여 변경
- if문 구현 - 조건이 변경되면 변경된 조건을 인식하여 변경
- 중첩된 if와 loop 구현
- loop 내에서 평가식(3항 연산자 포함) 구현
- vitePlugin으로 pado파일을 변경 시 마다 캐싱하고 캐싱된 데이터를 서빙
- SCSS Module 사용 (page.scss)
- SCSS 캐싱

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
