// Configuração do Playwright. Roda a partir da cópia em <pasta do Playwright, fora do projeto>/suite (ver run.mjs):
// BASE_URL vem do servidor que o run.mjs sobe; relatório, rastros e capturas ficam em E2E_WORKSPACE.
//
// Fases (E2E_PHASE, definida pelo run.mjs):
//   geral → todos os arquivos menos timing.spec.mjs, vários navegadores em paralelo;
//   tempo → só timing.spec.mjs, um navegador por vez (medidas de tempo real sem a máquina sobrecarregada);
//   (sem fase) → tudo junto, com relatório HTML direto.
// Nas fases, cada uma grava um relatório "blob" e o run.mjs junta os dois num só relatório HTML.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = process.env.E2E_WORKSPACE || path.resolve(HERE, '..');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL não definida: rode os testes com "npm run test:e2e" (tests/e2e/run.mjs).');

const PHASE = process.env.E2E_PHASE || 'tudo';
const TIMING_FILE = 'timing.spec.mjs';
const REPORT_DIR = path.join(WORKSPACE, 'report');
// WebKit no Windows desenha em software: mais que ~6 navegadores juntos derruba o ritmo dos quadros.
const workers = Number(process.env.E2E_WORKERS) || Math.max(2, Math.min(6, Math.floor(os.cpus().length / 3)));

export default defineConfig({
  testDir: HERE,
  testMatch: PHASE === 'tempo' ? TIMING_FILE : '*.spec.mjs',
  testIgnore: PHASE === 'geral' ? TIMING_FILE : undefined,
  outputDir: path.join(WORKSPACE, 'test-results', PHASE),
  fullyParallel: true,
  workers: PHASE === 'tempo' ? 1 : workers,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  forbidOnly: true,
  reporter:
    PHASE === 'tudo'
      ? [['list'], ['html', { outputFolder: REPORT_DIR, open: 'never' }]]
      : [
          ['list'],
          ['blob', { outputDir: path.join(WORKSPACE, 'blob-report', PHASE), fileName: `${PHASE}.zip` }],
          // Lido pelo run.mjs para separar teste que falhou de navegador que não fechou (ver run.mjs).
          ['json', { outputFile: path.join(WORKSPACE, 'json-report', `${PHASE}.json`) }],
        ],
  use: {
    baseURL: BASE_URL,
    serviceWorkers: 'block',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'ipad', use: { ...devices['iPad Pro 11 landscape'], browserName: 'webkit' } },
    { name: 'android', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
});
