// Atalhos de teclado e de controles Bluetooth de virar página (seção 7 da especificação).

const KEY_ACTIONS = {
  ' ': 'toggle',
  Spacebar: 'toggle',
  Enter: 'toggle',
  ArrowUp: 'speed-up',
  ArrowDown: 'speed-down',
  ArrowLeft: 'back',
  PageUp: 'back',
  ArrowRight: 'forward',
  PageDown: 'forward',
  '+': 'font-up',
  '=': 'font-up',
  '-': 'font-down',
  _: 'font-down',
  Home: 'restart',
  m: 'mirror',
  M: 'mirror',
  Escape: 'escape',
  Esc: 'escape',
};

/** Ações que não se repetem com a tecla segurada (segurar Espaço não pode ficar alternando). */
const NO_REPEAT = new Set(['toggle', 'restart', 'mirror', 'escape']);

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

/** Ação do teleprompter para a tecla, ou null. Com Ctrl, ⌘ ou Alt fica com o navegador (zoom, recarregar...). */
export function keyAction(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return KEY_ACTIONS[event.key] ?? null;
}

export function isRepeatable(action) {
  return !NO_REPEAT.has(action);
}

/** Campo de digitação: ali as teclas são do texto, não do teleprompter. */
export function isTextField(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String(target.type || 'text').toLowerCase());
  return false;
}
