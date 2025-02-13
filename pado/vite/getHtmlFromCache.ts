import fs from 'fs';

export function getHtmlFromCache(
  cachePath: string,
  options?: { fullPage?: boolean; params?: Record<string, any> }
): string {
  if (!fs.existsSync(cachePath)) {
    return '';
  }
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  const styleContent = cache.styles ? `<style>${cache.styles}</style>` : '';
  const scriptPath = cachePath.replace(/\.json$/, '.js');
  const scriptContent = fs.existsSync(scriptPath)
    ? `<script type="module" src="/cache${scriptPath.split('cache')[1]}"></script>`
    : '';
  let conditionsScript = `<script>
    window.__PADO_CONDITIONS__ = ${JSON.stringify(cache.conditions)};
    window.__PADO_LOOPS__ = ${JSON.stringify(cache.loops)};
  </script>`;
  if (options && options.params) {
    conditionsScript = `<script>
    window.__PADO_CONDITIONS__ = ${JSON.stringify(cache.conditions)};
    window.__PADO_LOOPS__ = ${JSON.stringify(cache.loops)};
    window.__PADO_PARAMS__ = ${JSON.stringify(options.params)};
  </script>`;
  }
  if (options && options.fullPage) {
    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Pado</title>
    <base href="/">
    ${styleContent}
    ${conditionsScript}
  </head>
  <body>
    ${cache.html}
    <script type="module">
      import '/@vite/client'
    </script>
    ${scriptContent}
  </body>
</html>
    `;
  } else {
    return `${styleContent}
${conditionsScript}
${scriptContent}
${cache.html}`;
  }
}
