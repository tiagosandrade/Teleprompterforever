// Motor do teleprompter: tempo de leitura (RF-01), tela acesa (RF-10), tela cheia (RF-11),
// contagem (RF-13), HUD (RF-15), fim do texto (RF-17) e a máquina de estados da seção 6.
import {
  test,
  expect,
  LONG_TEXT,
  LINE_HEIGHT,
  READING_LINE,
  clickHud,
  expectState,
  geometry,
  gotoApp,
  hudButton,
  hudReady,
  jumpToEnd,
  jumpToProgress,
  makeText,
  openPanel,
  openPrompter,
  resizeViewport,
  screenEl,
  setRange,
  closePanel,
  startPlaying,
  stateLog,
  tapAt,
  tapCenter,
  tpOffset,
  tpProgress,
  tpSettings,
  tpState,
  veiledReadingLine,
  waitMoving,
} from './helpers.mjs';

test.describe('RF-01 velocidade (ppm)', () => {
  test('mudar a velocidade rodando não move o texto (o ritmo novo é medido em timing.spec.mjs)', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { speed: 100 } });
    await openPrompter(page);
    await startPlaying(page);
    await page.waitForTimeout(500); // fim da rampa de retomada
    // No mesmo instante (sem quadro no meio), a tecla ↑ muda a velocidade e o ponto continua igual.
    const jump = await page.evaluate(() => {
      const before = window.__tp.offset();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      return { before, after: window.__tp.offset(), speed: window.__tp.settings().speed };
    });
    expect(jump.speed).toBe(105);
    expect(jump.after).toBe(jump.before);
    await expectState(page, 'playing');
  });

  test('pausado, os botões e o controle deslizante de velocidade não mexem no ponto do texto', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await jumpToProgress(page, 0.3);
    const before = await tpOffset(page);
    await clickHud(page, 'speed-up');
    await clickHud(page, 'speed-up');
    expect((await tpSettings(page)).speed).toBe(160);
    await expect(page.locator('.pr-speed')).toHaveText('160');
    await clickHud(page, 'speed-down');
    expect((await tpSettings(page)).speed).toBe(155);
    await openPanel(page);
    await setRange(page, 'speed', 240);
    await closePanel(page);
    expect((await tpSettings(page)).speed).toBe(240);
    expect(await tpOffset(page)).toBe(before);
  });

  test('limites 40 e 320 ppm desativam os botões; o valor volta igual ao reabrir o app', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { speed: 310 } });
    await openPrompter(page);
    await clickHud(page, 'speed-up');
    await clickHud(page, 'speed-up');
    expect((await tpSettings(page)).speed).toBe(320);
    await expect(hudButton(page, 'speed-up')).toBeDisabled();
    await expect(hudButton(page, 'speed-down')).toBeEnabled();
    await openPanel(page);
    await setRange(page, 'speed', 40);
    await closePanel(page);
    await expect(hudButton(page, 'speed-down')).toBeDisabled();
    await expect(page.locator('.pr-speed')).toHaveText('40');
    await clickHud(page, 'speed-up');
    expect((await tpSettings(page)).speed).toBe(45);
    await page.reload();
    await expect(page.locator('.ed-stats')).toContainText('a 45 ppm');
    expect((await tpSettings(page)).speed).toBe(45);
  });
});

/** Registra na página cada número que a contagem mostra (para conferir a sequência sem depender do relógio). */
const recordDigits = (page) =>
  page.evaluate(() => {
    window.__digits = [];
    const box = document.querySelector('#prompter-screen .pr-countdown');
    new MutationObserver(() => {
      const digit = box.querySelector('.pr-countdown__digit');
      if (digit) window.__digits.push(digit.textContent);
    }).observe(box, { childList: true });
  });

test.describe('RF-13 contagem regressiva', () => {
  test('3 s por padrão: 3, 2, 1 no centro da área, sem HUD, texto apagado; depois roda', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { countdown: 3 } });
    await openPrompter(page);
    await recordDigits(page);
    await tapCenter(page);
    await expectState(page, 'countdown');
    // Centralizado na área (o número fica dentro do palco e espelha com ele); medido logo, com a contagem rodando.
    const centers = await page.evaluate(() => {
      const center = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const digit = document.querySelector('#prompter-screen .pr-stage .pr-countdown__digit');
      return { digit: center(digit), area: center(document.querySelector('.pr-area')), hud: document.getElementById('prompter-screen').hasAttribute('data-hud') };
    });
    expect(Math.abs(centers.digit.x - centers.area.x)).toBeLessThan(2);
    expect(Math.abs(centers.digit.y - centers.area.y)).toBeLessThan(40);
    expect(centers.hud).toBe(false);
    await expect.poll(() => page.locator('.pr-text').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.3);
    await expectState(page, 'playing', 6_000);
    await expect(page.locator('.pr-countdown')).toBeEmpty();
    expect(await page.evaluate(() => window.__digits)).toEqual(['3', '2', '1']);
    // A duração exata (3 s) é medida sem carga em timing.spec.mjs; aqui só a ordem e o fim da contagem.
    const log = await stateLog(page);
    const countdown = log.findLast((entry) => entry.state === 'countdown');
    const playing = log.findLast((entry) => entry.state === 'playing');
    expect(playing.t - countdown.t).toBeGreaterThan(2_900);
    await waitMoving(page);
  });

  test('tocar durante a contagem cancela e volta para pronto, no início', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { countdown: 5 } });
    await openPrompter(page);
    await recordDigits(page);
    await tapCenter(page);
    await expectState(page, 'countdown');
    expect(await page.evaluate(() => window.__digits[0])).toBe('5'); // a opção de 5 s começa no 5
    await tapAt(page, 0.2, 0.7);
    await expectState(page, 'ready');
    await expect(page.locator('.pr-countdown')).toBeEmpty();
    await expect(screenEl(page)).toHaveAttribute('data-hud', '');
    expect(await tpOffset(page)).toBe(0);
    await page.waitForTimeout(1_200); // a contagem cancelada não volta sozinha
    await expectState(page, 'ready');
  });

  test('retomar uma pausa não tem contagem; o arrasto é ignorado durante a contagem', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { countdown: 3 } });
    await openPrompter(page);
    await page.keyboard.press('Space'); // Espaço em pronto também começa pela contagem
    await expectState(page, 'countdown');
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    await page.mouse.move(w / 2, h * 0.6);
    await page.mouse.down();
    await page.mouse.move(w / 2, h * 0.3, { steps: 6 });
    await page.mouse.up();
    expect(await tpOffset(page)).toBe(0);
    await expectState(page, 'playing', 4_000);
    await waitMoving(page);
    await tapCenter(page);
    await expectState(page, 'paused');
    await tapCenter(page);
    await expectState(page, 'playing');
    const log = await stateLog(page);
    expect(log.slice(-3).map((entry) => entry.state)).toEqual(['playing', 'paused', 'playing']);
  });

  test('"Desligada" começa direto', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { countdown: 3 } });
    await openPrompter(page);
    await openPanel(page);
    await page.locator('input[name="countdown"][value="0"]').check();
    await closePanel(page);
    expect((await tpSettings(page)).countdown).toBe(0);
    await tapCenter(page);
    await expectState(page, 'playing');
    expect((await stateLog(page)).some((entry) => entry.state === 'countdown')).toBe(false);
  });
});

test.describe('RF-15 HUD', () => {
  test('pronto: Voltar à esquerda, tempo no centro, Ajustes à direita, pílula completa e a dica certa', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await expect(page.locator('.pr-hint')).toHaveText('Toque em qualquer lugar para começar');
    await expect(page.locator('.pr-time__label')).toHaveText('−4:00'); // 600 palavras a 150 ppm
    const boxes = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        vw: innerWidth,
        vh: innerHeight,
        exit: box('[data-action="exit"]'),
        time: box('.pr-time'),
        settings: box('[data-action="settings"]'),
        pill: box('.pr-pill'),
        hint: box('.pr-hint'),
        order: [...document.querySelectorAll('.pr-pill [data-action]')].filter((el) => el.offsetParent).map((el) => el.dataset.action),
      };
    });
    expect(boxes.exit.left).toBeLessThan(boxes.vw * 0.25);
    expect(boxes.exit.top).toBeLessThan(80);
    expect(Math.abs(boxes.time.left + boxes.time.width / 2 - boxes.vw / 2)).toBeLessThan(2);
    expect(boxes.settings.right).toBeGreaterThan(boxes.vw * 0.75);
    expect(boxes.pill.bottom).toBeGreaterThan(boxes.vh - 80);
    expect(Math.abs(boxes.pill.left + boxes.pill.width / 2 - boxes.vw / 2)).toBeLessThan(2);
    expect(boxes.hint.bottom).toBeLessThanOrEqual(boxes.pill.top);
    expect(boxes.order).toEqual(['restart', 'speed-down', 'speed-up', 'font-down', 'font-up', 'toggle']);
    // Alvos de toque: 44 px (ou 36 px visíveis com área de toque de 44 px em telas estreitas).
    const sizes = await page.locator('#prompter-screen .pr-hud button:visible').evaluateAll((buttons) =>
      buttons.map((b) => {
        const r = b.getBoundingClientRect();
        const hit = b.classList.contains('btn--sm') ? 44 : Math.min(r.width, r.height);
        return { action: b.dataset.action, hit, label: b.getAttribute('aria-label') };
      }),
    );
    for (const size of sizes) {
      expect(size.hit, size.action).toBeGreaterThanOrEqual(44);
      expect(size.label, size.action).toBeTruthy();
    }
  });

  test('rodando, nada além do texto fica visível; pausado volta com "Toque para continuar"', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await expect(screenEl(page)).not.toHaveAttribute('data-hud', '');
    await expect(page.locator('.pr-hud')).toHaveCSS('visibility', 'hidden');
    // Todo elemento visível (área > 0, visibility visible, opacidade efetiva > 0) tem de ser do palco.
    const visible = await page.evaluate(() => {
      const allowed = ['pr-frame', 'pr-stage', 'pr-area', 'pr-viewport', 'pr-text', 'pr-fade', 'pr-countdown', 'pr-sr', 'pr-nosleep'];
      const opacity = (el) => {
        let value = 1;
        for (let node = el; node && node.nodeType === 1; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
        return value;
      };
      const found = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
        if (getComputedStyle(el).visibility !== 'visible' || opacity(el) < 0.01) continue;
        const own = [...el.classList].some((name) => allowed.some((ok) => name === ok || name.startsWith(`${ok}--`)));
        if (!own && el.id !== 'prompter-screen') found.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}#${el.id}`);
      }
      return found;
    });
    expect(visible).toEqual([]);
    await tapCenter(page);
    await expectState(page, 'paused');
    await expect(screenEl(page)).toHaveAttribute('data-hud', '');
    await expect(page.locator('.pr-hint')).toHaveText('Toque para continuar');
    await expect(hudButton(page, 'toggle')).toHaveAttribute('aria-label', 'Reproduzir');
  });

  test('o tempo restante diminui e a barra de progresso cresce enquanto lê', async ({ page }) => {
    await gotoApp(page, { script: makeText(100), settings: { speed: 300 } });
    await openPrompter(page);
    await expect(page.locator('.pr-time__label')).toHaveText('−0:20');
    await startPlaying(page);
    // Lê até passar de 10% do texto (2 s nesta velocidade).
    await expect.poll(() => tpProgress(page), { timeout: 15_000 }).toBeGreaterThan(0.1);
    await tapCenter(page);
    await expectState(page, 'paused');
    const label = await page.locator('.pr-time__label').textContent();
    const [, m, s] = label.match(/^−(\d+):(\d\d)$/);
    expect(Number(m) * 60 + Number(s)).toBeLessThan(20);
    const fill = await page.locator('.pr-time__fill').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    const progress = await tpProgress(page);
    expect(fill).toBeCloseTo(progress, 2);
    // O tempo restante é (1 − p) × palavras ÷ ppm, arredondado para cima.
    expect(Number(m) * 60 + Number(s)).toBe(Math.ceil((1 - progress) * 20));
  });

  test('no início o tempo restante é exatamente palavras × 60 ÷ ppm (31 palavras a 60 ppm = −0:31)', async ({ page }) => {
    await gotoApp(page, { script: makeText(31), settings: { speed: 60 } });
    await expect(page.locator('.ed-stats')).toHaveText('31 palavras · 31 s a 60 ppm');
    await openPrompter(page);
    await expect(page.locator('.pr-time__label')).toHaveText('−0:31');
  });

  // Área baixa (ou invertida): a linha de leitura chega perto de uma barra do HUD. O véu atrás da barra esmaece só
  // até antes da linha que está sendo lida; antes, ela ficava em parte sob o véu.
  for (const [width, height, settings] of [
    [375, 667, { areaHeight: 0.5, mirrorY: true }],
    [667, 375, { areaWidth: 0.6, areaHeight: 0.5 }],
  ]) {
    const name = `${width}×${height}${settings.mirrorY ? ' com inversão vertical' : ''}, área de 50% de altura`;
    test(`${name}: os véus do HUD não cobrem a linha que está na linha de leitura (pronto, pausado e fim)`, async ({ page }) => {
      await gotoApp(page, { script: LONG_TEXT, settings: { fontSize: 36, guide: true, ...settings } });
      await openPrompter(page);
      await resizeViewport(page, width, height);
      const ready = await veiledReadingLine(page);
      expect(ready.overBars, 'nenhuma barra do HUD sobre a linha').toBe(false);
      expect(ready.share, 'pronto').toBe(0);
      await jumpToProgress(page, 0.3);
      await expectState(page, 'paused');
      expect((await veiledReadingLine(page)).share, 'pausado').toBe(0);
      await jumpToEnd(page);
      expect((await veiledReadingLine(page)).share, 'fim').toBe(0);
    });
  }

  test('com a linha de leitura longe das barras, os véus esmaecem como antes (32 px em cima, 48 px embaixo)', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { guide: true } });
    await openPrompter(page);
    const { topFade, bottomFade, share } = await veiledReadingLine(page);
    expect([topFade, bottomFade]).toEqual([32, 48]);
    expect(share).toBe(0);
  });

  test('o HUD some com o painel aberto e volta ao fechar', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await openPanel(page);
    await expect(screenEl(page)).not.toHaveAttribute('data-hud', '');
    await closePanel(page);
    await expect(screenEl(page)).toHaveAttribute('data-hud', '');
  });

  test('abaixo de 360 px A− e A+ saem da pílula, que cabe inteira na tela', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await resizeViewport(page, 340, 640);
    await expect(hudButton(page, 'font-down')).toBeHidden();
    await expect(hudButton(page, 'font-up')).toBeHidden();
    await expect(hudButton(page, 'toggle')).toBeVisible();
    const pill = await page.locator('.pr-pill').boundingBox();
    expect(pill.x).toBeGreaterThanOrEqual(0);
    expect(pill.x + pill.width).toBeLessThanOrEqual(340);
    await resizeViewport(page, 360, 640);
    await expect(hudButton(page, 'font-up')).toBeVisible();
    const wide = await page.locator('.pr-pill').boundingBox();
    expect(wide.x).toBeGreaterThanOrEqual(0);
    expect(wide.x + wide.width).toBeLessThanOrEqual(360);
  });
});

test.describe('RF-17 fim do texto', () => {
  test('rodando, para sozinho no fim: HUD, "Fim do texto", Recomeçar em destaque e Reproduzir desativado', async ({ page }) => {
    await gotoApp(page, { script: makeText(20), settings: { speed: 320 } });
    await openPrompter(page);
    await tapCenter(page);
    await expectState(page, 'ended', 15_000);
    await expect(screenEl(page)).toHaveAttribute('data-hud', '');
    await expect(page.locator('.pr-hint')).toHaveText('Fim do texto');
    await expect(page.locator('.pr-sr')).toHaveText('Fim do texto');
    await expect(hudButton(page, 'toggle')).toBeDisabled();
    await expect(hudButton(page, 'restart')).toHaveCSS('background-color', 'rgb(255, 176, 32)');
    await expect(page.locator('.pr-time__label')).toHaveText('−0:00');
    // A última linha fica na linha de leitura.
    const { area, text } = await geometry(page);
    const { fontSize } = await tpSettings(page);
    const lastLineCenter = text.bottom - (fontSize * LINE_HEIGHT) / 2;
    expect(Math.abs(lastLineCenter - (area.top + area.height * READING_LINE))).toBeLessThan(1.5);
  });

  test('no fim, tocar no palco e apertar Espaço não fazem nada; Recomeçar volta ao início', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await jumpToEnd(page);
    const end = await tpOffset(page);
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.3], [0.8, 0.6]]) await tapAt(page, fx, fy);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await expectState(page, 'ended');
    expect(await tpOffset(page)).toBe(end);
    await clickHud(page, 'restart');
    await expectState(page, 'ready');
    expect(await tpOffset(page)).toBe(0);
    await expect(page.locator('.pr-hint')).toHaveText('Toque em qualquer lugar para começar');
  });
});

test.describe('Máquina de estados (seção 6)', () => {
  test('Voltar ao editor e abrir de novo começa em pronto, no início do texto', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await tapCenter(page);
    await expectState(page, 'paused');
    expect(await tpOffset(page)).toBeGreaterThan(0);
    await clickHud(page, 'exit');
    await expect(page.locator('#editor-screen')).toBeVisible();
    await expect(screenEl(page)).toBeHidden();
    await openPrompter(page);
    expect(await tpOffset(page)).toBe(0);
    expect(await tpState(page)).toBe('ready');
  });

  test('Voltar do sistema com o teleprompter aberto volta ao editor, sem sair do app', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    const url = page.url();
    await openPrompter(page);
    await startPlaying(page);
    await page.goBack();
    await expect(page.locator('#editor-screen')).toBeVisible();
    await expect(screenEl(page)).toBeHidden();
    expect(page.url()).toBe(url);
    await openPrompter(page);
    expect(await tpState(page)).toBe('ready');
  });

  test('sair pelo Voltar do HUD desfaz a entrada do histórico: o Voltar seguinte sai do app', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await clickHud(page, 'exit');
    await expect(page.locator('#editor-screen')).toBeVisible();
    await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
    await page.goBack();
    await expect.poll(() => page.url()).toBe('about:blank');
  });

  test('Recomeçar (HUD) leva a pronto no início; a primeira linha fica na linha de leitura (30%)', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await jumpToProgress(page, 0.2);
    await expectState(page, 'paused');
    await clickHud(page, 'restart');
    await expectState(page, 'ready');
    expect(await tpOffset(page)).toBe(0);
    const { area, text } = await geometry(page);
    const { fontSize } = await tpSettings(page);
    const firstLineCenter = text.top + (fontSize * LINE_HEIGHT) / 2;
    expect(Math.abs(firstLineCenter - (area.top + area.height * READING_LINE))).toBeLessThan(1.5);
  });

  test('sair do app rodando pausa; em contagem volta para pronto', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { countdown: 3 } });
    await openPrompter(page);
    const hide = (hidden) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await tapCenter(page);
    await expectState(page, 'countdown');
    await hide(true);
    await expectState(page, 'ready');
    await hide(false);
    await openPanel(page);
    await page.locator('input[name="countdown"][value="0"]').check();
    await closePanel(page);
    await startPlaying(page);
    await hide(true);
    await expectState(page, 'paused');
    const frozen = await tpOffset(page);
    await page.waitForTimeout(300);
    expect(await tpOffset(page)).toBe(frozen);
    await hide(false);
    await expectState(page, 'paused');
  });

  test('texto de uma linha (D = 0) fica parado na linha de leitura por palavras ÷ ppm e termina', async ({ page }) => {
    await gotoApp(page, { script: 'Olá a todos.', settings: { speed: 300 } });
    await openPrompter(page);
    expect(await page.evaluate(() => window.__tp.distance())).toBe(0);
    const { area, text } = await geometry(page);
    const { fontSize } = await tpSettings(page);
    expect(Math.abs(text.top + (fontSize * LINE_HEIGHT) / 2 - (area.top + area.height * READING_LINE))).toBeLessThan(1.5);
    await tapCenter(page);
    await expectState(page, 'ended', 10_000);
    const log = await stateLog(page);
    const seconds = (log.at(-1).t - log.findLast((entry) => entry.state === 'playing').t) / 1000;
    expect(seconds).toBeGreaterThan(0.55); // 3 palavras a 300 ppm = 0,6 s
    expect((await geometry(page)).text.top).toBe(text.top);
  });

  test('RNF-06: um roteiro de 20 mil palavras abre, roda, pausa e mantém o ponto ao mudar a fonte', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoApp(page, { script: makeText(20000), settings: { fontSize: 36 } });
    await expect(page.locator('.ed-stats')).toHaveText('20.000 palavras · 2 h 13 min a 150 ppm');
    await openPrompter(page);
    await expect(page.locator('.pr-time__label')).toHaveText('−2:13:20');
    expect(await page.evaluate(() => window.__tp.distance())).toBeGreaterThan(10_000);
    await startPlaying(page);
    await tapCenter(page);
    await expectState(page, 'paused');
    await jumpToProgress(page, 0.5);
    const before = await tpProgress(page);
    await clickHud(page, 'font-up');
    expect(Math.abs((await tpProgress(page)) - before)).toBeLessThan(0.02);
  });

  test('girar o aparelho no meio da leitura mantém o ponto do texto', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await jumpToProgress(page, 0.4);
    const before = await tpProgress(page);
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    await resizeViewport(page, h, w);
    const after = await tpProgress(page);
    expect(Math.abs(after - before)).toBeLessThan(0.02);
    expect(await page.evaluate(() => window.__tp.distance())).toBeGreaterThan(0);
  });
});

test.describe('RF-10 tela acesa', () => {
  test('com a Wake Lock API: pede "screen" dentro do toque de abrir, libera ao voltar ao editor e repede ao voltar ao app', async ({ page }) => {
    await page.addInitScript(() => {
      const log = (window.__wl = { requests: [], releases: 0, sentinels: [] });
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request(type) {
            log.requests.push({ type, active: navigator.userActivation ? navigator.userActivation.isActive : null });
            const sentinel = new EventTarget();
            sentinel.type = type;
            sentinel.released = false;
            sentinel.release = async () => {
              if (sentinel.released) return;
              sentinel.released = true;
              log.releases++;
              sentinel.dispatchEvent(new Event('release'));
            };
            log.sentinels.push(sentinel);
            return Promise.resolve(sentinel);
          },
        },
      });
    });
    await gotoApp(page, { script: LONG_TEXT });
    expect(await page.evaluate(() => window.__wl.requests.length)).toBe(0);
    await openPrompter(page);
    const opened = await page.evaluate(() => window.__wl.requests);
    expect(opened.length).toBe(1);
    expect(opened[0].type).toBe('screen');
    // O sistema solta o bloqueio ao esconder a página; ao voltar, o app pede de novo.
    await page.evaluate(() => {
      window.__wl.sentinels.at(-1).release();
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => window.__wl.requests.length)).toBe(2);
    // Caiu de novo: um toque no palco (gesto do usuário, que aqui também começa a leitura) religa.
    await page.evaluate(() => window.__wl.sentinels.at(-1).release());
    await tapCenter(page);
    await expect.poll(() => page.evaluate(() => window.__wl.requests.length)).toBe(3);
    await expectState(page, 'playing');
    await tapCenter(page);
    await expectState(page, 'paused');
    expect(await page.evaluate(() => window.__wl.requests.length)).toBe(3); // já ligado: não pede de novo
    await clickHud(page, 'exit');
    await expect.poll(() => page.evaluate(() => window.__wl.releases)).toBe(3);
    expect(await page.evaluate(() => window.__wl.sentinels.every((s) => s.released))).toBe(true);
  });

  test('sem a Wake Lock API: liga o vídeo invisível (sem muted e sem loop) e pausa ao voltar ao editor', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
      const log = (window.__media = { play: 0, pause: 0 });
      HTMLMediaElement.prototype.play = function play() {
        log.play++;
        Object.defineProperty(this, 'paused', { configurable: true, get: () => false });
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function pause() {
        log.pause++;
        Object.defineProperty(this, 'paused', { configurable: true, get: () => true });
      };
    });
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    const video = page.locator('#prompter-screen video.pr-nosleep');
    await expect(video).toHaveCount(1);
    const attrs = await video.evaluate((el) => ({ muted: el.muted || el.hasAttribute('muted'), loop: el.loop, playsinline: el.hasAttribute('playsinline'), src: el.src.slice(0, 22) }));
    expect(attrs).toEqual({ muted: false, loop: false, playsinline: true, src: 'data:video/mp4;base64,' });
    expect(await page.evaluate(() => window.__media.play)).toBe(1);
    await clickHud(page, 'exit');
    expect(await page.evaluate(() => window.__media.pause)).toBe(1);
  });
});

test.describe('RF-11 tela cheia', () => {
  test('onde a API existe, pede tela cheia ao abrir e o botão entra e sai', async ({ page, browserName }) => {
    if (browserName === 'webkit') {
      // O WebKit do Playwright no Windows não tem a API para elementos; o iPad tem, com prefixo webkit.
      await page.addInitScript(() => {
        const log = (window.__fs = { requests: 0, exits: 0, active: null });
        delete Element.prototype.requestFullscreen;
        Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => undefined });
        Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => undefined });
        Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { configurable: true, get: () => true });
        Object.defineProperty(Document.prototype, 'webkitFullscreenElement', { configurable: true, get: () => log.active });
        Element.prototype.webkitRequestFullscreen = function webkitRequestFullscreen() {
          log.requests++;
          log.active = this;
          document.dispatchEvent(new Event('webkitfullscreenchange'));
        };
        Document.prototype.webkitExitFullscreen = function webkitExitFullscreen() {
          log.exits++;
          log.active = null;
          document.dispatchEvent(new Event('webkitfullscreenchange'));
        };
        delete Document.prototype.exitFullscreen;
      });
    }
    const active = () => page.evaluate(() => Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await expect.poll(active).toBe(true);
    const button = hudButton(page, 'fullscreen');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-label', 'Sair da tela cheia');
    await button.click();
    await expect.poll(active).toBe(false);
    await expect(button).toHaveAttribute('aria-label', 'Tela cheia');
    await button.click();
    await expect.poll(active).toBe(true);
    await clickHud(page, 'exit');
    await expect.poll(active).toBe(false);
  });

  test('sem a API (iPhone) o botão de tela cheia não aparece', async ({ page, browserName }) => {
    if (browserName === 'chromium') {
      await page.addInitScript(() => {
        delete Element.prototype.requestFullscreen;
        delete Element.prototype.webkitRequestFullscreen;
        Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => false });
      });
    }
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await expect(hudButton(page, 'fullscreen')).toBeHidden();
    await expect(hudButton(page, 'settings')).toBeVisible();
  });

  test('aberto pela Tela de Início (app instalado) o botão some e não pede tela cheia', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query) => (/display-mode:\s*standalone/.test(query) ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : original(query));
    });
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await expect(hudButton(page, 'fullscreen')).toBeHidden();
    expect(await page.evaluate(() => Boolean(document.fullscreenElement || document.webkitFullscreenElement))).toBe(false);
    await expect(page.locator('.ed-hint')).toBeHidden();
  });
});
