// Motor do teleprompter (#prompter-screen): estados, rolagem, gestos, HUD, teclado, contagem regressiva,
// modo "Ajustar na tela", tela acesa e tela cheia. Contrato na seção 11.2 da especificação.
import { LIMITS } from '../store.js';
import { clamp, countWords, formatClock, pxPerSecond } from '../metrics.js';
import { canFullscreen, isStandalone } from '../platform.js';
import { icon } from '../icons.js';
import {
  HUD_GUARD_MS,
  adjustBarAtBottom,
  adjustPatch,
  areaRect,
  displayText,
  dragOffset,
  frameSeconds,
  handleAnchor,
  handlesFor,
  hasMixedUnits,
  hyphenatesAll,
  hyphenationRuns,
  isHyphenatable,
  keyboardJump,
  lineHeightFor,
  overflowingUnits,
  pointerToFraction,
  progressPerSecond,
  rampFactor,
  remainingSeconds,
  scrollDistance,
  slashPieces,
  snapToDevicePixel,
  textTranslateY,
  unbreakableUnits,
  veilRoom,
} from './layout.js';
import { isRepeatable, isTextField, keyAction } from './keyboard.js';
import { createWakeLock } from './wakelock.js';
import { enterFullscreen, exitFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from './fullscreen.js';
import { buildView } from './view.js';
import { trackGestures } from './gestures.js';

const TOAST_MS = 1200;
const COUNTDOWN_TICK_MS = 1000;
const MINUS = '−';
const HINTS = Object.freeze({
  ready: 'Toque em qualquer lugar para começar',
  paused: 'Toque para continuar',
  ended: 'Fim do texto',
});
const STATUS = Object.freeze({ playing: 'Lendo', paused: 'Pausado', ended: 'Fim do texto' });
const HUD_STATES = new Set(['ready', 'paused', 'ended']);
const LAYOUT_KEYS = ['fontSize', 'areaWidth', 'areaHeight'];
// Abaixo desta largura a pílula inteira não cabe com botões de 44 px: usa btn--sm (36 px, toque de 44 px).
const NARROW_PILL_QUERY = '(max-width: 419px)';

let canvasContext;
const measureContext = () => (canvasContext ??= document.createElement('canvas').getContext('2d'));

/**
 * As palavras do texto que o motor sabe quebrar, com a largura a 100 px na fonte do teleprompter (peso e família
 * de `el`), da mais larga para a mais estreita. Medidas uma vez por texto: a ordem pré-seleciona as que podem não
 * caber na coluna (overflowingUnits). `mixed`: o texto tem endereço ou outro trecho misto (hasMixedUnits), e nunca é
 * hifenizado todo de uma vez. null se o canvas não entender a fonte: aí nada é hifenizado, como antes.
 */
function measureUnits(text, el) {
  const context = measureContext();
  if (!context) return null;
  // Lidos uma vez: o estilo calculado é vivo, e lê-lo a cada medida obrigava o navegador a recalcular o texto todo.
  const { fontWeight, fontFamily } = getComputedStyle(el);
  const font = (size) => `${fontWeight} ${size}px ${fontFamily}`;
  context.font = font(100);
  if (!context.font.includes('100px')) return null;
  const found = [...unbreakableUnits(text)];
  const units = found
    .filter(isHyphenatable)
    .map((word) => ({ word, width: context.measureText(word).width }))
    .sort((a, b) => b.width - a.width);
  return units.length ? { font, units, mixed: hasMixedUnits(found) } : null;
}

/**
 * Palavras que não cabem na coluna no tamanho de letra `size`. A largura final vem do canvas nesse tamanho,
 * porque a fonte do sistema do iPhone muda o espaçamento em letra pequena.
 */
function overflowingWords(measured, size, columnWidth) {
  const context = measureContext();
  if (!measured || !context) return new Set();
  context.font = measured.font(size);
  return overflowingUnits({ units: measured.units, fontSize: size, columnWidth, widthAt: (word) => context.measureText(word).width });
}

/**
 * Põe cada ocorrência de uma palavra de `words` no nó de texto `node` num .pr-hy (só nós; nunca innerHTML). Na dupla
 * com "/" entre letras entra um <wbr> depois da barra: sozinho, o navegador não quebra ali.
 */
function wrapWords(node, words) {
  if (![...words].some((word) => node.data.includes(word))) return;
  const runs = hyphenationRuns(node.data, words);
  if (!runs.some(([, overflows]) => overflows)) return;
  const fragment = document.createDocumentFragment();
  for (const [part, overflows] of runs) {
    if (!overflows) {
      fragment.append(document.createTextNode(part));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'pr-hy';
    slashPieces(part).forEach((piece, i) => {
      if (i) span.append(document.createElement('wbr'));
      span.append(document.createTextNode(piece));
    });
    fragment.append(span);
  }
  node.replaceWith(fragment);
}

/**
 * Tira do .pr-hy as palavras fora de `keep`: cada trecho seguido de nós de texto e desses spans vira um nó de texto
 * só. Sem normalize(), que no Chromium refaz o texto do bloco inteiro a cada junção (caro num texto longo).
 */
function unwrapWords(container, keep) {
  let run = [];
  const flush = () => {
    if (run.length > 1 || run[0]?.nodeType === Node.ELEMENT_NODE) {
      run[0].replaceWith(document.createTextNode(run.map((node) => node.textContent).join('')));
      for (const node of run.slice(1)) node.remove();
    }
    run = [];
  };
  for (const node of [...container.childNodes]) { // cópia da lista: os nós são trocados no caminho
    if (node.nodeType === Node.TEXT_NODE || !keep.has(node.textContent)) run.push(node);
    else flush();
  }
  flush();
}

function consume(event) {
  event.preventDefault();
  event.stopPropagation();
}

// Voltar do sistema (botão do Android, gesto do Safari): abrir cria uma entrada no histórico, e voltar
// dela leva ao editor em vez de sair do app no meio da leitura.
function addHistoryEntry() {
  try {
    history.pushState({ teleprompter: true }, '');
  } catch {
    // Sem histórico (ex.: página aberta de um data:): o Voltar sai do app, como antes.
  }
}

function dropHistoryEntry() {
  // Saindo pelo HUD ou pelo Esc a entrada ainda está lá; saindo pelo Voltar, o navegador já a tirou.
  if (history.state?.teleprompter) history.back();
}

export function createPrompter({ root, store, onExit, onOpenPanel, onClosePanel }) {
  const view = buildView(root);
  const topBar = view.hud.querySelector('.pr-top');
  const bottomBar = view.hud.querySelector('.pr-bottom');
  // App da Tela de Início: medido uma vez, na criação. Depois, a própria tela cheia da API faz o
  // Chromium responder (display-mode: fullscreen) e o botão de sair da tela cheia sumiria.
  const standalone = isStandalone();
  const wakeLock = createWakeLock({ container: root, standalone });
  const fullscreenAllowed = () => canFullscreen() && !standalone;

  let opened = false;
  let state = 'ready';
  let panelOpen = false;
  let adjusting = false;
  let empty = true;
  let words = 0;
  let shownText = null;
  let measured = null; // palavras hifenizáveis do texto mostrado, por largura (RF-03)
  let wrapped = new Set(); // as que estão num .pr-hy: as que não cabem na coluna (ou só as duplas com "/")
  // Ponto de leitura guardado como progresso p = offset ÷ D (0 a 1): mantém o ponto em qualquer
  // re-layout (fonte, área, giro) e faz um texto de uma linha (D = 0) durar palavras ÷ ppm.
  let progress = 0;

  // Medidas: só ao abrir, ao mudar um ajuste, no ResizeObserver e no giro. Nunca dentro do loop.
  const m = { areaH: 0, lineH: 0, distance: 0, baseY: 0, dpr: 1 };
  // Moldura medida: só muda de tamanho num giro ou janela nova (aí é esquecida). Relida a cada ajuste, com o texto
  // ainda por recalcular, faria o navegador calcular o texto inteiro antes de hifenizar e de novo depois.
  let frameRect = null;
  let dirty = true;
  let measureRaf = 0;
  let lastY = null;

  let raf = 0;
  let lastFrame = null;
  let rampStart = 0;
  let drag = null;
  let handleDrag = null;
  let countdownTimer = 0;
  let countdownLeft = 0;
  let toastTimer = 0;
  let hudVisible = false;
  let hudShownAt = -Infinity;
  let toggleIcon = '';
  const cleanups = [];

  // Giro ou janela nova: mede de novo e, no modo de ajuste, revê o lado da barra (as alças mudaram de lugar).
  const onFrameResize = () => {
    frameRect = null;
    measure();
    if (adjusting) updateAdjust();
  };
  const onOrientationChange = () => {
    frameRect = null;
    markDirty();
  };
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(onFrameResize) : null;

  // ---------- Ajustes e medidas ----------

  function applySettings() {
    const s = store.getSettings();
    const { x, w, h } = areaRect(s);
    root.style.setProperty('--area-x', String(x));
    root.style.setProperty('--area-w', String(w));
    root.style.setProperty('--area-h', String(h));
    root.style.setProperty('--pr-mx', s.mirrorX ? '-1' : '1');
    root.style.setProperty('--pr-my', s.mirrorY ? '-1' : '1');
    root.toggleAttribute('data-mirror-x', s.mirrorX);
    root.toggleAttribute('data-mirror-y', s.mirrorY);
    root.toggleAttribute('data-guide', s.guide);
    view.text.style.fontSize = `${s.fontSize}px`;
  }

  function loadScript() {
    const script = store.getScript();
    const text = displayText(script);
    empty = text.length === 0;
    words = empty ? 0 : Math.max(1, countWords(script)); // a mesma contagem do editor
    if (text !== shownText) {
      shownText = text;
      wrapped = new Set();
      view.text.textContent = text; // roteiro do usuário: sempre texto puro
      view.text.classList.remove('pr-text--hyphens');
      root.removeAttribute('data-hyphenate');
      measured = measureUnits(text, view.text);
    }
    root.toggleAttribute('data-empty', empty);
  }

  /**
   * Hifenização (RF-03) só nas palavras que não cabem na coluna: cada ocorrência fica num <span class="pr-hy">,
   * criado com nós (o roteiro nunca passa por innerHTML). Mexe só nas palavras que entraram ou saíram do conjunto:
   * num texto longo, remontar o texto inteiro custa mais que envolver só as palavras que mudaram.
   * Quando não cabe nenhuma palavra que o navegador hifenizaria (letra enorme numa coluna estreita) e o texto não
   * tem trecho misto, o texto todo hifeniza (.pr-text--hyphens) com as mesmas quebras, e só as duplas com "/" ficam
   * num .pr-hy, pelo <wbr>.
   */
  function hyphenate(next) {
    const all = !measured?.mixed && hyphenatesAll(measured?.units ?? [], next);
    const wrap = all ? new Set([...next].filter((word) => slashPieces(word).length > 1)) : next;
    const added = new Set([...wrap].filter((word) => !wrapped.has(word)));
    const removed = [...wrapped].some((word) => !wrap.has(word));
    wrapped = wrap;
    if (removed) unwrapWords(view.text, wrap); // sem nenhuma, volta a um nó de texto só
    if (added.size) {
      // Cópia da lista: os nós de texto são trocados no caminho.
      for (const node of [...view.text.childNodes]) if (node.nodeType === Node.TEXT_NODE) wrapWords(node, added);
    }
    view.text.classList.toggle('pr-text--hyphens', all);
    root.toggleAttribute('data-hyphenate', next.size > 0);
  }

  function measure() {
    dirty = false;
    if (!opened) return;
    const rect = (frameRect ??= view.frame.getBoundingClientRect());
    if (!(rect.width > 0 && rect.height > 0)) {
      frameRect = null;
      dirty = true; // ainda sem tamanho (tela escondida): mede no próximo quadro
      return;
    }
    const s = store.getSettings();
    const area = areaRect(s);
    // Antes de medir a altura do texto: hifenizar muda as quebras de linha.
    hyphenate(overflowingWords(measured, s.fontSize, rect.width * area.w));
    m.areaH = rect.height * area.h;
    m.lineH = lineHeightFor(s.fontSize);
    m.distance = empty ? 0 : scrollDistance(view.text.getBoundingClientRect().height, m.lineH);
    m.baseY = textTranslateY({ offset: 0, areaHeight: m.areaH, lineHeight: m.lineH });
    m.dpr = window.devicePixelRatio || 1;
    lastY = null;
    render();
    fitVeils();
  }

  function markDirty() {
    dirty = true;
    if (!opened || measureRaf) return;
    measureRaf = requestAnimationFrame(() => {
      measureRaf = 0;
      if (dirty) measure();
    });
  }

  function flushMeasure() {
    if (dirty) measure();
  }

  /** Única escrita por quadro: o translate3d do texto, arredondado ao pixel físico. */
  function render() {
    const y = snapToDevicePixel(m.baseY - progress * m.distance, m.dpr);
    if (y === lastY) return;
    lastY = y;
    view.text.style.transform = `translate3d(0, ${y}px, 0)`;
  }

  // ---------- Rolagem ----------

  function startLoop() {
    rampStart = performance.now(); // retomada sem tranco: 0 → velocidade em 400 ms
    lastFrame = null;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = null;
  }

  function tick(now) {
    raf = 0;
    if (state !== 'playing' || drag) return;
    const dt = lastFrame === null ? 0 : frameSeconds(now - lastFrame);
    lastFrame = now;
    const rate = progressPerSecond({ wpm: store.getSettings().speed, words });
    progress = Math.min(1, progress + rate * rampFactor(now - rampStart) * dt);
    render();
    if (progress >= 1) {
      setState('ended');
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  // ---------- Estados (seção 6) ----------

  function setState(next) {
    if (next !== state) {
      state = next;
      root.dataset.state = next;
      view.status.textContent = STATUS[next] ?? '';
      if (next === 'playing') startLoop();
      else stopLoop();
    }
    updateHudVisibility();
    updateHud();
  }

  function begin() {
    if (empty) return;
    const seconds = store.getSettings().countdown;
    if (seconds > 0) startCountdown(seconds);
    else setState('playing');
  }

  function toggle() {
    if (state === 'ready') begin();
    else if (state === 'countdown') cancelCountdown();
    else if (state === 'playing') setState('paused');
    else if (state === 'paused') setState('playing');
    // ended: o toque não faz nada, para não recomeçar sem querer
  }

  function restart() {
    stopCountdown();
    drag = null;
    gestures.reset();
    progress = 0;
    render();
    setState('ready');
  }

  function startCountdown(seconds) {
    countdownLeft = seconds;
    setState('countdown');
    showDigit(countdownLeft);
    countdownTimer = setInterval(() => {
      countdownLeft -= 1;
      if (countdownLeft > 0) {
        showDigit(countdownLeft);
      } else {
        stopCountdown();
        setState('playing');
      }
    }, COUNTDOWN_TICK_MS);
  }

  function showDigit(value) {
    const digit = document.createElement('span'); // elemento novo a cada número reinicia a animação
    digit.className = 'pr-countdown__digit';
    digit.textContent = String(value);
    view.countdown.replaceChildren(digit);
  }

  function stopCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = 0;
    view.countdown.replaceChildren();
  }

  function cancelCountdown() {
    stopCountdown();
    setState('ready');
  }

  /** Move o ponto de leitura (arrasto ou teclado) com as transições da seção 6. */
  function moveTo(nextProgress) {
    progress = clamp(nextProgress, 0, 1);
    render();
    if (state === 'ready' && progress > 0) setState('paused');
    else if (state === 'ended' && progress < 1) setState('paused');
    else updateTime();
  }

  function jump(direction) {
    if (empty || state === 'countdown') return;
    flushMeasure();
    if (!(m.distance > 0)) return;
    const offset = clamp(progress * m.distance + direction * keyboardJump(m.areaH), 0, m.distance);
    moveTo(offset / m.distance);
    if (progress >= 1 && (state === 'paused' || state === 'playing')) setState('ended');
  }

  // ---------- Gestos ----------

  const gestures = trackGestures(root, {
    enabled: () => opened,
    onTap: stageTap,
    onDragStart() {
      if (adjusting || state === 'countdown' || empty) return false;
      flushMeasure();
      drag = { startOffset: progress * m.distance };
      if (state === 'playing') stopLoop(); // suspende a rolagem; continua ao soltar
      return true;
    },
    onDragMove(deltaY) {
      if (!drag || !(m.distance > 0)) return;
      const { mirrorY } = store.getSettings();
      const offset = dragOffset({ startOffset: drag.startOffset, deltaY, mirrorY, distance: m.distance });
      moveTo(offset / m.distance);
    },
    onDragEnd() {
      if (!drag) return;
      drag = null;
      if (state === 'playing') {
        if (progress >= 1) setState('ended');
        else startLoop();
      } else if (state === 'paused' && progress >= 1) {
        setState('ended');
      }
    },
  });

  function stageTap() {
    wakeLock.ensure(); // cada toque no palco religa a tela acesa (é um gesto do usuário)
    if (panelOpen) {
      onClosePanel?.(); // com o painel aberto, o toque só fecha o painel
      return;
    }
    if (adjusting) return;
    toggle();
  }

  // ---------- HUD ----------

  function updateHudVisibility() {
    const visible = opened && !panelOpen && !adjusting && HUD_STATES.has(state);
    if (visible === hudVisible) return;
    hudVisible = visible;
    if (visible) hudShownAt = performance.now();
    root.toggleAttribute('data-hud', visible);
    fitVeils();
  }

  /**
   * Os véus atrás das barras esmaecem só até a linha que está na linha de leitura: numa área baixa (ou invertida)
   * ela cairia na faixa do véu e sumiria. A posição das barras vem do layout (offsetTop), sem o deslocamento de
   * 8 px da animação de entrada.
   */
  function fitVeils() {
    if (!hudVisible) return;
    const s = store.getSettings();
    const frame = view.frame.getBoundingClientRect();
    const hudTop = view.hud.getBoundingClientRect().top;
    const room = empty
      ? null
      : veilRoom({
          frameTop: frame.top,
          frameBottom: frame.bottom,
          areaHeight: frame.height * areaRect(s).h,
          mirrorY: s.mirrorY,
          lineHeight: lineHeightFor(s.fontSize),
          topBarBottom: hudTop + topBar.offsetTop + topBar.offsetHeight,
          bottomBarTop: hudTop + bottomBar.offsetTop,
        });
    for (const [name, px] of [['--pr-veil-top', room?.top], ['--pr-veil-bottom', room?.bottom]]) {
      if (px == null) root.style.removeProperty(name);
      else root.style.setProperty(name, `${Math.floor(px)}px`);
    }
  }

  function updateHud() {
    const s = store.getSettings();
    const b = view.buttons;
    view.speed.textContent = String(s.speed);
    b['speed-down'].disabled = s.speed <= LIMITS.speed.min;
    b['speed-up'].disabled = s.speed >= LIMITS.speed.max;
    b['font-down'].disabled = s.fontSize <= LIMITS.fontSize.min;
    b['font-up'].disabled = s.fontSize >= LIMITS.fontSize.max;
    b.restart.disabled = empty;
    b.toggle.disabled = empty || state === 'ended';
    const name = state === 'playing' ? 'pause' : 'play';
    if (name !== toggleIcon) {
      toggleIcon = name;
      b.toggle.innerHTML = icon(name);
      b.toggle.setAttribute('aria-label', name === 'pause' ? 'Pausar' : 'Reproduzir');
    }
    view.hint.textContent = empty ? '' : HINTS[state] ?? '';
    updateTime();
    fitVeils(); // a dica muda com o estado, e a barra de baixo com ela
  }

  function updateTime() {
    const seconds = remainingSeconds({ progress, words, wpm: store.getSettings().speed });
    view.timeLabel.textContent = MINUS + formatClock(seconds);
    view.timeFill.style.transform = `scaleX(${progress})`;
  }

  function updateFullscreenButton() {
    const button = view.buttons.fullscreen;
    button.hidden = !fullscreenAllowed();
    const active = isFullscreen();
    button.innerHTML = icon(active ? 'fullscreen-exit' : 'fullscreen');
    button.setAttribute('aria-label', active ? 'Sair da tela cheia' : 'Tela cheia');
  }

  /** Ações dos botões do HUD e do teclado. Só o teclado mostra o aviso rápido no palco (RF-16). */
  function runAction(action, fromKeyboard = false) {
    switch (action) {
      case 'toggle':
        wakeLock.ensure();
        toggle();
        break;
      case 'speed-up':
      case 'speed-down':
        store.nudge('speed', action === 'speed-up' ? 1 : -1);
        if (fromKeyboard) showToast(`Velocidade ${store.getSettings().speed} ppm`);
        break;
      case 'font-up':
      case 'font-down':
        store.nudge('fontSize', action === 'font-up' ? 1 : -1);
        if (fromKeyboard) showToast(`Texto ${store.getSettings().fontSize} px`);
        break;
      case 'back':
      case 'forward':
        jump(action === 'forward' ? 1 : -1);
        break;
      case 'restart':
        restart();
        break;
      case 'mirror': {
        const mirrorX = !store.getSettings().mirrorX;
        store.setSettings({ mirrorX });
        showToast(mirrorX ? 'Espelho ligado' : 'Espelho desligado');
        break;
      }
      case 'exit':
        onExit?.();
        break;
      case 'fullscreen':
        toggleFullscreen();
        break;
      case 'settings':
        onOpenPanel?.();
        break;
      default:
        break;
    }
  }

  function showToast(message) {
    view.toast.textContent = message;
    view.toast.setAttribute('data-show', '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = 0;
    view.toast.removeAttribute('data-show');
  }

  // ---------- Modo "Ajustar na tela" (seções 5.4 e 10) ----------

  function updateAdjust() {
    const s = store.getSettings();
    view.measureWidth.textContent = `Largura ${Math.round(s.areaWidth * 100)}%`;
    view.measureHeight.textContent = `Altura ${Math.round(s.areaHeight * 100)}%`;
    for (const input of view.positions) input.checked = input.value === s.position;
    const visible = handlesFor(s.position);
    for (const handle of view.handles) handle.hidden = !visible.includes(handle.dataset.handle);
    // Com o dedo numa alça a barra fica onde está (não pula na frente do usuário); troca de lado ao soltar.
    if (!handleDrag) placeAdjustBar(s);
  }

  /** Quanto da área de toque das alças visíveis o retângulo cobre, em px². */
  function handleCover(rect) {
    let total = 0;
    for (const handle of view.handles) {
      if (handle.hidden) continue;
      const r = handle.getBoundingClientRect();
      const w = Math.min(rect.right, r.right) - Math.max(rect.left, r.left);
      const h = Math.min(rect.bottom, r.bottom) - Math.max(rect.top, r.top);
      if (w > 0 && h > 0) total += w * h;
    }
    return total;
  }

  /** Mede a barra em cima e embaixo (sem pintar entre as medidas) e deixa onde ela cobre menos alças. */
  function placeAdjustBar(s) {
    const coverAt = (bottom) => {
      root.toggleAttribute('data-adjust-bar-bottom', bottom);
      return handleCover(view.adjustBar.getBoundingClientRect());
    };
    const coverTop = coverAt(false);
    const coverBottom = coverAt(true);
    root.toggleAttribute('data-adjust-bar-bottom', adjustBarAtBottom({ ...s, coverTop, coverBottom }));
  }

  function enterAdjustMode() {
    if (!opened) return;
    if (state === 'playing') setState('paused');
    else if (state === 'countdown') cancelCountdown();
    drag = null;
    gestures.reset();
    adjusting = true;
    root.setAttribute('data-adjust', '');
    updateAdjust();
    updateHudVisibility();
    view.done.focus({ preventScroll: true });
  }

  function exitAdjustMode() {
    if (!adjusting) return;
    endHandleDrag();
    adjusting = false;
    root.removeAttribute('data-adjust');
    updateHudVisibility();
    root.focus({ preventScroll: true });
  }

  function handlePoint(event, rect) {
    const { mirrorX, mirrorY } = store.getSettings();
    return pointerToFraction({ x: event.clientX, y: event.clientY, rect, mirrorX, mirrorY });
  }

  function onHandleDown(event) {
    if (!adjusting || handleDrag) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const el = event.currentTarget;
    const s = store.getSettings();
    const rect = view.frame.getBoundingClientRect();
    const point = handlePoint(event, rect);
    const anchor = handleAnchor({ handle: el.dataset.handle, ...s });
    // Guarda onde o dedo pegou a alça, para a borda não "pular" até o centro do dedo.
    handleDrag = { id: event.pointerId, el, handle: el.dataset.handle, rect, dx: anchor.fx - point.fx, dy: anchor.fy - point.fy };
    el.setAttribute('data-active', '');
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      // Sem captura: o arrasto ainda funciona enquanto o dedo estiver sobre a alça.
    }
    event.preventDefault();
  }

  function onHandleMove(event) {
    if (!handleDrag || event.pointerId !== handleDrag.id) return;
    const point = handlePoint(event, handleDrag.rect);
    store.setSettings(
      adjustPatch({
        handle: handleDrag.handle,
        fx: clamp(point.fx + handleDrag.dx, 0, 1),
        fy: clamp(point.fy + handleDrag.dy, 0, 1),
        position: store.getSettings().position,
      }),
    );
  }

  function onHandleUp(event) {
    if (handleDrag && event.pointerId === handleDrag.id) endHandleDrag();
  }

  function endHandleDrag() {
    if (!handleDrag) return;
    handleDrag.el.removeAttribute('data-active');
    handleDrag = null;
    flushMeasure();
    if (adjusting) updateAdjust();
  }

  // ---------- Teclado (seção 7) ----------

  function onKeyDown(event) {
    if (!opened || isTextField(event.target)) return;
    const action = keyAction(event);
    if (!action) return;
    if (action === 'escape') {
      if (!panelOpen && !adjusting && state === 'playing') return; // rodando, Esc não faz nada
      consume(event);
      if (event.repeat) return;
      if (panelOpen) onClosePanel?.();
      else if (adjusting) exitAdjustMode();
      else onExit?.();
      return;
    }
    if (panelOpen || adjusting) return; // painel e modo de ajuste ficam com as próprias teclas
    consume(event); // o atalho vale mais que o botão em foco (Espaço não "clica" o último botão)
    if (event.repeat && !isRepeatable(action)) return;
    runAction(action, true);
  }

  function onKeyUp(event) {
    // O Espaço "clica" o botão em foco ao soltar a tecla: o atalho já agiu no keydown.
    if (!opened || panelOpen || adjusting || isTextField(event.target)) return;
    const action = keyAction(event);
    if (action && action !== 'escape') consume(event);
  }

  // ---------- Página, giro e tela cheia ----------

  function onVisibilityChange() {
    if (!opened) return;
    if (document.visibilityState === 'hidden') {
      // Trocar de app ou bloquear a tela: rodando vira pausado; contagem volta para pronto.
      drag = null;
      gestures.reset();
      endHandleDrag();
      if (state === 'playing') setState('paused');
      else if (state === 'countdown') cancelCountdown();
    } else {
      wakeLock.ensure();
      markDirty();
    }
  }

  const preventDefault = (event) => event.preventDefault();

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function attachPageListeners() {
    listen(document, 'keydown', onKeyDown, true);
    listen(document, 'keyup', onKeyUp, true);
    listen(document, 'visibilitychange', onVisibilityChange);
    listen(window, 'popstate', () => onExit?.());
    // Pinça do Safari (zoom): bloqueada só com o teleprompter aberto.
    listen(document, 'gesturestart', preventDefault, { passive: false });
    listen(document, 'gesturechange', preventDefault, { passive: false });
    listen(window, 'orientationchange', onOrientationChange);
    if (resizeObserver) {
      resizeObserver.observe(view.frame);
      cleanups.push(() => resizeObserver.unobserve(view.frame));
    } else {
      listen(window, 'resize', onFrameResize);
    }
    cleanups.push(onFullscreenChange(updateFullscreenButton));
  }

  function detachPageListeners() {
    while (cleanups.length) cleanups.pop()();
  }

  // ---------- Ligações fixas ----------

  // Recarregar com o teleprompter aberto deixa a entrada dele como a atual: o Voltar seguinte seria
  // engolido e a saída pelo HUD voltaria uma página a mais (para fora do app).
  if (history.state?.teleprompter) history.replaceState(null, '');

  root.tabIndex = -1;
  root.dataset.state = state;
  root.addEventListener('contextmenu', (event) => opened && event.preventDefault());
  root.addEventListener('dblclick', (event) => opened && event.preventDefault());

  view.hud.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button || button.disabled || !hudVisible) return;
    if (performance.now() - hudShownAt < HUD_GUARD_MS) return; // segundo toque de um toque duplo
    runAction(button.dataset.action);
  });

  view.adjustBar.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-action="adjust-done"]')) exitAdjustMode();
  });
  view.adjustBar.addEventListener('change', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.name === 'adjust-position' && input.checked) {
      store.setSettings({ position: input.value });
    }
  });

  for (const handle of view.handles) {
    handle.addEventListener('pointerdown', onHandleDown);
    handle.addEventListener('pointermove', onHandleMove);
    handle.addEventListener('pointerup', onHandleUp);
    handle.addEventListener('pointercancel', onHandleUp);
    handle.addEventListener('lostpointercapture', onHandleUp);
  }

  const narrowPill = typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_PILL_QUERY) : null;
  const applyPillSize = () => {
    for (const button of view.pill.querySelectorAll('.btn')) button.classList.toggle('btn--sm', Boolean(narrowPill?.matches));
  };
  applyPillSize();
  narrowPill?.addEventListener?.('change', applyPillSize);

  store.subscribe((_, changed) => {
    if (!opened) return;
    if (changed.has('script')) loadScript();
    applySettings();
    if (changed.has('script') || LAYOUT_KEYS.some((key) => changed.has(key))) {
      // Arrastando uma alça, mede uma vez por quadro (texto longo não trava o arrasto).
      if (handleDrag) markDirty();
      else measure();
    }
    updateHud();
    if (adjusting) updateAdjust();
  });

  // Ganchos de teste (seção 11.3), só leitura.
  const debug = Object.freeze({
    state: () => state,
    offset: () => {
      flushMeasure();
      return progress * m.distance;
    },
    distance: () => {
      flushMeasure();
      return m.distance;
    },
    pxPerSecond: () => {
      flushMeasure();
      return pxPerSecond({ wpm: store.getSettings().speed, words, distance: m.distance });
    },
    settings: () => store.getSettings(),
  });
  try {
    Object.defineProperty(window, '__tp', { value: debug, configurable: true, enumerable: false, writable: false });
  } catch {
    // Já definido por outra instância: mantém o existente.
  }

  // ---------- API pública ----------

  function open() {
    const wasOpen = opened;
    opened = true;
    root.hidden = false;
    // Dentro do toque do usuário e sem await antes: vídeo da tela acesa e tela cheia (RF-10, RF-11).
    wakeLock.acquire();
    if (!wasOpen && fullscreenAllowed()) enterFullscreen();
    if (!wasOpen) attachPageListeners();
    if (!wasOpen) addHistoryEntry();

    stopLoop();
    stopCountdown();
    hideToast();
    drag = null;
    gestures.reset();
    endHandleDrag();
    adjusting = false;
    root.removeAttribute('data-adjust');

    loadScript();
    progress = 0;
    state = 'ready';
    root.dataset.state = state;
    view.status.textContent = '';
    applySettings();
    frameRect = null; // escondida, a tela pode ter girado
    measure();
    updateFullscreenButton();
    hudVisible = false;
    updateHudVisibility();
    updateHud();
    root.focus({ preventScroll: true });
  }

  function close() {
    if (!opened) return;
    opened = false;
    stopLoop();
    stopCountdown();
    hideToast();
    drag = null;
    gestures.reset();
    endHandleDrag();
    adjusting = false;
    panelOpen = false;
    root.removeAttribute('data-adjust');
    if (measureRaf) cancelAnimationFrame(measureRaf);
    measureRaf = 0;
    wakeLock.release();
    exitFullscreen();
    detachPageListeners(); // antes de voltar no histórico: o popstate dessa volta não pode chamar onExit
    dropHistoryEntry();
    state = 'ready';
    root.dataset.state = state;
    view.status.textContent = '';
    hudVisible = false;
    root.removeAttribute('data-hud');
    root.hidden = true;
  }

  function setPanelOpen(value) {
    panelOpen = Boolean(value);
    if (panelOpen) {
      if (state === 'playing') setState('paused');
      else if (state === 'countdown') cancelCountdown();
    }
    updateHudVisibility();
  }

  return {
    open,
    close,
    isOpen: () => opened,
    setPanelOpen,
    enterAdjustMode,
    getState: () => state,
  };
}
