import fs from 'fs';
import path from 'path';

// 동적 라우팅 파라미터를 저장할 타입 정의
type RouteParams = {
  [key: string]: string;
};

// URL 경로를 실제 파일 경로로 변환하는 함수 수정
export function getActualPath(urlPath: string): { path: string; params: RouteParams } {
  const appDir = path.join(process.cwd(), 'src/app');

  // URL에서 쿼리 스트링 제거
  const [pathWithoutQuery] = urlPath.split('?');
  const segments = pathWithoutQuery.split('/').filter(Boolean);
  const params: RouteParams = {};

  // 쿼리 스트링 파싱하여 params에 추가
  const queryString = urlPath.split('?')[1];
  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }

  // 루트 경로(/) 처리
  if (segments.length === 0) {
    const defaultPath = path.join(appDir, 'page.pado');
    if (fs.existsSync(defaultPath)) {
      return { path: 'src/app', params };
    }
  }

  // 직접 경로 확인
  const directPath = path.join(appDir, ...segments);
  if (fs.existsSync(directPath)) {
    return { path: path.join('src/app', ...segments), params };
  }

  // 괄호 경로와 동적 라우팅 검색
  const findInDirectory = (
    dir: string,
    remainingSegments: string[]
  ): { path: string; params: RouteParams } | null => {
    if (remainingSegments.length === 0) {
      // 현재 디렉토리에 page.pado가 있는지 확인
      const pagePath = path.join(dir, 'page.pado');
      if (fs.existsSync(pagePath)) {
        return {
          path: path.join('src/app', path.relative(appDir, dir)),
          params
        };
      }
      return null;
    }

    const items = fs.readdirSync(dir);
    const segment = remainingSegments[0];
    const nextSegments = remainingSegments.slice(1);

    // 정확한 매칭 먼저 시도
    if (items.includes(segment)) {
      const fullPath = path.join(dir, segment);
      if (fs.statSync(fullPath).isDirectory()) {
        const found = findInDirectory(fullPath, nextSegments);
        if (found) return found;
      }
    }

    // 그 다음 동적 라우팅과 괄호 매칭 시도
    for (const item of items) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        // 동적 라우팅 매칭 ([id] 형태)
        if (item.startsWith('[') && item.endsWith(']')) {
          const paramName = item.slice(1, -1);
          params[paramName] = segment;
          const found = findInDirectory(fullPath, nextSegments);
          if (found) return found;
          delete params[paramName]; // 매칭 실패시 파라미터 제거
        }

        // 괄호 디렉토리 매칭
        if (item.startsWith('(') && item.endsWith(')')) {
          const found = findInDirectory(fullPath, remainingSegments);
          if (found) return found;
        }
      }
    }
    return null;
  };

  const found = findInDirectory(appDir, segments);
  return found || { path: '', params: {} };
}

export async function replaceAsync(
  str: string,
  regex: RegExp,
  asyncFn: (match: string, ...args: any[]) => Promise<string>
) {
  const promises: Promise<string>[] = [];
  str.replace(regex, (match, ...args) => {
    promises.push(asyncFn(match, ...args));
    return match;
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift() || '');
}
