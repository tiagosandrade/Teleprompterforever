// Detecção de plataforma e de recursos do navegador.
// Nada roda no carregamento do módulo, então ele também pode ser importado no Node (testes).

const nav = () => (typeof navigator === 'undefined' ? undefined : navigator);
const matches = (query) => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;

/** iPhone, iPod ou iPad. O Safari do iPadOS se apresenta como Mac, mas tem toque. */
export function isIOS() {
  const n = nav();
  if (!n) return false;
  return /iPad|iPhone|iPod/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
}

export function isIPhone() {
  const n = nav();
  return Boolean(n && /iPhone|iPod/.test(n.userAgent));
}

/** Aberto pela Tela de Início (app instalado), sem a barra do navegador. */
export function isStandalone() {
  return matches('(display-mode: standalone)') || matches('(display-mode: fullscreen)') || nav()?.standalone === true;
}

/** "tablet" quando o lado menor da tela tem 600 px ou mais. Serve só para escolher os padrões. */
export function deviceClass() {
  if (typeof screen === 'undefined') return 'phone';
  return Math.min(screen.width, screen.height) >= 600 ? 'tablet' : 'phone';
}

/** A API de tela cheia funciona para elementos comuns? (iPad e Android sim; iPhone não.) */
export function canFullscreen() {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  const api = el.requestFullscreen || el.webkitRequestFullscreen;
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
  return Boolean(api && enabled);
}

export function prefersReducedMotion() {
  return matches('(prefers-reduced-motion: reduce)');
}
