// Testes de ponta a ponta: `npm run test:e2e` (argumentos extras seguem para o Playwright,
// ex.: `npm run test:e2e -- --project=iphone --grep "RF-06"`). Só módulos nativos do Node.
//
// O Playwright fica FORA da pasta do projeto, que nunca ganha node_modules (ela pode estar numa pasta sincronizada na nuvem):
//   Windows: %LOCALAPPDATA%\teleprompter-e2e   ·   outros sistemas: ~/.cache/teleprompter-e2e
// (TELEPROMPTER_E2E_DIR troca o lugar). Passos:
//   1. garante @playwright/test 1.60.0 e os navegadores Chromium e WebKit nessa pasta;
//   2. copia specs, configuração, ajudantes e fixtures para <pasta>/suite (lá o '@playwright/test' resolve);
//   3. sobe o server.mjs do projeto (startServer) numa porta livre, com ROTEIROS_DIR = fixtures/Roteiros;
//   4. roda o Playwright com BASE_URL em duas fases: "geral" (tudo menos timing.spec.mjs, em paralelo) e
//      "tempo" (timing.spec.mjs, um navegador por vez); junta os dois relatórios num HTML só. Relatório,
//      rastros e capturas ficam na pasta de fora;
//   5. desliga o servidor e sai com o código do Playwright (diferente de 0 se alguma fase falhou).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLAYWRIGHT_VERSION = '1.60.0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');
const ROTEIROS_FIXTURES = path.join(HERE, 'fixtures', 'Roteiros');
const isWindows = process.platform === 'win32';

const log = (message) => console.log(`[e2e] ${message}`);

function fail(message) {
  console.error(`\n[e2e] ${message}\n`);
  process.exit(1);
}

function workspaceDir() {
  if (process.env.TELEPROMPTER_E2E_DIR) return path.resolve(process.env.TELEPROMPTER_E2E_DIR);
  if (isWindows) return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'teleprompter-e2e');
  return path.join(os.homedir(), '.cache', 'teleprompter-e2e');
}

const isInside = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

function readVersion(packageFile) {
  try {
    return JSON.parse(fs.readFileSync(packageFile, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** Roda um comando até o fim, mostrando a saída. Lança erro se o código de saída não for 0. */
function runSync(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`"${command} ${args.join(' ')}" saiu com código ${result.status}`);
}

/** Garante o Playwright fixado em 1.60.0 e os navegadores. Devolve o caminho do cli.js do @playwright/test. */
function ensurePlaywright(workspace) {
  fs.mkdirSync(workspace, { recursive: true });
  const packageFile = path.join(workspace, 'package.json');
  if (!fs.existsSync(packageFile)) {
    const manifest = { name: 'teleprompter-e2e', private: true, type: 'module', devDependencies: { '@playwright/test': PLAYWRIGHT_VERSION } };
    fs.writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const installed = readVersion(path.join(workspace, 'node_modules', '@playwright', 'test', 'package.json'));
  if (installed !== PLAYWRIGHT_VERSION) {
    log(`instalando @playwright/test@${PLAYWRIGHT_VERSION} em ${workspace} (encontrado: ${installed ?? 'nada'})...`);
    // No Windows o npm é um .cmd e só roda por um shell. Nenhum argumento tem espaço; o caminho vai em cwd.
    runSync('npm', ['install', '--save-exact', '--no-audit', '--no-fund', `@playwright/test@${PLAYWRIGHT_VERSION}`], {
      cwd: workspace,
      shell: isWindows,
    });
  }
  const cli = path.join(workspace, 'node_modules', '@playwright', 'test', 'cli.js');
  if (!fs.existsSync(cli)) fail(`Playwright não encontrado em ${cli}.`);
  // Equivale a "npx playwright install chromium webkit", sem depender do npx.cmd. Já instalado: < 1 s.
  log('conferindo os navegadores Chromium e WebKit...');
  runSync(process.execPath, [cli, 'install', 'chromium', 'webkit'], { cwd: workspace });
  return cli;
}

/**
 * Esvazia uma pasta sem apagar a própria pasta: no Windows, uma pasta que é o diretório atual de algum
 * processo (um terminal aberto nela, um navegador que ficou para trás) não pode ser removida.
 */
function emptyDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch (error) {
      log(`aviso: não foi possível apagar ${path.join(dir, name)} (${error.code}); será sobrescrito`);
    }
  }
}

/** Copia tudo de tests/e2e (menos este arquivo) para <pasta>/suite, limpando a cópia anterior. */
function copySuite(workspace) {
  const suite = path.join(workspace, 'suite');
  emptyDir(suite);
  for (const entry of fs.readdirSync(HERE, { withFileTypes: true })) {
    if (entry.name === path.basename(fileURLToPath(import.meta.url))) continue;
    const from = path.join(HERE, entry.name);
    const to = path.join(suite, entry.name);
    if (entry.isDirectory()) fs.cpSync(from, to, { recursive: true });
    else if (/\.(mjs|js|json)$/i.test(entry.name)) fs.copyFileSync(from, to);
  }
  return suite;
}

async function main() {
  const workspace = workspaceDir();
  if (isInside(workspace, PROJECT_ROOT) || /onedrive/i.test(workspace)) {
    fail(`A pasta do Playwright não pode ficar no projeto nem no OneDrive: ${workspace}`);
  }
  if (!fs.existsSync(path.join(ROTEIROS_FIXTURES))) fail(`Fixtures não encontradas em ${ROTEIROS_FIXTURES}`);

  const cli = ensurePlaywright(workspace);
  const suite = copySuite(workspace);
  log(`suíte copiada para ${suite}`);

  process.env.ROTEIROS_DIR = ROTEIROS_FIXTURES;
  const { startServer } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'server.mjs')).href);
  const server = await startServer({ port: 0, host: '127.0.0.1', roteirosDir: ROTEIROS_FIXTURES, quiet: true });
  const baseUrl = `http://127.0.0.1:${server.port}/`;
  log(`servidor do projeto em ${baseUrl} (ROTEIROS_DIR = ${ROTEIROS_FIXTURES})`);

  // Ctrl+C chega ao Playwright (mesmo console); aqui só esperamos ele sair para desligar o servidor.
  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const env = {
    ...process.env,
    BASE_URL: baseUrl,
    PROJECT_ROOT,
    E2E_WORKSPACE: workspace,
    ROTEIROS_DIR: ROTEIROS_FIXTURES,
    // O WebKit do Playwright no Windows às vezes deixa o processo de rede vivo ao fechar o navegador, e o
    // processo do teste não termina: o Playwright espera 5 min antes de encerrá-lo à força. 30 s bastam.
    PWTEST_CHILD_PROCESS_TIMEOUT: process.env.PWTEST_CHILD_PROCESS_TIMEOUT || '30000',
  };
  const config = path.join(suite, 'playwright.config.mjs');
  const blobRoot = path.join(workspace, 'blob-report');
  const jsonRoot = path.join(workspace, 'json-report');
  emptyDir(blobRoot);
  emptyDir(jsonRoot);

  // Fase "geral" em paralelo; fase "tempo" (timing.spec.mjs) com um navegador por vez, para o relógio
  // dos testes de tempo real não sofrer com a máquina ocupada (ver playwright.config.mjs).
  const phases = [
    ['geral', 'todos os testes menos os de tempo real, em paralelo'],
    ['tempo', 'testes de tempo real (timing.spec.mjs), um navegador por vez'],
  ];
  const codes = {};
  const webkitBefore = countWebKitNetworkProcesses();
  for (const [phase, description] of phases) {
    if (interrupted) break;
    log(`fase "${phase}": ${description}`);
    const args = [cli, 'test', '--config', config, '--pass-with-no-tests', ...process.argv.slice(2)];
    codes[phase] = await runChild(args, { cwd: suite, env: { ...env, E2E_PHASE: phase } });
    if (codes[phase] !== 0 && onlyStuckWorkers(path.join(jsonRoot, `${phase}.json`))) {
      log(`aviso: na fase "${phase}" nenhum teste falhou; o Playwright só acusou um navegador WebKit que não fechou`);
      log('       (falha conhecida do WebKit do Playwright no Windows, depois de o teste terminar). Fase considerada ok.');
      codes[phase] = 0;
    }
  }
  await server.close();

  mergeReports(cli, suite, blobRoot, path.join(workspace, 'report'));
  const webkitAfter = countWebKitNetworkProcesses();
  if (webkitBefore !== null && webkitAfter > webkitBefore) {
    log(`aviso: ${webkitAfter - webkitBefore} processo(s) WebKitNetworkProcess.exe ficaram para trás (falha do WebKit do`);
    log('       Playwright no Windows ao fechar o navegador; não afeta os resultados). Para liberar a memória, com');
    log('       nenhum teste rodando: taskkill /F /IM WebKitNetworkProcess.exe');
  }
  const failed = Object.entries(codes).filter(([, code]) => code !== 0);
  for (const [phase, code] of Object.entries(codes)) log(`fase "${phase}": ${code === 0 ? 'ok' : `falhou (código ${code})`}`);
  log(`relatório: ${path.join(workspace, 'report', 'index.html')}`);
  log(`capturas de tela: ${path.join(workspace, 'screenshots')}`);
  if (interrupted) process.exit(130);
  process.exit(failed.length ? failed[0][1] : 0);
}

/**
 * A fase falhou só porque um processo de teste não terminou depois de parar (navegador que não fechou)?
 * Verdadeiro apenas se nenhum teste falhou e todos os erros gerais são desse tipo.
 */
function onlyStuckWorkers(jsonFile) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  } catch {
    return false;
  }
  const stats = report.stats ?? {};
  const errors = report.errors ?? [];
  const stuck = (error) => /process did not exit within \d+ms after stop/.test(String(error?.message ?? ''));
  return stats.unexpected === 0 && stats.flaky === 0 && (stats.expected ?? 0) > 0 && errors.length > 0 && errors.every(stuck);
}

/** Quantos WebKitNetworkProcess.exe estão rodando (só Windows; null se não der para saber). Só leitura. */
function countWebKitNetworkProcesses() {
  if (!isWindows) return null;
  const tasklist = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tasklist.exe');
  const result = spawnSync(tasklist, ['/FI', 'IMAGENAME eq WebKitNetworkProcess.exe', '/NH', '/FO', 'CSV'], { encoding: 'utf8', shell: false });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout.split(/\r?\n/).filter((line) => line.startsWith('"WebKitNetworkProcess.exe"')).length;
}

/** Roda um processo filho com a saída no console e devolve o código de saída. */
function runChild(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', (error) => {
      console.error(error);
      resolve(1);
    });
    child.on('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
  });
}

/** Junta os relatórios "blob" das fases num único relatório HTML (em <pasta>/report). */
function mergeReports(cli, suite, blobRoot, reportDir) {
  const all = path.join(blobRoot, 'todas');
  emptyDir(all);
  let count = 0;
  for (const entry of fs.readdirSync(blobRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'todas') continue;
    for (const file of fs.readdirSync(path.join(blobRoot, entry.name))) {
      if (!file.endsWith('.zip')) continue;
      fs.copyFileSync(path.join(blobRoot, entry.name, file), path.join(all, file));
      count++;
    }
  }
  if (!count) return;
  const result = spawnSync(process.execPath, [cli, 'merge-reports', '--reporter', 'html', all], {
    cwd: suite,
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: false,
    env: { ...process.env, PLAYWRIGHT_HTML_OUTPUT_DIR: reportDir, PLAYWRIGHT_HTML_OPEN: 'never' },
  });
  if (result.status !== 0) log('não foi possível juntar os relatórios das fases (veja os .zip em blob-report).');
}

main().catch((error) => fail(error?.stack || String(error)));
