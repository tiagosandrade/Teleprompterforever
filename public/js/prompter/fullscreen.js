// Tela cheia: API padrão ou com prefixo webkit (iPad). O iPhone não tem a API para páginas.
// Os pedidos são síncronos para valer dentro do toque do usuário; falhas são ignoradas.

const doc = () => (typeof document === 'undefined' ? null : document);

export function fullscreenElement() {
  const d = doc();
  return d ? d.fullscreenElement || d.webkitFullscreenElement || null : null;
}

export function isFullscreen() {
  return Boolean(fullscreenElement());
}

export function enterFullscreen() {
  const d = doc();
  if (!d || isFullscreen()) return;
  const el = d.documentElement;
  try {
    if (el.requestFullscreen) {
      const result = el.requestFullscreen({ navigationUI: 'hide' });
      result?.catch?.(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } catch {
    // Sem permissão ou sem suporte: o teleprompter segue sem tela cheia.
  }
}

export function exitFullscreen() {
  const d = doc();
  if (!d || !isFullscreen()) return;
  try {
    if (d.exitFullscreen) {
      const result = d.exitFullscreen();
      result?.catch?.(() => {});
    } else if (d.webkitExitFullscreen) {
      d.webkitExitFullscreen();
    }
  } catch {
    // Já saiu (ex.: o usuário apertou "voltar" no Android).
  }
}

export function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}

/** Chama `listener` quando entra ou sai da tela cheia. Devolve a função que desliga. */
export function onFullscreenChange(listener) {
  const d = doc();
  if (!d) return () => {};
  d.addEventListener('fullscreenchange', listener);
  d.addEventListener('webkitfullscreenchange', listener);
  return () => {
    d.removeEventListener('fullscreenchange', listener);
    d.removeEventListener('webkitfullscreenchange', listener);
  };
}
