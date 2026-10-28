// Ícones do design system: SVG em linha, grade 24×24, traço de 2 px na cor do texto (currentColor).
// O botão que contém o ícone leva o aria-label; o SVG é decorativo (aria-hidden).
// back, close, computer, fullscreen, fullscreen-exit, import, minus, plus, restart e undo vêm do Lucide e do
// Feather (ISC e MIT): ver THIRD-PARTY-NOTICES.md.

const PATHS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  play: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.4-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" fill="currentColor"/>',
  pause:
    '<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>' +
    '<rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  settings:
    '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/>' +
    '<circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  'fullscreen-exit': '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
  // Seta entrando na bandeja (trazer o arquivo). A seta saindo é o Compartilhar do iOS, citado no aviso do iPhone.
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  trash:
    '<path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3"/>' +
    '<path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/>',
  computer: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'mirror-x': '<path d="M12 3v18"/><path d="M9 7l-6 5 6 5z"/><path d="M15 7l6 5-6 5z"/>',
  'mirror-y': '<path d="M3 12h18"/><path d="M7 9l5-6 5 6z"/><path d="M7 15l5 6 5-6z"/>',
  area: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
};

export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

/** Marcação SVG do ícone `name`, para usar dentro de botões (innerHTML). */
export function icon(name, size = 24) {
  const body = PATHS[name];
  if (!body) throw new Error(`Ícone desconhecido: ${name}`);
  return (
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
  );
}
