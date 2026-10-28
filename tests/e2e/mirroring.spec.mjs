// Espelhamento (RF-02, seção 10): só o palco espelha; HUD, painel e barra de ajuste nunca.
import {
  test,
  expect,
  LONG_TEXT,
  closePanel,
  drag,
  expectState,
  geometry,
  gotoApp,
  jumpToProgress,
  openPanel,
  openPrompter,
  panelEl,
  screenEl,
  setRange,
  startPlaying,
  tapCenter,
  toastTexts,
  tpOffset,
  tpSettings,
} from './helpers.mjs';

/** Sinal acumulado do espelho (eixo x e y) do elemento até a raiz, a partir das transformações calculadas. */
const mirrorOf = (page, selector) =>
  page.evaluate((sel) => {
    let sx = 1;
    let sy = 1;
    for (let node = document.querySelector(sel); node && node.nodeType === 1; node = node.parentElement) {
      const transform = getComputedStyle(node).transform;
      if (transform && transform !== 'none') {
        const m = new DOMMatrix(transform);
        sx *= Math.sign(m.a) || 1;
        sy *= Math.sign(m.d) || 1;
      }
    }
    return { x: sx, y: sy };
  }, selector);

test.describe('RF-02 espelhamento', () => {
  test('os interruptores viram o palco (X, Y e os dois = 180°); HUD e painel continuam sem espelho', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await openPanel(page);
    const stage = () => page.locator('#prompter-screen .pr-stage').evaluate((el) => getComputedStyle(el).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(await stage());
    await panelEl(page).locator('input[name="mirrorX"]').check();
    await expect(screenEl(page)).toHaveAttribute('data-mirror-x', '');
    expect(await stage()).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    await panelEl(page).locator('input[name="mirrorY"]').check();
    expect(await stage()).toBe('matrix(-1, 0, 0, -1, 0, 0)');
    await panelEl(page).locator('input[name="mirrorX"]').uncheck();
    expect(await stage()).toBe('matrix(1, 0, 0, -1, 0, 0)');
    await panelEl(page).locator('input[name="mirrorX"]').check();
    // O painel e o HUD ficam fora do palco e sem espelho.
    expect(await mirrorOf(page, 'aside.sheet.pn .sheet__title')).toEqual({ x: 1, y: 1 });
    await closePanel(page);
    for (const selector of ['[data-action="exit"]', '.pr-time__label', '.pr-pill', '.pr-hint']) {
      expect(await mirrorOf(page, `#prompter-screen ${selector}`), selector).toEqual({ x: 1, y: 1 });
    }
    expect(await mirrorOf(page, '#prompter-screen .pr-text')).toEqual({ x: -1, y: -1 });
    const { vw } = await geometry(page);
    const exit = await page.locator('[data-action="exit"]').boundingBox();
    expect(exit.x).toBeLessThan(vw / 4); // Voltar continua à esquerda
  });

  test('o palco inteiro espelha: texto, área, guia, contagem e aviso rápido ficam dentro dele', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { mirrorX: true, guide: true, countdown: 5 } });
    await openPrompter(page);
    for (const selector of ['.pr-text', '.pr-area', '.pr-guide', '.pr-countdown', '.pr-toast', '.pr-handle']) {
      expect(await page.locator(`#prompter-screen ${selector}`).first().evaluate((el) => Boolean(el.closest('.pr-stage'))), selector).toBe(true);
    }
    for (const selector of ['.pr-hud', '.pr-adjustbar', '.pr-empty']) {
      expect(await page.locator(`#prompter-screen ${selector}`).evaluate((el) => Boolean(el.closest('.pr-stage'))), selector).toBe(false);
    }
    await tapCenter(page);
    await expectState(page, 'countdown');
    expect(await mirrorOf(page, '#prompter-screen .pr-countdown__digit')).toEqual({ x: -1, y: 1 });
    await tapCenter(page); // cancela
    await expectState(page, 'ready');
  });

  test('tecla M vira o palco na hora com o texto rodando, sem pausar, e avisa "Espelho ligado"', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await page.keyboard.press('m');
    await expect(screenEl(page)).toHaveAttribute('data-mirror-x', '');
    expect(await mirrorOf(page, '#prompter-screen .pr-text')).toEqual({ x: -1, y: 1 });
    // O aviso (dentro do palco, espelhado com ele) dura 1,2 s: confere pelo registro da instrumentação.
    await expect.poll(() => toastTexts(page)).toEqual(['Espelho ligado']);
    await expectState(page, 'playing');
    const before = await tpOffset(page);
    await expect.poll(() => tpOffset(page)).toBeGreaterThan(before);
    await page.keyboard.press('M');
    await expect(screenEl(page)).not.toHaveAttribute('data-mirror-x', '');
    await expect.poll(() => toastTexts(page)).toEqual(['Espelho ligado', 'Espelho desligado']);
    expect((await tpSettings(page)).mirrorX).toBe(false);
  });

  test('com espelho horizontal, "Esquerda" aparece fisicamente à direita (o que o apresentador vê no reflexo)', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { mirrorX: true } });
    await openPrompter(page);
    await openPanel(page);
    await setRange(page, 'areaWidth', 0.5);
    await panelEl(page).locator('input[name="position"][value="left"]').check();
    let g = await geometry(page);
    expect(Math.abs(g.area.right - g.frame.right)).toBeLessThanOrEqual(0.5);
    await panelEl(page).locator('input[name="position"][value="right"]').check();
    g = await geometry(page);
    expect(Math.abs(g.area.left - g.frame.left)).toBeLessThanOrEqual(0.5);
    await closePanel(page);
  });

  for (const [mirrorX, mirrorY] of [[true, false], [false, true], [true, true]]) {
    test(`arrastar segue o dedo na tela física (espelho X: ${mirrorX ? 'sim' : 'não'}, inversão Y: ${mirrorY ? 'sim' : 'não'})`, async ({ page }) => {
      await gotoApp(page, { script: LONG_TEXT, settings: { mirrorX, mirrorY } });
      await openPrompter(page);
      await jumpToProgress(page, 0.4);
      const { vw, vh } = await geometry(page);
      const x = Math.round(vw / 2);
      const y = Math.round(vh / 2);
      for (const dy of [-90, 70]) {
        const before = (await geometry(page)).text;
        const offset = await tpOffset(page);
        await drag(page, { x, y }, { x, y: y + dy });
        const after = (await geometry(page)).text;
        // O texto (já espelhado na tela) anda junto com o dedo, na mesma direção e distância.
        expect(Math.abs(after.top - before.top - dy), `dy=${dy}`).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.abs((await tpOffset(page)) - offset) - Math.abs(dy))).toBeLessThan(0.5);
      }
      await expectState(page, 'paused');
    });
  }
});
