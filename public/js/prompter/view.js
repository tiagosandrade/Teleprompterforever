// Estrutura do teleprompter. Só marcação fixa e ícones aqui: o roteiro entra depois, por textContent.
//
// moldura (física, nunca espelha)
//   └ palco (scale(mx, my): espelho)
//       ├ área (--area-x/--area-w/--area-h): guia, texto, esmaecimentos, contagem, alças
//       └ aviso do teclado (centralizado no palco: numa área estreita o texto não caberia)
// HUD e barra de ajuste ficam FORA do palco: são tocados olhando direto para a tela.
import { icon } from '../icons.js';
import { HANDLES } from './layout.js';

const MINUS = '−';

const TEMPLATE = `
<div class="pr-frame">
  <div class="pr-stage">
    <div class="pr-area">
      <div class="pr-guide" aria-hidden="true">
        <span class="pr-guide__line"></span>
        <span class="pr-guide__mark pr-guide__mark--start"></span>
        <span class="pr-guide__mark pr-guide__mark--end"></span>
      </div>
      <div class="pr-viewport"><div class="pr-text"></div></div>
      <div class="pr-fade pr-fade--top" aria-hidden="true"></div>
      <div class="pr-fade pr-fade--bottom" aria-hidden="true"></div>
      <div class="pr-countdown" aria-hidden="true"></div>
      <div class="pr-outline" aria-hidden="true"></div>
      ${HANDLES.map((name) => `<div class="pr-handle" data-handle="${name}" aria-hidden="true"></div>`).join('')}
    </div>
    <div class="toast pr-toast" role="status" aria-live="polite"></div>
  </div>
</div>
<div class="pr-hud">
  <div class="pr-top">
    <button class="btn btn--icon btn--glass" type="button" data-action="exit" aria-label="Voltar ao texto">${icon('back')}</button>
    <div class="pr-time" role="group" aria-label="Tempo restante">
      <span class="pr-time__label">${MINUS}0:00</span>
      <span class="pr-time__bar" aria-hidden="true"><span class="pr-time__fill"></span></span>
    </div>
    <div class="pr-top__end">
      <button class="btn btn--icon btn--glass" type="button" data-action="fullscreen" aria-label="Tela cheia">${icon('fullscreen')}</button>
      <button class="btn btn--icon btn--glass" type="button" data-action="settings" aria-label="Ajustes">${icon('settings')}</button>
    </div>
  </div>
  <p class="pr-empty">Nenhum texto. Volte e cole seu roteiro.</p>
  <div class="pr-bottom">
    <p class="pr-hint"></p>
    <div class="pill pr-pill">
      <button class="btn btn--icon pr-restart" type="button" data-action="restart" aria-label="Recomeçar do início">${icon('restart')}</button>
      <span class="pill__sep" aria-hidden="true"></span>
      <button class="btn btn--icon" type="button" data-action="speed-down" aria-label="Diminuir velocidade">${icon('minus')}</button>
      <span class="pill__value"><b class="pr-speed">150</b><small title="palavras por minuto">ppm</small></span>
      <button class="btn btn--icon" type="button" data-action="speed-up" aria-label="Aumentar velocidade">${icon('plus')}</button>
      <span class="pill__sep pr-font-group" aria-hidden="true"></span>
      <button class="btn btn--icon pr-font-btn pr-font-group" type="button" data-action="font-down" aria-label="Diminuir texto"><span class="pr-a pr-a--sm" aria-hidden="true">A<small>${MINUS}</small></span></button>
      <button class="btn btn--icon pr-font-btn pr-font-group" type="button" data-action="font-up" aria-label="Aumentar texto"><span class="pr-a pr-a--lg" aria-hidden="true">A<small>+</small></span></button>
      <span class="pill__sep" aria-hidden="true"></span>
      <button class="btn btn--icon pr-play" type="button" data-action="toggle" aria-label="Reproduzir">${icon('play')}</button>
    </div>
  </div>
</div>
<div class="pill pr-adjustbar" role="toolbar" aria-label="Ajustar área do texto">
  <span class="pr-adjustbar__measure"><span class="pr-adjustbar__w"></span><span class="pr-adjustbar__dot"> · </span><span class="pr-adjustbar__h"></span></span>
  <div class="seg pr-seg" role="radiogroup" aria-label="Posição do texto">
    <label class="seg__opt"><input type="radio" name="adjust-position" value="left"><span>Esquerda</span></label>
    <label class="seg__opt"><input type="radio" name="adjust-position" value="center"><span>Centro</span></label>
    <label class="seg__opt"><input type="radio" name="adjust-position" value="right"><span>Direita</span></label>
  </div>
  <button class="btn btn--primary pr-done" type="button" data-action="adjust-done">${icon('check', 20)}<span>Concluir</span></button>
</div>
<p class="pr-sr" role="status" aria-live="polite"></p>
`;

/** Monta a estrutura dentro de `root` e devolve as referências usadas pelo motor. */
export function buildView(root) {
  root.innerHTML = TEMPLATE;
  const $ = (selector) => root.querySelector(selector);
  const action = (name) => root.querySelector(`[data-action="${name}"]`);
  return {
    frame: $('.pr-frame'),
    stage: $('.pr-stage'),
    area: $('.pr-area'),
    text: $('.pr-text'),
    countdown: $('.pr-countdown'),
    toast: $('.pr-toast'),
    hud: $('.pr-hud'),
    hint: $('.pr-hint'),
    timeLabel: $('.pr-time__label'),
    timeFill: $('.pr-time__fill'),
    speed: $('.pr-speed'),
    pill: $('.pr-pill'),
    status: $('.pr-sr'),
    adjustBar: $('.pr-adjustbar'),
    measureWidth: $('.pr-adjustbar__w'),
    measureHeight: $('.pr-adjustbar__h'),
    positions: [...root.querySelectorAll('input[name="adjust-position"]')],
    done: action('adjust-done'),
    handles: [...root.querySelectorAll('[data-handle]')],
    buttons: Object.fromEntries(
      ['exit', 'fullscreen', 'settings', 'restart', 'speed-down', 'speed-up', 'font-down', 'font-up', 'toggle'].map(
        (name) => [name, action(name)],
      ),
    ),
  };
}
