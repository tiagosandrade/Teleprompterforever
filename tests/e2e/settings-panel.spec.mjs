// Painel de ajustes (seção 5.3): tamanho do texto (RF-03), posição (RF-04), área pelos controles
// deslizantes (RF-05), persistência (RF-09) e guia de leitura (RF-14).
import {
  test,
  expect,
  FRAME_MARGIN,
  LINE_HEIGHT,
  LONG_TEXT,
  READING_LINE,
  STORAGE_KEY,
  clickHud,
  closePanel,
  expectState,
  geometry,
  gotoApp,
  hudButton,
  jumpToProgress,
  lineBreaks,
  openPanel,
  openPrompter,
  panelEl,
  resizeViewport,
  screenEl,
  setRange,
  setRangeRaw,
  tapAt,
  tpProgress,
  tpSettings,
} from './helpers.mjs';

/** Padrões do contrato (seção 8): tablet quando o lado menor da tela tem 600 px ou mais. */
const defaultsFor = (projectName) =>
  projectName === 'ipad'
    ? { speed: 150, fontSize: 60, position: 'center', areaWidth: 0.7, areaHeight: 1, mirrorX: false, mirrorY: false, countdown: 3, guide: false }
    : { speed: 150, fontSize: 36, position: 'center', areaWidth: 1, areaHeight: 1, mirrorX: false, mirrorY: false, countdown: 3, guide: false };

test.describe('RF-03 tamanho do texto', () => {
  test('A+ e A− mudam 4 px por toque; nos limites (160 e 16 px) o botão fica desativado', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { fontSize: 36 } });
    await openPrompter(page);
    await clickHud(page, 'font-up');
    expect((await tpSettings(page)).fontSize).toBe(40);
    await expect(page.locator('.pr-text')).toHaveCSS('font-size', '40px');
    await clickHud(page, 'font-down');
    await clickHud(page, 'font-down');
    expect((await tpSettings(page)).fontSize).toBe(32);
    await openPanel(page);
    await setRange(page, 'fontSize', 156);
    await expect(page.locator('output[for="pn-font-size"]')).toHaveText('156 px');
    await closePanel(page);
    await clickHud(page, 'font-up');
    expect((await tpSettings(page)).fontSize).toBe(160);
    await expect(hudButton(page, 'font-up')).toBeDisabled();
    await openPanel(page);
    await expect(panelEl(page).locator('[data-nudge="fontSize"][data-direction="1"]')).toBeDisabled();
    await setRange(page, 'fontSize', 20);
    await closePanel(page);
    await clickHud(page, 'font-down');
    expect((await tpSettings(page)).fontSize).toBe(16);
    await expect(hudButton(page, 'font-down')).toBeDisabled();
    await expect(hudButton(page, 'font-up')).toBeEnabled();
    await expect(page.locator('.pr-text')).toHaveCSS('font-size', '16px');
  });

  test('palavra mais larga que a coluna liga a hifenização só nela; se todas cabem, nada é hifenizado', async ({ page }) => {
    await gotoApp(page, { script: 'A Paralelepípedo funciona. '.repeat(60) });
    await openPrompter(page);
    const { frame } = await geometry(page);
    const fontSize = frame.width < 600 ? 24 : 48;
    // Largura da palavra na fonte do teleprompter, para pôr a coluna com folga e depois estreita demais.
    const word = await page.locator('.pr-text').evaluate((el, size) => {
      const context = document.createElement('canvas').getContext('2d');
      const style = getComputedStyle(el);
      context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
      return context.measureText('Paralelepípedo').width;
    }, fontSize);
    const hyphens = (selector) =>
      page.locator(selector).first().evaluate((el) => getComputedStyle(el).hyphens || getComputedStyle(el).webkitHyphens);
    const wide = Math.min(1, Math.ceil((word * 1.3 * 100) / frame.width) / 100);
    await openPanel(page);
    await setRange(page, 'fontSize', fontSize);
    await setRange(page, 'areaWidth', wide);
    await expect(screenEl(page)).not.toHaveAttribute('data-hyphenate', '');
    await expect(page.locator('.pr-text .pr-hy')).toHaveCount(0);
    expect(await hyphens('.pr-text')).toBe('manual');
    await setRange(page, 'areaWidth', Math.max(0.25, Math.floor((word * 0.8 * 100) / frame.width) / 100));
    await expect(screenEl(page)).toHaveAttribute('data-hyphenate', '');
    // Cada ocorrência da palavra que não cabe vai num .pr-hy, o único lugar com hifenização; o resto, manual.
    await expect(page.locator('.pr-text .pr-hy')).toHaveCount(60);
    expect(new Set(await page.locator('.pr-text .pr-hy').allTextContents())).toEqual(new Set(['Paralelepípedo']));
    expect(await hyphens('.pr-text .pr-hy')).toBe('auto');
    expect(await hyphens('.pr-text')).toBe('manual');
    expect(await page.locator('.pr-text').textContent()).toBe('A Paralelepípedo funciona. '.repeat(60).trim());
    // De volta à coluna larga: um nó de texto só, como antes.
    await setRange(page, 'areaWidth', wide);
    await expect(screenEl(page)).not.toHaveAttribute('data-hyphenate', '');
    expect(await page.locator('.pr-text').evaluate((el) => el.childNodes.length)).toBe(1);
  });

  test('só a palavra que não cabe na coluna termina a linha com hífen; as que cabem nunca são partidas', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'o WebKit do Windows não tem dicionário de português e não hifeniza nada');
    await gotoApp(page, { script: 'O paralelepípedo da calçada ficou torto depois da chuva. '.repeat(30), settings: { fontSize: 36 } });
    await openPrompter(page);
    const { frame } = await geometry(page);
    const widths = await page.locator('.pr-text').evaluate((el) => {
      const context = document.createElement('canvas').getContext('2d');
      const style = getComputedStyle(el);
      context.font = `${style.fontWeight} 36px ${style.fontFamily}`;
      return ['paralelepípedo', 'calçada'].map((word) => context.measureText(word).width);
    });
    // Coluna entre as duas palavras mais largas: só "paralelepípedo" não cabe. Antes, com a hifenização no texto
    // todo, o navegador também partia no fim da linha palavras que cabem ("cal-/çada").
    await openPanel(page);
    await setRange(page, 'areaWidth', Math.ceil(((widths[0] + widths[1]) / 2 / frame.width) * 100) / 100);
    await closePanel(page);
    await expect(screenEl(page)).toHaveAttribute('data-hyphenate', '');
    const { breaks, spans } = await lineBreaks(page);
    expect(new Set(spans)).toEqual(new Set(['paralelepípedo']));
    expect(breaks.length).toBeGreaterThan(0);
    for (const { at, inSpan, hyphen } of breaks) {
      expect(inSpan, `${at} fora da palavra que não cabe`).toBe(true);
      expect(hyphen, `${at} sem hífen`).toBe(true);
    }
  });

  test('palavras ligadas por "/" ou por espaço inseparável quebram na barra ou no espaço, nunca no meio', async ({ page }) => {
    // "parecia" cabe na coluna: a hifenização fica só nas palavras que não cabem (não no texto todo).
    const sentence = 'O cabo de entrada/saída falhou e a Canon/Nikon parecia paralelepípedo\u00a0quadrado. ';
    await gotoApp(page, { script: sentence.repeat(20) });
    // O roteiro salvo e a contagem não mudam: 11 palavras × 20.
    await expect(page.locator('.ed-stats')).toHaveText('220 palavras · 1 min 28 s a 150 ppm');
    await openPrompter(page);
    await expect(page.locator('.pr-time__label')).toHaveText('−1:28');
    const { frame } = await geometry(page);
    // No tablet, letra grande o bastante para "entrada/saída" não caber nem em 25% da moldura.
    const fontSize = frame.width < 600 ? 36 : 60;
    const widths = await page.locator('.pr-text').evaluate((el, size) => {
      const context = document.createElement('canvas').getContext('2d');
      const style = getComputedStyle(el);
      context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
      return ['entrada/saída', 'entrada/'].map((word) => context.measureText(word).width);
    }, fontSize);
    // Coluna mais estreita que "entrada/saída" e mais larga que "entrada/": o navegador precisa quebrar na barra.
    await openPanel(page);
    await setRange(page, 'fontSize', fontSize);
    await setRange(page, 'areaWidth', Math.ceil(((widths[0] + widths[1]) / 2 / frame.width) * 100) / 100);
    await closePanel(page);
    await expect(page.locator('.pr-text')).not.toHaveClass(/pr-text--hyphens/);
    // Na tela o espaço inseparável vira espaço comum; a "/" fica como está.
    expect(await page.locator('.pr-text').textContent()).toBe(sentence.repeat(20).replaceAll('\u00a0', ' ').trim());
    // A dupla que não cabe na coluna vai num .pr-hy com um <wbr> depois da barra: o navegador quebra ali.
    const pairs = await page.locator('.pr-text .pr-hy').evaluateAll((spans) =>
      spans
        .filter((span) => span.textContent === 'entrada/saída')
        .map((span) => [...span.childNodes].map((node) => (node.nodeType === Node.ELEMENT_NODE ? node.nodeName : node.data))),
    );
    expect(pairs).toHaveLength(20);
    for (const pair of pairs) expect(pair).toEqual(['entrada/', 'WBR', 'saída']);
    const { lines, breaks } = await lineBreaks(page);
    expect(breaks.filter(({ inSpan }) => !inSpan).map(({ at }) => at)).toEqual([]);
    expect(lines.some((line) => line.trimEnd().endsWith('entrada/'))).toBe(true);
  });

  test('dupla curta com "/" que cabe na coluna nunca fica partida na barra ("km/" numa linha e "h" na outra)', async ({ page }) => {
    const fillers = ['a', 'de', 'que', 'para', 'muito', 'quando', 'sempre'];
    let script = '';
    for (let i = 0; i < 40; i++) {
      const lead = Array.from({ length: (i % 5) + 1 }, (_, j) => fillers[(i + j) % fillers.length]).join(' ');
      script += `${lead} rodou a 120 km/h ${fillers[i % 7]} e/ou pelo TCP/IP ${fillers[(i + 3) % 7]} com I/O ${fillers[(i + 5) % 7]} entrada/saída. `;
    }
    await gotoApp(page, { script, settings: { fontSize: 36, areaWidth: 1 } });
    await openPrompter(page);
    // Tudo cabe: a dupla vai inteira para a linha seguinte, como uma palavra. Com um ponto de quebra em toda "/",
    // 26 das 200 duplas ficavam partidas no iPhone (km/|h, e/|ou, I/|O, entrada/|saída).
    await expect(screenEl(page)).not.toHaveAttribute('data-hyphenate', '');
    const { lines } = await lineBreaks(page);
    expect(lines.length).toBeGreaterThan(40);
    expect(lines.filter((line) => /\p{L}\/$/u.test(line.trimEnd()))).toEqual([]);
  });

  test('letra enorme numa coluna estreita: nenhuma palavra cabe e o texto todo hifeniza, sem um .pr-hy por palavra', async ({ page }) => {
    const script = 'O paralelepípedo da calçada de entrada/saída ficou torto. '.repeat(20);
    await gotoApp(page, { script, settings: { fontSize: 160, areaWidth: 0.25 } });
    await openPrompter(page);
    const hyphens = (selector) =>
      page.locator(selector).first().evaluate((el) => getComputedStyle(el).hyphens || getComputedStyle(el).webkitHyphens);
    await expect(screenEl(page)).toHaveAttribute('data-hyphenate', '');
    await expect(page.locator('.pr-text')).toHaveClass(/pr-text--hyphens/);
    expect(await hyphens('.pr-text')).toBe('auto');
    // Mesmas quebras, sem milhares de spans: só a dupla com "/" continua num .pr-hy, pelo <wbr> depois da barra.
    await expect(page.locator('.pr-text .pr-hy')).toHaveCount(20);
    expect(new Set(await page.locator('.pr-text .pr-hy').allTextContents())).toEqual(new Set(['entrada/saída']));
    expect(await page.locator('.pr-text').textContent()).toBe(script.trim());
    // Letra menor e coluna larga: tudo cabe; volta ao texto manual, num nó de texto só.
    await openPanel(page);
    await setRange(page, 'fontSize', 36);
    await setRange(page, 'areaWidth', 1);
    await expect(page.locator('.pr-text')).not.toHaveClass(/pr-text--hyphens/);
    await expect(screenEl(page)).not.toHaveAttribute('data-hyphenate', '');
    expect(await hyphens('.pr-text')).toBe('manual');
    expect(await page.locator('.pr-text').evaluate((el) => el.childNodes.length)).toBe(1);
  });

  test('letra enorme com um endereço no texto: fica o modo por palavra (no texto todo, o endereço ganharia hífen)', async ({ page }) => {
    const script = 'O paralelepípedo da foto em https://www.exemplo.org/calcadas ficou torto. '.repeat(20);
    await gotoApp(page, { script, settings: { fontSize: 160, areaWidth: 0.25 } });
    await openPrompter(page);
    await expect(screenEl(page)).toHaveAttribute('data-hyphenate', '');
    await expect(page.locator('.pr-text')).not.toHaveClass(/pr-text--hyphens/);
    const wrapped = await page.locator('.pr-text .pr-hy').allTextContents();
    expect(wrapped).toContain('paralelepípedo');
    expect(wrapped).not.toContain('https://www.exemplo.org/calcadas');
    expect(await page.locator('.pr-text').textContent()).toBe(script.trim());
  });

  test('e-mail ou endereço mais largo que a coluna não liga a hifenização (o navegador não os hifeniza)', async ({ page }) => {
    await gotoApp(page, { script: 'Escreva para fulano.de.tal.da.silva@exemplo.com ou veja https://exemplo.com/um/caminho. '.repeat(20) });
    await openPrompter(page);
    const { area } = await geometry(page);
    const email = await page.locator('.pr-text').evaluate((el) => {
      const context = document.createElement('canvas').getContext('2d');
      const style = getComputedStyle(el);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return context.measureText('fulano.de.tal.da.silva@exemplo.com').width;
    });
    expect(email).toBeGreaterThan(area.width); // o e-mail não cabe na coluna...
    await expect(screenEl(page)).not.toHaveAttribute('data-hyphenate', ''); // ...e mesmo assim nada é hifenizado
  });

  test('coluna estreita com palavras curtas: sem hifenização', async ({ page }) => {
    await gotoApp(page, { script: 'Eu vi o mar e o sol. '.repeat(80), settings: { areaWidth: 0.25, fontSize: 24 } });
    await openPrompter(page);
    await expect(page.locator('.pr-text')).toHaveCSS('font-size', '24px');
    await expect(screenEl(page)).not.toHaveAttribute('data-hyphenate', '');
  });

  test('trocar o tamanho mantém o progresso da leitura (menos de 2 pontos de diferença)', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { fontSize: 36 } });
    await openPrompter(page);
    await jumpToProgress(page, 0.5);
    const changes = [
      async () => clickHud(page, 'font-up'),
      async () => clickHud(page, 'font-down'),
      async () => page.keyboard.press('+'),
      async () => {
        await openPanel(page);
        await setRange(page, 'fontSize', 120);
        await setRange(page, 'fontSize', 20);
        await closePanel(page);
      },
    ];
    for (const change of changes) {
      const before = await tpProgress(page);
      await change();
      const after = await tpProgress(page);
      expect(Math.abs(after - before)).toBeLessThan(0.02);
    }
  });
});

test.describe('RF-04 posição do texto', () => {
  test('com largura 50%: Esquerda encosta na margem esquerda, Direita na direita e Centro centraliza; topo encostado na moldura', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    let g = await geometry(page);
    // Moldura útil = tela − áreas seguras − 16 px de margem.
    expect(g.frame.left).toBe(FRAME_MARGIN);
    expect(g.frame.top).toBe(FRAME_MARGIN);
    expect(g.frame.right).toBe(g.vw - FRAME_MARGIN);
    expect(g.frame.bottom).toBe(g.vh - FRAME_MARGIN);
    expect((await tpSettings(page)).position).toBe('center');
    await openPanel(page);
    await setRange(page, 'areaWidth', 0.5);
    await expect(page.locator('output[for="pn-area-width"]')).toHaveText('50%');
    for (const position of ['left', 'center', 'right']) {
      await panelEl(page).locator(`input[name="position"][value="${position}"]`).check();
      g = await geometry(page);
      expect(Math.abs(g.area.width - g.frame.width * 0.5), position).toBeLessThanOrEqual(1);
      expect(Math.abs(g.area.top - g.frame.top), position).toBeLessThanOrEqual(0.5);
      if (position === 'left') expect(Math.abs(g.area.left - g.frame.left)).toBeLessThanOrEqual(0.5);
      if (position === 'right') expect(Math.abs(g.area.right - g.frame.right)).toBeLessThanOrEqual(0.5);
      if (position === 'center') expect(Math.abs(g.area.left + g.area.width / 2 - (g.frame.left + g.frame.width / 2))).toBeLessThanOrEqual(0.5);
    }
    // Com 100% de largura a posição não faz diferença visível.
    await setRange(page, 'areaWidth', 1);
    const rects = [];
    for (const position of ['left', 'center', 'right']) {
      await panelEl(page).locator(`input[name="position"][value="${position}"]`).check();
      rects.push((await geometry(page)).area);
    }
    expect(rects[0]).toEqual(rects[1]);
    expect(rects[1]).toEqual(rects[2]);
  });

  test('áreas seguras (notch, Dynamic Island, indicador de início): moldura, área e HUD se afastam delas', async ({ page }) => {
    // O Playwright não simula áreas seguras; o app as lê de env(safe-area-inset-*) pelas variáveis
    // --safe-*, então o teste dá a essas variáveis os valores de um iPhone deitado.
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.5, position: 'left' } });
    await openPrompter(page);
    await page.evaluate(() => {
      const root = document.documentElement.style;
      root.setProperty('--safe-left', '47px');
      root.setProperty('--safe-right', '47px');
      root.setProperty('--safe-bottom', '21px');
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const g = await geometry(page);
    expect(g.frame.left).toBe(47 + FRAME_MARGIN);
    expect(g.frame.right).toBe(g.vw - 47 - FRAME_MARGIN);
    expect(g.frame.bottom).toBe(g.vh - 21 - FRAME_MARGIN);
    expect(Math.abs(g.area.left - g.frame.left)).toBeLessThanOrEqual(0.5); // "Esquerda" encosta na moldura, não no notch
    expect(Math.abs(g.area.width - g.frame.width * 0.5)).toBeLessThanOrEqual(1);
    const exit = await hudButton(page, 'exit').boundingBox();
    expect(exit.x).toBeGreaterThanOrEqual(47 + 8 - 0.5);
    const pill = await page.locator('.pr-pill').boundingBox();
    expect(g.vh - (pill.y + pill.height)).toBeGreaterThanOrEqual(21 + 8 - 0.5);
  });
});

test.describe('RF-05 área pelos controles deslizantes', () => {
  test('Largura e Altura mudam a área na hora, respeitam 25–100% e 20–100% e mantêm o ponto de leitura', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await jumpToProgress(page, 0.4);
    await openPanel(page);
    const before = await tpProgress(page);
    await setRange(page, 'areaWidth', 0.6);
    await setRange(page, 'areaHeight', 0.5);
    let g = await geometry(page);
    expect(Math.abs(g.area.width - g.frame.width * 0.6)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.area.height - g.frame.height * 0.5)).toBeLessThanOrEqual(1);
    expect(Math.abs((await tpProgress(page)) - before)).toBeLessThan(0.02);
    await expect(page.locator('output[for="pn-area-height"]')).toHaveText('50%');
    // Limites: o polegar levado além das pontas não passa de 25%/20% nem de 100%.
    await setRangeRaw(page, 'areaWidth', 0.05);
    await setRangeRaw(page, 'areaHeight', 0.05);
    expect(await tpSettings(page)).toMatchObject({ areaWidth: 0.25, areaHeight: 0.2 });
    await expect(page.locator('output[for="pn-area-width"]')).toHaveText('25%');
    await expect(page.locator('output[for="pn-area-height"]')).toHaveText('20%');
    g = await geometry(page);
    expect(Math.abs(g.area.width - g.frame.width * 0.25)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.area.height - g.frame.height * 0.2)).toBeLessThanOrEqual(1);
    await setRangeRaw(page, 'areaWidth', 3);
    await setRangeRaw(page, 'areaHeight', 3);
    expect(await tpSettings(page)).toMatchObject({ areaWidth: 1, areaHeight: 1 });
    await expect(page.locator('output[for="pn-area-width"]')).toHaveText('100%');
  });

  test('os valores ficam salvos (recarregar) e valem em retrato e paisagem, por serem porcentagens', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await openPanel(page);
    await setRange(page, 'areaWidth', 0.6);
    await setRange(page, 'areaHeight', 0.5);
    await page.reload();
    await expect(page.locator('textarea[name="script"]')).toBeVisible();
    expect(await tpSettings(page)).toMatchObject({ areaWidth: 0.6, areaHeight: 0.5 });
    await openPrompter(page);
    const check = async () => {
      const g = await geometry(page);
      expect(Math.abs(g.area.width - g.frame.width * 0.6)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.area.height - g.frame.height * 0.5)).toBeLessThanOrEqual(1);
    };
    await check();
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    await resizeViewport(page, h, w);
    await check();
  });

  test('padrões: celular 100% × 100% e 36 px; tablet 70% × 100% e 60 px (seção 8)', async ({ page }, testInfo) => {
    await gotoApp(page, { seed: false });
    expect(await tpSettings(page)).toEqual(defaultsFor(testInfo.project.name));
  });
});

test.describe('Painel de ajustes (seção 5.3)', () => {
  test('seções na ordem do contrato, com rótulos em português', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await openPanel(page);
    const text = await panelEl(page).locator('.sheet__body').innerText();
    const order = ['Velocidade', 'Tamanho do texto', 'Posição do texto', 'Área do texto', 'Largura', 'Altura', 'Ajustar na tela', 'Espelhamento', 'Espelhar horizontalmente', 'Inverter verticalmente', 'Contagem regressiva', 'Guia de leitura', 'Restaurar padrões'];
    let last = -1;
    for (const label of order) {
      const index = text.indexOf(label, last + 1);
      expect(index, `"${label}" depois do item anterior`).toBeGreaterThan(last);
      last = index;
    }
    await expect(panelEl(page).locator('[data-action="close-panel"]')).toHaveAttribute('aria-label', 'Fechar ajustes');
  });

  test('posição: folha embaixo no celular em pé; painel lateral do lado oposto ao da área (o espelho inverte o lado)', async ({ page }, testInfo) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.5 } });
    await openPrompter(page);
    await openPanel(page);
    const placement = () => panelEl(page).getAttribute('data-placement');
    const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    if (w < 600 && h >= w) {
      expect(await placement()).toBe('bottom');
      const box = await panelEl(page).boundingBox();
      expect(box.height).toBeLessThanOrEqual(h * 0.6 + 1);
      expect(Math.round(box.y + box.height)).toBe(h);
      await closePanel(page);
      await resizeViewport(page, h, w); // deitado: painel lateral
      await openPanel(page);
    }
    expect(await placement()).toBe('right');
    const sides = [
      [{ position: 'left' }, 'right'],
      [{ position: 'right' }, 'left'],
      [{ position: 'center' }, 'right'],
      [{ position: 'left', mirrorX: true }, 'left'],
      [{ position: 'right', mirrorX: true }, 'right'],
    ];
    for (const [patch, expected] of sides) {
      await panelEl(page).locator(`input[name="position"][value="${patch.position}"]`).check();
      const mirror = panelEl(page).locator('input[name="mirrorX"]');
      if (patch.mirrorX) await mirror.check();
      else await mirror.uncheck();
      await expect.poll(placement, JSON.stringify(patch)).toBe(expected);
    }
    await expect.poll(() => panelEl(page).evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    const box = await panelEl(page).boundingBox();
    expect(Math.round(box.width)).toBe(340);
    expect(box.y).toBeGreaterThanOrEqual(16);
  });

  test('celular em pé com inversão vertical: a folha desce do topo e a linha de leitura fica à vista', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    const { vw, vh } = await geometry(page);
    test.skip(!(vw < 600 && vh >= vw), 'só no celular em pé (no tablet e deitado o painel é lateral)');
    const placement = () => panelEl(page).getAttribute('data-placement');
    const mirror = panelEl(page).locator('input[name="mirrorY"]');
    await openPanel(page);
    expect(await placement()).toBe('bottom');
    // Ligar a inversão com o painel aberto não move a folha (ela pularia sob o dedo)...
    const before = await panelEl(page).boundingBox();
    await mirror.check();
    await page.waitForTimeout(400); // mais que a animação da folha (320 ms)
    expect(await placement()).toBe('bottom');
    expect(await panelEl(page).boundingBox()).toEqual(before);
    // ...e na próxima vez que abre, a folha desce do topo.
    await closePanel(page);
    await openPanel(page);
    expect(await placement()).toBe('top');
    const box = await panelEl(page).boundingBox();
    expect(Math.round(box.y)).toBe(0);
    expect(box.height).toBeLessThanOrEqual(vh * 0.6 + 1);
    // Invertida, a linha de leitura fica a 30% da altura da área contando de baixo.
    const { area } = await geometry(page);
    expect(area.bottom - area.height * READING_LINE).toBeGreaterThan(box.y + box.height);
    // Desligar com o painel aberto também não move a folha; ao abrir de novo, ela volta para baixo.
    await mirror.uncheck();
    await page.waitForTimeout(400);
    expect(await placement()).toBe('top');
    expect(await panelEl(page).boundingBox()).toEqual(box);
    await closePanel(page);
    await openPanel(page);
    expect(await placement()).toBe('bottom');
    const bottom = await panelEl(page).boundingBox();
    expect(Math.round(bottom.y + bottom.height)).toBe(vh);
    const after = await geometry(page);
    expect(after.area.top + after.area.height * READING_LINE).toBeLessThan(bottom.y);
  });

  test('inverter com o painel aberto não tira o controle de baixo do dedo: o segundo toque desfaz a inversão', async ({ page }) => {
    const custom = { speed: 210, fontSize: 48, position: 'left', areaWidth: 0.6, areaHeight: 0.8, mirrorX: true, countdown: 5, guide: true };
    await gotoApp(page, { script: LONG_TEXT, settings: custom });
    await openPrompter(page);
    const { vw, vh } = await geometry(page);
    test.skip(!(vw < 600 && vh >= vw), 'só no celular em pé (no tablet e deitado o painel é lateral e não muda com a inversão)');
    await openPanel(page);
    // O interruptor no alto da lista visível: antes, a folha pulava para o topo e ali ficava "Restaurar padrões".
    const mirror = panelEl(page).locator('input[name="mirrorY"]');
    await mirror.evaluate((el) => el.closest('.switch').scrollIntoView({ block: 'start' }));
    const box = await mirror.boundingBox();
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await page.mouse.click(x, y);
    expect((await tpSettings(page)).mirrorY).toBe(true);
    await page.waitForTimeout(400); // mais que a animação da folha (320 ms)
    await page.mouse.click(x, y);
    expect(await tpSettings(page)).toEqual({ ...custom, mirrorY: false });
    await expect(panelEl(page)).toHaveClass(/is-open/);
  });

  test('fecha pelo ×, pelo Esc e por um toque no palco; o toque só fecha (não começa a leitura)', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await openPanel(page);
    await closePanel(page);
    await expect(hudButton(page, 'settings')).toBeVisible();
    await openPanel(page);
    await page.keyboard.press('Escape');
    await expect(panelEl(page)).not.toHaveClass(/is-open/);
    await expect(screenEl(page)).toBeVisible(); // o Esc fechou só o painel
    await openPanel(page);
    await tapAt(page, 0.3, 0.12);
    await expect(panelEl(page)).not.toHaveClass(/is-open/);
    await page.waitForTimeout(250);
    await expectState(page, 'ready');
  });

  test('o painel que está saindo não recebe toques: tocar no palco logo depois de fechar começa a leitura', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await openPanel(page);
    // Saída bem lenta só para o teste enxergar a janela de tempo (no app ela dura 320 ms, com saída rápida
    // no começo): o painel ainda cobre o ponto quando o toque chega, mesmo com a máquina ocupada.
    await page.evaluate(() => document.documentElement.style.setProperty('--dur-slow', '20000ms'));
    const box = await panelEl(page).boundingBox();
    const before = await tpSettings(page);
    const sheet = await panelEl(page).getAttribute('data-placement');
    // Um ponto que o painel cobre por quase toda a saída e que não é do HUD (que volta ao fechar).
    const x = Math.round(sheet === 'bottom' ? box.x + box.width / 2 : sheet === 'right' ? box.x + box.width - 30 : box.x + 30);
    const y = Math.round(sheet === 'bottom' ? box.y + box.height * 0.45 : box.y + box.height / 2);
    await page.locator('[data-action="close-panel"]').click();
    await expect(panelEl(page)).not.toHaveClass(/is-open/);
    const covered = await panelEl(page).evaluate((el, [px, py]) => {
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).visibility === 'visible' && px > r.left && px < r.right && py > r.top && py < r.bottom;
    }, [x, y]);
    expect(covered, 'o painel ainda está saindo sobre o ponto do toque').toBe(true);
    await page.touchscreen.tap(x, y);
    await expectState(page, 'playing');
    expect(await tpSettings(page)).toEqual(before);
  });

  test('o painel reflete as mudanças feitas pelo HUD; os botões − e + do painel mudam a velocidade', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { fontSize: 36 } });
    await openPrompter(page);
    await clickHud(page, 'speed-up');
    await clickHud(page, 'font-up');
    await openPanel(page);
    await expect(panelEl(page).locator('input[name="speed"]')).toHaveValue('155');
    await expect(page.locator('output[for="pn-speed"]')).toHaveText('155 ppm');
    await expect(panelEl(page).locator('input[name="fontSize"]')).toHaveValue('40');
    await panelEl(page).locator('[data-nudge="speed"][data-direction="1"]').click();
    await expect(page.locator('output[for="pn-speed"]')).toHaveText('160 ppm');
    await panelEl(page).locator('[data-nudge="speed"][data-direction="-1"]').click();
    await panelEl(page).locator('[data-nudge="speed"][data-direction="-1"]').click();
    expect((await tpSettings(page)).speed).toBe(150);
    await closePanel(page);
    await expect(page.locator('.pr-speed')).toHaveText('150');
  });
});

test.describe('RF-09 persistência', () => {
  test('todos os ajustes voltam iguais ao recarregar a página', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    await openPanel(page);
    await setRange(page, 'speed', 205);
    await setRange(page, 'fontSize', 50);
    await panelEl(page).locator('input[name="position"][value="right"]').check();
    await setRange(page, 'areaWidth', 0.55);
    await setRange(page, 'areaHeight', 0.8);
    await panelEl(page).locator('input[name="mirrorX"]').check();
    await panelEl(page).locator('input[name="mirrorY"]').check();
    await panelEl(page).locator('input[name="countdown"][value="5"]').check();
    await panelEl(page).locator('input[name="guide"]').check();
    const saved = await tpSettings(page);
    expect(saved).toEqual({ speed: 205, fontSize: 50, position: 'right', areaWidth: 0.55, areaHeight: 0.8, mirrorX: true, mirrorY: true, countdown: 5, guide: true });
    await page.reload();
    await expect(page.locator('textarea[name="script"]')).toHaveValue(LONG_TEXT);
    expect(await tpSettings(page)).toEqual(saved);
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    expect(stored.settings).toEqual(saved);
    expect(stored.script).toBe(LONG_TEXT);
    await openPrompter(page);
    await expect(screenEl(page)).toHaveAttribute('data-mirror-x', '');
    await expect(screenEl(page)).toHaveAttribute('data-guide', '');
    await openPanel(page);
    await expect(panelEl(page).locator('input[name="countdown"][value="5"]')).toBeChecked();
    await expect(panelEl(page).locator('input[name="mirrorY"]')).toBeChecked();
    await expect(panelEl(page).locator('input[name="position"][value="right"]')).toBeChecked();
  });

  test('dado corrompido no aparelho: o app abre com os padrões e o texto de exemplo', async ({ page }, testInfo) => {
    await gotoApp(page, { raw: '{"version":1,"settings":{"speed":' });
    await expect(page.locator('textarea[name="script"]')).toHaveValue(/^Bem-vindo ao Teleprompter\./);
    expect(await tpSettings(page)).toEqual(defaultsFor(testInfo.project.name));
    await openPrompter(page);
    await expectState(page, 'ready');
  });

  test('valores fora do contrato são corrigidos (limites, passo e opções válidas)', async ({ page }, testInfo) => {
    const raw = JSON.stringify({
      version: 1,
      script: 'Texto salvo antes.',
      settings: { speed: 9999, fontSize: 'abc', position: 'top', areaWidth: 0.01, areaHeight: '0.503', mirrorX: 'sim', mirrorY: true, countdown: 4, guide: 1 },
      flags: [],
    });
    await gotoApp(page, { raw });
    const d = defaultsFor(testInfo.project.name);
    expect(await tpSettings(page)).toEqual({ ...d, speed: 320, areaWidth: 0.25, areaHeight: 0.5, mirrorY: true });
    await expect(page.locator('textarea[name="script"]')).toHaveValue('Texto salvo antes.');
  });

  test('armazenamento bloqueado: o app funciona sem guardar', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('bloqueado', 'SecurityError');
        },
      });
    });
    await gotoApp(page, { seed: false });
    await expect(page.locator('textarea[name="script"]')).toHaveValue(/^Bem-vindo ao Teleprompter\./);
    await page.locator('textarea[name="script"]').fill('Um texto curto para ler sem armazenamento.');
    await expect(page.locator('.ed-stats')).toContainText('7 palavras');
    await openPrompter(page);
    await openPanel(page);
    await page.locator('input[name="countdown"][value="0"]').check();
    await closePanel(page);
    await tapAt(page, 0.5, 0.5);
    await expectState(page, 'playing');
  });

  test('"Restaurar padrões" volta só os ajustes e não apaga o texto', async ({ page }, testInfo) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { speed: 250, fontSize: 80, position: 'left', areaWidth: 0.4, mirrorX: true, guide: true, countdown: 5 } });
    await openPrompter(page);
    await openPanel(page);
    await panelEl(page).locator('[data-action="reset"]').click();
    expect(await tpSettings(page)).toEqual(defaultsFor(testInfo.project.name));
    await expect(panelEl(page).locator('input[name="mirrorX"]')).not.toBeChecked();
    await expect(panelEl(page).locator('input[name="countdown"][value="3"]')).toBeChecked();
    await closePanel(page);
    await clickHud(page, 'exit');
    await expect(page.locator('textarea[name="script"]')).toHaveValue(LONG_TEXT);
  });
});

test.describe('RF-14 guia de leitura', () => {
  test('desligada por padrão; ligada, marca a linha de leitura a 30% da altura da área, com setas fora da área', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { areaWidth: 0.6, areaHeight: 0.7 } });
    await openPrompter(page);
    await expect(screenEl(page)).not.toHaveAttribute('data-guide', '');
    await expect(page.locator('.pr-guide')).toBeHidden();
    await openPanel(page);
    await panelEl(page).locator('input[name="guide"]').check();
    await closePanel(page);
    await expect(screenEl(page)).toHaveAttribute('data-guide', '');
    const r = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        area: box('.pr-area'),
        line: box('.pr-guide__line'),
        start: box('.pr-guide__mark--start'),
        end: box('.pr-guide__mark--end'),
        color: getComputedStyle(document.querySelector('.pr-guide__mark')).backgroundColor,
      };
    });
    const readingY = r.area.top + r.area.height * READING_LINE;
    expect(Math.abs(r.line.top + r.line.height / 2 - readingY)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.start.top + r.start.height / 2 - readingY)).toBeLessThanOrEqual(1);
    expect(r.start.right).toBeLessThanOrEqual(r.area.left);
    expect(r.end.left).toBeGreaterThanOrEqual(r.area.right);
    expect(r.color).toBe('rgb(255, 176, 32)');
    // No início, o centro da primeira linha fica exatamente nessa linha.
    const { text } = await geometry(page);
    const { fontSize } = await tpSettings(page);
    expect(Math.abs(text.top + (fontSize * LINE_HEIGHT) / 2 - readingY)).toBeLessThanOrEqual(1);
  });

  test('esmaecimento sempre ativo no topo e na base da área', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT });
    await openPrompter(page);
    const fades = await page.evaluate(() =>
      ['.pr-fade--top', '.pr-fade--bottom'].map((selector) => {
        const el = document.querySelector(selector);
        const r = el.getBoundingClientRect();
        const area = document.querySelector('.pr-area').getBoundingClientRect();
        return { image: getComputedStyle(el).backgroundImage, height: r.height, areaHeight: area.height, top: r.top - area.top, bottom: area.bottom - r.bottom };
      }),
    );
    for (const fade of fades) {
      expect(fade.image).toContain('linear-gradient');
      expect(fade.height).toBeGreaterThan(10);
    }
    expect(fades[0].top).toBeLessThanOrEqual(0);
    expect(fades[1].bottom).toBeLessThanOrEqual(0);
  });
});
