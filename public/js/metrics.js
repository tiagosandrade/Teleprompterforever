// Métricas do texto: palavras, duração estimada e velocidade em pixels por segundo.
// Módulo puro (sem DOM): usado pelo editor, pelo teleprompter, pelo servidor e pelos testes.

const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

/** Conta palavras: trechos entre espaços com ao menos uma letra ou número ("e-mail" = 1, "—" = 0). */
export function countWords(text) {
  if (!text) return 0;
  let words = 0;
  for (const token of String(text).split(/\s+/)) {
    if (HAS_WORD_CHAR.test(token)) words++;
  }
  return words;
}

/** Segundos para ler `words` palavras a `wpm` palavras por minuto. */
export function estimateSeconds(words, wpm) {
  // W × 60 ÷ ppm, nesta ordem: (W ÷ ppm) × 60 dá 8000.000000000001 para 20 mil palavras a 150 ppm,
  // e o relógio do HUD (que arredonda para cima) mostraria um segundo a mais.
  return words > 0 && wpm > 0 ? (words * 60) / wpm : 0;
}

/**
 * Pixels por segundo para percorrer `distance` px de texto no ritmo de `wpm` palavras por minuto.
 * Como a conta usa a distância real do texto, o ritmo de leitura não muda quando a fonte ou a
 * largura da área mudam, e o tempo total é sempre words / wpm minutos.
 */
export function pxPerSecond({ wpm, words, distance }) {
  if (!(wpm > 0 && words > 0 && distance > 0)) return 0;
  return (wpm / 60) * (distance / words);
}

/**
 * Duração por extenso: "45 s", "8 min", "8 min 16 s", "1 h 02 min". Arredonda os segundos para cima, como o
 * relógio do HUD: o editor e o teleprompter recém-aberto mostram o mesmo tempo (39,2 s é "40 s" e "−0:40").
 */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.ceil(seconds || 0));
  if (total < 60) return `${total} s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return s > 0 ? `${m} min ${s} s` : `${m} min`;
}

/** Relógio de tempo restante (arredonda para cima): "0:45", "8:16", "1:02:05". */
export function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Número no formato brasileiro: 1240 → "1.240". */
export function formatNumber(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Arredonda para o passo mais próximo (contado a partir de `min`) e limita ao intervalo. */
export function snapToStep(value, { min, max, step }) {
  const snapped = Math.round((value - min) / step) * step + min;
  return clamp(Number(snapped.toFixed(6)), min, max);
}
