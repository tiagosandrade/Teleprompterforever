// Ajudantes compartilhados dos testes de ponta a ponta.
// Ganchos estáveis do app (seção 11.3 da especificação): data-state/data-hud em #prompter-screen,
// botões com data-action, campos do painel com name = chave do ajuste e window.__tp (só leitura).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';

export { expect };

export const STORAGE_KEY = 'teleprompter.v1';
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, 'fixtures');
export const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(HERE, '..', '..');
export const WORKSPACE = process.env.E2E_WORKSPACE || path.resolve(HERE, '..');
export const BASE_URL = process.env.BASE_URL;

/** Passos e limites do contrato (store.js / seção 8). */
export const NUDGE = { speed: 5, fontSize: 4 };
export const LINE_HEIGHT = 1.4;
export const READING_LINE = 0.3;
export const FRAME_MARGIN = 16;
export const HUD_GUARD_MS = 350;

/**
 * Todo teste falha se a página registrar erro de JavaScript ou erro no console.
 * Testes que provocam falha de rede de propósito chamam appErrors.allow(/padrão/).
 */
export const test = base.extend({
  appErrors: [
    async ({ page }, use) => {
      const errors = [];
      const allowed = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      await use({ allow: (pattern) => allowed.push(pattern), list: () => errors });
      const unexpected = errors.filter((text) => !allowed.some((pattern) => pattern.test(text)));
      expect(unexpected, 'erros de JavaScript ou no console da página').toEqual([]);
    },
    { auto: true },
  ],
});

// ---------- Textos ----------

const VOCAB = [
  'roteiro', 'câmera', 'luz', 'gravação', 'texto', 'leitura', 'vídeo', 'canal', 'ideia', 'pausa',
  'ritmo', 'voz', 'olhar', 'lente', 'cena', 'público', 'história', 'exemplo', 'dado', 'resultado',
];

/** Texto com exatamente `count` palavras, em parágrafos de `perParagraph` palavras. */
export function makeText(count, { perParagraph = 12 } = {}) {
  const paragraphs = [];
  let current = [];
  for (let i = 0; i < count; i++) {
    current.push(`${VOCAB[i % VOCAB.length]}${i % 7 === 6 ? ',' : ''}`);
    if (current.length === perParagraph || i === count - 1) {
      current[current.length - 1] = current[current.length - 1].replace(/,?$/, '.');
      paragraphs.push(current.join(' '));
      current = [];
    }
  }
  return paragraphs.join('\n\n');
}

/** Texto longo: 600 palavras (4 min a 150 ppm), não acaba durante um teste. */
export const LONG_TEXT = makeText(600);

export const readFixture = (relative) => fs.readFileSync(path.join(FIXTURES, relative), 'utf8');

// ---------- Preparação da página ----------

/** Roda antes do app: registra as trocas de estado, quando o HUD apareceu e os avisos rápidos do palco. */
function instrument() {
  window.__e2e = { states: [], hudAt: -Infinity, ups: [], toasts: [] };
  const attach = () => {
    const el = document.getElementById('prompter-screen');
    if (!el) return;
    const toast = el.querySelector('.pr-stage .pr-toast');
    if (toast) {
      new MutationObserver(() => {
        if (toast.hasAttribute('data-show')) window.__e2e.toasts.push(toast.textContent);
      }).observe(toast, { attributes: true, attributeFilter: ['data-show'] });
    }
    const log = window.__e2e.states;
    let hud = el.hasAttribute('data-hud');
    log.push({ state: el.dataset.state ?? null, t: performance.now() });
    new MutationObserver(() => {
      const now = performance.now();
      const state = el.dataset.state;
      if (log[log.length - 1].state !== state) log.push({ state, t: now });
      const visible = el.hasAttribute('data-hud');
      if (visible && !hud) window.__e2e.hudAt = now;
      hud = visible;
    }).observe(el, { attributes: true, attributeFilter: ['data-state', 'data-hud'] });
    // Deslocamento no instante em que o dedo sai da tela (antes do motor tratar o toque).
    window.addEventListener(
      'pointerup',
      () => {
        if (window.__tp) window.__e2e.ups.push({ offset: window.__tp.offset(), pps: window.__tp.pxPerSecond(), t: performance.now() });
      },
      true,
    );
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

/**
 * Instrumenta a página e semeia o localStorage só na primeira carga (recarregar mantém o que o app
 * gravou). Por padrão a contagem regressiva vem desligada, para os testes andarem rápido.
 * - settings: ajustes extras; script: texto; flags: avisos; raw: valor cru da chave (dado corrompido);
 * - seed: false não semeia nada (padrões e texto de exemplo do app).
 */
export async function prepare(page, { settings = {}, script, flags, raw, seed = true } = {}) {
  await page.addInitScript(instrument);
  if (!seed) return;
  const value = raw ?? JSON.stringify({
    version: 1,
    settings: { countdown: 0, ...settings },
    ...(script !== undefined ? { script } : {}),
    ...(flags ? { flags } : {}),
  });
  await page.addInitScript(
    ([key, data]) => {
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, data);
      } catch {
        // armazenamento bloqueado: o próprio teste trata
      }
    },
    [STORAGE_KEY, value],
  );
}

/** Abre o editor já preparado. */
export async function gotoApp(page, options = {}) {
  await prepare(page, options);
  await page.goto('/');
  await expect(page.locator('textarea[name="script"]')).toBeVisible();
}

// ---------- Teleprompter ----------

export const screenEl = (page) => page.locator('#prompter-screen');
export const hudButton = (page, action) => page.locator(`#prompter-screen [data-action="${action}"]`);
export const panelEl = (page) => page.locator('aside.sheet.pn');

export const tpState = (page) => page.evaluate(() => window.__tp.state());
export const tpOffset = (page) => page.evaluate(() => window.__tp.offset());
export const tpSettings = (page) => page.evaluate(() => window.__tp.settings());
export const tpProgress = (page) =>
  page.evaluate(() => {
    const d = window.__tp.distance();
    return d > 0 ? window.__tp.offset() / d : 0;
  });

export async function expectState(page, state, timeout) {
  await expect(screenEl(page)).toHaveAttribute('data-state', state, timeout ? { timeout } : undefined);
}

/** Espera o HUD visível e já fora da proteção contra toque duplo (350 ms depois de aparecer). */
export async function hudReady(page) {
  await page.waitForFunction(
    (guard) => {
      const el = document.getElementById('prompter-screen');
      return el.hasAttribute('data-hud') && performance.now() - window.__e2e.hudAt > guard;
    },
    HUD_GUARD_MS + 120,
    { polling: 50 },
  );
}

/** Toca "Abrir teleprompter" e espera o estado pronto com o HUD utilizável. */
export async function openPrompter(page) {
  await page.locator('[data-action="start"]').click();
  await expect(screenEl(page)).toBeVisible();
  await expectState(page, 'ready');
  await hudReady(page);
}

/** Clica num botão do HUD (espera a proteção de 350 ms). */
export async function clickHud(page, action) {
  await hudReady(page);
  await hudButton(page, action).click();
}

export const viewport = (page) => page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));

/** Toque (touch) numa fração da tela. */
export async function tapAt(page, fx, fy) {
  const { w, h } = await viewport(page);
  await page.touchscreen.tap(Math.round(w * fx), Math.round(h * fy));
}

export const tapCenter = (page) => tapAt(page, 0.5, 0.5);

/** Espera o texto andar (a retomada acelera de 0 à velocidade em 400 ms). */
export async function waitMoving(page, px = 2) {
  const start = await tpOffset(page);
  await expect.poll(() => tpOffset(page), { timeout: 5_000 }).toBeGreaterThan(start + px);
}

/** Do estado pronto (contagem desligada) para rodando, já com o texto andando. */
export async function startPlaying(page) {
  await tapCenter(page);
  await expectState(page, 'playing');
  await waitMoving(page);
}

/** Arrasto com o mouse (Pointer Events do tipo mouse): de `from` para `to`, em coordenadas da tela. */
export async function drag(page, from, to, { steps = 10, hold = 0 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.up();
}

/** Teclas de avanço disparadas dentro da página até o estado "fim" (atalho para chegar ao fim). */
export async function jumpToEnd(page) {
  await page.evaluate(() => {
    for (let i = 0; i < 1000 && window.__tp.state() !== 'ended'; i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
    }
  });
  await expectState(page, 'ended');
}

/** Leva o ponto de leitura para perto de `target` (0 a 1) com as teclas de avanço, em pausa. */
export async function jumpToProgress(page, target) {
  await page.evaluate((goal) => {
    const progress = () => window.__tp.offset() / window.__tp.distance();
    for (let i = 0; i < 1000 && progress() < goal; i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
    }
  }, target);
}

// ---------- Painel ----------

/** Abre o painel pelo HUD e espera a animação de entrada terminar (posição final). */
export async function openPanel(page) {
  await clickHud(page, 'settings');
  await expect(panelEl(page)).toHaveClass(/is-open/);
  await expect(page.locator('#pn-title')).toBeFocused();
  await expect.poll(() => panelEl(page).evaluate((el) => getComputedStyle(el).transform)).toBe('none');
}

export async function closePanel(page) {
  await page.locator('[data-action="close-panel"]').click();
  await expect(panelEl(page)).not.toHaveClass(/is-open/);
}

/** Muda um controle deslizante do painel (o evento "input" aplica o ajuste na hora). */
export async function setRange(page, name, value) {
  await panelEl(page).locator(`input[name="${name}"]`).fill(String(value));
}

/** Como arrastar o polegar além da ponta: o navegador limita o valor ao min/max do campo. */
export async function setRangeRaw(page, name, value) {
  await panelEl(page)
    .locator(`input[name="${name}"]`)
    .evaluate((input, v) => {
      input.value = String(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
}

// ---------- Geometria ----------

/** Retângulos (coordenadas da tela, já com o espelho aplicado) da moldura, área, texto e janela. */
export const geometry = (page) =>
  page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      frame: rect('#prompter-screen .pr-frame'),
      area: rect('#prompter-screen .pr-area'),
      text: rect('#prompter-screen .pr-text'),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });

/**
 * Linhas do texto do teleprompter como estão na tela e as quebras de linha no meio de uma palavra (entre duas
 * letras): { word, at: "antes|depois", inSpan: dentro de um .pr-hy, hyphen: hífen desenhado no fim da linha }.
 * O hífen gerado não está no DOM: o Chromium o devolve como um retângulo à parte, junto da letra antes ou depois da
 * quebra; aqui ele aparece como largura a mais na linha da letra antes da quebra. Também as palavras dos .pr-hy.
 */
export const lineBreaks = (page) =>
  page.evaluate(() => {
    const text = document.querySelector('#prompter-screen .pr-text');
    const style = getComputedStyle(text);
    const context = document.createElement('canvas').getContext('2d');
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const hyphenWidth = context.measureText('-').width;
    const chars = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) for (let i = 0; i < node.length; i++) chars.push([node, i]);
    const str = chars.map(([node, i]) => node.data[i]).join('');
    const range = document.createRange();
    const rects = (from, to) => {
      range.setStart(chars[from][0], chars[from][1]);
      range.setEnd(chars[to][0], chars[to][1] + 1);
      return [...range.getClientRects()];
    };
    const lineHeight = parseFloat(style.lineHeight);
    const lines = [''];
    const breaks = [];
    let prev = null;
    for (let k = 0; k < chars.length; k++) {
      if (str[k] === '\n') {
        prev = null;
        lines.push('');
        continue;
      }
      const own = rects(k, k);
      if (!own.length) continue;
      const box = own[own.length - 1]; // a linha da letra é a do último retângulo (o hífen vem à parte, antes)
      if (prev && box.top - prev.top > lineHeight / 2) {
        lines.push('');
        if (/\p{L}/u.test(str[k - 1]) && /\p{L}/u.test(str[k])) {
          let start = k;
          while (start > 0 && !/\s/.test(str[start - 1])) start--;
          let end = k;
          while (end < str.length && !/\s/.test(str[end])) end++;
          const mid = (prev.top + prev.bottom) / 2;
          const onLine = rects(k - 1, k).filter((r) => r.top <= mid && r.bottom >= mid);
          const extent = Math.max(...onLine.map((r) => r.right)) - Math.min(...onLine.map((r) => r.left));
          breaks.push({
            word: str.slice(start, end),
            at: `${str.slice(start, k)}|${str.slice(k, end)}`,
            inSpan: Boolean(chars[k - 1][0].parentElement.closest('.pr-hy')),
            hyphen: extent - context.measureText(str[k - 1]).width >= hyphenWidth / 2,
          });
        }
      }
      lines[lines.length - 1] += str[k];
      prev = box;
    }
    return { lines, breaks, spans: [...text.querySelectorAll('.pr-hy')].map((span) => span.textContent) };
  });

/**
 * Quanto das letras da linha que está na linha de leitura fica sob os véus do HUD com opacidade de 50% ou mais
 * (0 a 1), lido do CSS aplicado: o véu é sólido atrás da barra e esmaece além dela. `overBars`: a caixa de uma
 * barra do HUD passa por cima dessas letras. Precisa da guia de leitura ligada (a seta marca a linha de leitura).
 */
export const veiledReadingLine = (page) =>
  page.evaluate(() => {
    const root = document.getElementById('prompter-screen');
    const fontSize = parseFloat(getComputedStyle(root.querySelector('.pr-text')).fontSize);
    const mark = root.querySelector('.pr-guide__mark--start').getBoundingClientRect();
    const reading = mark.top + mark.height / 2;
    const band = [reading - 0.38 * fontSize, reading + 0.32 * fontSize]; // altura das letras no peso 600
    const top = root.querySelector('.pr-top').getBoundingClientRect();
    const bottom = root.querySelector('.pr-bottom').getBoundingClientRect();
    const topFade = -parseFloat(getComputedStyle(root.querySelector('.pr-top'), '::before').bottom);
    const bottomFade = -parseFloat(getComputedStyle(root.querySelector('.pr-bottom'), '::before').top);
    const fade = (distance, length) => (distance < length ? 1 - distance / length : 0);
    const alphaAt = (y) => (y <= top.bottom || y >= bottom.top ? 1 : Math.max(fade(y - top.bottom, topFade), fade(bottom.top - y, bottomFade)));
    let veiled = 0;
    let samples = 0;
    for (let y = band[0]; y <= band[1]; y += 1, samples++) if (alphaAt(y) >= 0.5) veiled++;
    const bars = [root.querySelector('.pr-top'), root.querySelector('.pr-hint'), root.querySelector('.pr-pill')];
    const overBars = bars.some((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.bottom > band[0] && r.top < band[1];
    });
    return { share: veiled / samples, overBars, topFade, bottomFade };
  });

/** Sai da tela cheia do Chromium (antes de mudar o tamanho da janela) e espera o layout assentar. */
export async function exitFullscreen(page) {
  await page.evaluate(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  });
}

/** Muda o tamanho da janela (ex.: girar o aparelho) e espera dois quadros para o ResizeObserver medir. */
export async function resizeViewport(page, width, height) {
  await exitFullscreen(page);
  await page.setViewportSize({ width, height });
  await page.waitForFunction(([w, h]) => window.innerWidth === w && window.innerHeight === h, [width, height]);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Instantes (relógio da página) em que o teleprompter entrou em cada estado, na ordem. */
export const stateLog = (page) => page.evaluate(() => window.__e2e.states);

/**
 * Textos de todos os avisos rápidos que apareceram dentro do palco, na ordem (registrados pela
 * instrumentação). O aviso dura só 1,2 s: conferir pelo registro não depende de o teste chegar a tempo.
 */
export const toastTexts = (page) => page.evaluate(() => window.__e2e.toasts);

/** Pasta das capturas de tela do passe visual, por projeto. */
export function screenshotDir(projectName) {
  const dir = path.join(WORKSPACE, 'screenshots', projectName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
