// Testes de tempo real (RF-01, RF-13). O run.mjs roda este arquivo numa fase própria, com um navegador
// por vez, para a máquina não estar ocupada com os outros testes.
//
// Por que os quadros são registrados: o motor limita cada quadro a 100 ms (seção 9: depois de um engasgo
// o texto não "pula"). Num aparelho de verdade os quadros têm ~16 ms e nada é descontado. O WebKit do
// Playwright no Windows desenha em software e, com a máquina carregada, chega a quadros de 100–190 ms;
// aí o relógio de parede mediria a máquina, não o app. Por isso cada teste:
//   - registra o instante de cada quadro e calcula o tempo que o motor descartou (o que passou de 100 ms);
//   - exige que "tempo medido − tempo descartado" fique em ±3% do esperado (a conta do app);
//   - exige o critério bruto (relógio de parede em ±3%) no Chromium, cujos quadros são estáveis, e em
//     qualquer motor quando o descarte é desprezível (menos de 0,5% do tempo esperado).
import { test, expect, LONG_TEXT, closePanel, expectState, gotoApp, makeText, openPanel, openPrompter, setRange, stateLog, tapCenter, tpSettings } from './helpers.mjs';

const FRAME_LIMIT_MS = 100;

/** Liga o registro de quadros: a cada quadro guarda o instante (relógio da página) e o deslocamento do texto. */
const startFrameLog = (page) =>
  page.evaluate(() => {
    const log = (window.__frames = { samples: [], on: true });
    const tick = (t) => {
      log.samples.push({ t, offset: window.__tp.offset() });
      if (log.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const stopFrameLog = (page) =>
  page.evaluate(() => {
    window.__frames.on = false;
    return window.__frames.samples;
  });

/** Tempo (ms) que o motor descartou entre t0 e t1: a parte de cada quadro acima de 100 ms. */
function discardedMs(samples, t0, t1) {
  let lost = 0;
  for (let i = 1; i < samples.length; i++) {
    const start = samples[i - 1].t;
    const end = samples[i].t;
    const gap = end - start;
    if (gap <= FRAME_LIMIT_MS || end <= t0 || start >= t1) continue;
    const inside = (Math.min(end, t1) - Math.max(start, t0)) / gap; // fração do quadro dentro da janela
    lost += (gap - FRAME_LIMIT_MS) * inside;
  }
  return lost;
}

/** Instantes (ms, relógio da página) da última passagem "rodando" → "fim". */
async function lastRun(page) {
  const log = await stateLog(page);
  const end = log.findLastIndex((entry) => entry.state === 'ended');
  const start = log.slice(0, end).findLastIndex((entry) => entry.state === 'playing');
  expect(start, JSON.stringify(log)).toBeGreaterThanOrEqual(0);
  return { t0: log[start].t, t1: log[end].t };
}

/** Lê do início ao fim (esperado: `expected` segundos) e devolve { raw, effective, lostMs, frames }. */
async function measureRun(page, expected) {
  await startFrameLog(page);
  await tapCenter(page);
  await expectState(page, 'ended', expected * 2_000 + 10_000);
  const samples = await stopFrameLog(page);
  const { t0, t1 } = await lastRun(page);
  const lostMs = discardedMs(samples, t0, t1);
  const gaps = samples.slice(1).map((s, i) => s.t - samples[i].t).filter((g) => g > 0);
  return {
    raw: (t1 - t0) / 1000,
    effective: (t1 - t0 - lostMs) / 1000,
    lostMs,
    frames: { average: gaps.reduce((a, b) => a + b, 0) / gaps.length, max: Math.max(...gaps), over: gaps.filter((g) => g > FRAME_LIMIT_MS).length },
  };
}

function describeRun(label, run) {
  return `${label}: ${run.raw.toFixed(3)} s no relógio; ${run.effective.toFixed(3)} s descontando ${run.lostMs.toFixed(0)} ms de quadros acima de 100 ms (quadros: média ${run.frames.average.toFixed(1)} ms, máx. ${run.frames.max.toFixed(0)} ms, ${run.frames.over} acima de 100 ms)`;
}

/** Critério de ±3%: sempre sobre o tempo do app; também no relógio quando os quadros permitem medir. */
function expectWithinTolerance(run, expected, label, browserName) {
  const tolerance = expected * 0.03;
  expect(Math.abs(run.effective - expected), describeRun(label, run)).toBeLessThanOrEqual(tolerance);
  const rawMeasurable = browserName === 'chromium' || run.lostMs < expected * 1000 * 0.005;
  if (rawMeasurable) expect(Math.abs(run.raw - expected), describeRun(label, run)).toBeLessThanOrEqual(tolerance);
  return rawMeasurable;
}

test.describe('RF-01 tempo de leitura @tempo', () => {
  test('60 palavras a 300 ppm vão do início ao fim em 12 s (±3%), com fonte de 24 px e de 96 px', async ({ page, browserName }, testInfo) => {
    test.setTimeout(150_000);
    const words = 60;
    const wpm = 300;
    const expected = (words * 60) / wpm; // 12 s, igual à estimativa do editor
    await gotoApp(page, { script: makeText(words), settings: { speed: wpm, fontSize: 24 } });
    await expect(page.locator('.ed-stats')).toHaveText('60 palavras · 12 s a 300 ppm');
    await openPrompter(page);
    const runs = [];
    for (const fontSize of [24, 96]) {
      if (fontSize !== 24) {
        await openPanel(page);
        await setRange(page, 'fontSize', fontSize);
        await closePanel(page);
        await page.keyboard.press('Home');
        await expectState(page, 'ready');
      }
      expect((await tpSettings(page)).fontSize).toBe(fontSize);
      const distance = await page.evaluate(() => window.__tp.distance());
      const pxPerSecond = await page.evaluate(() => window.__tp.pxPerSecond());
      // px/s = (ppm ÷ 60) × (D ÷ W): a velocidade em pixels acompanha a altura do texto.
      expect(pxPerSecond).toBeCloseTo((wpm / 60) * (distance / words), 6);
      const run = await measureRun(page, expected);
      const rawChecked = expectWithinTolerance(run, expected, `fonte ${fontSize}px`, browserName);
      runs.push({ fontSize, distance, ...run });
      testInfo.annotations.push({
        type: 'tempo',
        description: `${describeRun(`fonte ${fontSize}px (D = ${distance.toFixed(0)} px)`, run)}; critério no relógio ${rawChecked ? 'verificado' : 'não medível nesta máquina (quadros lentos)'}`,
      });
    }
    // A fonte maior deixa o texto bem mais alto, mas o tempo total não muda.
    expect(runs[1].distance).toBeGreaterThan(runs[0].distance * 2);
    expect(Math.abs(runs[0].effective - runs[1].effective)).toBeLessThanOrEqual(expected * 0.03);
  });

  test('critério de aceite literal: 300 palavras a 150 ppm em 120 s (±3%) — rode com E2E_FULL=1', async ({ page, browserName }, testInfo) => {
    test.skip(!process.env.E2E_FULL, 'leva 2 min por aparelho; rode com E2E_FULL=1');
    test.setTimeout(330_000);
    await gotoApp(page, { script: makeText(300), settings: { speed: 150, fontSize: 48 } });
    await expect(page.locator('.ed-stats')).toHaveText('300 palavras · 2 min a 150 ppm');
    await openPrompter(page);
    const run = await measureRun(page, 120);
    const rawChecked = expectWithinTolerance(run, 120, '300 palavras a 150 ppm', browserName);
    testInfo.annotations.push({ type: 'tempo', description: `${describeRun('120 s', run)}; critério no relógio ${rawChecked ? 'verificado' : 'não medível'}` });
  });

  test('depois de mudar a velocidade rodando, o ritmo segue a velocidade nova', async ({ page }, testInfo) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { speed: 100 } });
    await openPrompter(page);
    await tapCenter(page);
    await expectState(page, 'playing');
    await page.waitForTimeout(600); // fim da rampa de retomada (400 ms)
    await page.keyboard.press('ArrowUp');
    expect((await tpSettings(page)).speed).toBe(105);
    const pps = await page.evaluate(() => window.__tp.pxPerSecond());
    await startFrameLog(page);
    await page.waitForTimeout(4_000);
    const samples = await stopFrameLog(page);
    // Tempo do app = soma dos quadros, cada um limitado a 100 ms (exatamente o que o motor integra).
    let appMs = 0;
    for (let i = 1; i < samples.length; i++) appMs += Math.min(samples[i].t - samples[i - 1].t, FRAME_LIMIT_MS);
    const moved = samples.at(-1).offset - samples[0].offset;
    const rate = moved / (appMs / 1000);
    testInfo.annotations.push({ type: 'ritmo', description: `${rate.toFixed(2)} px/s medidos para ${pps.toFixed(2)} px/s esperados (${samples.length} quadros)` });
    expect(rate).toBeGreaterThan(pps * 0.97);
    expect(rate).toBeLessThan(pps * 1.03);
  });
});

test.describe('RF-13 contagem regressiva @tempo', () => {
  test('a contagem de 3 s dura 3 s', async ({ page }) => {
    await gotoApp(page, { script: LONG_TEXT, settings: { countdown: 3 } });
    await openPrompter(page);
    await tapCenter(page);
    await expectState(page, 'countdown');
    await expectState(page, 'playing', 5_000);
    const log = await stateLog(page);
    const countdown = log.findLast((entry) => entry.state === 'countdown');
    const playing = log.findLast((entry) => entry.state === 'playing');
    expect(playing.t - countdown.t).toBeGreaterThan(2_950);
    expect(playing.t - countdown.t).toBeLessThan(3_150);
  });
});
