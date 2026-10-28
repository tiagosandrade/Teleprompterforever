// Passe visual: salva capturas das telas principais em <pasta do Playwright, fora do projeto>/screenshots/<aparelho>/
// para revisão a olho (rode só este arquivo com: npm run test:e2e -- visual.spec.mjs). Também confere
// que nada transborda na horizontal.
import path from 'node:path';
import {
  test,
  expect,
  LONG_TEXT,
  clickHud,
  closePanel,
  expectState,
  gotoApp,
  jumpToEnd,
  jumpToProgress,
  openPanel,
  openPrompter,
  panelEl,
  resizeViewport,
  screenEl,
  screenshotDir,
  setRange,
  tapCenter,
  waitMoving,
} from './helpers.mjs';

const SCRIPT =
  'Texto de exemplo para as capturas de tela, com dois parágrafos curtos antes do texto longo.\n\n' +
  'Cada captura mostra uma tela ou um estado do teleprompter.\n\n' +
  LONG_TEXT;

/** Captura com nome numerado; espera as transições de interface (200–320 ms) terminarem. */
function shooter(page, testInfo) {
  const dir = screenshotDir(testInfo.project.name);
  return async (name) => {
    await page.waitForTimeout(400);
    const file = path.join(dir, `${name}.png`);
    await page.screenshot({ path: file });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name}: rolagem horizontal`).toBeLessThanOrEqual(0);
  };
}

test.describe('Passe visual', () => {
  test('editor: com texto, vazio, Roteiros do PC e aviso do iPhone', async ({ page }, testInfo) => {
    const shot = shooter(page, testInfo);
    await gotoApp(page, { script: SCRIPT });
    await expect(page.locator('[data-action="roteiros"]')).toBeVisible();
    await shot('01-editor');
    await page.locator('[data-action="roteiros"]').click();
    await expect(page.locator('.dialog .list__item').first()).toBeVisible();
    await shot('02-dialogo-roteiros');
    await page.keyboard.press('Escape');
    await page.locator('[data-action="clear"]').click();
    await expect(page.locator('.ed-toast')).toContainText('Texto apagado');
    await shot('03-editor-vazio-desfazer');
  });

  test('teleprompter: pronto, contagem, rodando, pausado, painel, ajuste, guia, espelho e fim', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const shot = shooter(page, testInfo);
    await gotoApp(page, { script: SCRIPT, settings: { countdown: 3 } });
    await openPrompter(page);
    await shot('04-pronto');
    await tapCenter(page);
    await expectState(page, 'countdown');
    await page.waitForTimeout(200);
    await shot('05-contagem');
    await expectState(page, 'playing', 5_000);
    await waitMoving(page);
    await shot('06-rodando');
    await tapCenter(page);
    await expectState(page, 'paused');
    await shot('07-pausado');
    await openPanel(page);
    await shot(`08-painel-${await panelEl(page).getAttribute('data-placement')}`);
    await panelEl(page).locator('.sheet__body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await shot('09-painel-fim-da-lista');
    await panelEl(page).locator('.sheet__body').evaluate((el) => el.scrollTo(0, 0));
    await setRange(page, 'areaWidth', 0.6);
    await panelEl(page).locator('[data-action="adjust-area"]').click();
    await expect(screenEl(page)).toHaveAttribute('data-adjust', '');
    await shot('10-ajustar-na-tela');
    await page.locator('[data-action="adjust-done"]').click();
    await openPanel(page);
    await panelEl(page).locator('input[name="guide"]').check();
    await closePanel(page);
    await shot('11-guia-de-leitura');
    await page.keyboard.press('m');
    await shot('12-espelhado-com-aviso');
    await page.keyboard.press('m');
    await jumpToEnd(page);
    await shot('13-fim');
  });

  test('variações: painel lateral no celular deitado, espelho + inversão no ajuste, HUD em 320 px', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const shot = shooter(page, testInfo);
    await gotoApp(page, { script: SCRIPT, settings: { mirrorX: true, mirrorY: true, areaWidth: 0.6, areaHeight: 0.7, position: 'left' } });
    await openPrompter(page);
    await jumpToProgress(page, 0.1);
    await shot('14-espelho-e-inversao-esquerda');
    await openPanel(page);
    await panelEl(page).locator('[data-action="adjust-area"]').click();
    await shot('15-ajuste-espelhado-invertido');
    await page.keyboard.press('Escape');
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    await resizeViewport(page, h, w);
    await openPanel(page);
    await shot(`16-girado-painel-${await panelEl(page).getAttribute('data-placement')}`);
    await closePanel(page);
    await clickHud(page, 'exit');
    await resizeViewport(page, 320, 568);
    await openPrompter(page);
    await shot('17-hud-320px');
  });
});
