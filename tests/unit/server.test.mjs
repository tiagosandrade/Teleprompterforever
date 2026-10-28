import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startServer, isPrivateIPv4, portFromEnv, hostFromEnv, scanPorts, launch, serverAddresses } from '../../server.mjs';
import { countWords } from '../../public/js/metrics.js';
import { markdownToPlain } from '../../public/js/markdown.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// IPv4 deste computador na rede (Wi-Fi ou cabo), para os testes com HOST = esse IP.
const LAN_IP = Object.values(os.networkInterfaces())
  .flat()
  .find((entry) => (entry.family === 'IPv4' || entry.family === 4) && !entry.internal && isPrivateIPv4(entry.address))?.address;

const FIXTURES = {
  '2026-10-25-video-teste': '# Fala — Vídeo de teste: luz e câmera\n\nUma gravação de teste completa.\n\nE deu **certo**.\n',
  '2026-09-01-antigo': '# Fala: Roteiro antigo\n\nTexto antigo.\n',
  '2026-10-01-sem-titulo': 'Texto sem título nenhum aqui.\n',
};

let dir;
let running;

/** GET/HEAD cru: o caminho vai exatamente como escrito (fetch normalizaria "%2e%2e" e afins). */
function request(urlPath, { method = 'GET', headers = {}, port = running.port, setHost = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers, setHost }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'teleprompter-roteiros-'));
  for (const [id, text] of Object.entries(FIXTURES)) {
    await mkdir(path.join(dir, id, 'Roteiro'), { recursive: true });
    await writeFile(path.join(dir, id, 'Roteiro', 'fala.md'), text);
  }
  // Não entram na lista: sem fala.md, nome sem data e arquivo solto.
  await mkdir(path.join(dir, '2026-08-01-sem-fala', 'Roteiro'), { recursive: true });
  await writeFile(path.join(dir, '2026-08-01-sem-fala', 'Roteiro', 'roteiro.md'), '# Outro arquivo');
  await mkdir(path.join(dir, 'rascunho', 'Roteiro'), { recursive: true });
  await writeFile(path.join(dir, 'rascunho', 'Roteiro', 'fala.md'), '# Fala — Rascunho');
  await writeFile(path.join(dir, '2026-10-02-arquivo-solto.md'), '# Solto');
  running = await startServer({ port: 0, host: '127.0.0.1', roteirosDir: dir, quiet: true });
});

after(async () => {
  await running?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

test('GET / devolve o index.html', async () => {
  const res = await request('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^text\/html; charset=utf-8/);
  assert.equal(res.headers['cache-control'], 'no-cache');
  assert.match(res.body.toString(), /<main id="editor-screen"/);
});

test('tipos MIME de js, css, webmanifest, svg e png', async () => {
  const cases = {
    '/js/store.js': 'text/javascript; charset=utf-8',
    '/css/tokens.css': 'text/css; charset=utf-8',
    '/manifest.webmanifest': 'application/manifest+json; charset=utf-8',
    '/icons/icon.svg': 'image/svg+xml',
    '/icons/icon-192.png': 'image/png',
  };
  for (const [url, type] of Object.entries(cases)) {
    const res = await request(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers['content-type'], type, url);
    assert.equal(res.headers['x-content-type-options'], 'nosniff', url);
  }
});

test('HEAD devolve os cabeçalhos sem corpo', async () => {
  const size = (await readFile(path.join(ROOT, 'public', 'index.html'))).length;
  const res = await request('/index.html', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(Number(res.headers['content-length']), size);
  assert.equal(res.body.length, 0);
});

test('ETag: pedido condicional devolve 304', async () => {
  const first = await request('/js/metrics.js');
  const again = await request('/js/metrics.js', { headers: { 'If-None-Match': first.headers.etag } });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
});

test('404 para arquivo que não existe, pasta e rota de API desconhecida', async () => {
  for (const url of ['/nao-existe.txt', '/css', '/css/', '/api', '/api/nada']) {
    assert.equal((await request(url)).status, 404, url);
  }
});

test('405 para métodos que não são GET nem HEAD', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const res = await request('/', { method });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.allow, 'GET, HEAD');
  }
});

test('Range: 206 com os bytes certos, sufixo e 416 fora do arquivo', async () => {
  const file = await readFile(path.join(ROOT, 'public', 'js', 'metrics.js'));
  const partial = await request('/js/metrics.js', { headers: { Range: 'bytes=0-9' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers['content-range'], `bytes 0-9/${file.length}`);
  assert.equal(partial.headers['content-length'], '10');
  assert.deepEqual(partial.body, file.subarray(0, 10));

  const open = await request('/js/metrics.js', { headers: { Range: 'bytes=100-' } });
  assert.equal(open.status, 206);
  assert.deepEqual(open.body, file.subarray(100));

  const suffix = await request('/js/metrics.js', { headers: { Range: 'bytes=-5' } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(suffix.body, file.subarray(file.length - 5));

  const beyond = await request('/js/metrics.js', { headers: { Range: `bytes=${file.length}-` } });
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers['content-range'], `bytes */${file.length}`);

  const ignored = await request('/js/metrics.js', { headers: { Range: 'linhas=1-2' } });
  assert.equal(ignored.status, 200);
  assert.equal(ignored.body.length, file.length);
});

test('path traversal e caminhos suspeitos devolvem 404', async () => {
  const attempts = [
    '/..%2f..%2fpackage.json',
    '/..%2fserver.mjs',
    '/%2e%2e/%2e%2e/server.mjs',
    '/%2e%2e%2f%2e%2e%2fserver.mjs',
    '/..%5c..%5cpackage.json',
    '/css/..%2f..%2fserver.mjs',
    '/js/%2e%2e/%2e%2e/package.json',
    '/../server.mjs',
    '/%00',
    '/index.html%00.png',
    '/C:%5cWindows%5cwin.ini',
    '/%E0%A4%A',
    '/.git/config',
    '/con',
    '/api/roteiros/..%2f..%2fx',
    '/api/roteiros/..%2f..%2fpackage.json',
    '/api/roteiros/%2e%2e',
    '/api/roteiros/2026-10-25-video-teste%2fRoteiro%2ffala.md',
    '/api/roteiros/rascunho',
    '/api/roteiros/2026-08-01-sem-fala',
  ];
  for (const url of attempts) {
    const res = await request(url);
    assert.equal(res.status, 404, url);
    assert.ok(!res.body.toString().includes('"name": "teleprompter"'), url);
  }
});

test('API: lista os fala.md, mais novo primeiro, com título, data e palavras', async () => {
  const res = await request('/api/roteiros');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^application\/json/);
  assert.equal(res.headers['cache-control'], 'no-store');
  const { roteiros } = JSON.parse(res.body.toString());
  assert.deepEqual(
    roteiros.map((r) => r.id),
    ['2026-10-25-video-teste', '2026-10-01-sem-titulo', '2026-09-01-antigo'],
  );
  assert.deepEqual(roteiros[0], {
    id: '2026-10-25-video-teste',
    titulo: 'Vídeo de teste: luz e câmera',
    data: '2026-10-25',
    palavras: countWords(markdownToPlain(FIXTURES['2026-10-25-video-teste'])),
  });
  assert.equal(roteiros[0].palavras, 8);
  assert.equal(roteiros[1].titulo, 'sem titulo');
  assert.equal(roteiros[2].titulo, 'Roteiro antigo');
  assert.equal((await request('/api/roteiros/')).status, 200);
});

test('API: devolve o fala.md do roteiro e 404 para id desconhecido', async () => {
  const res = await request('/api/roteiros/2026-10-25-video-teste');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/markdown; charset=utf-8');
  assert.equal(res.body.toString(), FIXTURES['2026-10-25-video-teste']);

  const head = await request('/api/roteiros/2026-10-25-video-teste', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);

  for (const id of ['2026-10-28-nao-existe', 'qualquer', '%20']) {
    assert.equal((await request(`/api/roteiros/${id}`)).status, 404, id);
  }
});

test('API: pasta de roteiros inexistente devolve lista vazia', async () => {
  const other = await startServer({ port: 0, host: '127.0.0.1', roteirosDir: path.join(dir, 'nao-existe'), quiet: true });
  try {
    const res = await request('/api/roteiros', { port: other.port });
    assert.deepEqual(JSON.parse(res.body.toString()), { roteiros: [] });
  } finally {
    await other.close();
  }
});

test('porta ocupada: tenta a seguinte', async () => {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const busy = blocker.address().port;
  try {
    const other = await startServer({ port: busy, host: '127.0.0.1', roteirosDir: dir, quiet: true });
    try {
      assert.notEqual(other.port, busy);
      assert.ok(other.port > busy && other.port <= busy + 10);
      assert.deepEqual(other.urls, [`http://127.0.0.1:${other.port}/`], 'escutando só em 127.0.0.1: só esse endereço');
    } finally {
      await other.close();
    }
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});

test('Host de outro domínio (DNS rebinding) ou ausente: 421, sem os roteiros', async () => {
  for (const host of ['evil.example', 'rebind.attacker.example:3210', 'localhost.evil.example', '192.168.0.10.evil.example']) {
    const res = await request('/api/roteiros', { headers: { Host: host } });
    assert.equal(res.status, 421, host);
    assert.ok(!res.body.toString().includes('video-teste'), host);
  }
  assert.equal((await request('/api/roteiros/2026-10-25-video-teste', { headers: { Host: 'evil.example' } })).status, 421);
  // Sem Host o próprio Node (22+) recusa o pedido HTTP/1.1 antes de chegar ao servidor (requireHostHeader).
  assert.equal((await request('/', { setHost: false })).status, 400, 'sem Host');
});

test('Host aceito: localhost, IP (v4 e v6) e o nome deste computador', async () => {
  const name = os.hostname();
  for (const host of ['localhost', 'localhost:3210', '127.0.0.1', '192.168.0.10:3210', '[::1]:3210', name, `${name}.local:3210`, name.toUpperCase()]) {
    assert.equal((await request('/api/roteiros', { headers: { Host: host } })).status, 200, host);
  }
});

test('segundo início na mesma porta: avisa que já está rodando e sai, sem subir outro na porta seguinte', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [path.join(ROOT, 'server.mjs')], {
    env: { ...process.env, PORT: String(running.port), HOST: '127.0.0.1' },
    timeout: 10_000,
  });
  assert.match(stdout, /já está rodando/);
  // HOST=127.0.0.1: o endereço é esse IP; "localhost" poderia abrir outro programa que escuta em [::1].
  assert.match(stdout, new RegExp(`Neste computador:   http://127\\.0\\.0\\.1:${running.port}\\b`));
  assert.doesNotMatch(stdout, /estava ocupada|localhost|No celular/);
});

/**
 * Ocupa uma porta em `host` (`port` 0 = livre qualquer): `mute` aceita a conexão e nunca responde; senão,
 * responde com `handler` (padrão: HTTP 200 "oi").
 */
async function occupyPort({ mute = false, host = '127.0.0.1', port = 0, handler = (req, res) => res.end('oi') } = {}) {
  const blocker = mute ? net.createServer() : http.createServer(handler);
  const sockets = new Set();
  blocker.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(port, host, resolve);
  });
  const close = () =>
    new Promise((resolve) => {
      blocker.close(resolve);
      for (const socket of sockets) socket.destroy(); // close() espera as conexões abertas acabarem
    });
  return { port: blocker.address().port, close };
}

test('scanPorts: porta livre; porta de outro programa (mesmo mudo, só em 127.0.0.1 ou só em [::1]) conta como ocupada', async () => {
  const free = await occupyPort();
  await free.close();
  assert.equal((await scanPorts(free.port)).free[0], free.port);
  for (const options of [{ mute: false }, { mute: true }, { host: '::1' }]) {
    const other = await occupyPort(options);
    try {
      const scan = await scanPorts(other.port);
      assert.equal(scan.running, undefined, JSON.stringify(options));
      assert.ok(!scan.free.includes(other.port), `${JSON.stringify(options)}: ${JSON.stringify(scan)}`);
      assert.ok(scan.free[0] > other.port && scan.free[0] <= other.port + 10, `${JSON.stringify(options)}: ${JSON.stringify(scan)}`);
    } finally {
      await other.close();
    }
  }
});

test('scanPorts: acha o teleprompter que escuta só em [::1] (HOST=localhost no Windows)', async () => {
  const v6 = await startServer({ port: 0, host: '::1', roteirosDir: dir, quiet: true });
  try {
    assert.deepEqual(await scanPorts(v6.port), { running: v6.port });
  } finally {
    await v6.close();
  }
});

test('scanPorts: o curinga escrito de outro jeito (::0, 0:0:0:0:0:0:0:0) também pergunta nos dois localhost', async () => {
  // O teleprompter do before() escuta só em 127.0.0.1. Perguntar no próprio "::0" seria perguntar só no ::1.
  for (const host of ['::0', '0:0:0:0:0:0:0:0']) assert.deepEqual(await scanPorts(running.port, host), { running: running.port }, host);
});

test('scanPorts: o teleprompter que leva 1,5 s para responder (PC sem memória) ainda é o teleprompter', async () => {
  const slow = await occupyPort({
    handler: (req, res) => {
      const timer = setTimeout(() => res.end(JSON.stringify({ name: 'Teleprompter' })), 1500);
      res.on('close', () => clearTimeout(timer));
    },
  });
  try {
    assert.deepEqual(await scanPorts(slow.port), { running: slow.port });
  } finally {
    await slow.close();
  }
});

test('scanPorts: manifesto com corpo sem fim: a sonda lê só ~64 KB e para, sem a memória crescer', async () => {
  // O outro programa roda em outro processo, para a memória medida aqui ser só a da sonda. Numa porta ele manda
  // 1 MB atrás de 1 MB e diz por quanto tempo mandou; na outra, 8 KB a cada 10 ms, e diz quanto mandou até a
  // sonda desistir. O tempo é medido lá, e não na busca, que olha também as 10 portas seguintes: o Windows
  // entrega essas portas, em sequência, a outros processos, e algum deles pode demorar a responder.
  const source = `
    const http = require('node:http');
    const endless = (res, size, every) => {
      let open = true;
      let sent = 0;
      const startedAt = Date.now();
      const chunk = Buffer.alloc(size, 0x20);
      const pump = () => { while (open && res.write(chunk)) sent += size; };
      const timer = every ? setInterval(() => { if (open) { res.write(chunk); sent += size; } }, every) : null;
      if (!every) { res.on('drain', pump); pump(); }
      res.on('close', () => { open = false; clearInterval(timer); console.log(every ? 'drip ' + sent : 'fast ' + (Date.now() - startedAt)); });
    };
    const fast = http.createServer((req, res) => endless(res, 1 << 20, 0));
    const drip = http.createServer((req, res) => endless(res, 8192, 10));
    fast.listen(0, '127.0.0.1', () => drip.listen(0, '127.0.0.1', () => console.log('ports ' + fast.address().port + ' ' + drip.address().port)));
  `;
  const child = spawn(process.execPath, ['-e', source]);
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  const waitFor = (pattern) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`sem ${pattern} na saída: ${output}`)), 10_000);
      const check = () => {
        const match = pattern.exec(output);
        if (!match) return;
        clearTimeout(timer);
        child.stdout.off('data', check);
        resolve(match);
      };
      child.stdout.on('data', check);
      check();
    });
  try {
    const [, fastPort, dripPort] = (await waitFor(/ports (\d+) (\d+)/)).map(Number);

    const before = process.memoryUsage();
    let peak = before.rss;
    const sampler = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 5);
    const fastScan = await scanPorts(fastPort, '127.0.0.1');
    clearInterval(sampler);
    peak = Math.max(peak, process.memoryUsage().rss);
    assert.notEqual(fastScan.running, fastPort);
    assert.ok(!(fastScan.free ?? []).includes(fastPort), JSON.stringify(fastScan));
    const fastMs = Number((await waitFor(/fast (\d+)/))[1]);
    assert.ok(fastMs < 2000, `parou pelo limite de 64 KB, antes do prazo de 2,5 s: ${fastMs} ms`);
    assert.ok(peak - before.rss < 48 * 2 ** 20, `memória: +${Math.round((peak - before.rss) / 2 ** 20)} MB`);

    const dripScan = await scanPorts(dripPort, '127.0.0.1');
    assert.ok(!(dripScan.free ?? []).includes(dripPort), JSON.stringify(dripScan));
    await waitFor(/drip \d+/);
    const sent = [...output.matchAll(/drip (\d+)/g)].map((match) => Number(match[1]));
    assert.ok(sent.every((bytes) => bytes <= 256 * 1024), `bytes mandados até a sonda desistir: ${sent}`);
  } finally {
    child.kill();
  }
});

test('PORT: de 1 a 65535; fora disso, ou sem ela, a 3210', () => {
  assert.equal(portFromEnv({ PORT: '8080' }), 8080);
  for (const value of [undefined, '', '0', '-1', '65536', 'abc', '80.5']) assert.equal(portFromEnv({ PORT: value }), 3210, String(value));
});

test('HOST: sem os espaços das pontas (o `set HOST=127.0.0.1 && …` do cmd.exe deixa um); vazio ou só espaços, 0.0.0.0', async () => {
  assert.equal(hostFromEnv({ HOST: '127.0.0.1 ' }), '127.0.0.1');
  assert.equal(hostFromEnv({ HOST: ' 0.0.0.0' }), '0.0.0.0');
  assert.equal(hostFromEnv({ HOST: ' ::1\t' }), '::1');
  for (const value of [undefined, '', '   ']) assert.equal(hostFromEnv({ HOST: value }), '0.0.0.0', String(value));
  // Pela linha de comando: acha o teleprompter que já roda em 127.0.0.1, em vez de falhar com "ENOTFOUND 127.0.0.1 ".
  const { stdout } = await promisify(execFile)(process.execPath, [path.join(ROOT, 'server.mjs')], {
    env: { ...process.env, PORT: `${running.port} `, HOST: '127.0.0.1 ' },
    timeout: 10_000,
  });
  assert.match(stdout, /já está rodando/);
  assert.match(stdout, new RegExp(`http://127\\.0\\.0\\.1:${running.port}\\b`));
});

/** Abre o atalho duas vezes, com `gap` ms entre os cliques, e devolve a saída de cada janela. */
async function launchTwice(env, gap) {
  const outputs = ['', ''];
  const children = [];
  const started = (child, index) =>
    new Promise((resolve) => {
      child.stdout.on('data', (chunk) => {
        outputs[index] += chunk;
        if (/Para parar o servidor|já está rodando/.test(outputs[index])) resolve();
      });
      child.on('exit', resolve);
    });
  let timer;
  try {
    const waits = [];
    for (let index = 0; index < 2; index++) {
      if (index) await new Promise((resolve) => setTimeout(resolve, gap));
      children.push(spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env }));
      waits.push(started(children[index], index));
    }
    await Promise.race([Promise.all(waits), new Promise((resolve) => (timer = setTimeout(resolve, 15_000)))]);
    return outputs;
  } finally {
    clearTimeout(timer);
    for (const child of children) child.kill();
  }
}

test('dois cliques quase juntos no atalho, com a porta pedida presa por um programa mudo: só um servidor sobe', async () => {
  const mute = await occupyPort({ mute: true });
  try {
    // O segundo clique chega no meio da busca do primeiro.
    const outputs = await launchTwice({ ...process.env, PORT: String(mute.port), HOST: '127.0.0.1', ROTEIROS_DIR: dir }, 400);
    assert.equal(outputs.filter((text) => /no ar/.test(text)).length, 1, outputs.join('\n----\n'));
    assert.equal(outputs.filter((text) => /já está rodando/.test(text)).length, 1, outputs.join('\n----\n'));
  } finally {
    await mute.close();
  }
});

test(
  'HOST = IP do computador na rede (o Windows leva ~2 s para recusar): porta livre conta como livre, e dois cliques juntos sobem um servidor só',
  { skip: !LAN_IP && 'sem IPv4 privado neste computador' },
  async () => {
    const free = await occupyPort({ host: LAN_IP });
    await free.close();
    const scan = await scanPorts(free.port, LAN_IP);
    assert.equal(scan.free?.[0], free.port, JSON.stringify(scan));

    const outputs = await launchTwice({ ...process.env, PORT: String(free.port), HOST: LAN_IP, ROTEIROS_DIR: dir }, 0);
    const up = outputs.filter((text) => /no ar/.test(text));
    assert.equal(up.length, 1, outputs.join('\n----\n'));
    assert.equal(outputs.filter((text) => /já está rodando/.test(text)).length, 1, outputs.join('\n----\n'));
    // Escutando só nesse IP: o banner mostra só ele, na linha do celular.
    assert.match(up[0], new RegExp(`No celular/tablet:  http://${LAN_IP.replaceAll('.', '\\.')}:${free.port}\\b`));
    assert.doesNotMatch(up[0], /localhost|Neste computador/);
  },
);

test('scanPorts: acha o teleprompter que subiu numa das 10 portas seguintes à pedida', async () => {
  const other = await occupyPort();
  try {
    const moved = await startServer({ port: other.port, host: '127.0.0.1', roteirosDir: dir, quiet: true });
    try {
      assert.ok(moved.port > other.port);
      assert.deepEqual(await scanPorts(other.port, '127.0.0.1'), { running: moved.port });
    } finally {
      await moved.close();
    }
  } finally {
    await other.close();
  }
});

test('porta pedida com outro programa: o segundo início acha o primeiro na porta seguinte e não sobe outro', async () => {
  const other = await occupyPort();
  const env = { ...process.env, PORT: String(other.port), HOST: '127.0.0.1', ROTEIROS_DIR: dir };
  const first = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env });
  try {
    let banner = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`a primeira janela não subiu: ${banner}`)), 10_000);
      first.stdout.on('data', (chunk) => {
        banner += chunk;
        if (banner.includes('Para parar o servidor')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const moved = Number(/usando a (\d+)/.exec(banner)?.[1]);
    assert.ok(moved > other.port, banner);
    assert.match(banner, new RegExp(`Neste computador:   http://127\\.0\\.0\\.1:${moved}\\b`));
    assert.doesNotMatch(banner, /localhost|No celular|Nenhuma rede local/);
    const { stdout } = await promisify(execFile)(process.execPath, [path.join(ROOT, 'server.mjs')], { env, timeout: 10_000 });
    assert.match(stdout, /já está rodando/);
    assert.match(stdout, new RegExp(`http://127\\.0\\.0\\.1:${moved}\\b`));
    assert.doesNotMatch(stdout, /no ar|estava ocupada/);
  } finally {
    first.kill();
    await other.close();
  }
});

/** Ocupa `count` portas seguidas em 127.0.0.1, longe da 3210; `optionsAt(i)` dá as opções de occupyPort da i-ésima. */
async function occupyRange(count, optionsAt = () => ({})) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const base = 20000 + Math.floor(Math.random() * 20000);
    const taken = [];
    try {
      for (let i = 0; i < count; i++) taken.push(await occupyPort({ ...optionsAt(i), port: base + i }));
      return taken;
    } catch {
      await Promise.all(taken.map((item) => item.close()));
    }
  }
  throw new Error(`sem ${count} portas seguidas livres`);
}

test('launch: sem porta livre na busca, tenta a pedida e as 10 seguintes; acha o teleprompter que demorou na busca, ou lança o último erro', async () => {
  // Na busca, o teleprompter da porta pedida passa do prazo (3 s); depois responde na hora. As 10 seguintes têm outro programa.
  let answers = 0;
  const lateTeleprompter = (req, res) => {
    const timer = setTimeout(() => res.end(JSON.stringify({ name: 'Teleprompter' })), answers++ ? 0 : 3000);
    res.on('close', () => clearTimeout(timer));
  };
  const taken = await occupyRange(11, (i) => (i ? {} : { handler: lateTeleprompter }));
  const base = taken[0].port;
  const options = { roteirosDir: dir, quiet: true };
  try {
    assert.deepEqual(await launch(base, '127.0.0.1', options), { running: base });

    await taken[0].close();
    taken[0] = await occupyPort({ port: base });
    const outcome = await launch(base, '127.0.0.1', options).then((value) => value, (error) => error);
    await outcome.server?.close();
    assert.equal(outcome.code, 'EADDRINUSE', String(outcome.server ? `subiu na ${outcome.server.port}` : outcome));
    assert.equal(outcome.port, base + 10, 'o erro é o da última porta tentada');
  } finally {
    await Promise.all(taken.map((item) => item.close()));
  }
});

test('launch: sem porta livre na busca e com programas mudos, a pergunta repetida espera pouco e o erro sai logo', async () => {
  // Dois programas mudos e nove que respondem "oi". A busca espera 2,5 s pelos mudos; depois, cada EADDRINUSE
  // pergunta de novo com prazo de 0,5 s: ~3,5 s até o erro. Com 2,5 s também na pergunta repetida, seriam ~7,5 s.
  const taken = await occupyRange(11, (i) => ({ mute: i < 2 }));
  try {
    const startedAt = performance.now();
    const outcome = await launch(taken[0].port, '127.0.0.1', { roteirosDir: dir, quiet: true }).then((value) => value, (error) => error);
    const elapsed = performance.now() - startedAt;
    await outcome.server?.close();
    assert.equal(outcome.code, 'EADDRINUSE', String(outcome.server ? `subiu na ${outcome.server.port}` : outcome));
    assert.ok(elapsed < 5500, `${Math.round(elapsed)} ms até o erro`);
  } finally {
    await Promise.all(taken.map((item) => item.close()));
  }
});

test('launch: porta acima de 65535 ou que não é número lança RangeError, como startServer', async () => {
  for (const port of [65536, 70000, NaN]) {
    await assert.rejects(launch(port, '127.0.0.1', { roteirosDir: dir, quiet: true }), {
      name: 'RangeError',
      message: `Porta fora do intervalo de 0 a 65535: ${port}`,
    });
  }
});

test('isPrivateIPv4 aceita só 10/8, 172.16/12 e 192.168/16', () => {
  for (const ip of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.254', '192.168.0.10']) {
    assert.equal(isPrivateIPv4(ip), true, ip);
  }
  for (const ip of ['203.0.113.7', '172.15.0.1', '172.32.0.1', '192.169.0.1', '127.0.0.1', '169.254.1.1', '8.8.8.8', '::1', 'abc', '10.0.0']) {
    assert.equal(isPrivateIPv4(ip), false, ip);
  }
});

test('endereços do banner, conforme onde o servidor escuta: curinga e loopback em qualquer grafia, localhost, IP específico e nome', () => {
  const interfaces = {
    'Wi-Fi': [
      { address: 'fe80::1:2:3:4', family: 'IPv6', internal: false },
      { address: '2001:db8:1:2:3:4:5:6', family: 'IPv6', internal: false },
      { address: '192.168.0.10', family: 'IPv4', internal: false },
    ],
    Ethernet: [{ address: '10.0.0.5', family: 4, internal: false }], // Node 18.0 a 18.3: família em número
    'Outro adaptador': [{ address: '203.0.113.7', family: 'IPv4', internal: false }], // IP público: fica de fora
    'Loopback Pseudo-Interface 1': [
      { address: '::1', family: 'IPv6', internal: true },
      { address: '127.0.0.1', family: 'IPv4', internal: true },
    ],
  };
  const local = (url) => ({ url, lan: false });
  const lan = (url, name) => ({ url, lan: true, name });
  const anyHost = [local('http://localhost:3210'), lan('http://192.168.0.10:3210', 'Wi-Fi'), lan('http://10.0.0.5:3210', 'Ethernet')];
  const cases = {
    '0.0.0.0': anyHost,
    '::': anyHost,
    '::0': anyHost,
    '0:0:0:0:0:0:0:0': anyHost,
    '127.0.0.1': [local('http://127.0.0.1:3210')],
    '::1': [local('http://[::1]:3210')],
    '0:0:0:0:0:0:0:1': [local('http://[0:0:0:0:0:0:0:1]:3210')],
    '::ffff:127.0.0.1': [local('http://[::ffff:127.0.0.1]:3210')], // 127.0.0.1 escrito em IPv6
    localhost: [local('http://localhost:3210')],
    '127.0.0.2': [local('http://127.0.0.2:3210')],
    '192.168.0.10': [lan('http://192.168.0.10:3210', 'Wi-Fi')],
    '2001:db8:1:2:3:4:5:6': [lan('http://[2001:db8:1:2:3:4:5:6]:3210', 'Wi-Fi')],
    'meu-pc': [local('http://meu-pc:3210')],
  };
  for (const [host, expected] of Object.entries(cases)) assert.deepEqual(serverAddresses(host, 3210, interfaces), expected, host);
  const offline = { 'Loopback Pseudo-Interface 1': interfaces['Loopback Pseudo-Interface 1'] };
  assert.deepEqual(serverAddresses('0.0.0.0', 3210, offline), [local('http://localhost:3210')], 'curinga sem rede: só localhost');
});
