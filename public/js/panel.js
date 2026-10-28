// Painel de ajustes (seção 5.3): tudo aplica na hora, sem botão salvar, e reflete as mudanças feitas
// pelo HUD e pelo teclado (os dois lados falam só pelo store).
import { icon } from './icons.js';
import { LIMITS } from './store.js';

const BOTTOM_SHEET_MAX_WIDTH = 600; // celular em pé abaixo disto: folha embaixo
const isSheetEnd = (placement) => placement === 'bottom' || placement === 'top';

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

/** Ícone como elemento: a marcação vem fixa de icons.js. */
function svg(name, size) {
  const template = document.createElement('template');
  template.innerHTML = icon(name, size);
  return template.content.firstElementChild;
}

const percent = (value) => `${Math.round(value * 100)}%`;
const percentText = (value) => `${Math.round(value * 100)} por cento`;

export function createPanel({ root, store, onAdjustArea, onOpenChange }) {
  const ranges = []; // { key, input, output, format, valueText, down, up }
  const radios = []; // { key, input }
  const switches = []; // { key, input }
  let open = false;
  let opener = null;
  let placement = null;

  // ---------- Controles ----------

  function stepButton(key, direction, iconName, label) {
    const button = h('button', {
      class: 'btn btn--icon btn--sm pn-step',
      type: 'button',
      'aria-label': label,
      'data-nudge': key,
      'data-direction': direction,
    }, svg(iconName, 20));
    button.addEventListener('click', () => store.nudge(key, direction));
    return button;
  }

  function slider({ key, id, label, heading = false, format, valueText, title, steps }) {
    const { min, max, step } = LIMITS[key];
    const input = h('input', { id, type: 'range', name: key, min, max, step });
    const output = h('output', { for: id, title });
    const labelNode = h('label', { for: id, text: label, class: heading ? null : 'pn-sublabel' });
    const field = { key, input, output, format, valueText };
    const row = h('div', { class: 'slider__row' });
    if (steps) {
      field.down = stepButton(key, -1, 'minus', steps[0]);
      field.up = stepButton(key, 1, 'plus', steps[1]);
      row.append(field.down, input, field.up);
    } else {
      row.append(input);
    }
    input.addEventListener('input', () => store.setSettings({ [key]: input.valueAsNumber }));
    ranges.push(field);
    return h('div', { class: 'slider' },
      h('div', { class: 'slider__head' }, heading ? h('h3', { class: 'sheet__label' }, labelNode) : labelNode, output),
      row);
  }

  function segmented({ key, label, options }) {
    const labelId = `pn-${key}-label`;
    const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': labelId });
    for (const [value, text] of options) {
      const input = h('input', { type: 'radio', name: key, value });
      input.addEventListener('change', () => {
        if (input.checked) store.setSettings({ [key]: typeof value === 'number' ? value : input.value });
      });
      radios.push({ key, input });
      group.append(h('label', { class: 'seg__opt' }, input, h('span', { text })));
    }
    return h('section', { class: 'sheet__section' }, h('h3', { class: 'sheet__label', id: labelId, text: label }), group);
  }

  function toggle({ key, label, note, iconName }) {
    const input = h('input', { type: 'checkbox', name: key, role: 'switch' });
    input.addEventListener('change', () => store.setSettings({ [key]: input.checked }));
    switches.push({ key, input });
    return h('label', { class: 'switch' },
      iconName ? h('span', { class: 'pn-switch-icon', 'aria-hidden': 'true' }, svg(iconName)) : null,
      h('span', { class: 'switch__text' }, label, h('small', { text: note })),
      input,
      h('span', { class: 'switch__track', 'aria-hidden': 'true' }));
  }

  // ---------- Estrutura ----------

  const title = h('h2', { class: 'sheet__title', id: 'pn-title', tabindex: '-1', text: 'Ajustes' });
  const closeButton = h('button', { class: 'btn btn--icon', type: 'button', 'data-action': 'close-panel', 'aria-label': 'Fechar ajustes' },
    svg('close'));
  const adjustButton = h('button', { class: 'btn btn--secondary pn-wide', type: 'button', 'data-action': 'adjust-area' },
    svg('area'), h('span', { text: 'Ajustar na tela' }));
  const resetButton = h('button', { class: 'btn btn--ghost pn-wide pn-reset', type: 'button', 'data-action': 'reset', text: 'Restaurar padrões' });

  const body = h('div', { class: 'sheet__body' },
    h('section', { class: 'sheet__section' },
      slider({
        key: 'speed', id: 'pn-speed', label: 'Velocidade', heading: true, title: 'palavras por minuto',
        format: (v) => `${v} ppm`, valueText: (v) => `${v} palavras por minuto`,
        steps: ['Diminuir velocidade', 'Aumentar velocidade'],
      })),
    h('section', { class: 'sheet__section' },
      slider({
        key: 'fontSize', id: 'pn-font-size', label: 'Tamanho do texto', heading: true,
        format: (v) => `${v} px`, valueText: (v) => `${v} pixels`,
        steps: ['Diminuir tamanho do texto', 'Aumentar tamanho do texto'],
      })),
    segmented({ key: 'position', label: 'Posição do texto', options: [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']] }),
    h('section', { class: 'sheet__section' },
      h('h3', { class: 'sheet__label', text: 'Área do texto' }),
      slider({ key: 'areaWidth', id: 'pn-area-width', label: 'Largura', format: percent, valueText: percentText }),
      slider({ key: 'areaHeight', id: 'pn-area-height', label: 'Altura', format: percent, valueText: percentText }),
      adjustButton),
    h('section', { class: 'sheet__section' },
      h('h3', { class: 'sheet__label', text: 'Espelhamento' }),
      toggle({ key: 'mirrorX', label: 'Espelhar horizontalmente', note: 'Para vidro de teleprompter', iconName: 'mirror-x' }),
      // Espaço inseparável em "para baixo": numa folha estreita "baixo" não fica sozinho na segunda linha.
      toggle({ key: 'mirrorY', label: 'Inverter verticalmente', note: 'Para aparelho de cabeça para baixo', iconName: 'mirror-y' })),
    segmented({ key: 'countdown', label: 'Contagem regressiva', options: [[0, 'Desligada'], [3, '3 s'], [5, '5 s']] }),
    h('section', { class: 'sheet__section' },
      toggle({ key: 'guide', label: 'Guia de leitura', note: 'Marca a linha de leitura' })),
    h('section', { class: 'sheet__section' }, resetButton),
  );

  const sheet = h('aside', { class: 'sheet pn', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'pn-title' },
    h('header', { class: 'sheet__header' }, title, closeButton),
    body);
  root.append(sheet);

  // ---------- Estado → controles ----------

  function render(settings, changed) {
    const touches = (key) => !changed || changed.has(key);
    for (const field of ranges) {
      if (!touches(field.key)) continue;
      const value = settings[field.key];
      const { min, max } = LIMITS[field.key];
      // Só escreve no campo se mudou: reescrever durante o arrasto atrapalha o dedo no iOS.
      if (field.input.valueAsNumber !== value) field.input.value = String(value);
      field.input.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
      field.input.setAttribute('aria-valuetext', field.valueText(value));
      field.output.textContent = field.format(value);
      if (field.down) {
        field.down.disabled = value <= min;
        field.up.disabled = value >= max;
      }
    }
    for (const { key, input } of radios) {
      if (touches(key)) input.checked = input.value === String(settings[key]);
    }
    for (const { key, input } of switches) {
      if (touches(key)) input.checked = Boolean(settings[key]);
    }
    if (touches('position') || touches('mirrorX') || touches('mirrorY')) place();
  }

  // ---------- Posição na tela ----------

  /**
   * Celular em pé: embaixo; com inversão vertical, em cima (a linha de leitura vai para 70% da altura e a
   * folha de baixo a esconderia). Senão, do lado oposto ao da área na tela física (o espelho inverte o lado).
   */
  function computePlacement() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const { position, mirrorX, mirrorY } = store.getSettings();
    if (width < BOTTOM_SHEET_MAX_WIDTH && height >= width) return mirrorY ? 'top' : 'bottom';
    let visual = position;
    if (mirrorX && position !== 'center') visual = position === 'left' ? 'right' : 'left';
    return visual === 'right' ? 'left' : 'right';
  }

  function place() {
    const next = computePlacement();
    // Aberta, a folha não troca de ponta (embaixo ↔ em cima, ao inverter): pularia sob o dedo, e o toque seguinte
    // no mesmo lugar cairia em outro controle, como "Restaurar padrões". A ponta nova vale na próxima abertura.
    if (next === placement || (open && isSheetEnd(next) && isSheetEnd(placement))) return;
    const animate = open && placement !== null;
    placement = next;
    // Fechado, a troca de lado não pode virar animação: a próxima entrada tem de vir do lado certo.
    if (!animate) sheet.style.transition = 'none';
    sheet.classList.toggle('sheet--bottom', next === 'bottom');
    sheet.classList.toggle('sheet--top', next === 'top');
    sheet.classList.toggle('sheet--side', next === 'left' || next === 'right');
    sheet.classList.toggle('sheet--left', next === 'left');
    sheet.classList.toggle('sheet--right', next === 'right');
    sheet.dataset.placement = next;
    if (!animate) {
      sheet.getBoundingClientRect();
      sheet.style.transition = '';
    }
  }

  // ---------- Abrir e fechar ----------

  function openPanel() {
    if (open) return;
    const active = document.activeElement;
    opener = active instanceof HTMLElement && active !== document.body && !sheet.contains(active) ? active : null;
    place();
    open = true;
    sheet.getBoundingClientRect(); // estado fechado aplicado antes da transição de entrada
    sheet.classList.add('is-open');
    title.focus({ preventScroll: true });
    onOpenChange?.(true);
  }

  function closePanel() {
    if (!open) return;
    open = false;
    const hadFocus = sheet.contains(document.activeElement);
    sheet.classList.remove('is-open');
    if (hadFocus) document.activeElement.blur();
    onOpenChange?.(false);
    const target = opener;
    opener = null;
    if (hadFocus && target) {
      // No próximo quadro o HUD já voltou a ficar visível e pode receber o foco.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!open && target.isConnected && (!active || active === document.body)) target.focus({ preventScroll: true });
      });
    }
  }

  closeButton.addEventListener('click', closePanel);
  adjustButton.addEventListener('click', () => {
    closePanel();
    onAdjustArea?.();
  });
  resetButton.addEventListener('click', () => store.resetSettings());

  // Esc fecha o painel antes de qualquer outro atalho: na captura da janela, e não segue adiante
  // (senão o teleprompter receberia o mesmo Esc com o painel já fechado e voltaria ao editor).
  window.addEventListener('keydown', (event) => {
    if (!open || (event.key !== 'Escape' && event.key !== 'Esc')) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) closePanel();
  }, true);

  window.addEventListener('resize', place);
  window.addEventListener('orientationchange', place);

  store.subscribe((state, changed) => render(state.settings, changed));
  render(store.getSettings(), null);

  return {
    open: openPanel,
    close: closePanel,
    isOpen: () => open,
  };
}
