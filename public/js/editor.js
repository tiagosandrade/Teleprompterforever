// Editor (tela inicial): colar, digitar ou importar o roteiro; abre o teleprompter (RF-07, RF-08, seção 5.1).
import { icon } from './icons.js';
import { countWords, estimateSeconds, formatDuration, formatNumber } from './metrics.js';
import { isIPhone, isStandalone } from './platform.js';
import { markdownToPlain } from './markdown.js';
import { fetchRoteiro, fetchRoteiros } from './roteiros.js';

const TOAST_MS = 6000;
const DIALOG_EXIT_MS = 360; // um pouco mais que --dur-slow, para a saída terminar antes de remover
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const KEYBOARD_MIN_PX = 80;
const IOS_HINT = 'Para tela cheia no iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
const LOAD_ERROR = 'Não foi possível carregar os roteiros do PC.';

/** Cria um elemento. `text` vira textContent (nunca HTML); null/false nos atributos e filhos são ignorados. */
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  node.append(...children.filter((child) => child != null && child !== false));
  return node;
}

/** Ícone como elemento: a marcação vem fixa de icons.js, nunca de texto do usuário. */
function svg(name, size) {
  const template = document.createElement('template');
  template.innerHTML = icon(name, size);
  return template.content.firstElementChild;
}

const wordsLabel = (count) => `${formatNumber(count)} ${count === 1 ? 'palavra' : 'palavras'}`;

const isMarkdownFile = (file) => /\.(md|markdown)$/i.test(file.name) || file.type === 'text/markdown';

/** Lê o arquivo como UTF-8; arquivos antigos do Bloco de Notas (UTF-16 ou ANSI) também funcionam. */
async function readTextFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Arquivo grande demais');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(bytes);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(bytes);
  else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
    }
  }
  if (text.includes('\u0000')) throw new Error('Arquivo binário');
  return text.replace(/^﻿/, '');
}

export function createEditor({ root, store, onStart }) {
  const dialogRoot = document.getElementById('dialog-root') ?? document.body;
  let visible = !root.hidden;
  let toastTimer = 0;
  let dialog = null; // { node, body, busy }
  let checking = null;

  // ---------- Estrutura ----------

  const headerButton = (action, iconName, label, ariaLabel) =>
    h('button', { class: 'btn btn--ghost', type: 'button', 'data-action': action, 'aria-label': ariaLabel },
      svg(iconName), h('span', { class: 'btn__label', text: label }));

  const roteirosButton = headerButton('roteiros', 'computer', 'Roteiros do PC', 'Roteiros do PC');
  roteirosButton.hidden = true;
  roteirosButton.setAttribute('aria-haspopup', 'dialog');
  const importButton = headerButton('import', 'import', 'Importar', 'Importar arquivo');
  const clearButton = headerButton('clear', 'trash', 'Limpar', 'Limpar texto');

  const textarea = h('textarea', {
    class: 'ed-text',
    name: 'script',
    id: 'ed-script',
    'aria-label': 'Roteiro',
    'aria-describedby': 'ed-stats',
    placeholder: 'Cole ou digite seu roteiro aqui…',
    spellcheck: 'false',
    autocomplete: 'off',
  });

  const dismissButton = h('button', { class: 'btn btn--ghost', type: 'button', 'data-action': 'dismiss-hint', text: 'Entendi' });
  const hint = h('div', { class: 'ed-hint', hidden: true },
    h('div', { class: 'ed-col' }, h('div', { class: 'banner', role: 'note' }, h('p', { text: IOS_HINT }), dismissButton)));

  const stats = h('p', { class: 'ed-stats', id: 'ed-stats' });
  const startButton = h('button', { class: 'btn btn--primary ed-start', type: 'button', 'data-action': 'start', text: 'Abrir teleprompter' });
  const toast = h('div', { class: 'toast toast--hidden ed-toast', role: 'status', 'aria-live': 'polite' });

  const fileInput = h('input', {
    class: 'ed-file',
    type: 'file',
    accept: '.txt,.md,.markdown,text/plain,text/markdown',
    tabindex: '-1',
    'aria-hidden': 'true',
  });

  root.classList.add('ed');
  root.replaceChildren(
    h('header', { class: 'ed-header' },
      h('div', { class: 'ed-col ed-header__bar' },
        h('h1', { class: 'ed-brand', text: 'Teleprompter' }),
        h('div', { class: 'ed-actions' }, roteirosButton, importButton, clearButton))),
    h('div', { class: 'ed-main' }, textarea),
    // Âncora de altura zero: o aviso rápido flutua logo acima do aviso do iPhone ou do rodapé, sem cobri-los.
    h('div', { class: 'ed-toast-anchor' }, toast),
    hint,
    h('footer', { class: 'ed-footer' }, h('div', { class: 'ed-col ed-footer__bar' }, stats, startButton)),
    fileInput,
  );

  // ---------- Estado → tela ----------

  function renderStats() {
    const script = store.getScript();
    const words = countWords(script);
    if (words === 0) {
      stats.textContent = 'Nenhum texto ainda';
    } else {
      const { speed } = store.getSettings();
      // Texto curtíssimo (0,4 s) não aparece como "0 s".
      const seconds = Math.max(1, estimateSeconds(words, speed));
      stats.replaceChildren(
        `${wordsLabel(words)} · ${formatDuration(seconds)} a ${speed} `,
        h('abbr', { title: 'palavras por minuto', text: 'ppm' }),
      );
    }
    startButton.disabled = words === 0;
    clearButton.disabled = script === '';
  }

  function syncText() {
    const script = store.getScript();
    if (textarea.value !== script) textarea.value = script;
  }

  function updateHint() {
    hint.hidden = !(isIPhone() && !isStandalone() && !store.getFlag('iosHintDismissed'));
  }

  /** Mostra "Roteiros do PC" só se a API respondeu com pelo menos um roteiro. */
  function checkRoteiros() {
    if (!checking) {
      checking = fetchRoteiros()
        .then((list) => {
          roteirosButton.hidden = !(list && list.length > 0);
        })
        .finally(() => {
          checking = null;
        });
    }
    return checking;
  }

  store.subscribe((state, changed) => {
    if (changed.has('script')) syncText();
    if (changed.has('script') || changed.has('speed')) renderStats();
  });

  // ---------- Aviso rápido ----------

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = 0;
    toast.classList.add('toast--hidden');
  }

  function showToast(message, onUndo) {
    clearTimeout(toastTimer);
    const parts = [h('span', { text: message })];
    if (onUndo) {
      const undo = h('button', { class: 'btn btn--ghost toast__action', type: 'button', 'data-action': 'undo' },
        svg('undo', 18), h('span', { text: 'Desfazer' }));
      undo.addEventListener('click', () => {
        hideToast();
        onUndo();
      });
      parts.push(undo);
    }
    toast.replaceChildren(...parts);
    toast.classList.remove('toast--hidden');
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  /** Troca o texto inteiro (arquivo ou roteiro do PC), com "Desfazer". */
  function replaceScript(text, message) {
    const previous = store.getScript();
    store.setScript(text);
    textarea.scrollTop = 0;
    showToast(message, previous === text ? null : () => store.setScript(previous));
  }

  // ---------- Ações ----------

  function start() {
    if (!visible || dialog || countWords(store.getScript()) === 0) return;
    hideToast();
    onStart(); // dentro do gesto do usuário: o teleprompter pede tela cheia e tela acesa aqui
  }

  textarea.addEventListener('input', () => {
    hideToast();
    store.setScript(textarea.value);
  });

  startButton.addEventListener('click', start);

  clearButton.addEventListener('click', () => {
    const previous = store.getScript();
    if (!previous) return;
    store.setScript('');
    showToast('Texto apagado', () => store.setScript(previous));
  });

  importButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    let script;
    try {
      const text = await readTextFile(file);
      script = isMarkdownFile(file) ? markdownToPlain(text) : text.replace(/\r\n?/g, '\n').trim();
    } catch {
      showToast('Não foi possível ler o arquivo.');
      return;
    }
    if (countWords(script) === 0) showToast('O arquivo está vazio.');
    else replaceScript(script, 'Arquivo importado');
  });

  dismissButton.addEventListener('click', () => {
    store.setFlag('iosHintDismissed', true);
    updateHint();
  });

  // ---------- Diálogo "Roteiros do PC" ----------

  function showStatus(text, { error = false } = {}) {
    if (!dialog) return;
    const status = h('div', { class: `ed-dialog-status${error ? ' ed-dialog-status--error' : ''}`, role: error ? 'alert' : 'status' },
      h('p', { text }));
    if (error) {
      const retry = h('button', { class: 'btn btn--secondary', type: 'button', text: 'Tentar de novo' });
      retry.addEventListener('click', loadList);
      status.append(retry);
    }
    dialog.body.replaceChildren(status);
  }

  async function loadList() {
    const current = dialog;
    if (!current) return;
    showStatus('Carregando…');
    const list = await fetchRoteiros();
    if (dialog !== current) return; // fechado enquanto carregava
    if (!list) {
      showStatus(LOAD_ERROR, { error: true });
      return;
    }
    roteirosButton.hidden = list.length === 0;
    if (list.length === 0) {
      showStatus('Nenhum roteiro encontrado.');
      return;
    }
    const items = list.map((item) => {
      const button = h('button', { class: 'list__item', type: 'button' },
        h('span', { class: 'list__title', text: item.titulo }),
        h('span', { class: 'list__meta', text: `${item.data} · ${wordsLabel(item.palavras)}` }));
      button.addEventListener('click', () => pick(item, button));
      return h('li', {}, button);
    });
    current.body.replaceChildren(h('ul', { class: 'list' }, ...items));
  }

  async function pick(item, button) {
    const current = dialog;
    if (!current || current.busy) return;
    current.busy = true;
    for (const other of current.body.querySelectorAll('.list__item')) other.disabled = true;
    button.setAttribute('aria-busy', 'true');
    let markdown = null;
    try {
      markdown = await fetchRoteiro(item.id);
    } catch {
      markdown = null;
    }
    if (dialog !== current) return;
    current.busy = false;
    if (markdown == null) {
      showStatus(LOAD_ERROR, { error: true });
      return;
    }
    closeDialog();
    replaceScript(markdownToPlain(markdown), 'Roteiro carregado');
  }

  function openDialog() {
    if (dialog) return;
    hideToast();
    const title = h('h2', { class: 'sheet__title', id: 'ed-roteiros-title', tabindex: '-1', text: 'Roteiros do PC' });
    const close = h('button', { class: 'btn btn--icon', type: 'button', 'data-action': 'close-dialog', 'aria-label': 'Fechar' }, svg('close'));
    const body = h('div', { class: 'dialog__body' });
    const node = h('div', { class: 'dialog ed-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ed-roteiros-title' },
      h('div', { class: 'dialog__scrim', 'data-action': 'close-dialog' }),
      h('div', { class: 'dialog__box' }, h('header', { class: 'sheet__header' }, title, close), body));
    node.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-action="close-dialog"]')) closeDialog();
    });
    dialog = { node, body, busy: false };
    dialogRoot.append(node);
    root.inert = true; // o editor atrás não recebe foco nem toque
    node.getBoundingClientRect(); // aplica o estado inicial antes da transição de entrada
    node.classList.add('is-open');
    title.focus({ preventScroll: true });
    void loadList();
  }

  function closeDialog({ restoreFocus = true } = {}) {
    if (!dialog) return;
    const { node } = dialog;
    dialog = null;
    root.inert = false;
    node.classList.remove('is-open');
    setTimeout(() => node.remove(), DIALOG_EXIT_MS);
    if (restoreFocus && !roteirosButton.hidden) roteirosButton.focus({ preventScroll: true });
  }

  /** Foco preso no diálogo: Tab e Shift+Tab circulam entre os botões dele. */
  function trapFocus(event) {
    const buttons = [...dialog.node.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) {
      event.preventDefault();
      return;
    }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    const inside = buttons.includes(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      if (!inside && active?.id === 'ed-roteiros-title') return; // do título, Tab segue para o primeiro botão
      event.preventDefault();
      first.focus();
    }
  }

  roteirosButton.addEventListener('click', openDialog);

  document.addEventListener('keydown', (event) => {
    if (!visible || event.defaultPrevented || event.isComposing) return;
    if (dialog) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      } else if (event.key === 'Tab') {
        trapFocus(event);
      }
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.repeat) {
      event.preventDefault();
      start();
    }
  });

  // ---------- Teclado virtual (iOS e Android): o rodapé fica acima dele ----------

  const viewport = window.visualViewport;
  function syncKeyboard() {
    const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
    const open = visible && document.activeElement === textarea && covered >= KEYBOARD_MIN_PX;
    root.style.setProperty('--ed-keyboard', open ? `${covered}px` : '0px');
    root.classList.toggle('ed--keyboard', open);
  }
  if (viewport) {
    viewport.addEventListener('resize', syncKeyboard);
    viewport.addEventListener('scroll', syncKeyboard);
    textarea.addEventListener('focus', syncKeyboard);
    textarea.addEventListener('blur', syncKeyboard);
  }

  // ---------- Início ----------

  syncText();
  renderStats();
  updateHint();
  void checkRoteiros();

  return {
    show() {
      root.hidden = false;
      visible = true;
      syncText();
      renderStats();
      updateHint();
      void checkRoteiros();
    },
    hide() {
      closeDialog({ restoreFocus: false });
      hideToast();
      if (root.contains(document.activeElement)) document.activeElement.blur();
      visible = false;
      root.hidden = true;
      if (viewport) syncKeyboard();
    },
  };
}
