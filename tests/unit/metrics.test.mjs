import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countWords,
  estimateSeconds,
  pxPerSecond,
  formatDuration,
  formatClock,
  formatNumber,
  clamp,
  snapToStep,
} from '../../public/js/metrics.js';

test('countWords: vazio, espaços e pontuação solta não contam', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords(null), 0);
  assert.equal(countWords(undefined), 0);
  assert.equal(countWords('   \n\t  '), 0);
  assert.equal(countWords('— – - … ! ?'), 0);
});

test('countWords: palavras com acento, números, hífen e quebras de linha', () => {
  assert.equal(countWords('Olá, mundo!'), 2);
  assert.equal(countWords('e-mail conta como uma'), 4);
  assert.equal(countWords('Ação — reação'), 2);
  assert.equal(countWords('São 1.240 palavras em 3,5 min'), 6);
  assert.equal(countWords('linha um\n\nlinha  dois\tfim'), 5);
  assert.equal(countWords('"aspas" (parênteses) 50%'), 3);
});

test('countWords: texto de 20 mil palavras', () => {
  const big = Array.from({ length: 20000 }, (_, i) => `palavra${i}`).join(' ');
  assert.equal(countWords(big), 20000);
});

test('estimateSeconds: palavras ÷ ppm, zero quando não há texto ou velocidade', () => {
  assert.equal(estimateSeconds(300, 150), 120);
  assert.ok(Math.abs(estimateSeconds(1240, 150) - 496) < 1e-9);
  assert.equal(formatDuration(estimateSeconds(1240, 150)), '8 min 16 s');
  assert.equal(estimateSeconds(0, 150), 0);
  assert.equal(estimateSeconds(100, 0), 0);
  assert.equal(estimateSeconds(-5, 150), 0);
});

test('pxPerSecond: o tempo total é sempre palavras ÷ ppm, em qualquer distância', () => {
  for (const distance of [1200, 5000, 37000]) {
    const speed = pxPerSecond({ wpm: 150, words: 300, distance });
    assert.ok(Math.abs(distance / speed - 120) < 1e-9);
  }
  assert.equal(pxPerSecond({ wpm: 150, words: 0, distance: 100 }), 0);
  assert.equal(pxPerSecond({ wpm: 0, words: 10, distance: 100 }), 0);
  assert.equal(pxPerSecond({ wpm: 150, words: 10, distance: 0 }), 0);
  assert.equal(pxPerSecond({ wpm: 150, words: 10, distance: -1 }), 0);
});

test('formatDuration: segundos, minutos e horas por extenso', () => {
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(59.6), '1 min');
  assert.equal(formatDuration(480), '8 min');
  assert.equal(formatDuration(496), '8 min 16 s');
  assert.equal(formatDuration(3720), '1 h 02 min');
  assert.equal(formatDuration(-3), '0 s');
  assert.equal(formatDuration(NaN), '0 s');
  assert.equal(formatDuration(39.2), '40 s'); // para cima, como o relógio
});

test('o editor e o relógio do teleprompter recém-aberto mostram o mesmo tempo (abaixo de 1 h)', () => {
  const durationSeconds = (text) => {
    const [, m = 0, s = 0] = /^(?:(\d+) min)? ?(?:(\d+) s)?$/.exec(text).map((n) => Number(n ?? 0));
    return m * 60 + s;
  };
  const clockSeconds = (text) => text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  for (const wpm of [40, 145, 150, 155, 320]) {
    for (let words = 1; words <= 2000; words++) {
      const seconds = estimateSeconds(words, wpm);
      if (seconds >= 3600) continue;
      assert.equal(durationSeconds(formatDuration(seconds)), clockSeconds(formatClock(seconds)), `${words} palavras a ${wpm} ppm`);
    }
  }
});

test('formatClock: relógio de tempo restante arredonda para cima', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(44.2), '0:45');
  assert.equal(formatClock(496), '8:16');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(-1), '0:00');
});

test('formatNumber: separador de milhar brasileiro', () => {
  assert.equal(formatNumber(1240), '1.240');
  assert.equal(formatNumber(20000), '20.000');
  assert.equal(formatNumber(7), '7');
  assert.equal(formatNumber(undefined), '0');
});

test('clamp e snapToStep respeitam limites e passo (inclusive passo fracionado)', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  const speed = { min: 40, max: 320, step: 5 };
  assert.equal(snapToStep(152, speed), 150);
  assert.equal(snapToStep(153, speed), 155);
  assert.equal(snapToStep(10, speed), 40);
  assert.equal(snapToStep(999, speed), 320);
  const area = { min: 0.25, max: 1, step: 0.01 };
  assert.equal(snapToStep(0.7, area), 0.7);
  assert.equal(snapToStep(0.333333, area), 0.33);
  assert.equal(snapToStep(0.1, area), 0.25);
  assert.equal(snapToStep(1.2, area), 1);
  assert.equal(snapToStep(37, { min: 16, max: 160, step: 2 }), 38);
});
