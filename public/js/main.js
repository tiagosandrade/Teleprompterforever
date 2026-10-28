// Ponto de entrada: cria o estado e liga editor, teleprompter e painel (contratos na seção 11.2 da especificação).
import { createStore } from './store.js';
import { createEditor } from './editor.js';
import { createPanel } from './panel.js';
import { createPrompter } from './prompter/prompter.js';

const store = createStore();
let prompter;
let editor;

const panel = createPanel({
  root: document.getElementById('panel-root'),
  store,
  onAdjustArea: () => prompter.enterAdjustMode(),
  onOpenChange: (open) => prompter.setPanelOpen(open),
});

prompter = createPrompter({
  root: document.getElementById('prompter-screen'),
  store,
  onExit: () => {
    panel.close();
    prompter.close();
    editor.show();
  },
  onOpenPanel: () => panel.open(),
  onClosePanel: () => panel.close(),
});

editor = createEditor({
  root: document.getElementById('editor-screen'),
  store,
  onStart: () => {
    editor.hide();
    prompter.open();
  },
});

// Pinça do Safari bloqueada no app todo: um zoom feito no editor continuaria valendo no teleprompter.
document.addEventListener('gesturestart', (event) => event.preventDefault());

// Offline só em contexto seguro (HTTPS ou localhost); pela Wi-Fi em HTTP o app funciona sem service worker.
if (window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
