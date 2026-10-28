// Servidor local do teleprompter: arquivos de public/ + API "Roteiros do PC".
// Só módulos nativos do Node. Uso: `npm start`, `node server.mjs` ou duplo clique em "Iniciar Teleprompter.cmd".
// Variáveis: PORT (3210), HOST (0.0.0.0), ROTEIROS_DIR (../Roteiros).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { countWords } from './public/js/metrics.js';
import { markdownToPlain } from './public/js/markdown.js';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(SERVER_DIR, 'public');
const DEFAULT_PORT = 3210;
const PORT_RETRIES = 10;
const ROTEIRO_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}-/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

// Nomes de dispositivo do Windows (CON, NUL, COM1…) apontam para o sistema, não para arquivos.
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** IPv4 de rede privada (10/8, 172.16/12, 192.168/16): os únicos que fazem sentido mostrar para o celular. */
export function isPrivateIPv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Host aceito: localhost, IP literal (o celular abre http://192.168.x.x:3210) ou o nome deste computador.
 * Barra o "DNS rebinding": uma página de fora que aponta o próprio domínio para este IP chegaria aqui
 * com o Host dela e leria a API dos roteiros como se fosse do mesmo site. Um IP literal não dá para redirecionar.
 */
function isAllowedHost(header) {
  const host = String(header ?? '').trim().toLowerCase().replace(/:\d+$/, '');
  if (host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /^\[[\da-f:.]+\]$/.test(host)) return true;
  const name = os.hostname().toLowerCase();
  return host !== '' && (host === name || host === `${name}.local`);
}

/** Endereços IPv4 privados desta máquina, com o nome do adaptador (ex.: "Wi-Fi"). */
function lanAddresses(interfaces) {
  const found = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      const ipv4 = entry.family === 'IPv4' || entry.family === 4;
      if (ipv4 && !entry.internal && isPrivateIPv4(entry.address)) found.push({ name, address: entry.address });
    }
  }
  return found;
}

function send(res, status, body, headers = {}, head = false) {
  const payload = Buffer.from(body);
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Length': payload.length, ...headers });
  res.end(head ? undefined : payload);
}

const sendText = (res, status, text, head, headers = {}) =>
  send(res, status, text, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, head);

const notFound = (res, head) => sendText(res, 404, 'Não encontrado.\n', head);

/** Decodifica %XX sem lançar erro; null se a sequência for inválida. */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Caminho da URL → arquivo dentro de public/, ou null se tentar sair da pasta ou for suspeito. */
function resolvePublicPath(pathname) {
  const decoded = safeDecode(pathname);
  if (decoded === null || decoded.includes('\0') || decoded.includes(':')) return null;
  const segments = decoded.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.') || WINDOWS_DEVICE.test(segment))) return null;
  const relative = segments.length ? segments.join(path.sep) : 'index.html';
  const filePath = path.resolve(PUBLIC_DIR, relative);
  return filePath.startsWith(PUBLIC_DIR + path.sep) ? filePath : null;
}

/** Intervalo pedido no cabeçalho Range. null = ignorar (sintaxe inválida); 'invalid' = 416. */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || start >= size || start > end) return 'invalid';
  return { start, end };
}

async function serveStatic(req, res, pathname, head) {
  const filePath = resolvePublicPath(pathname);
  if (!filePath) return notFound(res, head);

  let real;
  let stat;
  try {
    // realpath: um atalho (symlink) dentro de public/ não pode levar a um arquivo de fora.
    real = await fsp.realpath(filePath);
    const realRoot = await fsp.realpath(PUBLIC_DIR);
    if (!real.startsWith(realRoot + path.sep)) return notFound(res, head);
    stat = await fsp.stat(real);
  } catch {
    return notFound(res, head);
  }
  if (!stat.isFile()) return notFound(res, head);

  const size = stat.size;
  const etag = `W/"${size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    ...BASE_HEADERS,
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
  };

  let status = 200;
  let start = 0;
  let end = size - 1;
  const range = req.headers.range ? parseRange(req.headers.range, size) : null;
  if (range === 'invalid') {
    res.writeHead(416, { ...BASE_HEADERS, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 });
    return res.end();
  }
  if (range) {
    status = 206;
    ({ start, end } = range);
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  } else if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ...BASE_HEADERS, ETag: etag, 'Cache-Control': 'no-cache' });
    return res.end();
  }

  headers['Content-Length'] = size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (head || size === 0) return res.end();

  const stream = fs.createReadStream(real, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

/** Título do roteiro: primeiro "# " do fala.md, sem o prefixo "Fala — ". Sem título: o nome da pasta. */
function titleOf(markdown, id) {
  const line = markdown.replace(/^﻿/, '').split(/\r?\n/).find((text) => /^#[ \t]/.test(text));
  let title = '';
  if (line) {
    let heading = line.slice(1).trim();
    while (heading.endsWith('#')) heading = heading.slice(0, -1); // "# Título #" (fechamento opcional)
    heading = heading.trim().replace(/^Fala[ \t]*(?:[—–-]|:)[ \t]*/i, '');
    title = markdownToPlain(heading).replace(/\s+/g, ' ').trim();
  }
  return title || id.slice(11).replace(/-+/g, ' ').trim() || id;
}

/** Lê Roteiros/AAAA-MM-DD-slug/Roteiro/fala.md. Guarda o resultado por arquivo até ele mudar. */
function createRoteiroCatalog(roteirosDir) {
  const cache = new Map();

  async function describe(id) {
    const file = path.join(roteirosDir, id, 'Roteiro', 'fala.md');
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;
    const hit = cache.get(id);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit;
    try {
      const markdown = await fsp.readFile(file, 'utf8');
      const entry = {
        id,
        file,
        titulo: titleOf(markdown, id),
        data: id.slice(0, 10),
        palavras: countWords(markdownToPlain(markdown)),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      };
      cache.set(id, entry);
      return entry;
    } catch {
      return null;
    }
  }

  async function list() {
    let dirents;
    try {
      dirents = await fsp.readdir(roteirosDir, { withFileTypes: true });
    } catch {
      return []; // pasta não existe ou não pode ser lida: lista vazia
    }
    const ids = dirents.filter((d) => d.isDirectory() && ROTEIRO_DIR_PATTERN.test(d.name)).map((d) => d.name);
    const entries = (await Promise.all(ids.map(describe))).filter(Boolean);
    // Mais novo primeiro: data da pasta; no mesmo dia, o fala.md alterado por último.
    return entries.sort((a, b) => b.data.localeCompare(a.data) || b.mtimeMs - a.mtimeMs || b.id.localeCompare(a.id));
  }

  return { list };
}

async function serveApi(res, pathname, catalog, head) {
  const json = (status, body) =>
    send(res, status, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, head);

  if (pathname === '/api/roteiros' || pathname === '/api/roteiros/') {
    const roteiros = await catalog.list();
    return json(200, { roteiros: roteiros.map(({ id, titulo, data, palavras }) => ({ id, titulo, data, palavras })) });
  }

  const prefix = '/api/roteiros/';
  if (pathname.startsWith(prefix)) {
    // O id só vale se for exatamente o nome de uma pasta da lista: nada vindo da URL vira caminho de arquivo.
    const id = safeDecode(pathname.slice(prefix.length));
    const entry = id ? (await catalog.list()).find((item) => item.id === id) : null;
    if (!entry) return json(404, { erro: 'Roteiro não encontrado.' });
    let markdown;
    try {
      markdown = await fsp.readFile(entry.file);
    } catch {
      return json(404, { erro: 'Roteiro não encontrado.' });
    }
    return send(res, 200, markdown, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' }, head);
  }

  return json(404, { erro: 'Não encontrado.' });
}

function createHandler(catalog) {
  return async function handle(req, res) {
    const head = req.method === 'HEAD';
    if (!isAllowedHost(req.headers.host)) {
      return sendText(res, 421, 'Endereço não permitido. Abra o teleprompter pelo IP do computador, como mostra a janela do servidor.\n', head);
    }
    if (req.method !== 'GET' && !head) {
      return sendText(res, 405, 'Método não permitido.\n', false, { Allow: 'GET, HEAD' });
    }
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return sendText(res, 400, 'Pedido inválido.\n', head);
    }
    try {
      if (pathname === '/api' || pathname.startsWith('/api/')) return await serveApi(res, pathname, catalog, head);
      return await serveStatic(req, res, pathname, head);
    } catch (error) {
      console.error('Erro ao responder', req.url, error);
      if (!res.headersSent) sendText(res, 500, 'Erro interno.\n', head);
      else res.destroy();
    }
  };
}

// Curinga (escuta em todos os endereços deste computador) e loopback. O BlockList compara o IP pelo valor, não
// pela grafia: :: também se escreve ::0 ou 0:0:0:0:0:0:0:0, ::1 é 0:0:0:0:0:0:0:1 e 127.0.0.1 é ::ffff:127.0.0.1.
const ANY_ADDRESS = new net.BlockList();
ANY_ADDRESS.addAddress('0.0.0.0');
ANY_ADDRESS.addAddress('::', 'ipv6');
const LOOPBACK = new net.BlockList();
LOOPBACK.addSubnet('127.0.0.0', 8);
LOOPBACK.addAddress('::1', 'ipv6');

/** O host é um IP da lista, em qualquer grafia? (localhost e nomes de computador não são.) */
function hostIn(list, host) {
  return net.isIP(host) !== 0 && list.check(host, net.isIPv6(host) ? 'ipv6' : 'ipv4');
}

/**
 * Endereços que abrem o app, conforme onde o servidor escuta: [{ url, lan, name }], na ordem do banner.
 * Host curinga: localhost e os IPv4 privados. IP de loopback, localhost ou nome do computador: só ele.
 * Outro IP: só ele (IPv6 entre colchetes). `lan` marca os endereços para o celular (os IPv4 privados do
 * curinga, ou o IP do host quando não é de loopback), com o nome do adaptador em `name` (ex.: "Wi-Fi").
 */
export function serverAddresses(host, port, interfaces = os.networkInterfaces()) {
  if (hostIn(ANY_ADDRESS, host)) {
    const lan = lanAddresses(interfaces).map(({ name, address }) => ({ url: `http://${address}:${port}`, lan: true, name }));
    return [{ url: `http://localhost:${port}`, lan: false }, ...lan];
  }
  const family = net.isIP(host);
  if (!family) return [{ url: `http://${host}:${port}`, lan: false }]; // localhost ou nome do computador
  const url = `http://${family === 6 ? `[${host}]` : host}:${port}`;
  if (hostIn(LOOPBACK, host)) return [{ url, lan: false }];
  const name = Object.keys(interfaces).find((key) => interfaces[key]?.some((entry) => entry.address === host));
  return [{ url, lan: true, name }];
}

const addressLines = (addresses) =>
  addresses.map(({ url, lan, name }) =>
    lan ? `  No celular/tablet:  ${url}${name ? `   (${name})` : ''}` : `  Neste computador:   ${url}`,
  );

function printBanner({ requestedPort, port, addresses, anyHost, roteiros, roteirosDir }) {
  const lines = ['', '  Teleprompter no ar!', ''];
  if (requestedPort !== 0 && port !== requestedPort) {
    lines.push(`  A porta ${requestedPort} estava ocupada; usando a ${port}.`, '');
  }
  lines.push(...addressLines(addresses), '');
  if (addresses.some(({ lan }) => lan)) {
    lines.push('  No celular ou tablet conectado à mesma rede Wi-Fi, abra o endereço "No celular/tablet" no navegador.');
  } else if (anyHost) {
    lines.push('  Nenhuma rede local encontrada: conecte o computador à Wi-Fi para abrir no celular.');
  }
  lines.push(
    roteiros
      ? `  Roteiros do PC: ${roteiros} em ${roteirosDir}`
      : `  Roteiros do PC: nenhum fala.md encontrado em ${roteirosDir}`,
    '  Para parar o servidor, pressione Ctrl+C (ou feche esta janela).',
    '',
  );
  console.log(lines.join('\n'));
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/** Porta da variável PORT (de 1 a 65535); sem ela, ou com valor fora disso, a padrão. */
export function portFromEnv(env = process.env) {
  const value = Number(env.PORT);
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : DEFAULT_PORT;
}

/** Host da variável HOST, sem espaços nas pontas (o `set HOST=… && …` do cmd.exe deixa um); sem ela, 0.0.0.0. */
export function hostFromEnv(env = process.env) {
  return (env.HOST || '').trim() || '0.0.0.0';
}

/**
 * Sobe o servidor. Se a porta estiver ocupada, tenta as `retries` seguintes (port 0 = porta livre qualquer).
 * `requestedPort`: a porta que o usuário pediu, para o aviso "estava ocupada" quando a busca começa depois dela.
 * Devolve { server, port, urls, close() }; urls são os endereços do banner (ver serverAddresses).
 */
export async function startServer({
  port = portFromEnv(),
  requestedPort = port,
  retries = PORT_RETRIES,
  host = hostFromEnv(),
  roteirosDir = process.env.ROTEIROS_DIR ? path.resolve(process.env.ROTEIROS_DIR) : path.resolve(SERVER_DIR, '..', 'Roteiros'),
  quiet = false,
} = {}) {
  const catalog = createRoteiroCatalog(roteirosDir);
  const handler = createHandler(catalog);
  let server;
  let lastError;
  for (let attempt = 0; attempt <= (port === 0 ? 0 : retries) && port + attempt <= 65535; attempt++) {
    server = http.createServer(handler);
    try {
      await listen(server, port === 0 ? 0 : port + attempt, host);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      // EACCES: o Windows às vezes reserva faixas de portas (Hyper-V); vale tentar a próxima.
      if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') throw error;
    }
  }
  if (!server?.listening) throw lastError ?? new RangeError(`Porta fora do intervalo de 0 a 65535: ${port}`);

  const actualPort = server.address().port;
  const addresses = serverAddresses(host, actualPort);
  const urls = addresses.map(({ url }) => `${url}/`);

  if (!quiet) {
    const roteiros = await catalog.list();
    printBanner({ requestedPort, port: actualPort, addresses, anyHost: hostIn(ANY_ADDRESS, host), roteiros: roteiros.length, roteirosDir });
  }

  const close = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });

  return { server, port: actualPort, urls, close };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  const entry = path.resolve(process.argv[1]);
  if (import.meta.url === pathToFileURL(entry).href) return true;
  try {
    // No Windows, maiúsculas/minúsculas do caminho podem vir diferentes conforme o atalho usado.
    const a = fs.realpathSync(entry);
    const b = fs.realpathSync(fileURLToPath(import.meta.url));
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

// Sem ninguém escutando: conexão recusada, ou IPv6 desligado no computador (para o ::1).
const NOBODY_LISTENING = new Set(['ECONNREFUSED', 'EADDRNOTAVAIL', 'ENETUNREACH', 'EHOSTUNREACH', 'EAFNOSUPPORT']);
// Prazo para conectar: o Windows só recusa a conexão ao IP do próprio PC na rede depois de ~2 s.
const PROBE_CONNECT_MS = 3000;
// Prazo para responder, depois de conectar: o teleprompter lento porque o PC está sem memória ainda é ele.
const PROBE_ANSWER_MS = 2500;
// Na pergunta repetida (porta ocupada na hora de subir), o teleprompter acabou de subir ou já foi acordado pela
// busca, e responde em ~50 ms. Com 2,5 s por porta, 11 programas mudos deixariam a janela 30 s sem resposta.
const PROBE_RECHECK_MS = 500;
// O manifesto tem ~1 KB: de um corpo sem fim, a sonda lê só isto.
const PROBE_MAX_BYTES = 64 * 1024;

/** JSON.parse sem lançar erro; null se o texto não for JSON. */
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * O que responde nesta porta: 'teleprompter' (este app), 'free' (ninguém escutando) ou 'busy' (outro programa,
 * ou algo que não conecta em 3 s ou não responde em `answerMs` depois de conectar). Pergunta pelo manifesto.
 */
function probePort(port, target, answerMs = PROBE_ANSWER_MS) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy(); // nenhum socket fica aberto: no "já está rodando" o processo sai sozinho
      resolve(answer);
    };
    const deadline = (ms) => {
      clearTimeout(timer);
      if (!settled) timer = setTimeout(() => finish('busy'), ms);
    };
    const req = http.get({ host: target, port, path: '/manifest.webmanifest', agent: false });
    deadline(PROBE_CONNECT_MS);
    req.on('socket', (socket) => {
      if (socket.connecting) socket.once('connect', () => deadline(answerMs));
      else deadline(answerMs);
    });
    req.on('error', (error) => finish(NOBODY_LISTENING.has(error.code) ? 'free' : 'busy'));
    req.on('close', () => finish('busy')); // a conexão caiu antes do fim do corpo
    req.on('response', (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) return finish('busy');
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > PROBE_MAX_BYTES) return finish('busy');
        chunks.push(chunk);
      });
      res.on('end', () => finish(safeJson(Buffer.concat(chunks).toString())?.name === 'Teleprompter' ? 'teleprompter' : 'busy'));
    });
  });
}

/** Onde perguntar: com o curinga (0.0.0.0, ::…) ou localhost, nos dois "localhost" (127.0.0.1 e ::1); senão, no próprio host. */
function probeTargets(host) {
  return host === 'localhost' || hostIn(ANY_ADDRESS, host) ? ['127.0.0.1', '::1'] : [host]; // no http.get, IPv6 vai sem colchetes
}

/** Uma porta nos endereços de `targets`: teleprompter em algum deles, livre em todos, ou ocupada. */
async function probeAll(port, targets, answerMs) {
  const answers = await Promise.all(targets.map((target) => probePort(port, target, answerMs)));
  if (answers.includes('teleprompter')) return 'teleprompter';
  return answers.every((answer) => answer === 'free') ? 'free' : 'busy';
}

/** A porta pedida e as 10 seguintes, sem passar de 65535. */
function candidatePorts(port) {
  const ports = [];
  for (let candidate = port; candidate <= Math.min(port + PORT_RETRIES, 65535); candidate++) ports.push(candidate);
  return ports;
}

/**
 * Antes de subir: o teleprompter já está rodando (o atalho aberto duas vezes)? Olha a porta pedida e as 10
 * seguintes, de uma vez, porque com a pedida ocupada ele sobe numa delas. Subir outro mudaria o endereço, e no
 * celular outro endereço é outra origem: o texto e os ajustes salvos pareceriam sumir.
 * Devolve { running: porta do que já está rodando } ou { free: portas onde ninguém escuta, em ordem }. Porta em
 * que outro programa escuta só em 127.0.0.1 ou só em [::1] conta como ocupada: o Windows deixaria subir em
 * 0.0.0.0 nela, e "localhost" neste computador abriria o outro programa.
 */
export async function scanPorts(port, host = '0.0.0.0') {
  const targets = probeTargets(host);
  const ports = candidatePorts(port);
  const found = await Promise.all(ports.map((candidate) => probeAll(candidate, targets)));
  const running = ports.find((_, i) => found[i] === 'teleprompter');
  if (running !== undefined) return { running };
  return { free: ports.filter((_, i) => found[i] === 'free') };
}

/**
 * Início pela linha de comando (o atalho): sobe na primeira porta livre da busca, ou avisa que já está rodando.
 * Sem nenhuma livre na busca, tenta a pedida e as 10 seguintes, em ordem. Se a porta estiver ocupada na hora de
 * subir (dois cliques quase juntos no atalho), pergunta de novo quem está nela, com prazo curto: sendo o
 * teleprompter, é o outro clique, e este não sobe. Devolve { running } ou { server }; se nenhuma porta servir,
 * lança o último erro.
 */
export async function launch(port, host = '0.0.0.0', options = {}) {
  const scan = await scanPorts(port, host);
  if (scan.running !== undefined) return { running: scan.running };
  let lastError;
  for (const candidate of scan.free.length ? scan.free : candidatePorts(port)) {
    try {
      return { server: await startServer({ ...options, port: candidate, requestedPort: port, host, retries: 0 }) };
    } catch (error) {
      if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') throw error;
      if ((await probeAll(candidate, probeTargets(host), PROBE_RECHECK_MS)) === 'teleprompter') return { running: candidate };
      lastError = error;
    }
  }
  // Nenhuma porta para tentar: a pedida passa de 65535 ou não é número.
  throw lastError ?? new RangeError(`Porta fora do intervalo de 0 a 65535: ${port}`);
}

if (isMainModule()) {
  try {
    const port = portFromEnv();
    const host = hostFromEnv();
    const result = await launch(port, host);
    if (result.running !== undefined) {
      // Sem process.exit(): no console do Windows a escrita é assíncrona e a mensagem sairia cortada.
      const addresses = serverAddresses(host, result.running);
      console.log(['', '  O teleprompter já está rodando, em outra janela.', '', ...addressLines(addresses), ''].join('\n'));
    } else {
      const running = result.server;
      let stopping = false;
      const shutdown = () => {
        if (stopping) return;
        stopping = true;
        console.log('\n  Servidor encerrado.');
        setTimeout(() => process.exit(0), 1500).unref();
        void running.close().finally(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }
  } catch (error) {
    console.error(`\n  Não foi possível iniciar o servidor: ${error.message}\n`);
    process.exitCode = 1;
  }
}
