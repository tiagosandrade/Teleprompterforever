// Matemática do teleprompter (seções 9 e 10 da especificação): funções puras, sem DOM.
// Coordenadas "lógicas" são as do palco antes do espelhamento; frações são relativas à moldura útil.
import { clamp, estimateSeconds } from '../metrics.js';

/** Entrelinha do texto (igual a --lh-prompter): a altura de uma linha é fontSize × 1,4. */
export const LINE_HEIGHT_RATIO = 1.4;
/** Linha de leitura: 30% da altura da área, medida a partir do topo lógico. */
export const READING_LINE = 0.3;
/** Retomada: a velocidade sobe de 0 ao alvo neste tempo. */
export const RAMP_MS = 400;
/** Maior intervalo entre quadros considerado: depois de um engasgo o texto não "pula". */
export const MAX_FRAME_MS = 100;
/** Toque = soltar em menos de 500 ms, sem mover mais de 10 px. */
export const TAP_SLOP_PX = 10;
export const TAP_MAX_MS = 500;
/** Botões do HUD ignoram toques logo depois de aparecer (segundo toque de um toque duplo). */
export const HUD_GUARD_MS = 350;
/** Margem de 0,5% na largura de uma palavra: canvas e texto na tela diferem bem menos que isso nos dois motores. */
const OVERFLOW_MARGIN = 0.005;
/** Pré-seleção pela largura a 100 px com folga: em letra pequena a fonte do iPhone espaça mais as letras. */
const PRESELECT_SLACK = 0.15;
/** Folga entre o fim do véu do HUD e a caixa da linha que está na linha de leitura. */
const VEIL_GAP_PX = 4;

export const HANDLES = Object.freeze(['left', 'right', 'bottom', 'corner-left', 'corner-right']);

/** Retângulo da área em frações da moldura: topo 0, altura h, largura w e esquerda conforme a posição. */
export function areaRect({ position, areaWidth, areaHeight }) {
  const w = clamp(Number(areaWidth) || 0, 0, 1);
  const h = clamp(Number(areaHeight) || 0, 0, 1);
  let x = (1 - w) / 2;
  if (position === 'left') x = 0;
  else if (position === 'right') x = 1 - w;
  return { x, y: 0, w, h };
}

export function lineHeightFor(fontSize) {
  return fontSize * LINE_HEIGHT_RATIO;
}

/**
 * Texto como vai para a tela; o roteiro salvo e a contagem de palavras não mudam. Quebras do Windows
 * normalizadas, sem linhas vazias nas pontas e em NFC (acento combinado vira letra, e a palavra conta para a
 * hifenização). O navegador não quebra a linha num espaço inseparável: a dupla seria partida em qualquer letra,
 * sem hífen ("paralelepípedo qua" / "drado"). Por isso o espaço inseparável vira espaço comum.
 */
export function displayText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .trim();
}

// Trecho que o navegador não quebra sem hifenizar: vai até um espaço (os inseparáveis não contam), até um U+200B
// ou até logo depois de um hífen ou travessão ("e-mail" = "e-" + "mail"). Depois de "/" entre letras ele também
// não quebra: "entrada/saída" é um trecho só.
const UNIT = /(?:[^-‐–—\s\u200b]|[\u00a0\u2007\u202f])+[-‐–—]?|[-‐–—]/gu;

/** Trechos sem quebra do texto, sem repetir. */
export function unbreakableUnits(text) {
  return new Set(String(text ?? '').match(UNIT));
}

/**
 * O texto em pedaços para a tela: [trecho, true] em cada ocorrência de uma palavra de `words` (as que não cabem
 * na coluna, as únicas hifenizadas) e [trecho, false] no que fica entre elas.
 */
export function hyphenationRuns(text, words) {
  const runs = [];
  let last = 0;
  for (const match of text.matchAll(UNIT)) {
    if (!words.has(match[0])) continue;
    if (match.index > last) runs.push([text.slice(last, match.index), false]);
    runs.push([match[0], true]);
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push([text.slice(last), false]);
  return runs;
}

// Palavra que o motor sabe quebrar: letras (com apóstrofo no meio, ou "/" entre letras: "entrada/saída") e
// pontuação em volta. E-mail, endereço, número e código não contam: o navegador não os hifeniza, então um .pr-hy
// neles não adiantaria (seriam partidos em qualquer letra do mesmo jeito).
const HYPHENATABLE = /^[^\p{L}\p{N}]*\p{L}+(?:['’/]\p{L}+)*[^\p{L}\p{N}]*$/u;

export function isHyphenatable(unit) {
  return HYPHENATABLE.test(unit);
}

/**
 * A palavra em pedaços que terminam numa "/" entre letras ("entrada/saída" → "entrada/", "saída"): o motor põe um
 * <wbr> entre eles só quando a dupla não cabe na coluna. Em toda "/", "km/" ficaria no fim da linha e "h" na outra.
 */
export function slashPieces(unit) {
  return String(unit).split(/(?<=\p{L}\/)(?=\p{L})/u);
}

/** Palavra de menos de 6 caracteres o navegador nunca hifeniza: pedaços de 3 ou mais de cada lado (prompter.css). */
const MIN_HYPHENATED = 6;

/**
 * Toda palavra que o navegador conseguiria hifenizar está em `words` (as que não cabem na coluna): hifenizar o texto
 * inteiro dá as mesmas quebras e dispensa um .pr-hy por ocorrência, que custa caro quando quase nada cabe (letra
 * enorme numa coluna estreita). `units`: as palavras hifenizáveis do texto ({ word }).
 */
export function hyphenatesAll(units, words) {
  return words.size > 0 && units.every(({ word }) => word.length < MIN_HYPHENATED || words.has(word));
}

// 6 letras seguidas: o mínimo que o navegador hifeniza (MIN_HYPHENATED).
const LETTER_RUN = /\p{L}{6}/u;

/**
 * O texto tem trecho com 6 letras seguidas que não é palavra de letras (endereço, "snake_case", "Sério?Perfeito!")?
 * Com o texto todo hifenizado, o navegador hifeniza as letras dele; no modo por palavra, nunca. Aí o motor fica no
 * modo por palavra, para as quebras serem as mesmas. `units`: os trechos sem quebra do texto (unbreakableUnits).
 */
export function hasMixedUnits(units) {
  for (const unit of units) if (!isHyphenatable(unit) && LETTER_RUN.test(unit)) return true;
  return false;
}

/**
 * Hifenização (RF-03): só na palavra que não cabe na largura da coluna. Sem ela o navegador parte essa palavra
 * em qualquer letra, sem hífen ("paralelepí" / "pedo"). `wordPx`: a largura da palavra no tamanho de letra atual.
 */
export function needsHyphenation({ wordPx, columnWidth }) {
  return wordPx > 0 && wordPx >= columnWidth * (1 - OVERFLOW_MARGIN);
}

/**
 * As palavras que não cabem na coluna. `units`: as palavras hifenizáveis do texto com a largura a 100 px, da mais
 * larga para a mais estreita (a ordem pré-seleciona); `widthAt(palavra)` mede no tamanho de letra atual.
 */
export function overflowingUnits({ units, fontSize, columnWidth, widthAt }) {
  const words = new Set();
  const floor = columnWidth * (1 - OVERFLOW_MARGIN) * (1 - PRESELECT_SLACK);
  for (const { word, width } of units) {
    if ((width * fontSize) / 100 < floor) break;
    if (needsHyphenation({ wordPx: widthAt(word), columnWidth })) words.add(word);
  }
  return words;
}

/** D: do início (primeira linha na linha de leitura) ao fim (última linha na linha de leitura). */
export function scrollDistance(textHeight, lineHeight) {
  return Math.max(0, (Number(textHeight) || 0) - (Number(lineHeight) || 0));
}

export function readingLineY(areaHeightPx) {
  return areaHeightPx * READING_LINE;
}

/**
 * Véus do HUD (pronto, pausado, fim): quanto cada um ainda pode esmaecer além da sua barra (px) sem chegar na
 * caixa da linha que está na linha de leitura (linha de leitura ± meia linha, mais VEIL_GAP_PX). Medidas na tela
 * física: com a inversão vertical a área fica presa embaixo. null: a linha não fica além da barra, e o véu
 * esmaece como sempre.
 */
export function veilRoom({ frameTop, frameBottom, areaHeight, mirrorY, lineHeight, topBarBottom, bottomBarTop }) {
  const reading = mirrorY ? frameBottom - readingLineY(areaHeight) : frameTop + readingLineY(areaHeight);
  const lineTop = reading - lineHeight / 2 - VEIL_GAP_PX;
  const lineBottom = reading + lineHeight / 2 + VEIL_GAP_PX;
  return {
    top: lineBottom > topBarBottom ? Math.max(0, lineTop - topBarBottom) : null,
    bottom: lineTop < bottomBarTop ? Math.max(0, bottomBarTop - lineBottom) : null,
  };
}

/**
 * Deslocamento vertical (translateY) do texto dentro da área para um `offset` de rolagem.
 * offset 0 põe o centro da primeira linha na linha de leitura; offset D, o centro da última.
 */
export function textTranslateY({ offset, areaHeight, lineHeight }) {
  return readingLineY(areaHeight) - lineHeight / 2 - offset;
}

/** Posições inicial e final do texto, para conferir as pontas da rolagem. */
export function scrollBounds({ textHeight, lineHeight, areaHeight }) {
  const distance = scrollDistance(textHeight, lineHeight);
  return {
    distance,
    startY: textTranslateY({ offset: 0, areaHeight, lineHeight }),
    endY: textTranslateY({ offset: distance, areaHeight, lineHeight }),
  };
}

/** Arredonda ao pixel físico: evita texto borrado sem perder a fração acumulada no deslocamento. */
export function snapToDevicePixel(value, dpr = 1) {
  const ratio = dpr > 0 ? dpr : 1;
  return Math.round(value * ratio) / ratio;
}

export function progressOf(offset, distance) {
  return distance > 0 ? clamp(offset / distance, 0, 1) : 0;
}

export function offsetAt(progress, distance) {
  return clamp(Number(progress) || 0, 0, 1) * Math.max(0, distance);
}

/** Re-layout (fonte, área, giro): mantém o progresso p = offset ÷ D e devolve o novo offset p × D'. */
export function preserveOffset({ offset, oldDistance, newDistance }) {
  return offsetAt(progressOf(offset, oldDistance), newDistance);
}

/** Avanço das teclas ← → PageUp PageDown: 1/3 da altura da área. */
export function keyboardJump(areaHeightPx) {
  return Math.max(0, areaHeightPx) / 3;
}

/** Segundos de um quadro, limitados a 100 ms. */
export function frameSeconds(deltaMs) {
  return clamp((Number(deltaMs) || 0) / 1000, 0, MAX_FRAME_MS / 1000);
}

/** Fator de velocidade da retomada: 0 → 1 em RAMP_MS, com saída suave (ease-out cúbica). */
export function rampFactor(elapsedMs, rampMs = RAMP_MS) {
  if (!(rampMs > 0) || elapsedMs >= rampMs) return 1;
  if (!(elapsedMs > 0)) return 0;
  const t = elapsedMs / rampMs;
  return 1 - (1 - t) ** 3;
}

/**
 * Progresso por segundo: (ppm ÷ 60) ÷ palavras. Equivale a px/s ÷ D, mas não depende de D,
 * então um texto de uma linha (D = 0) também leva palavras ÷ ppm para chegar ao fim.
 */
export function progressPerSecond({ wpm, words }) {
  return wpm > 0 && words > 0 ? wpm / 60 / words : 0;
}

export function remainingSeconds({ progress, words, wpm }) {
  return (1 - clamp(Number(progress) || 0, 0, 1)) * estimateSeconds(words, wpm);
}

/**
 * Arrasto: o texto acompanha o dedo na tela física. Com o palco invertido (mirrorY),
 * descer o dedo precisa subir o texto lógico, então o sinal do delta se inverte.
 */
export function dragOffset({ startOffset, deltaY, mirrorY, distance }) {
  const direction = mirrorY ? -1 : 1;
  return clamp(startOffset - deltaY * direction, 0, Math.max(0, distance));
}

/** Ponteiro (coordenadas da tela) → fração lógica da moldura, invertida quando espelhada. */
export function pointerToFraction({ x, y, rect, mirrorX, mirrorY }) {
  let fx = rect.width > 0 ? (x - rect.left) / rect.width : 0;
  let fy = rect.height > 0 ? (y - rect.top) / rect.height : 0;
  if (mirrorX) fx = 1 - fx;
  if (mirrorY) fy = 1 - fy;
  return { fx: clamp(fx, 0, 1), fy: clamp(fy, 0, 1) };
}

/** Alças do modo "Ajustar na tela" para cada posição (seção 5.4). */
export function handlesFor(position) {
  if (position === 'left') return ['right', 'bottom', 'corner-right'];
  if (position === 'right') return ['left', 'bottom', 'corner-left'];
  return [...HANDLES];
}

/**
 * Barra do modo de ajuste embaixo (true) ou em cima: do lado livre da tela. A área fica presa no topo
 * (embaixo com inversão vertical). Até 50% da altura, a barra vai para o lado oposto e não cobre as alças
 * laterais; acima disso, fica do lado em que a área está presa, longe da alça da altura.
 * `coverTop` e `coverBottom`: quanto da área de toque das alças a barra cobriria em cima e embaixo (px²,
 * medido na tela). Numa tela baixa a regra dos 50% pode errar; aí vale o lado que cobre menos.
 */
export function adjustBarAtBottom({ areaHeight, mirrorY, coverTop = 0, coverBottom = 0 }) {
  const bottom = (areaHeight <= 0.5) !== Boolean(mirrorY);
  const [here, there] = bottom ? [coverBottom, coverTop] : [coverTop, coverBottom];
  return there < here ? !bottom : bottom;
}

/** Largura a partir da fração horizontal do ponteiro: Centro simétrico, Esquerda e Direita pela borda livre. */
export function widthFromPointer(fx, position) {
  if (position === 'left') return fx;
  if (position === 'right') return 1 - fx;
  return 2 * Math.abs(fx - 0.5);
}

/** Ajustes produzidos por uma alça. O resultado ainda passa por store.setSettings (limites e passo). */
export function adjustPatch({ handle, fx, fy, position }) {
  const patch = {};
  const corner = handle === 'corner-left' || handle === 'corner-right';
  if (handle === 'left' || handle === 'right' || corner) patch.areaWidth = widthFromPointer(fx, position);
  if (handle === 'bottom' || corner) patch.areaHeight = fy;
  return patch;
}

/** Centro lógico de uma alça (fração da moldura). Serve para compensar onde o dedo pegou a alça. */
export function handleAnchor({ handle, position, areaWidth, areaHeight }) {
  const { x, w, h } = areaRect({ position, areaWidth, areaHeight });
  const left = handle === 'left' || handle === 'corner-left';
  const right = handle === 'right' || handle === 'corner-right';
  const fx = left ? x : right ? x + w : x + w / 2;
  const fy = handle === 'bottom' || handle.startsWith('corner') ? h : h / 2;
  return { fx, fy };
}
