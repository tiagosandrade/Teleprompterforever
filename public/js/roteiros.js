// Cliente da API "Roteiros do PC" do servidor local (server.mjs).
// URLs relativas: se o app for hospedado em outro lugar, a API não responde e o botão não aparece.

const TIMEOUT_MS = 4000;

async function request(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

const isItem = (item) =>
  Boolean(item) &&
  typeof item.id === 'string' &&
  item.id !== '' &&
  typeof item.titulo === 'string' &&
  typeof item.data === 'string' &&
  Number.isFinite(item.palavras);

/**
 * Lista dos roteiros do PC, mais novo primeiro: [{ id, titulo, data, palavras }].
 * Devolve null quando a API não existe ou não respondeu (rede, tempo esgotado, resposta inválida).
 */
export async function fetchRoteiros() {
  try {
    const response = await request('api/roteiros');
    const body = await response.json();
    if (!body || !Array.isArray(body.roteiros)) return null;
    return body.roteiros.filter(isItem);
  } catch {
    return null;
  }
}

/** Conteúdo (Markdown) do fala.md do roteiro `id`. Lança erro se não conseguir carregar. */
export async function fetchRoteiro(id) {
  const response = await request(`api/roteiros/${encodeURIComponent(id)}`);
  return response.text();
}
