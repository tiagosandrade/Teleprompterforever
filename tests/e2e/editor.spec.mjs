// Editor (RF-07, seção 5.1): estatísticas, importar, limpar com Desfazer, texto vazio, Ctrl+Enter,
// aviso do iPhone (RF-11) e texto salvo no aparelho (RF-09).
import path from 'node:path';
import {
  test,
  expect,
  FIXTURES,
  LONG_TEXT,
  clickHud,
  expectState,
  gotoApp,
  makeText,
  openPrompter,
  screenEl,
} from './helpers.mjs';

const IOS_HINT = 'Para tela cheia no iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
const field = (page) => page.locator('textarea[name="script"]');
const stats = (page) => page.locator('.ed-stats');
const editorToast = (page) => page.locator('.ed-toast');

/** Troca o texto do campo como se o usuário tivesse colado (rápido também para textos enormes). */
async function pasteText(page, text) {
  await field(page).evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

async function importFile(page, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-action="import"]').click()]);
  await chooser.setFiles(path.join(FIXTURES, 'import', file));
}

test.describe('RF-07 editor', () => {
  test('primeiro uso: texto de exemplo que ensina os gestos e estatísticas na velocidade atual', async ({ page }) => {
    await gotoApp(page, { seed: false });
    await expect(field(page)).toHaveValue(/^Bem-vindo ao Teleprompter\.\n\nToque uma vez em qualquer lugar da tela para pausar/);
    await expect(stats(page)).toHaveText(/^\d+ palavras · \d+ (s|min( \d+ s)?) a 150 ppm$/);
    await expect(page.locator('[data-action="start"]')).toBeEnabled();
    await expect(page.locator('.ed-brand')).toHaveText('Teleprompter');
    await expect(field(page)).toHaveCSS('font-size', '18px'); // ≥ 16 px: o iOS não dá zoom ao focar
  });

  test('"1.240 palavras · 8 min 16 s a 150 ppm", singular e números no formato brasileiro', async ({ page }) => {
    await gotoApp(page, { script: '' });
    await pasteText(page, makeText(1240));
    await expect(stats(page)).toHaveText('1.240 palavras · 8 min 16 s a 150 ppm');
    await expect(stats(page).locator('abbr')).toHaveAttribute('title', 'palavras por minuto');
    await pasteText(page, 'Olá');
    await expect(stats(page)).toHaveText('1 palavra · 1 s a 150 ppm');
    await pasteText(page, makeText(20000));
    await expect(stats(page)).toHaveText('20.000 palavras · 2 h 13 min a 150 ppm');
  });

  test('sem texto: "Nenhum texto ainda", campo com a dica e botão principal desativado', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await field(page).fill('');
    await expect(stats(page)).toHaveText('Nenhum texto ainda');
    await expect(field(page)).toHaveAttribute('placeholder', 'Cole ou digite seu roteiro aqui…');
    await expect(page.locator('[data-action="start"]')).toBeDisabled();
    await expect(page.locator('[data-action="clear"]')).toBeDisabled();
    await page.keyboard.press('Control+Enter');
    await expect(screenEl(page)).toBeHidden();
    // Só pontuação também não tem palavras.
    await field(page).fill('— … —');
    await expect(stats(page)).toHaveText('Nenhum texto ainda');
    await expect(page.locator('[data-action="start"]')).toBeDisabled();
  });

  test('o texto digitado fica salvo e volta ao recarregar', async ({ page }) => {
    await gotoApp(page, { script: '' });
    await field(page).fill('Meu roteiro com acentuação: ação, você, vídeo.\n\nSegundo parágrafo.');
    await page.reload();
    await expect(field(page)).toHaveValue('Meu roteiro com acentuação: ação, você, vídeo.\n\nSegundo parágrafo.');
    await expect(stats(page)).toContainText('9 palavras');
  });

  test('importar um fala.md carrega só a fala, sem a linha "# Fala — …" e sem marcações; Desfazer volta', async ({ page }) => {
    await gotoApp(page, { script: 'Texto anterior.' });
    await importFile(page, 'fala.md');
    const expected =
      'Primeiro parágrafo com negrito, itálico e código.\n\n' +
      'Uma citação com acentuação: ação, coração, pé.\n\n' +
      'Leia o manual antes de gravar.\n\n' +
      'Último parágrafo.';
    await expect(field(page)).toHaveValue(expected);
    await expect(editorToast(page)).toBeVisible();
    await expect(editorToast(page)).toContainText('Arquivo importado');
    await editorToast(page).locator('[data-action="undo"]').click();
    await expect(field(page)).toHaveValue('Texto anterior.');
    await expect(editorToast(page)).toBeHidden();
  });

  test('importar um .txt (quebras do Windows) mantém o texto e os parágrafos', async ({ page }) => {
    await gotoApp(page, { script: 'Texto anterior.' });
    await importFile(page, 'roteiro.txt');
    await expect(field(page)).toHaveValue('Roteiro em texto puro.\n\nSegunda linha com acentos: você, informação, maçã.');
    await expect(stats(page)).toContainText('11 palavras');
  });

  test('importar um arquivo sem fala avisa "O arquivo está vazio." e mantém o texto atual', async ({ page }) => {
    await gotoApp(page, { script: 'Texto que fica.' });
    await importFile(page, 'vazio.md');
    await expect(editorToast(page)).toHaveText('O arquivo está vazio.');
    await expect(field(page)).toHaveValue('Texto que fica.');
  });

  test('Limpar apaga com "Desfazer" por 6 s', async ({ page }) => {
    await page.clock.install();
    await gotoApp(page, { script: LONG_TEXT });
    await page.locator('[data-action="clear"]').click();
    await expect(field(page)).toHaveValue('');
    await expect(editorToast(page)).toContainText('Texto apagado');
    await expect(editorToast(page).locator('[data-action="undo"]')).toBeVisible();
    await page.clock.runFor(5_800);
    await expect(editorToast(page)).toBeVisible();
    await page.clock.runFor(400);
    await expect(editorToast(page)).toBeHidden();
    // Desfazer de novo só pelo botão enquanto o aviso aparece: limpa e desfaz.
    await field(page).fill('Outro texto.');
    await page.locator('[data-action="clear"]').click();
    await editorToast(page).locator('[data-action="undo"]').click();
    await expect(field(page)).toHaveValue('Outro texto.');
  });

  test('Ctrl+Enter (e ⌘+Enter) abre o teleprompter', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await field(page).focus();
    await page.keyboard.press('Control+Enter');
    await expectState(page, 'ready');
    await expect(screenEl(page)).toBeVisible();
    await expect(page.locator('#editor-screen')).toBeHidden();
    await clickHud(page, 'exit');
    await page.keyboard.press('Meta+Enter');
    await expect(screenEl(page)).toBeVisible();
  });

  test('a duração estimada acompanha a velocidade escolhida no teleprompter', async ({ page }) => {
    await gotoApp(page, { script: makeText(300) });
    await expect(stats(page)).toHaveText('300 palavras · 2 min a 150 ppm');
    await openPrompter(page);
    await clickHud(page, 'speed-up');
    await clickHud(page, 'speed-up');
    await clickHud(page, 'exit');
    await expect(stats(page)).toHaveText('300 palavras · 1 min 53 s a 160 ppm');
  });

  test('cabeçalho: ações com aria-label; rótulos só a partir de 600 px; nada rola na horizontal', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    for (const [action, label] of [['roteiros', 'Roteiros do PC'], ['import', 'Importar arquivo'], ['clear', 'Limpar texto']]) {
      await expect(page.locator(`[data-action="${action}"]`)).toHaveAttribute('aria-label', label);
    }
    const width = await page.evaluate(() => innerWidth);
    const labels = page.locator('.ed-actions .btn__label');
    if (width < 600) await expect(labels.first()).toBeHidden();
    else await expect(labels.first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const start = await page.locator('[data-action="start"]').boundingBox();
    if (width < 768) expect(start.width).toBeGreaterThan(width - 2 * 16 - 2);
    else expect(start.x + start.width).toBeGreaterThan(width / 2);
  });

  test('em 320 px de largura o editor cabe sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await gotoApp(page, { script: LONG_TEXT });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    for (const action of ['import', 'clear', 'start']) {
      const box = await page.locator(`[data-action="${action}"]`).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('celular deitado: estatísticas e botão numa linha só, e o campo continua com várias linhas à vista', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await gotoApp(page, { script: LONG_TEXT });
    const statsBox = await stats(page).boundingBox();
    const start = await page.locator('[data-action="start"]').boundingBox();
    // Mesma linha: as caixas se sobrepõem na vertical e o botão fica à direita das estatísticas.
    expect(start.y).toBeLessThan(statsBox.y + statsBox.height);
    expect(statsBox.y).toBeLessThan(start.y + start.height);
    expect(start.x).toBeGreaterThanOrEqual(statsBox.x + statsBox.width - 1);
    expect(start.height).toBeGreaterThanOrEqual(44);
    // Mesmo com o aviso do iPhone (no projeto iphone), sobram umas 3 linhas de texto no campo.
    expect((await field(page).boundingBox()).height).toBeGreaterThanOrEqual(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(568);
  });
});

test.describe('RF-11 aviso do iPhone', () => {
  test('só no iPhone pelo Safari: aviso dispensável que não volta depois de "Entendi"', async ({ page }, testInfo) => {
    await gotoApp(page, { script: LONG_TEXT });
    const hint = page.locator('.ed-hint');
    if (testInfo.project.name !== 'iphone') {
      await expect(hint).toBeHidden();
      return;
    }
    await expect(hint).toBeVisible();
    await expect(hint.locator('p')).toHaveText(IOS_HINT);
    await hint.locator('[data-action="dismiss-hint"]').click();
    await expect(hint).toBeHidden();
    await page.reload();
    await expect(field(page)).toBeVisible();
    await expect(hint).toBeHidden();
  });
});
