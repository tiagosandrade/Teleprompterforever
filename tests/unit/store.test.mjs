import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  defaultSettings,
  sanitizeSettings,
  LIMITS,
  NUDGE,
  SAMPLE_SCRIPT,
  STORAGE_KEY,
} from '../../public/js/store.js';

/** localStorage de mentira, em memória. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  };
}

/** Armazenamento que falha em tudo (modo privado antigo, cota cheia, bloqueado). */
const brokenStorage = {
  getItem() { throw new Error('bloqueado'); },
  setItem() { throw new Error('bloqueado'); },
  removeItem() { throw new Error('bloqueado'); },
};

const saved = (storage) => JSON.parse(storage.getItem(STORAGE_KEY));

test('padrões de celular e de tablet', () => {
  assert.deepEqual(defaultSettings('phone'), {
    speed: 150, fontSize: 36, position: 'center', areaWidth: 1, areaHeight: 1,
    mirrorX: false, mirrorY: false, countdown: 3, guide: false,
  });
  const tablet = defaultSettings('tablet');
  assert.equal(tablet.fontSize, 60);
  assert.equal(tablet.areaWidth, 0.7);
  assert.equal(tablet.areaHeight, 1);
});

test('primeiro uso: texto de exemplo e ajustes padrão', () => {
  const store = createStore({ storage: memoryStorage(), kind: 'phone' });
  assert.equal(store.getScript(), SAMPLE_SCRIPT);
  assert.deepEqual(store.getSettings(), defaultSettings('phone'));
  assert.equal(store.getFlag('iosHintDismissed'), undefined);
});

test('texto de exemplo ensina o gesto certo e só promete o que toda tela tem', () => {
  // Arrastar para cima avança (o texto acompanha o dedo); A− e A+ somem da pílula abaixo de 360 px.
  assert.match(SAMPLE_SCRIPT, /para cima para avançar o texto e para baixo para voltar/);
  assert.match(SAMPLE_SCRIPT, /os botões de baixo mudam a velocidade\. No ícone de ajustes você muda o tamanho da letra/);
});

test('sanitizeSettings limita, arredonda ao passo e ignora valores inválidos', () => {
  const base = defaultSettings('phone');
  const out = sanitizeSettings(
    { speed: '152', fontSize: 999, areaWidth: 0.1, areaHeight: '0.555', position: 'top', countdown: 4, mirrorX: 'sim', guide: true },
    base,
  );
  assert.equal(out.speed, 150);
  assert.equal(out.fontSize, LIMITS.fontSize.max);
  assert.equal(out.areaWidth, LIMITS.areaWidth.min);
  assert.equal(out.areaHeight, 0.56);
  assert.equal(out.position, 'center');
  assert.equal(out.countdown, 3);
  assert.equal(out.mirrorX, false);
  assert.equal(out.guide, true);
  assert.deepEqual(sanitizeSettings(null, base), base);
  assert.deepEqual(sanitizeSettings([1, 2], base), base);
  assert.equal(sanitizeSettings({ countdown: '0' }, base).countdown, 0);
  assert.equal(sanitizeSettings({ speed: '' }, base).speed, 150);
  assert.equal(sanitizeSettings({ speed: NaN }, base).speed, 150);
});

test('setSettings avisa só as chaves que mudaram', () => {
  const store = createStore({ storage: null, kind: 'phone' });
  const calls = [];
  store.subscribe((state, changed) => calls.push([...changed].sort()));
  store.setSettings({ speed: 200, fontSize: 36, position: 'left' });
  store.setSettings({ speed: 200 }); // nada muda: não avisa
  assert.deepEqual(calls, [['position', 'speed']]);
  assert.equal(store.getSettings().speed, 200);
  assert.ok(Object.isFrozen(store.getSettings()));
  assert.ok(Object.isFrozen(store.getState()));
});

test('nudge soma ou subtrai um passo e para nos limites', () => {
  const store = createStore({ storage: null, kind: 'phone' });
  store.nudge('speed', 1);
  assert.equal(store.getSettings().speed, 150 + NUDGE.speed);
  store.nudge('fontSize', -1);
  assert.equal(store.getSettings().fontSize, 36 - NUDGE.fontSize);
  store.setSettings({ speed: LIMITS.speed.max, fontSize: LIMITS.fontSize.min });
  store.nudge('speed', 1);
  store.nudge('fontSize', -1);
  assert.equal(store.getSettings().speed, LIMITS.speed.max);
  assert.equal(store.getSettings().fontSize, LIMITS.fontSize.min);
});

test('resetSettings volta os ajustes e mantém o texto', () => {
  const store = createStore({ storage: null, kind: 'tablet' });
  store.setScript('Meu roteiro');
  store.setSettings({ speed: 300, mirrorX: true, areaWidth: 0.4, position: 'right' });
  store.resetSettings();
  assert.deepEqual(store.getSettings(), defaultSettings('tablet'));
  assert.equal(store.getScript(), 'Meu roteiro');
});

test('setScript e setFlag avisam com as chaves "script" e "flag:<nome>"', () => {
  const store = createStore({ storage: null, kind: 'phone' });
  const changes = [];
  const unsubscribe = store.subscribe((state, changed) => changes.push([...changed]));
  store.setScript('Olá');
  store.setScript('Olá'); // igual: não avisa
  store.setScript(null);
  store.setFlag('iosHintDismissed', true);
  store.setFlag('iosHintDismissed', true);
  unsubscribe();
  store.setScript('depois de sair');
  assert.deepEqual(changes, [['script'], ['script'], ['flag:iosHintDismissed']]);
  assert.equal(store.getScript(), 'depois de sair');
  assert.equal(store.getFlag('iosHintDismissed'), true);
});

test('grava no armazenamento e volta igual ao reabrir', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, kind: 'phone' });
  store.setScript('Texto salvo');
  store.setSettings({ speed: 175, mirrorX: true, areaWidth: 0.5 });
  store.setFlag('iosHintDismissed', true);
  store.flush();
  assert.equal(saved(storage).version, 1);

  const reopened = createStore({ storage, kind: 'phone' });
  assert.equal(reopened.getScript(), 'Texto salvo');
  assert.equal(reopened.getSettings().speed, 175);
  assert.equal(reopened.getSettings().mirrorX, true);
  assert.equal(reopened.getSettings().areaWidth, 0.5);
  assert.equal(reopened.getFlag('iosHintDismissed'), true);
});

test('texto apagado continua apagado ao reabrir (não volta o exemplo)', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, kind: 'phone' });
  store.setScript('');
  store.flush();
  assert.equal(createStore({ storage, kind: 'phone' }).getScript(), '');
});

test('a gravação é adiada e agrupa várias mudanças', async () => {
  const storage = memoryStorage();
  const store = createStore({ storage, kind: 'phone' });
  store.setScript('a');
  store.setScript('ab');
  assert.equal(storage.getItem(STORAGE_KEY), null);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(saved(storage).script, 'ab');
});

test('dados corrompidos ou inválidos voltam aos padrões', () => {
  for (const raw of ['{não é json', '"texto"', '[1,2,3]', 'null', JSON.stringify({ script: 42, settings: 'x', flags: [] })]) {
    const store = createStore({ storage: memoryStorage({ [STORAGE_KEY]: raw }), kind: 'phone' });
    assert.equal(store.getScript(), SAMPLE_SCRIPT, raw);
    assert.deepEqual(store.getSettings(), defaultSettings('phone'), raw);
  }
  const partial = createStore({
    storage: memoryStorage({ [STORAGE_KEY]: JSON.stringify({ settings: { speed: 9999, position: 'left', guide: 'sim' } }) }),
    kind: 'phone',
  });
  assert.equal(partial.getSettings().speed, LIMITS.speed.max);
  assert.equal(partial.getSettings().position, 'left');
  assert.equal(partial.getSettings().guide, false);
});

test('armazenamento bloqueado ou ausente não quebra o app', () => {
  for (const storage of [brokenStorage, null]) {
    const store = createStore({ storage, kind: 'phone' });
    assert.equal(store.getScript(), SAMPLE_SCRIPT);
    store.setScript('funciona sem guardar');
    store.setSettings({ speed: 200 });
    assert.doesNotThrow(() => store.flush());
    assert.equal(store.getScript(), 'funciona sem guardar');
    assert.equal(store.getSettings().speed, 200);
  }
});
