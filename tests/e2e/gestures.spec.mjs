// Gestos no palco: toque para pausar e continuar (RF-06) e arrastar para reposicionar (RF-12).
import {
  test,
  expect,
  LONG_TEXT,
  drag,
  expectState,
  geometry,
  gotoApp,
  hudButton,
  jumpToEnd,
  jumpToProgress,
  openPanel,
  openPrompter,
  resizeViewport,
  screenEl,
  startPlaying,
  stateLog,
  tapAt,
  tapCenter,
  tpOffset,
  tpProgress,
  tpSettings,
  waitMoving,
} from './helpers.mjs';

const GRID = [1 / 6, 1 / 2, 5 / 6];

/**
 * O ponto (fração da tela) fica num botão ou na pílula do HUD, ou a menos de 24 px deles? Perto assim,
 * o navegador ajusta o toque do dedo para o botão (no Chromium, o "touch adjustment"): é toque no botão.
 */
const nearControl = (page, fx, fy) =>
  page.evaluate(([x, y]) => {
    const px = innerWidth * x;
    const py = innerHeight * y;
    const margin = 24;
    return [...document.querySelectorAll('#prompter-screen .pr-hud button, #prompter-screen .pr-pill')].some((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || getComputedStyle(el).visibility !== 'visible') return false;
      return px > r.left - margin && px < r.right + margin && py > r.top - margin && py < r.bottom + margin;
    });
  }, [fx, fy]);

/**
 * Toca em cada um dos 9 pontos de uma grade 3×3: rodando, pausa na hora (o texto não anda depois do
 * toque); pausado, um novo toque no mesmo ponto (se não for botão) retoma.
 */
async function tapGrid(page) {
  for (const fy of GRID) {
    for (const fx of GRID) {
      const where = `ponto (${fx.toFixed(2)}, ${fy.toFixed(2)})`;
      await expectState(page, 'playing');
      await waitMoving(page);
      await page.evaluate(() => (window.__e2e.ups.length = 0));
      await tapAt(page, fx, fy);
      await expect(screenEl(page), where).toHaveAttribute('data-state', 'paused');
      // Pausa imediata: o texto não anda mais que 1 quadro depois que o dedo sai da tela.
      const { ups, now } = await page.evaluate(() => ({ ups: window.__e2e.ups, now: window.__tp.offset() }));
      expect(ups.length, where).toBe(1);
      const oneFrame = ups[0].pps / 60;
      expect(Math.abs(now - ups[0].offset), where).toBeLessThanOrEqual(oneFrame + 0.01);
      await page.waitForTimeout(150);
      expect(await tpOffset(page), where).toBe(now);
      if (await nearControl(page, fx, fy)) await tapAt(page, 0.5, 0.45);
      else await tapAt(page, fx, fy);
      await expect(screenEl(page), where).toHaveAttribute('data-state', 'playing');
    }
  }
}

test.describe('RF-06 um toque para parar e continuar', () => {
  test('rodando, tocar em cada ponto de uma grade 3×3 pausa na hora; tocar de novo retoma', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await tapGrid(page);
  });

  test('a grade 3×3 funciona com espelho horizontal e inversão vertical', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoApp(page, { script: LONG_TEXT, settings: { mirrorX: true, mirrorY: true } });
    await openPrompter(page);
    await expect(screenEl(page)).toHaveAttribute('data-mirror-x', '');
    await expect(screenEl(page)).toHaveAttribute('data-mirror-y', '');
    await startPlaying(page);
    await tapGrid(page);
  });

  test('a grade 3×3 funciona na outra orientação da tela', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    await resizeViewport(page, h, w);
    await startPlaying(page);
    await tapGrid(page);
  });

  test('pausado, tocar num botão aciona só o botão; tocar fora retoma', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await tapCenter(page);
    await expectState(page, 'paused');
    await page.waitForTimeout(450); // proteção contra toque duplo do HUD
    const progress = await tpProgress(page);
    const { fontSize } = await tpSettings(page);
    await hudButton(page, 'speed-up').tap();
    await expect.poll(async () => (await tpSettings(page)).speed).toBe(155);
    await hudButton(page, 'font-up').tap();
    await expect.poll(async () => (await tpSettings(page)).fontSize).toBe(fontSize + 4);
    await page.waitForTimeout(200);
    await expectState(page, 'paused');
    expect(Math.abs((await tpProgress(page)) - progress)).toBeLessThan(0.02);
    await tapAt(page, 0.5, 0.4);
    await expectState(page, 'playing');
  });

  test('proteção contra toque duplo: um segundo toque logo depois da pausa não aciona "Recomeçar"', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    const restart = await hudButton(page, 'restart').boundingBox();
    const x = Math.round(restart.x + restart.width / 2);
    const y = Math.round(restart.y + restart.height / 2);
    // Rodando, o HUD está escondido: o primeiro toque cai no palco (pausa); o segundo cai no botão,
    // que acabou de aparecer e ainda ignora toques. Os instantes medidos na página confirmam que o
    // segundo toque chegou mesmo dentro dos 350 ms (com a máquina lenta, tenta de novo).
    let verified = false;
    for (let attempt = 0; attempt < 3 && !verified; attempt++) {
      await startPlaying(page);
      await page.waitForTimeout(400);
      await page.evaluate(() => (window.__e2e.ups.length = 0));
      await page.touchscreen.tap(x, y);
      await page.touchscreen.tap(x, y);
      const timing = await page.evaluate(() => ({ ups: window.__e2e.ups.map((up) => up.t), hudAt: window.__e2e.hudAt }));
      if (timing.ups.length !== 2 || timing.ups[1] - timing.hudAt >= 300) continue;
      await expectState(page, 'paused');
      const paused = await tpOffset(page);
      expect(paused).toBeGreaterThan(0);
      await page.waitForTimeout(200);
      await expectState(page, 'paused');
      expect(await tpOffset(page)).toBe(paused);
      verified = true;
    }
    expect(verified, 'os dois toques chegaram dentro da janela de 350 ms').toBe(true);
    // Passada a proteção, o mesmo toque aciona o botão.
    await page.waitForTimeout(400);
    await page.touchscreen.tap(x, y);
    await expectState(page, 'ready');
    expect(await tpOffset(page)).toBe(0);
  });

  test('um segundo dedo durante o gesto cancela o toque (não pausa nem retoma)', async ({ page, browserName }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    const x = Math.round(w / 2);
    const y = Math.round(h / 2);
    if (browserName === 'chromium') {
      // Toque real com dois dedos pelo protocolo do Chromium.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }, { x: x + 60, y: y + 20, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);
      await expectState(page, 'playing');
      // Controle: um dedo só, pelo mesmo caminho, pausa.
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expectState(page, 'paused');
    } else {
      // O WebKit do Playwright só simula um dedo: os eventos de ponteiro vão direto para o palco.
      const send = (steps) =>
        page.evaluate(([list, cx, cy]) => {
          const target = document.querySelector('#prompter-screen .pr-text');
          for (const [type, id, dx] of list) {
            target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: cx + dx, clientY: cy, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
          }
        }, [steps, x, y]);
      await send([['pointerdown', 11, 0], ['pointerdown', 12, 60], ['pointerup', 11, 0], ['pointerup', 12, 60]]);
      await page.waitForTimeout(200);
      await expectState(page, 'playing');
      // Controle: o mesmo caminho com um dedo só pausa (os eventos chegam ao motor).
      await send([['pointerdown', 13, 0], ['pointerup', 13, 0]]);
      await expectState(page, 'paused');
    }
  });

  test('segurar sem mover (toque longo) não pausa; o menu de contexto e o toque duplo do navegador ficam bloqueados', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    await page.mouse.move(w / 2, h / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForTimeout(100);
    await expectState(page, 'playing');
    const blocked = await page.evaluate(() => {
      const target = document.querySelector('#prompter-screen .pr-text');
      const fire = (type, Ctor) => {
        const event = new Ctor(type, { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const root = getComputedStyle(document.getElementById('prompter-screen'));
      return {
        contextmenu: fire('contextmenu', MouseEvent),
        dblclick: fire('dblclick', MouseEvent),
        gesturestart: fire('gesturestart', Event), // pinça do Safari
        touchAction: getComputedStyle(target).touchAction,
        userSelect: root.userSelect || root.webkitUserSelect,
      };
    });
    expect(blocked).toEqual({ contextmenu: true, dblclick: true, gesturestart: true, touchAction: 'none', userSelect: 'none' });
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  });
});

test.describe('RF-12 arrastar para reposicionar', () => {
  test('pausado, o texto acompanha o dedo 1:1 e o arrasto não retoma a leitura', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await jumpToProgress(page, 0.3);
    await expectState(page, 'paused');
    const { vw, vh } = await geometry(page);
    const x = Math.round(vw / 2);
    const y = Math.round(vh / 2);
    const start = await tpOffset(page);
    const textBefore = (await geometry(page)).text;
    await drag(page, { x, y }, { x, y: y - 120 });
    expect(Math.abs((await tpOffset(page)) - (start + 120))).toBeLessThan(0.5);
    // Na tela, o texto sobe os mesmos 120 px (desenho arredondado ao pixel físico).
    expect(Math.abs((await geometry(page)).text.top - (textBefore.top - 120))).toBeLessThanOrEqual(1);
    await drag(page, { x, y }, { x, y: y + 50 });
    expect(Math.abs((await tpOffset(page)) - (start + 70))).toBeLessThan(0.5);
    await expectState(page, 'paused');
  });

  test('rodando, o arrasto suspende a rolagem e ela continua ao soltar', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    const { vw, vh } = await geometry(page);
    const x = Math.round(vw / 2);
    const y = Math.round(vh / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 40, { steps: 5 });
    const held = await tpOffset(page);
    await page.waitForTimeout(500);
    expect(await tpOffset(page)).toBe(held); // dedo parado na tela: o texto parado também
    await expectState(page, 'playing');
    await page.mouse.move(x, y - 100, { steps: 5 });
    expect(await tpOffset(page)).toBeCloseTo(held + 60, 0);
    await page.mouse.up();
    await expectState(page, 'playing');
    await waitMoving(page);
    expect((await stateLog(page)).some((entry) => entry.state === 'paused')).toBe(false);
  });

  test('em pronto, arrastar para a frente vai para pausado', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    const { vw, vh } = await geometry(page);
    await drag(page, { x: vw / 2, y: vh * 0.6 }, { x: vw / 2, y: vh * 0.6 - 80 });
    await expectState(page, 'paused');
    expect(await tpOffset(page)).toBeCloseTo(80, 0);
    await expect(page.locator('.pr-hint')).toHaveText('Toque para continuar');
  });

  test('no fim, arrastar para trás volta para pausado; arrastar até o fim (rodando) termina', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await jumpToEnd(page);
    const end = await tpOffset(page);
    const { vw, vh } = await geometry(page);
    await drag(page, { x: vw / 2, y: vh * 0.4 }, { x: vw / 2, y: vh * 0.4 + 90 });
    await expectState(page, 'paused');
    expect(await tpOffset(page)).toBeCloseTo(end - 90, 0);
    // Rodando: arrastar além do fim e soltar leva ao estado fim.
    await tapCenter(page);
    await expectState(page, 'playing');
    await drag(page, { x: vw / 2, y: vh * 0.7 }, { x: vw / 2, y: vh * 0.7 - 300 });
    await expectState(page, 'ended');
    expect(await tpOffset(page)).toBe(end);
  });

  test('o painel aberto: um toque no palco só fecha o painel, sem retomar', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await startPlaying(page);
    await tapCenter(page);
    await expectState(page, 'paused');
    await openPanel(page);
    const offset = await tpOffset(page);
    const panel = await page.locator('aside.sheet.pn').boundingBox();
    const { vw } = await geometry(page);
    // Um ponto do palco fora do painel (acima da folha de baixo, ou do lado oposto do painel lateral).
    const fx = panel.x > vw / 2 ? 0.2 : panel.x + panel.width < vw / 2 ? 0.8 : 0.5;
    await tapAt(page, fx, 0.15);
    await expect(page.locator('aside.sheet.pn')).not.toHaveClass(/is-open/);
    await page.waitForTimeout(200);
    await expectState(page, 'paused');
    expect(await tpOffset(page)).toBe(offset);
    await expect(screenEl(page)).toHaveAttribute('data-hud', '');
  });
});
