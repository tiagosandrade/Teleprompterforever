// Tela sempre acesa (RF-10, seção 12): Screen Wake Lock API e, como reserva, um vídeo invisível tocando.
// O vídeo segue o NoSleep.js: imagem + áudio silencioso, SEM muted e SEM loop (o WebKit não segura a tela
// com mídia muda ou em loop), reiniciado por timeupdate, dentro do documento e iniciado dentro de um toque.
import { NOSLEEP_MP4 } from './nosleep-media.js';
import { isIOS, isStandalone } from '../platform.js';

const RESTART_AFTER_S = 1; // o vídeo tem 2 s: volta ao começo bem antes de terminar

/**
 * `acquire()` e `ensure()` são síncronos: chame-os dentro do gesto do usuário, sem await antes,
 * porque o play() do vídeo com áudio só é aceito durante um toque.
 * `standalone`: aberto pela Tela de Início (medir antes de pedir tela cheia; ver prompter.js).
 */
export function createWakeLock({ container, standalone = isStandalone() }) {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const hasNative = typeof nav?.wakeLock?.request === 'function';
  // No app da Tela de Início do iOS a API nativa só funciona a partir do 18.4: liga o vídeo também.
  const iosStandalone = isIOS() && standalone;
  let wanted = false;
  let sentinel = null;
  let pending = false;
  let nativeFailed = false;
  let video = null;

  const videoNeeded = () => !hasNative || nativeFailed || iosStandalone;

  function videoElement() {
    if (video) return video;
    video = document.createElement('video');
    video.className = 'pr-nosleep';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x-webkit-airplay', 'deny');
    video.setAttribute('disableremoteplayback', '');
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('tabindex', '-1');
    video.preload = 'auto';
    // Fora da tela, mas renderizado e dentro do documento (display: none não segura a tela no iOS).
    Object.assign(video.style, {
      position: 'absolute',
      left: '-100%',
      top: '-100%',
      width: '2px',
      height: '2px',
      pointerEvents: 'none',
    });
    video.addEventListener('timeupdate', () => {
      if (video.currentTime > RESTART_AFTER_S) video.currentTime = Math.random() * 0.5;
    });
    video.addEventListener('ended', () => {
      if (wanted) playVideo();
    });
    video.src = NOSLEEP_MP4;
    container.appendChild(video);
    return video;
  }

  function playVideo() {
    const el = videoElement();
    if (!el.paused && !el.ended) return;
    try {
      el.play()?.catch?.(() => {}); // recusado fora de um gesto: o próximo toque no palco tenta de novo
    } catch {
      // Sem suporte a vídeo: segue sem a reserva.
    }
  }

  function requestNative() {
    if (!hasNative || sentinel || pending) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    pending = true;
    let request;
    try {
      request = nav.wakeLock.request('screen');
    } catch {
      request = Promise.reject(new Error('wake lock indisponível'));
    }
    request.then(
      (lock) => {
        pending = false;
        if (!wanted) {
          lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null; // o sistema solta ao esconder a página; ensure() pede de novo
        });
      },
      () => {
        pending = false;
        nativeFailed = true;
        if (wanted) playVideo(); // fora do gesto pode não valer; o próximo toque no palco garante
      },
    );
  }

  function ensure() {
    if (!wanted) return;
    if (videoNeeded()) playVideo();
    requestNative();
  }

  return {
    /** Liga a tela acesa. Síncrono: chame dentro do toque que abre o teleprompter. */
    acquire() {
      wanted = true;
      ensure();
    },
    /** Religa o que tiver caído (toque no palco, volta ao app). */
    ensure,
    release() {
      wanted = false;
      if (sentinel) {
        const lock = sentinel;
        sentinel = null;
        lock.release().catch(() => {});
      }
      if (video && !video.paused) video.pause();
    },
    /** Para depuração e testes: { native, video }. */
    status: () => ({ native: Boolean(sentinel), video: Boolean(video && !video.paused) }),
  };
}
