// Toque e arrasto em qualquer ponto do teleprompter, com Pointer Events (dedo, mouse e caneta).
import { TAP_MAX_MS, TAP_SLOP_PX } from './layout.js';

// Toques que começam num controle ficam com o controle (o botão recebe o clique; o palco não pausa).
const CONTROL_SELECTOR = 'button, input, select, textarea, label, a[href], .pill, .seg, [data-handle]';

/**
 * Toque = um só ponteiro, até 10 px de movimento, solto em menos de 500 ms. Mais que isso é arrasto.
 * handlers: enabled() → boolean; onTap(); onDragStart() → false recusa o arrasto;
 *           onDragMove(deltaY na tela física); onDragEnd().
 */
export function trackGestures(root, { enabled, onTap, onDragStart, onDragMove, onDragEnd }) {
  let gesture = null;

  function finish(notify) {
    const current = gesture;
    gesture = null;
    if (current?.dragging && notify) onDragEnd();
    return current;
  }

  function onDown(event) {
    if (!enabled()) return;
    if (gesture) {
      if (event.pointerId !== gesture.id) gesture.multi = true; // segundo dedo: não é toque
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(CONTROL_SELECTOR)) return;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      moved: false,
      multi: false,
      dragging: false,
    };
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      // Ponteiro já solto: segue sem captura.
    }
  }

  function onMove(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dy = event.clientY - gesture.y;
    if (!gesture.moved) {
      if (Math.abs(event.clientX - gesture.x) <= TAP_SLOP_PX && Math.abs(dy) <= TAP_SLOP_PX) return;
      gesture.moved = true;
      gesture.dragging = onDragStart() !== false;
    }
    if (gesture.dragging) onDragMove(dy);
  }

  function onUp(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const current = finish(true);
    if (!current.moved && !current.multi && performance.now() - current.time < TAP_MAX_MS) onTap();
  }

  function onCancel(event) {
    if (gesture && event.pointerId === gesture.id) finish(true);
  }

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onCancel);

  return {
    /** Esquece o gesto em andamento sem avisar ninguém (ao fechar ou esconder a página). */
    reset: () => finish(false),
    isDragging: () => Boolean(gesture?.dragging),
  };
}
