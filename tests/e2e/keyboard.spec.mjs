// Teclado e controles Bluetooth (RF-16, tabela da seção 7).
import {
  test,
  expect,
  LONG_TEXT,
  clickHud,
  expectState,
  geometry,
  gotoApp,
  hudButton,
  jumpToEnd,
  jumpToProgress,
  openPanel,
  openPrompter,
  panelEl,
  screenEl,
  startPlaying,
  toastTexts,
  tpOffset,
  tpSettings,
  waitMoving,
} from './helpers.mjs';

const toast = (page) => page.locator('#prompter-screen .pr-stage .pr-toast');

/** O aviso rápido com `text` apareceu dentro do palco (pelo registro da instrumentação). */
async function expectToast(page, text) {
  await expect.poll(() => toastTexts(page)).toContain(text);
}

test.describe('RF-16 teclado', () => {
  for (const key of ['Space', 'Enter']) {
    test(`${key} começa, pausa e continua (como o toque)`, async ({ page }) => {
      await gotoApp(page, { script: LONG_TEXT });
      await openPrompter(page);
      await page.keyboard.press(key);
      await expectState(page, 'playing');
      await waitMoving(page);
      await page.keyboard.press(key);
      await expectState(page, 'paused');
      const frozen = await tpOffset(page);
      await page.waitForTimeout(150);
      expect(await tpOffset(page)).toBe(frozen);
      await page.keyboard.press(key);
      await expectState(page, 'playing');
    });
  }

  test('↑ e ↓ mudam a velocidade em 5 ppm, com aviso rápido de 1,2 s dentro do palco', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    // Quando o aviso aparece e some, no relógio da própria página.
    await page.evaluate(() => {
      const el = document.querySelector('#prompter-screen .pr-toast');
      window.__toast = [];
      new MutationObserver(() => window.__toast.push({ shown: el.hasAttribute('data-show'), t: performance.now() })).observe(el, {
        attributes: true,
        attributeFilter: ['data-show'],
      });
    });
    await page.keyboard.press('ArrowUp');
    expect((await tpSettings(page)).speed).toBe(155);
    await expectToast(page, 'Velocidade 155 ppm');
    await page.keyboard.press('ArrowUp');
    await expectToast(page, 'Velocidade 160 ppm');
    await expect(toast(page)).not.toHaveAttribute('data-show', '', { timeout: 3_000 });
    const events = await page.evaluate(() => window.__toast);
    const hidden = events.findLast((event) => !event.shown);
    const lastShown = events.findLast((event) => event.shown && event.t < hidden.t);
    expect(hidden.t - lastShown.t).toBeGreaterThan(1_100); // 1,2 s depois da última tecla
    expect(hidden.t - lastShown.t).toBeLessThan(1_700);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect((await tpSettings(page)).speed).toBe(145);
    await expectToast(page, 'Velocidade 145 ppm');
    await expect(page.locator('.pr-speed')).toHaveText('145');
  });

  test('o aviso cabe inteiro na pílula mesmo com a área estreita (25%), à esquerda e espelhada', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.25, position: 'left', mirrorX: true } });
    await openPrompter(page);
    await page.keyboard.press('ArrowUp');
    await expectToast(page, 'Velocidade 155 ppm');
    // Medido mesmo depois de o aviso sumir: escondido ele continua com o tamanho que teve.
    const size = await toast(page).evaluate((el) => ({ content: el.scrollWidth, box: el.clientWidth }));
    expect(size.content).toBeLessThanOrEqual(size.box);
  });

  test('os botões do HUD mudam a velocidade sem aviso rápido (o aviso é só do teclado)', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await clickHud(page, 'speed-up');
    expect((await tpSettings(page)).speed).toBe(155);
    await page.waitForTimeout(300);
    expect(await toastTexts(page)).toEqual([]);
    await expect(toast(page)).not.toHaveAttribute('data-show', '');
  });

  test('+ e = aumentam, - e _ diminuem o texto em 4 px, com aviso "Texto N px"', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { fontSize: 40 } });
    await openPrompter(page);
    await page.keyboard.press('+');
    expect((await tpSettings(page)).fontSize).toBe(44);
    await expectToast(page, 'Texto 44 px');
    await page.keyboard.press('=');
    expect((await tpSettings(page)).fontSize).toBe(48);
    await page.keyboard.press('-');
    expect((await tpSettings(page)).fontSize).toBe(44);
    await page.keyboard.press('_');
    expect((await tpSettings(page)).fontSize).toBe(40);
    await expectToast(page, 'Texto 40 px');
    await expect(page.locator('.pr-text')).toHaveCSS('font-size', '40px');
  });

  test('← e PageUp voltam, → e PageDown avançam 1/3 da altura da área', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaHeight: 0.9 } });
    await openPrompter(page);
    const { area } = await geometry(page);
    const step = area.height / 3;
    const moves = [
      ['ArrowRight', 1],
      ['PageDown', 1],
      ['ArrowRight', 1],
      ['ArrowLeft', -1],
      ['PageUp', -1],
    ];
    let expected = 0;
    for (const [key, direction] of moves) {
      await page.keyboard.press(key);
      expected += direction * step;
      expect(Math.abs((await tpOffset(page)) - expected), key).toBeLessThan(0.5);
    }
    await expectState(page, 'paused'); // saiu do início: pausado
    await page.keyboard.press('PageUp');
    await page.keyboard.press('PageUp');
    const start = await tpOffset(page); // não passa do início (resíduo de ponto flutuante é aceitável)
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThan(1e-6);
  });

  test('Home recomeça (pronto, no início) e M liga e desliga o espelho com aviso', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await page.keyboard.press('Home');
    await expectState(page, 'ready');
    expect(await tpOffset(page)).toBe(0);
    await page.keyboard.press('m');
    expect((await tpSettings(page)).mirrorX).toBe(true);
    await expectToast(page, 'Espelho ligado');
    await page.keyboard.press('m');
    expect((await tpSettings(page)).mirrorX).toBe(false);
    await expectToast(page, 'Espelho desligado');
  });

  test('o atalho vale mais que o botão em foco: Espaço e Enter não "clicam" o botão', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await hudButton(page, 'speed-up').focus();
    await expect(hudButton(page, 'speed-up')).toBeFocused();
    await page.keyboard.press('Space');
    await expectState(page, 'playing');
    expect((await tpSettings(page)).speed).toBe(150);
    await waitMoving(page);
    await page.keyboard.press('Space');
    await expectState(page, 'paused');
    await hudButton(page, 'restart').focus();
    await expect(hudButton(page, 'restart')).toBeFocused();
    await page.keyboard.press('Enter');
    await expectState(page, 'playing');
    expect(await tpOffset(page)).toBeGreaterThan(0); // não recomeçou
    expect((await tpSettings(page)).speed).toBe(150);
  });

  test('segurar Espaço não fica alternando; segurar ↑ repete', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await page.keyboard.down('Space');
    await page.keyboard.down('Space'); // repetição automática da tecla (repeat = true)
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await expectState(page, 'playing');
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowUp');
    await page.keyboard.up('ArrowUp');
    expect((await tpSettings(page)).speed).toBe(165);
  });

  test('Esc: rodando não faz nada; pausado volta ao editor', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await expectState(page, 'playing');
    await expect(screenEl(page)).toBeVisible();
    await page.keyboard.press('Space');
    await expectState(page, 'paused');
    await page.keyboard.press('Escape');
    await expect(screenEl(page)).toBeHidden();
    await expect(page.locator('#editor-screen')).toBeVisible();
  });

  test('Esc em pronto, na contagem e no fim volta ao editor', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { countdown: 3 } });
    await openPrompter(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor-screen')).toBeVisible();
    await openPrompter(page);
    await page.keyboard.press('Space');
    await expectState(page, 'countdown');
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor-screen')).toBeVisible();
    await expect(page.locator('.pr-countdown')).toBeEmpty();
    await openPrompter(page);
    await jumpToEnd(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor-screen')).toBeVisible();
  });

  test('com o painel aberto os atalhos ficam parados; Esc fecha só o painel', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await jumpToProgress(page, 0.2);
    await openPanel(page);
    const before = await tpSettings(page);
    const offset = await tpOffset(page);
    for (const key of ['m', 'ArrowUp', '+', 'PageDown', 'Home', 'Space']) await page.keyboard.press(key);
    expect(await tpSettings(page)).toEqual(before);
    expect(await tpOffset(page)).toBe(offset);
    await expectState(page, 'paused');
    await page.keyboard.press('Escape');
    await expect(panelEl(page)).not.toHaveClass(/is-open/);
    await expect(screenEl(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor-screen')).toBeVisible();
  });

  test('no editor as teclas são do texto: "m" digita no campo e não mexe no espelho', async ({ page }) => {
    await gotoApp(page, { script: '' });
    const field = page.locator('textarea[name="script"]');
    await field.click();
    await page.keyboard.type('m + Home');
    await expect(field).toHaveValue('m + Home');
    expect((await tpSettings(page)).mirrorX).toBe(false);
    await expect(screenEl(page)).toBeHidden();
  });
});
