// Instalação e uso offline (RF-18), servidor de arquivos (seção 13) e requisitos não funcionais
// verificáveis no navegador (RNF-02 sem requisições externas, RNF-03 peso, RNF-04 rótulos).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  test,
  expect,
  BASE_URL,
  LONG_TEXT,
  PROJECT_ROOT,
  clickHud,
  closePanel,
  gotoApp,
  openPanel,
  openPrompter,
  startPlaying,
  tapCenter,
} from './helpers.mjs';

function rawGet(urlPath, headers = {}) {
  const { hostname, port } = new URL(BASE_URL);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: hostname, port, path: urlPath, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Largura e altura de um PNG (cabeçalho IHDR). */
function pngSize(buffer) {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test.describe('RF-18 instalação e offline', () => {
  test('manifest com o tipo MIME certo, display standalone/fullscreen e os ícones 192, 512 e maskable 512', async () => {
    const res = await rawGet('/manifest.webmanifest');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/manifest+json; charset=utf-8');
    const manifest = JSON.parse(res.body.toString('utf8'));
    expect(manifest).toMatchObject({
      name: 'Teleprompter',
      short_name: 'Teleprompter',
      lang: 'pt-BR',
      start_url: './',
      scope: './',
      display: 'standalone',
      display_override: ['fullscreen', 'standalone'],
      background_color: '#000000',
      theme_color: '#000000',
    });
    const icons = manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`);
    expect(icons).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const icon of manifest.icons) {
      const file = await rawGet(`/${icon.src}`);
      expect(file.status, icon.src).toBe(200);
      expect(file.headers['content-type'], icon.src).toBe('image/png');
      const size = pngSize(file.body);
      expect(`${size.width}x${size.height}`, icon.src).toBe(icon.sizes);
    }
  });

  test('index.html liga manifest, apple-touch-icon 180 × 180, barra de status translúcida e viewport-fit=cover', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
    await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black-translucent');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    const icon = await rawGet(`/${href}`);
    expect(icon.status).toBe(200);
    expect(pngSize(icon.body)).toEqual({ width: 180, height: 180 });
  });

  test('sw.js é servido como JavaScript, com "rede primeiro" e sem cachear a API', async () => {
    const res = await rawGet('/sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    const source = res.body.toString('utf8');
    expect(source).toContain("addEventListener('fetch'");
    expect(source).toMatch(/networkFirst/);
    expect(source).toMatch(/API_PATH/);
  });

  test('arquivos com MIME certo, no-cache, ETag e pedidos parciais (Range → 206)', async () => {
    const cases = {
      '/': 'text/html; charset=utf-8',
      '/index.html': 'text/html; charset=utf-8',
      '/css/prompter.css': 'text/css; charset=utf-8',
      '/js/prompter/prompter.js': 'text/javascript; charset=utf-8',
      '/icons/icon.svg': 'image/svg+xml',
    };
    for (const [url, type] of Object.entries(cases)) {
      const res = await rawGet(url);
      expect(res.status, url).toBe(200);
      expect(res.headers['content-type'], url).toBe(type);
      expect(res.headers['cache-control'], url).toBe('no-cache');
      expect(res.headers['x-content-type-options'], url).toBe('nosniff');
      expect(res.headers.etag, url).toBeTruthy();
    }
    const partial = await rawGet('/js/store.js', { Range: 'bytes=0-9' });
    expect(partial.status).toBe(206);
    expect(partial.headers['content-range']).toMatch(/^bytes 0-9\/\d+$/);
    expect(partial.body.length).toBe(10);
  });

  test('o app registra sw.js depois de carregar, em contexto seguro (localhost)', async ({ page }) => {
    // Com serviceWorkers: 'block' o Playwright troca navigator.serviceWorker.register no próprio objeto;
    // o espião entra depois e substitui essa troca.
    await page.addInitScript(() => {
      window.__sw = [];
      if (navigator.serviceWorker) {
        navigator.serviceWorker.register = function register(url) {
          window.__sw.push({ url: String(url), secure: window.isSecureContext, loaded: document.readyState === 'complete' });
          return new Promise(() => {});
        };
      }
    });
    await gotoApp(page, { script: LONG_TEXT });
    await expect.poll(() => page.evaluate(() => window.__sw)).toEqual([{ url: 'sw.js', secure: true, loaded: true }]);
  });

  test.describe('service worker', () => {
    test.use({ serviceWorkers: 'allow' });

    test('registra em contexto seguro (localhost) e o app abre sem rede depois da primeira visita', async ({ page, context, appErrors, browserName }) => {
      // O WebKit do Playwright no Windows dá "internal error" ao recarregar sob service worker e depois
      // trava ao fechar o navegador: o caminho offline real fica coberto pelo Chromium.
      test.skip(browserName === 'webkit', 'WebKit do Playwright no Windows: erro interno com service worker');
      appErrors.allow(/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::|Load failed|offline|fetch/i);
      await gotoApp(page, { script: LONG_TEXT });
      expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
      expect(scope).toBe(new URL('/', page.url()).href);
      // Garante que a página já está sob o controle do service worker e os módulos entraram no cache.
      await page.reload();
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await openPrompter(page);
      await clickHud(page, 'exit');
      await context.setOffline(true);
      try {
        await page.reload();
        await expect(page.locator('textarea[name="script"]')).toHaveValue(LONG_TEXT);
        await expect(page.locator('[data-action="roteiros"]')).toBeHidden(); // a API não fica no cache
        await openPrompter(page);
        await tapCenter(page);
        await expect(page.locator('#prompter-screen')).toHaveAttribute('data-state', 'playing');
      } finally {
        await context.setOffline(false);
      }
    });
  });
});

test.describe('Requisitos não funcionais', () => {
  test('RNF-02: nenhuma requisição externa (CDN, fontes, analytics) num uso completo', async ({ page }) => {
    const origin = new URL(BASE_URL).origin;
    const external = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url);
    });
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await tapCenter(page);
    await openPanel(page);
    await closePanel(page);
    await clickHud(page, 'exit');
    await page.locator('[data-action="roteiros"]').click();
    await expect(page.locator('.dialog .list__item').first()).toBeVisible();
    expect(external).toEqual([]);
  });

  test('RNF-03: JS + CSS do app abaixo de 200 KB, sem minificar', async ({}, testInfo) => {
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|css)$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(PROJECT_ROOT, 'public', 'js'));
    walk(path.join(PROJECT_ROOT, 'public', 'css'));
    const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
    testInfo.annotations.push({ type: 'peso', description: `${(bytes / 1024).toFixed(1)} KB em ${files.length} arquivos` });
    expect(bytes).toBeLessThan(200 * 1024);
  });

  test('RNF-04: todo botão tem nome acessível em português', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await openPanel(page);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim()))
        .map((b) => b.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
    const labels = await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')));
    expect(labels.length).toBeGreaterThan(10);
    for (const label of labels) expect(label).toMatch(/^[A-ZÀ-Úa-zà-ú][\p{L} −+]*$/u);
  });

  test('RNF-04: foco visível em âmbar ao navegar pelo teclado', async ({ page, browserName }) => {
    // Como o Safari, o WebKit não leva o Tab aos botões (só a campos): o anel de foco, que é o mesmo CSS
    // nos dois motores, é conferido pelo Tab real no Chromium.
    test.skip(browserName === 'webkit', 'no WebKit o Tab não passa pelos botões (padrão do Safari)');
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return { tag: el.tagName, color: style.outlineColor, width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline.tag).toBe('BUTTON');
    expect(outline).toMatchObject({ color: 'rgb(255, 176, 32)', width: '2px', style: 'solid' });
  });
});
