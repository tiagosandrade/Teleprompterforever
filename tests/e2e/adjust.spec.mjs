// Modo "Ajustar na tela" (RF-05, seções 5.4 e 10): alças sobre o teleprompter, limites,
// segmentado de posição, saída por Concluir/Esc e espelho.
import {
  test,
  expect,
  LONG_TEXT,
  closePanel,
  expectState,
  geometry,
  gotoApp,
  jumpToProgress,
  openPanel,
  openPrompter,
  panelEl,
  resizeViewport,
  screenEl,
  setRange,
  tapAt,
  tpOffset,
  tpSettings,
} from './helpers.mjs';

const handle = (page, name) => page.locator(`#prompter-screen [data-handle="${name}"]`);

async function enterAdjust(page) {
  await openPanel(page);
  await panelEl(page).locator('[data-action="adjust-area"]').click();
  await expect(panelEl(page)).not.toHaveClass(/is-open/);
  await expect(screenEl(page)).toHaveAttribute('data-adjust', '');
  await expect(page.locator('.pr-adjustbar')).toBeVisible();
}

async function visibleHandles(page) {
  return page.locator('#prompter-screen [data-handle]').evaluateAll((els) =>
    els.filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.dataset.handle).sort(),
  );
}

/** Centro da alça na tela. */
async function handleCenter(page, name) {
  const box = await handle(page, name).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Arrasta a alça `name` por (dx, dy) px na tela física, com o mouse. Devolve os ajustes lidos com o
 * dedo ainda na tela (tempo real) e depois de soltar.
 */
async function dragHandle(page, name, dx, dy) {
  const from = await handleCenter(page, name);
  return dragHandleTo(page, name, { x: from.x + dx, y: from.y + dy });
}

/** Toda alça visível está livre: a barra não encosta na área de toque dela e o toque no centro chega à alça. */
async function expectHandlesClear(page, label) {
  const result = await page.evaluate(() => {
    const bar = document.querySelector('#prompter-screen .pr-adjustbar').getBoundingClientRect();
    return [...document.querySelectorAll('#prompter-screen [data-handle]')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-handle]');
        const overlaps = r.left < bar.right && bar.left < r.right && r.top < bar.bottom && bar.top < r.bottom;
        return { name: el.dataset.handle, ok: hit === el && !overlaps };
      });
  });
  expect(result.length, label).toBeGreaterThan(0);
  for (const { name, ok } of result) expect(ok, `${label}: alça ${name}`).toBe(true);
}

/** Arrasta a alça até um ponto da tela (dentro da janela). */
async function dragHandleTo(page, name, to) {
  const from = await handleCenter(page, name);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  const live = await tpSettings(page);
  await page.mouse.up();
  return { live, done: await tpSettings(page) };
}

test.describe('RF-05 Ajustar na tela', () => {
  test('entra pelo painel com o texto parado: borda tracejada, alças, barra "Largura · Altura" e sem HUD', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.7, areaHeight: 1 } });
    await openPrompter(page);
    await enterAdjust(page);
    await expect(screenEl(page)).not.toHaveAttribute('data-hud', '');
    await expect(page.locator('.pr-outline')).toHaveCSS('border-top-style', 'dashed');
    await expect(page.locator('.pr-outline')).toHaveCSS('border-top-color', 'rgb(255, 176, 32)');
    await expect(page.locator('.pr-adjustbar__w')).toHaveText('Largura 70%');
    await expect(page.locator('.pr-adjustbar__h')).toHaveText('Altura 100%');
    await expect(page.locator('.pr-adjustbar input[name="adjust-position"][value="center"]')).toBeChecked();
    await expect(page.locator('[data-action="adjust-done"]')).toBeVisible();
    expect(await visibleHandles(page)).toEqual(['bottom', 'corner-left', 'corner-right', 'left', 'right']);
    // Alças: círculo de 28 px com área de toque de 44 px, na borda da área.
    const g = await geometry(page);
    const right = await handle(page, 'right').boundingBox();
    expect(Math.round(right.width)).toBe(44);
    expect(Math.abs(right.x + right.width / 2 - g.area.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(right.y + right.height / 2 - (g.area.top + g.area.height / 2))).toBeLessThanOrEqual(1);
    const circle = await handle(page, 'right').evaluate((el) => {
      const style = getComputedStyle(el, '::before');
      return { inset: style.top, border: style.borderTopWidth };
    });
    expect(circle).toEqual({ inset: '8px', border: '3px' });
  });

  test('alça lateral muda a largura em tempo real (Centro: simétrica); a de baixo muda a altura; a do canto, as duas', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6, areaHeight: 0.8 } });
    await openPrompter(page);
    await enterAdjust(page);
    const { frame } = await geometry(page);
    const dx = Math.round(frame.width * 0.1);
    let r = await dragHandle(page, 'right', -dx, 0);
    const width = 0.6 - (2 * dx) / frame.width;
    expect(Math.abs(r.live.areaWidth - width)).toBeLessThanOrEqual(0.011);
    expect(Math.abs(r.done.areaWidth - width)).toBeLessThanOrEqual(0.011);
    let g = await geometry(page);
    expect(Math.abs(g.area.left + g.area.width / 2 - (frame.left + frame.width / 2))).toBeLessThanOrEqual(1); // continua centralizada
    await expect(page.locator('.pr-adjustbar__w')).toHaveText(`Largura ${Math.round(r.done.areaWidth * 100)}%`);

    const dy = Math.round(frame.height * 0.3);
    r = await dragHandle(page, 'bottom', 0, -dy);
    expect(Math.abs(r.live.areaHeight - (0.8 - dy / frame.height))).toBeLessThanOrEqual(0.011);
    expect(r.done.areaWidth).toBe(r.live.areaWidth);

    const before = await tpSettings(page);
    r = await dragHandle(page, 'corner-left', -Math.round(frame.width * 0.05), Math.round(frame.height * 0.1));
    expect(Math.abs(r.done.areaWidth - (before.areaWidth + 0.1))).toBeLessThanOrEqual(0.011);
    expect(Math.abs(r.done.areaHeight - (before.areaHeight + 0.1))).toBeLessThanOrEqual(0.011);
    g = await geometry(page);
    expect(Math.abs(g.area.width - frame.width * r.done.areaWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.area.height - frame.height * r.done.areaHeight)).toBeLessThanOrEqual(1);
  });

  test('nunca passa dos limites: mínimo 25% × 20%, máximo 100%', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6, areaHeight: 0.6 } });
    await openPrompter(page);
    await enterAdjust(page);
    const { frame, vw, vh } = await geometry(page);
    // Centro: largura = 2 × |fx − 0,5|. Levar o canto ao meio da moldura e ao topo pede largura e altura 0.
    let r = await dragHandleTo(page, 'corner-right', { x: frame.left + frame.width / 2, y: frame.top + 2 });
    expect(r.live).toMatchObject({ areaWidth: 0.25, areaHeight: 0.2 });
    expect(r.done).toMatchObject({ areaWidth: 0.25, areaHeight: 0.2 });
    const g = await geometry(page);
    expect(Math.abs(g.area.width - frame.width * 0.25)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.area.height - frame.height * 0.2)).toBeLessThanOrEqual(1);
    // Além da moldura (no canto da tela): para em 100%.
    r = await dragHandleTo(page, 'corner-right', { x: vw - 2, y: vh - 2 });
    expect(r.done).toMatchObject({ areaWidth: 1, areaHeight: 1 });
  });

  test('Esquerda: alça só à direita; Direita: só à esquerda; a largura segue a borda livre', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.5 } });
    await openPrompter(page);
    await enterAdjust(page);
    const { frame } = await geometry(page);
    const dx = Math.round(frame.width * 0.1);

    await page.locator('.pr-adjustbar input[name="adjust-position"][value="left"]').check();
    expect((await tpSettings(page)).position).toBe('left');
    expect(await visibleHandles(page)).toEqual(['bottom', 'corner-right', 'right']);
    let g = await geometry(page);
    expect(Math.abs(g.area.left - frame.left)).toBeLessThanOrEqual(0.5);
    let r = await dragHandle(page, 'right', dx, 0);
    expect(Math.abs(r.done.areaWidth - (0.5 + dx / frame.width))).toBeLessThanOrEqual(0.011);

    await page.locator('.pr-adjustbar input[name="adjust-position"][value="right"]').check();
    expect(await visibleHandles(page)).toEqual(['bottom', 'corner-left', 'left']);
    g = await geometry(page);
    expect(Math.abs(g.area.right - frame.right)).toBeLessThanOrEqual(0.5);
    const width = (await tpSettings(page)).areaWidth;
    r = await dragHandle(page, 'left', dx, 0);
    expect(Math.abs(r.done.areaWidth - (width - dx / frame.width))).toBeLessThanOrEqual(0.011);
    g = await geometry(page);
    expect(Math.abs(g.area.right - frame.right)).toBeLessThanOrEqual(0.5);

    await page.locator('[data-action="adjust-done"]').click();
    await openPanel(page);
    await expect(panelEl(page).locator('input[name="position"][value="right"]')).toBeChecked();
    await closePanel(page);
  });

  test('toques e arrastos fora das alças não pausam, não retomam e não movem o texto; Concluir volta ao estado anterior', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6 } });
    await openPrompter(page);
    await jumpToProgress(page, 0.2);
    await expectState(page, 'paused');
    const offset = await tpOffset(page);
    await enterAdjust(page);
    await tapAt(page, 0.5, 0.5);
    await tapAt(page, 0.1, 0.8);
    const { vw, vh } = await geometry(page);
    await page.mouse.move(vw / 2, vh * 0.6);
    await page.mouse.down();
    await page.mouse.move(vw / 2, vh * 0.3, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await expect(screenEl(page)).toHaveAttribute('data-adjust', '');
    await expectState(page, 'paused');
    expect(await tpOffset(page)).toBe(offset);
    await page.locator('[data-action="adjust-done"]').click();
    await expect(screenEl(page)).not.toHaveAttribute('data-adjust', '');
    await expect(screenEl(page)).toHaveAttribute('data-hud', '');
    await expectState(page, 'paused');
    await expect(page.locator('.pr-hint')).toHaveText('Toque para continuar');
  });

  test('Esc sai do modo de ajuste sem voltar ao editor', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await enterAdjust(page);
    await page.keyboard.press('Escape');
    await expect(screenEl(page)).not.toHaveAttribute('data-adjust', '');
    await expect(screenEl(page)).toBeVisible();
    await expectState(page, 'ready');
    await expect(screenEl(page)).toHaveAttribute('data-hud', '');
  });

  test('com espelho horizontal as alças espelham com o palco e o arrasto segue o dedo; a barra não espelha', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6, mirrorX: true } });
    await openPrompter(page);
    await enterAdjust(page);
    const { frame } = await geometry(page);
    // A alça "right" (borda lógica direita) aparece fisicamente à esquerda.
    const right = await handleCenter(page, 'right');
    expect(Math.abs(right.x - (frame.left + frame.width * 0.2))).toBeLessThanOrEqual(1);
    const dx = Math.round(frame.width * 0.1);
    const r = await dragHandle(page, 'right', -dx, 0); // dedo para a esquerda: a área cresce
    expect(Math.abs(r.done.areaWidth - (0.6 + (2 * dx) / frame.width))).toBeLessThanOrEqual(0.011);
    const bar = await page.locator('.pr-adjustbar').evaluate((el) => {
      const chain = [];
      for (let node = el; node && node.id !== 'prompter-screen'; node = node.parentElement) chain.push(getComputedStyle(node).transform);
      return chain;
    });
    for (const transform of bar) expect(transform === 'none' || !transform.startsWith('matrix(-1')).toBe(true);
    expect(await page.locator('.pr-adjustbar').evaluate((el) => Boolean(el.closest('.pr-stage')))).toBe(false);
  });

  test('com inversão vertical a alça de baixo fica em cima e a barra desce para a base', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaHeight: 0.6, mirrorY: true } });
    await openPrompter(page);
    await enterAdjust(page);
    const { frame, vh } = await geometry(page);
    const bottom = await handleCenter(page, 'bottom');
    expect(Math.abs(bottom.y - (frame.top + frame.height * 0.4))).toBeLessThanOrEqual(1);
    const dy = Math.round(frame.height * 0.2);
    const r = await dragHandle(page, 'bottom', 0, -dy); // dedo para cima: a área cresce
    expect(Math.abs(r.done.areaHeight - (0.6 + dy / frame.height))).toBeLessThanOrEqual(0.011);
    const bar = await page.locator('.pr-adjustbar').boundingBox();
    expect(bar.y + bar.height).toBeGreaterThan(vh - 40);
  });

  // Área baixa (perto da câmera): a barra vai para o lado livre e não cobre nenhuma alça (no celular ela
  // tem duas linhas e cobria as alças laterais).
  for (const { name, settings, barAt } of [
    { name: 'área baixa presa em cima', settings: { areaWidth: 0.6, areaHeight: 0.2 }, barAt: 'embaixo' },
    { name: 'área baixa invertida, presa embaixo', settings: { areaWidth: 0.6, areaHeight: 0.3, mirrorY: true }, barAt: 'em cima' },
  ]) {
    test(`${name}: a barra fica ${barAt} e todas as alças ficam ao alcance do dedo`, async ({ page }) => {
      await gotoApp(page, { script: LONG_TEXT, settings });
      await openPrompter(page);
      await enterAdjust(page);
      const { area } = await geometry(page);
      const bar = await page.locator('.pr-adjustbar').boundingBox();
      if (barAt === 'embaixo') expect(bar.y).toBeGreaterThan(area.bottom);
      else expect(bar.y + bar.height).toBeLessThan(area.top);
      for (const handleName of await visibleHandles(page)) {
        const { x, y } = await handleCenter(page, handleName);
        const hit = await page.evaluate(
          ([px, py]) => document.elementFromPoint(px, py)?.closest('[data-handle]')?.dataset.handle ?? null,
          [x, y],
        );
        expect(hit, `alça ${handleName}`).toBe(handleName);
      }
    });
  }

  // Celular deitado (estreito e baixo): a barra tem uma linha só e em nenhuma altura cobre alça, com ou sem
  // inversão. Em duas linhas (114 px) ela cobria as alças laterais de 51% a 70% de altura. Janela em pé e baixa
  // (tela dividida do Android): duas linhas, também sem cobrir alça.
  for (const [width, height] of [[667, 375], [640, 360], [568, 320], [480, 320], [412, 450]]) {
    const landscape = width > height;
    const name = landscape ? `celular deitado ${width}×${height}: barra numa linha` : `janela em pé ${width}×${height}: barra em duas linhas`;
    test(`${name} e nenhuma alça coberta, de 20% a 100% de altura`, async ({ page }) => {
      test.setTimeout(90_000);
      await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6 } });
      await openPrompter(page);
      await resizeViewport(page, width, height);
      for (const mirrorY of [false, true]) {
        for (const areaHeight of [0.2, 0.45, 0.51, 0.55, 0.6, 0.7, 0.8, 1]) {
          await openPanel(page);
          await setRange(page, 'areaHeight', areaHeight);
          const mirror = panelEl(page).locator('input[name="mirrorY"]');
          if (mirrorY) await mirror.check();
          else await mirror.uncheck();
          await panelEl(page).locator('[data-action="adjust-area"]').click();
          await expect(screenEl(page)).toHaveAttribute('data-adjust', '');
          const label = `altura ${areaHeight}, inversão ${mirrorY}`;
          const barHeight = (await page.locator('.pr-adjustbar').boundingBox()).height;
          if (landscape) expect(barHeight, label).toBeLessThan(60);
          else expect(barHeight, label).toBeGreaterThan(100);
          await expectHandlesClear(page, label);
          await page.locator('[data-action="adjust-done"]').click();
          await expect(screenEl(page)).not.toHaveAttribute('data-adjust', '');
        }
      }
    });
  }

  test('barra compacta só deitado: posições com rótulo inteiro e alvo de 44 px; abaixo de 560 px sem as medidas, abaixo de 440 px Concluir só com o ✓', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6 } });
    await openPrompter(page);
    // [largura, altura, linhas da barra, medidas à vista, rótulo do Concluir à vista]. 360 × 300: metade de um
    // celular de 360 × 640 em tela dividida.
    for (const [width, height, rows, measure, doneLabel] of [
      [412, 450, 2, true, true],
      [360, 400, 2, true, true],
      [480, 320, 1, false, true],
      [458, 412, 1, false, true],
      [568, 320, 1, true, true],
      [420, 380, 1, false, false],
      [360, 300, 1, false, false],
    ]) {
      const label = `${width}×${height}`;
      await resizeViewport(page, width, height);
      await enterAdjust(page);
      const barHeight = (await page.locator('.pr-adjustbar').boundingBox()).height;
      if (rows === 1) expect(barHeight, label).toBeLessThan(60);
      else expect(barHeight, label).toBeGreaterThan(100);
      if (measure) await expect(page.locator('.pr-adjustbar__measure'), label).toBeVisible();
      else await expect(page.locator('.pr-adjustbar__measure'), label).toBeHidden();
      const options = await page.locator('.pr-adjustbar .seg__opt').evaluateAll((els) =>
        els.map((el) => {
          const text = el.querySelector('span');
          return { name: text.textContent, width: el.getBoundingClientRect().width, cut: text.scrollWidth > text.clientWidth + 1 };
        }),
      );
      for (const option of options) {
        expect(option.width, `${label}: ${option.name}`).toBeGreaterThanOrEqual(44);
        expect(option.cut, `${label}: "${option.name}" cortado`).toBe(false);
      }
      // Só com o ✓, o botão continua com o nome "Concluir" (leitor de tela) e alvo de 44 px.
      const done = page.locator('.pr-adjustbar').getByRole('button', { name: 'Concluir' });
      const doneBox = await done.boundingBox();
      expect(Math.min(doneBox.width, doneBox.height), `${label}: Concluir`).toBeGreaterThanOrEqual(44);
      const doneText = await done.locator('span').evaluate((el) => el.getBoundingClientRect().width);
      if (doneLabel) expect(doneText, `${label}: rótulo do Concluir`).toBeGreaterThan(40);
      else expect(doneText, `${label}: rótulo do Concluir`).toBeLessThanOrEqual(1);
      await expectHandlesClear(page, label);
      await done.click();
      await expect(screenEl(page)).not.toHaveAttribute('data-adjust', '');
    }
  });

  test('onde a regra dos 50% cobriria uma alça, a barra mede e vai para o outro lado', async ({ page }) => {
    // 699 × 520: barra em duas linhas (114 px) e, a 55%, as alças laterais 2 px abaixo dela se ficasse em cima.
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6, areaHeight: 0.55 } });
    await openPrompter(page);
    await resizeViewport(page, 699, 520);
    await enterAdjust(page);
    const { area } = await geometry(page);
    expect((await page.locator('.pr-adjustbar').boundingBox()).y).toBeGreaterThan(area.bottom);
    await expectHandlesClear(page, '699×520 a 55%');
  });

  test('mudar o tamanho da tela no modo de ajuste revê o lado da barra', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6, areaHeight: 0.55 } });
    await openPrompter(page);
    await resizeViewport(page, 699, 700);
    await enterAdjust(page);
    const top = await page.locator('.pr-adjustbar').boundingBox();
    expect(top.y).toBeLessThan(100); // alta o bastante: em cima, sem cobrir nada
    await resizeViewport(page, 699, 520);
    await expect.poll(async () => (await page.locator('.pr-adjustbar').boundingBox()).y).toBeGreaterThan(300);
    await expectHandlesClear(page, 'depois de mudar para 699×520');
  });

  test('a barra só troca de lado ao soltar a alça, não no meio do arrasto', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaHeight: 0.3 } });
    await openPrompter(page);
    await enterAdjust(page);
    const { frame } = await geometry(page);
    const before = await page.locator('.pr-adjustbar').boundingBox();
    const from = await handleCenter(page, 'bottom');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + Math.round(frame.height * 0.4), { steps: 8 });
    expect((await tpSettings(page)).areaHeight).toBeGreaterThan(0.6);
    expect((await page.locator('.pr-adjustbar').boundingBox()).y).toBe(before.y);
    await page.mouse.up();
    await expect.poll(async () => (await page.locator('.pr-adjustbar').boundingBox()).y).toBeLessThan(before.y);
  });

  test('os valores ajustados ficam salvos ao recarregar', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6, areaHeight: 0.8 } });
    await openPrompter(page);
    await enterAdjust(page);
    const { frame } = await geometry(page);
    await dragHandle(page, 'corner-right', -Math.round(frame.width * 0.05), -Math.round(frame.height * 0.1));
    await page.locator('[data-action="adjust-done"]').click();
    const saved = await tpSettings(page);
    expect(saved.areaWidth).toBeLessThan(0.6);
    expect(saved.areaHeight).toBeLessThan(0.8);
    await page.reload();
    await expect(page.locator('textarea[name="script"]')).toBeVisible();
    expect(await tpSettings(page)).toEqual(saved);
  });
});
