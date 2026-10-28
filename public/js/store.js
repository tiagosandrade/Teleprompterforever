// Estado do app: roteiro + ajustes, com padrões, limites e persistência no aparelho (localStorage).
// Nada toca o DOM no carregamento: nos testes do Node, passe `storage` e `kind` para createStore().
import { deviceClass } from './platform.js';
import { snapToStep } from './metrics.js';

export const STORAGE_KEY = 'teleprompter.v1';
const SCHEMA_VERSION = 1;
const SAVE_DELAY_MS = 250;

/** Limites e passos dos ajustes numéricos. Painel, HUD, teclado e "Ajustar na tela" respeitam estes valores. */
export const LIMITS = Object.freeze({
  speed: Object.freeze({ min: 40, max: 320, step: 5 }), // palavras por minuto (ppm)
  fontSize: Object.freeze({ min: 16, max: 160, step: 2 }), // px
  areaWidth: Object.freeze({ min: 0.25, max: 1, step: 0.01 }), // fração da largura útil da tela
  areaHeight: Object.freeze({ min: 0.2, max: 1, step: 0.01 }), // fração da altura útil da tela
});

/** Quanto cada toque nos botões −/+ (e nas teclas de atalho) muda o ajuste. */
export const NUDGE = Object.freeze({ speed: 5, fontSize: 4 });

export const POSITIONS = Object.freeze(['left', 'center', 'right']);
export const COUNTDOWNS = Object.freeze([0, 3, 5]);
const BOOLEANS = ['mirrorX', 'mirrorY', 'guide'];

/** Texto do primeiro uso: ensina os gestos enquanto passa na tela. */
export const SAMPLE_SCRIPT = `Bem-vindo ao Teleprompter.

Toque uma vez em qualquer lugar da tela para pausar. Toque de novo para continuar.

Arraste o dedo para cima para avançar o texto e para baixo para voltar.

Na pausa, os botões de baixo mudam a velocidade. No ícone de ajustes você muda o tamanho da letra, a posição do texto, o tamanho da área de leitura, o espelhamento para vidro de teleprompter e a contagem regressiva.

Para ler o seu roteiro, volte ao editor, apague este texto e cole o seu, importe um arquivo ou abra um roteiro do PC.

Boa gravação!`;

export function defaultSettings(kind = deviceClass()) {
  const tablet = kind === 'tablet';
  return {
    speed: 150,
    fontSize: tablet ? 60 : 36,
    position: 'center',
    // No tablet, uma coluna mais estreita reduz o movimento dos olhos que aparece na câmera.
    areaWidth: tablet ? 0.7 : 1,
    areaHeight: 1,
    mirrorX: false,
    mirrorY: false,
    countdown: 3,
    guide: false,
  };
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

/**
 * Valida e normaliza ajustes vindos de fora (localStorage, painel, teclado).
 * Campo inválido fica com o valor de `base`; números são limitados e arredondados ao passo.
 * Aceita números em texto ("150"), como chegam de um <input>.
 */
export function sanitizeSettings(raw, base) {
  const src = isObject(raw) ? raw : {};
  const out = { ...base };
  for (const [key, limits] of Object.entries(LIMITS)) {
    const value = toNumber(src[key]);
    if (Number.isFinite(value)) out[key] = snapToStep(value, limits);
  }
  if (POSITIONS.includes(src.position)) out.position = src.position;
  const countdown = toNumber(src.countdown);
  if (COUNTDOWNS.includes(countdown)) out.countdown = countdown;
  for (const key of BOOLEANS) {
    if (typeof src[key] === 'boolean') out[key] = src[key];
  }
  return out;
}

function browserStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null; // modo privado antigo ou armazenamento bloqueado: o app funciona sem guardar
  }
}

function read(storage) {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    return isObject(parsed) ? parsed : {};
  } catch {
    return {}; // JSON corrompido: começa do zero
  }
}

/**
 * Cria o estado do app.
 * - `getState()` devolve { script, settings, flags } congelado; nunca altere o objeto, use os setters.
 * - `subscribe(fn)` chama fn(state, changed) a cada mudança; `changed` é um Set com as chaves
 *   alteradas ("speed", "fontSize"... "script", "flag:<nome>").
 * - A gravação no aparelho é adiada em 250 ms e forçada ao esconder/sair da página.
 */
export function createStore({ storage = browserStorage(), kind } = {}) {
  const defaults = Object.freeze(defaultSettings(kind));
  const saved = read(storage);
  let state = Object.freeze({
    script: typeof saved.script === 'string' ? saved.script : SAMPLE_SCRIPT,
    settings: Object.freeze(sanitizeSettings(saved.settings, defaults)),
    flags: Object.freeze(isObject(saved.flags) ? { ...saved.flags } : {}),
  });
  const listeners = new Set();
  let saveTimer = null;

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...state }));
    } catch {
      // Cota cheia ou armazenamento bloqueado: segue funcionando, só não guarda.
    }
  }

  function commit(next, changed) {
    state = Object.freeze(next);
    if (storage) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, SAVE_DELAY_MS);
    }
    for (const listener of listeners) listener(state, changed);
  }

  function setSettings(patch) {
    const next = Object.freeze(sanitizeSettings({ ...state.settings, ...patch }, state.settings));
    const changed = new Set(Object.keys(next).filter((key) => next[key] !== state.settings[key]));
    if (changed.size) commit({ ...state, settings: next }, changed);
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // O iOS pode encerrar a página em segundo plano sem aviso: grava ao sair ou esconder.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return {
    defaults,
    getState: () => state,
    getSettings: () => state.settings,
    getScript: () => state.script,
    getFlag: (name) => state.flags[name],
    setSettings,
    /** Soma `direction` (+1 ou −1) passos de NUDGE ao ajuste ("speed" ou "fontSize"). */
    nudge(key, direction) {
      setSettings({ [key]: state.settings[key] + Math.sign(direction) * NUDGE[key] });
    },
    resetSettings() {
      setSettings(defaults);
    },
    setScript(text) {
      const script = String(text ?? '');
      if (script !== state.script) commit({ ...state, script }, new Set(['script']));
    },
    setFlag(name, value) {
      if (state.flags[name] !== value) {
        commit({ ...state, flags: Object.freeze({ ...state.flags, [name]: value }) }, new Set([`flag:${name}`]));
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush,
  };
}
