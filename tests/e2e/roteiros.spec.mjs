// "Roteiros do PC" (RF-08, seções 5.5 e 13): lista do servidor, carregar com Desfazer, erros de rede
// e nenhuma leitura fora dos fala.md listados.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect, BASE_URL, PROJECT_ROOT, gotoApp } from './helpers.mjs';

const FIXTURE_LIST = [
  { id: '2026-10-25-letra-e-distancia', titulo: 'Teleprompter: letra e distância', data: '2026-10-25', palavras: 20 },
  { id: '2026-10-20-luz-e-enquadramento', titulo: 'Atenção: luz e enquadramento para vídeo', data: '2026-10-20', palavras: 51 },
  { id: '2026-09-14-cuidados-com-o-audio', titulo: 'Cuidados com o áudio', data: '2026-09-14', palavras: 13 },
  { id: '2026-08-30-sem-titulo-no-arquivo', titulo: 'sem titulo no arquivo', data: '2026-08-30', palavras: 11 },
];

const LUZ_TEXT =
  'Abertura\n\n' +
  'Olá! Hoje vamos falar de iluminação com luz natural e do ring light que não é só um enfeite.\n\n' +
  'A pergunta é: a câmera percebe a diferença?\n\n' +
  'Veja o guia completo e compare as fotos.\n\n' +
  'Lente · Nitidez\n50 mm · 90%\n35 mm · 75%\n\n' +
  'Até a próxima, e obrigado por assistir.';

/** GET cru (o caminho vai exatamente como escrito; fetch normalizaria "..", "%2e" e afins). */
function rawGet(urlPath, { base = BASE_URL, method = 'GET' } = {}) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: hostname, port, path: urlPath, method }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

const dialog = (page) => page.locator('.dialog.ed-dialog');
const roteirosButton = (page) => page.locator('[data-action="roteiros"]');

async function openRoteiros(page) {
  await expect(roteirosButton(page)).toBeVisible();
  await roteirosButton(page).click();
  await expect(dialog(page)).toHaveClass(/is-open/);
}

test.describe('RF-08 Roteiros do PC', () => {
  test('a lista mostra os fala.md do mais novo para o mais antigo, com título sem "Fala — ", data e palavras', async ({ page }) => {
    await gotoApp(page, { script: 'Texto atual.' });
    await openRoteiros(page);
    const items = dialog(page).locator('.list__item');
    await expect(items).toHaveCount(FIXTURE_LIST.length);
    await expect(dialog(page).locator('.list__title')).toHaveText(FIXTURE_LIST.map((item) => item.titulo));
    await expect(dialog(page).locator('.list__meta')).toHaveText(FIXTURE_LIST.map((item) => `${item.data} · ${item.palavras} palavras`));
    await expect(page.locator('#ed-roteiros-title')).toHaveText('Roteiros do PC');
    await expect(page.locator('#ed-roteiros-title')).toBeFocused();
    await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
  });

  test('tocar num roteiro carrega o texto (substitui o atual) e "Desfazer" devolve o anterior', async ({ page }) => {
    await gotoApp(page, { script: 'Texto atual que vai ser trocado.' });
    await openRoteiros(page);
    await dialog(page).locator('.list__item', { hasText: 'Atenção: luz e enquadramento' }).click();
    await expect(page.locator('.ed-dialog')).toHaveCount(0);
    await expect(page.locator('textarea[name="script"]')).toHaveValue(LUZ_TEXT);
    await expect(page.locator('.ed-stats')).toContainText('51 palavras');
    const toast = page.locator('.ed-toast');
    await expect(toast).toContainText('Roteiro carregado');
    await toast.locator('[data-action="undo"]').click();
    await expect(page.locator('textarea[name="script"]')).toHaveValue('Texto atual que vai ser trocado.');
  });

  test('o diálogo fecha pelo ×, pelo Esc e pelo fundo; o foco volta ao botão', async ({ page }) => {
    await gotoApp(page, { script: 'Texto atual.' });
    await openRoteiros(page);
    await dialog(page).locator('.sheet__header [data-action="close-dialog"]').click();
    await expect(page.locator('.ed-dialog')).toHaveCount(0);
    await expect(roteirosButton(page)).toBeFocused();
    await openRoteiros(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ed-dialog')).toHaveCount(0);
    await openRoteiros(page);
    await page.locator('.dialog__scrim').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.ed-dialog')).toHaveCount(0);
    await expect(page.locator('textarea[name="script"]')).toHaveValue('Texto atual.');
  });

  test('sem a API (app hospedado em outro lugar) o botão não aparece', async ({ page, appErrors }) => {
    appErrors.allow(/Failed to load resource|ERR_FAILED|ERR_ABORTED|net::|fetch|Load failed/i);
    await page.route('**/api/roteiros', (route) => route.abort());
    await gotoApp(page, { script: 'Texto atual.' });
    await page.waitForTimeout(300);
    await expect(roteirosButton(page)).toBeHidden();
    await expect(page.locator('[data-action="import"]')).toBeVisible();
  });

  test('erro de rede no diálogo: "Não foi possível carregar os roteiros do PC." e "Tentar de novo" recupera', async ({ page, appErrors }) => {
    appErrors.allow(/Failed to load resource|ERR_FAILED|ERR_ABORTED|net::|fetch|Load failed/i);
    await gotoApp(page, { script: 'Texto atual.' });
    await expect(roteirosButton(page)).toBeVisible();
    await page.route('**/api/roteiros', (route) => route.abort());
    await roteirosButton(page).click();
    const status = dialog(page).locator('.ed-dialog-status');
    await expect(status).toContainText('Não foi possível carregar os roteiros do PC.');
    await expect(status).toHaveAttribute('role', 'alert');
    await page.unroute('**/api/roteiros');
    await status.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(dialog(page).locator('.list__item')).toHaveCount(FIXTURE_LIST.length);
    // Falha ao baixar o roteiro escolhido também mostra o erro, sem mexer no texto.
    await page.route('**/api/roteiros/*', (route) => route.abort());
    await dialog(page).locator('.list__item').first().click();
    await expect(dialog(page).locator('.ed-dialog-status')).toContainText('Não foi possível carregar os roteiros do PC.');
    await expect(page.locator('textarea[name="script"]')).toHaveValue('Texto atual.');
  });
});

test.describe('RF-08 API do servidor (seção 13)', () => {
  test('GET /api/roteiros devolve a lista em JSON, mais novo primeiro; GET /api/roteiros/<id> devolve o fala.md', async () => {
    const list = await rawGet('/api/roteiros');
    expect(list.status).toBe(200);
    expect(list.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(JSON.parse(list.body)).toEqual({ roteiros: FIXTURE_LIST });
    const item = await rawGet('/api/roteiros/2026-10-25-letra-e-distancia');
    expect(item.status).toBe(200);
    expect(item.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(item.body).toMatch(/^# Fala — Teleprompter: letra e distância\n/);
  });

  test('nenhum arquivo fora dos fala.md listados pode ser lido (.., %2e%2e, ids inventados → 404)', async () => {
    const attempts = [
      '/api/roteiros/..%2F..%2Fsegredo.txt',
      '/api/roteiros/..%2Fsegredo.txt',
      '/api/roteiros/%2e%2e%2f%2e%2e%2fsegredo.txt',
      '/api/roteiros/%2E%2E%5C%2E%2E%5Csegredo.txt',
      '/api/roteiros/2026-10-25-letra-e-distancia%2F..%2F..%2Fsegredo.txt',
      '/api/roteiros/2026-10-25-letra-e-distancia%2FRoteiro%2Ffala.md',
      '/api/roteiros/2026-10-01-sem-fala',
      '/api/roteiros/rascunho',
      '/api/roteiros/2026-12-31-roteiro-inventado',
      '/api/roteiros/..',
      '/api/roteiros/../../segredo.txt',
      '/api/../../tests/e2e/fixtures/segredo.txt',
      '/../server.mjs',
      '/%2e%2e/server.mjs',
      '/..%2fserver.mjs',
      '/..%5cserver.mjs',
      '/js/..%2F..%2Fserver.mjs',
      '/%2e%2e%2f%2e%2e%2fRoteiros%2f2026-10-25-letra-e-distancia%2fRoteiro%2ffala.md',
      '/server.mjs',
      '/package.json',
      '/.htaccess',
      '/js/%00store.js',
      '/C:%5CWindows%5Cwin.ini',
      '/con',
    ];
    for (const attempt of attempts) {
      const res = await rawGet(attempt);
      expect(res.status, attempt).toBe(404);
      expect(res.body, attempt).not.toContain('SEGREDO');
      expect(res.body, attempt).not.toContain('startServer');
    }
  });

  test('o servidor só aceita GET e HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await rawGet('/api/roteiros', { method });
      expect(res.status, method).toBe(405);
      expect(res.headers.allow).toBe('GET, HEAD');
    }
    const head = await rawGet('/api/roteiros', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
  });

  test('pasta Roteiros de verdade (TELEPROMPTER_ROTEIROS_REAIS): a lista mostra o roteiro mais novo e devolve o fala.md dele', async () => {
    const real = process.env.TELEPROMPTER_ROTEIROS_REAIS ? path.resolve(process.env.TELEPROMPTER_ROTEIROS_REAIS) : '';
    const ids =
      real && fs.existsSync(real) && fs.statSync(real).isDirectory()
        ? fs.readdirSync(real).filter((name) => /^\d{4}-\d{2}-\d{2}-/.test(name) && fs.existsSync(path.join(real, name, 'Roteiro', 'fala.md')))
        : [];
    test.skip(!ids.length, 'defina TELEPROMPTER_ROTEIROS_REAIS com uma pasta Roteiros');
    const newest = ids.sort().at(-1);
    const file = path.join(real, newest, 'Roteiro', 'fala.md');
    // Segundo servidor, só leitura, apontado para a pasta de verdade (o da suíte usa as fixtures).
    const { startServer } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'server.mjs')).href);
    const server = await startServer({ port: 0, host: '127.0.0.1', roteirosDir: real, quiet: true });
    try {
      const base = `http://127.0.0.1:${server.port}/`;
      const list = JSON.parse((await rawGet('/api/roteiros', { base })).body).roteiros;
      const item = list.find((entry) => entry.id === newest);
      expect(item).toBeTruthy();
      expect(item.data).toBe(newest.slice(0, 10));
      expect(item.palavras).toBeGreaterThan(0);
      // Comparações sem diff: título e texto do roteiro não vão para o relatório.
      expect(list.every((entry) => !/^Fala[ \t]*(?:[—–-]|:)/i.test(entry.titulo)), 'nenhum título fica com o prefixo "Fala — "').toBe(true);
      const dates = list.map((entry) => entry.data);
      expect(dates).toEqual([...dates].sort().reverse());
      const text = await rawGet(`/api/roteiros/${encodeURIComponent(newest)}`, { base });
      expect(text.status).toBe(200);
      expect(text.body === fs.readFileSync(file, 'utf8'), 'o servidor devolve o fala.md sem mudar nada').toBe(true);
    } finally {
      await server.close();
    }
  });
});
