// Testes da matemática do teleprompter (public/js/prompter/layout.js) e do mapa de teclas.
// Rodar da raiz do projeto: node --test tests/unit/layout.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  HANDLES,
  MAX_FRAME_MS,
  RAMP_MS,
  adjustBarAtBottom,
  adjustPatch,
  areaRect,
  displayText,
  dragOffset,
  frameSeconds,
  handleAnchor,
  handlesFor,
  hasMixedUnits,
  hyphenatesAll,
  hyphenationRuns,
  isHyphenatable,
  keyboardJump,
  lineHeightFor,
  needsHyphenation,
  offsetAt,
  overflowingUnits,
  pointerToFraction,
  preserveOffset,
  progressOf,
  progressPerSecond,
  rampFactor,
  readingLineY,
  remainingSeconds,
  scrollBounds,
  scrollDistance,
  slashPieces,
  snapToDevicePixel,
  textTranslateY,
  unbreakableUnits,
  veilRoom,
  widthFromPointer,
} from '../../public/js/prompter/layout.js';
import { isRepeatable, isTextField, keyAction } from '../../public/js/prompter/keyboard.js';
import { countWords, pxPerSecond } from '../../public/js/metrics.js';

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `esperado ${expected}, veio ${actual}`);

describe('areaRect: área em frações da moldura', () => {
  it('centro centraliza, esquerda encosta em 0 e direita em 1 − w', () => {
    assert.deepEqual(areaRect({ position: 'left', areaWidth: 0.5, areaHeight: 1 }), { x: 0, y: 0, w: 0.5, h: 1 });
    assert.deepEqual(areaRect({ position: 'center', areaWidth: 0.5, areaHeight: 1 }), { x: 0.25, y: 0, w: 0.5, h: 1 });
    assert.deepEqual(areaRect({ position: 'right', areaWidth: 0.5, areaHeight: 0.6 }), { x: 0.5, y: 0, w: 0.5, h: 0.6 });
  });

  it('largura 100% ocupa a moldura inteira em qualquer posição', () => {
    for (const position of ['left', 'center', 'right']) {
      assert.deepEqual(areaRect({ position, areaWidth: 1, areaHeight: 1 }), { x: 0, y: 0, w: 1, h: 1 });
    }
  });

  it('posição desconhecida vale como centro e valores fora da faixa são limitados', () => {
    close(areaRect({ position: 'diagonal', areaWidth: 0.7, areaHeight: 1 }).x, 0.15);
    assert.deepEqual(areaRect({ position: 'left', areaWidth: 3, areaHeight: -1 }), { x: 0, y: 0, w: 1, h: 0 });
  });
});

describe('distância, linha de leitura e pontas da rolagem', () => {
  it('linha = fonte × 1,4 e D = altura do texto − uma linha', () => {
    close(lineHeightFor(36), 50.4);
    close(scrollDistance(504, 50.4), 453.6);
  });

  it('texto de uma linha (ou vazio) tem D = 0, nunca negativo', () => {
    assert.equal(scrollDistance(50.4, 50.4), 0);
    assert.equal(scrollDistance(50, 50.4), 0);
    assert.equal(scrollDistance(0, 50.4), 0);
    assert.equal(scrollDistance(undefined, 50.4), 0);
  });

  it('linha de leitura a 30% da altura da área', () => {
    close(readingLineY(800), 240);
  });

  it('no início o centro da 1ª linha fica na linha de leitura; no fim, o centro da última', () => {
    const areaHeight = 800;
    const lineHeight = 50;
    const textHeight = 500; // 10 linhas
    const { distance, startY, endY } = scrollBounds({ textHeight, lineHeight, areaHeight });
    assert.equal(distance, 450);
    assert.equal(startY + lineHeight / 2, 240); // centro da primeira linha
    assert.equal(endY + textHeight - lineHeight / 2, 240); // centro da última linha
    assert.equal(textTranslateY({ offset: 100, areaHeight, lineHeight }), startY - 100);
  });
});

describe('véus do HUD não cobrem a linha que está na linha de leitura', () => {
  // iPhone SE em pé (375 × 667): moldura de 16 a 651 px; barra de cima termina em 60 e a de baixo começa em 570.
  const phone = { frameTop: 16, frameBottom: 651, topBarBottom: 60, bottomBarTop: 570, lineHeight: 50.4 };

  it('linha longe das barras: espaço de sobra (o CSS limita o esmaecimento a 32 e 48 px)', () => {
    const room = veilRoom({ ...phone, areaHeight: 635, mirrorY: false });
    close(room.top, 16 + 635 * 0.3 - 25.2 - 4 - 60); // linha de leitura − meia linha − folga de 4 px − barra
    close(room.bottom, 570 - (16 + 635 * 0.3 + 25.2 + 4));
  });

  it('invertida e baixa: a linha desce até a barra de baixo e o véu de baixo para antes dela', () => {
    // Área de 40% (254 px) presa embaixo: linha de leitura em 651 − 76,2 = 574,8, já dentro da barra.
    assert.equal(veilRoom({ ...phone, areaHeight: 254, mirrorY: true }).bottom, 0);
    // Área de 60% (381 px): linha em 536,7; o véu de baixo só pode esmaecer 570 − 565,9 px.
    close(veilRoom({ ...phone, areaHeight: 381, mirrorY: true }).bottom, 570 - (651 - 381 * 0.3 + 25.2 + 4));
  });

  it('deitado e baixo: a linha sobe até a barra de cima e o véu de cima não esmaece sobre ela', () => {
    const landscape = { frameTop: 16, frameBottom: 359, topBarBottom: 52, bottomBarTop: 305, lineHeight: 50.4 };
    // Área de 50% (171,5 px): linha de leitura em 67,45; a caixa da linha começa acima do fim da barra → 0 px.
    assert.equal(veilRoom({ ...landscape, areaHeight: 171.5, mirrorY: false }).top, 0);
  });

  it('linha toda atrás da própria barra: aquele véu esmaece como sempre (null)', () => {
    assert.equal(veilRoom({ ...phone, topBarBottom: 300, areaHeight: 635, mirrorY: false }).top, null);
    // Invertida a 20% (127 px): linha em 612,9, a caixa começa em 583,7, abaixo do começo da barra de baixo.
    assert.equal(veilRoom({ ...phone, areaHeight: 127, mirrorY: true }).bottom, null);
  });
});

describe('texto da tela (RF-03, RF-07)', () => {
  it('quebras do Windows, pontas aparadas e acentos em NFC', () => {
    assert.equal(displayText('\r\n  Olá\r\nmundo\rfim  \r\n'), 'Olá\nmundo\nfim');
    assert.equal(displayText('inconstitucionalíssimamente'), 'inconstitucionalíssimamente');
    assert.equal(displayText(null), '');
  });

  it('espaço inseparável vira espaço comum; "/" fica como está', () => {
    assert.equal(displayText('paralelepípedo\u00a0quadrado, 10\u202f%, 1\u20072'), 'paralelepípedo quadrado, 10 %, 1 2');
    // O ponto de quebra depois da "/" só entra na dupla que não cabe na coluna (slashPieces): "km/h" cabe e fica junta.
    assert.equal(displayText('entrada/saída, 120 km/h e 1/2'), 'entrada/saída, 120 km/h e 1/2');
  });

  it('a contagem de palavras do texto da tela é a mesma do roteiro salvo', () => {
    const script = 'O cabo de entrada/saída falhou: paralelepípedo\u00a0quadrado, segundo a Canon/Nikon.\r\n';
    assert.equal(countWords(displayText(script)), countWords(script));
  });
});

describe('hifenização só nas palavras que não cabem na coluna (RF-03)', () => {
  it('trechos sem quebra: entre espaços, depois de U+200B e depois de hífen ou travessão; sem repetir', () => {
    assert.deepEqual([...unbreakableUnits('O e-mail chegou —\nrápido, rápido, a/b  ')], ['O', 'e-', 'mail', 'chegou', '—', 'rápido,', 'a/b']);
    // Depois de "/" o navegador não quebra: a dupla é um trecho só. Um U+200B do próprio roteiro corta.
    assert.deepEqual([...unbreakableUnits(displayText('entrada/saída a--b'))], ['entrada/saída', 'a-', '-', 'b']);
    assert.deepEqual([...unbreakableUnits('entrada/\u200bsaída')], ['entrada/', 'saída']);
    // O navegador não quebra no espaço inseparável: a dupla fica num trecho só.
    assert.deepEqual([...unbreakableUnits('paralelepípedo\u00a0quadrado')], ['paralelepípedo\u00a0quadrado']);
    assert.deepEqual([...unbreakableUnits('')], []);
    assert.deepEqual([...unbreakableUnits(null)], []);
  });

  it('a palavra não cabe quando ocupa 99,5% da coluna ou mais', () => {
    assert.equal(needsHyphenation({ wordPx: 300, columnWidth: 358 }), false);
    assert.equal(needsHyphenation({ wordPx: 300, columnWidth: 179 }), true);
    assert.equal(needsHyphenation({ wordPx: 300, columnWidth: 301 }), true); // 300 ≥ 99,5% de 301
    assert.equal(needsHyphenation({ wordPx: 300, columnWidth: 303 }), false); // com a margem antiga (2%), ligava
    // 356 px numa coluna de 358 px (99,4%) cabe inteira.
    assert.equal(needsHyphenation({ wordPx: 356, columnWidth: 358 }), false);
    assert.equal(needsHyphenation({ wordPx: 0, columnWidth: 10 }), false); // sem medida: nada hifenizado
  });

  it('pré-seleciona pela largura a 100 px e decide pela medida no tamanho atual', () => {
    const units = [
      { word: 'paralelepípedo', width: 740 },
      { word: 'equipamentos', width: 615 },
      { word: 'microfones.', width: 560 },
      { word: 'de', width: 120 },
    ];
    const asked = [];
    // No tamanho atual (36 px) a fonte espaça as letras 5% a mais do que a 100 px.
    const widthAt = (word) => {
      asked.push(word);
      return units.find((unit) => unit.word === word).width * 0.36 * 1.05;
    };
    const words = overflowingUnits({ units, fontSize: 36, columnWidth: 230, widthAt });
    // "equipamentos" daria 221,4 px pela conta a 100 px (cabe), mas mede 232,5 px a 36 px: não cabe em 230.
    assert.deepEqual([...words], ['paralelepípedo', 'equipamentos']);
    assert.deepEqual(asked, ['paralelepípedo', 'equipamentos', 'microfones.']); // "de" nem é medida
    assert.equal(overflowingUnits({ units, fontSize: 36, columnWidth: 400, widthAt }).size, 0);
    assert.equal(overflowingUnits({ units: [], fontSize: 36, columnWidth: 100, widthAt }).size, 0);
  });

  it('o texto em pedaços: só as ocorrências das palavras que não cabem ficam marcadas', () => {
    const text = 'A paralelepípedo, e paralelepípedo.\n\nX paralelepípedo';
    assert.deepEqual(hyphenationRuns(text, new Set(['paralelepípedo,', 'paralelepípedo'])), [
      ['A ', false],
      ['paralelepípedo,', true],
      [' e paralelepípedo.\n\nX ', false],
      ['paralelepípedo', true],
    ]);
    // Trecho inteiro, não pedaço de outro: "e-" + "mail" não casa com "mail" dentro de "email".
    assert.deepEqual(hyphenationRuns('email e-mail', new Set(['mail'])), [['email e-', false], ['mail', true]]);
    assert.deepEqual(hyphenationRuns('O cabo de entrada/saída falhou', new Set(['entrada/saída'])), [
      ['O cabo de ', false],
      ['entrada/saída', true],
      [' falhou', false],
    ]);
    assert.deepEqual(hyphenationRuns('nada aqui', new Set(['outra'])), [['nada aqui', false]]);
    assert.deepEqual(hyphenationRuns('', new Set(['x'])), []);
  });

  it('só palavras de letras contam (e duplas com "/" entre letras): e-mail, endereço, número e código o navegador não hifeniza', () => {
    for (const word of ['paralelepípedo', 'Paralelepípedo,', '"coração"', '(gramática).', 'caminho-', 'd’água', 'R$', 'entrada/saída', '(Canon/Nikon),', 'km/h', 'e/ou/nem']) {
      assert.equal(isHyphenatable(word), true, word);
    }
    for (const word of ['fulano.de.tal.da.silva@exemplo.com', 'exemplo.com/', '1.200,50', '2025.', 'snake_case', 'COVID-19', 'x2', '1/2', 'https://exemplo.com/um/caminho', 'a//b', 'km/2']) {
      assert.equal(isHyphenatable(word), false, word);
    }
  });

  it('a dupla com "/" em pedaços, para o <wbr> depois de cada barra entre letras', () => {
    assert.deepEqual(slashPieces('entrada/saída'), ['entrada/', 'saída']);
    assert.deepEqual(slashPieces('(e/ou/nem),'), ['(e/', 'ou/', 'nem),']);
    assert.deepEqual(slashPieces('paralelepípedo'), ['paralelepípedo']);
    assert.deepEqual(slashPieces('/caminho/'), ['/caminho/']); // sem letra dos dois lados, sem pedaço
  });

  it('texto todo hifenizado só quando nenhuma palavra que o navegador hifenizaria (6 caracteres ou mais) cabe', () => {
    const units = [{ word: 'paralelepípedo' }, { word: 'caminho' }, { word: 'casa,' }, { word: 'de' }];
    assert.equal(hyphenatesAll(units, new Set(['paralelepípedo', 'caminho'])), true); // "casa," e "de" nunca hifenizam
    assert.equal(hyphenatesAll(units, new Set(['paralelepípedo', 'caminho', 'de'])), true);
    // "caminho" cabe: hifenizado o texto todo, o navegador o partiria no fim da linha ("cami-/nho").
    assert.equal(hyphenatesAll(units, new Set(['paralelepípedo'])), false);
    assert.equal(hyphenatesAll(units, new Set()), false);
    assert.equal(hyphenatesAll([], new Set()), false);
  });

  it('trecho misto com 6 letras seguidas (endereço, "_", "?" ou "…" grudados) deixa o texto no modo por palavra', () => {
    // Com o texto todo hifenizado, o navegador hifenizaria as letras deles ("calca-das" dentro do endereço).
    for (const text of ['Veja https://www.exemplo.org/calcadas agora', 'o snake_case_identificador', 'Sério?Perfeito!', 'pensamento…interrompido']) {
      assert.equal(hasMixedUnits(unbreakableUnits(text)), true, text);
    }
    for (const text of ['O paralelepípedo de entrada/saída ficou torto.', 'Kit-4o custa R$1.499,90 em 2026-10-28', 'a@b.co km/h', '']) {
      assert.equal(hasMixedUnits(unbreakableUnits(text)), false, text);
    }
  });
});

describe('progresso e re-layout', () => {
  it('progresso = offset ÷ D, limitado entre 0 e 1', () => {
    assert.equal(progressOf(250, 1000), 0.25);
    assert.equal(progressOf(-5, 1000), 0);
    assert.equal(progressOf(2000, 1000), 1);
    assert.equal(progressOf(10, 0), 0);
  });

  it('offsetAt é o inverso de progressOf', () => {
    assert.equal(offsetAt(0.25, 1000), 250);
    assert.equal(offsetAt(1.5, 1000), 1000);
    assert.equal(offsetAt(0.5, -10), 0);
  });

  it('trocar fonte ou largura mantém o ponto de leitura (p = offset ÷ D)', () => {
    // 40% do texto lido com D = 2000; a fonte maior leva D para 3500.
    close(preserveOffset({ offset: 800, oldDistance: 2000, newDistance: 3500 }), 1400);
    close(progressOf(1400, 3500), 0.4);
    // Voltar ao tamanho anterior devolve o mesmo offset.
    close(preserveOffset({ offset: 1400, oldDistance: 3500, newDistance: 2000 }), 800);
  });

  it('re-layout para D = 0 vai a 0 sem NaN', () => {
    assert.equal(preserveOffset({ offset: 300, oldDistance: 600, newDistance: 0 }), 0);
    assert.equal(preserveOffset({ offset: 0, oldDistance: 0, newDistance: 500 }), 0);
  });
});

describe('velocidade e tempo', () => {
  it('progresso por segundo × D = px/s do metrics.pxPerSecond', () => {
    const wpm = 150;
    const words = 300;
    const distance = 9000;
    close(progressPerSecond({ wpm, words }) * distance, pxPerSecond({ wpm, words, distance }));
  });

  it('300 palavras a 150 ppm levam 120 s do início ao fim, em qualquer D', () => {
    const rate = progressPerSecond({ wpm: 150, words: 300 });
    close(1 / rate, 120);
    close(remainingSeconds({ progress: 0, words: 300, wpm: 150 }), 120);
    close(remainingSeconds({ progress: 0.75, words: 300, wpm: 150 }), 30);
    assert.equal(remainingSeconds({ progress: 1, words: 300, wpm: 150 }), 0);
  });

  it('sem palavras ou sem velocidade não anda', () => {
    assert.equal(progressPerSecond({ wpm: 150, words: 0 }), 0);
    assert.equal(progressPerSecond({ wpm: 0, words: 10 }), 0);
    assert.equal(remainingSeconds({ progress: 0, words: 0, wpm: 150 }), 0);
  });

  it('quadro limitado a 100 ms (sem pulo depois de um engasgo) e nunca negativo', () => {
    close(frameSeconds(16.7), 0.0167);
    assert.equal(frameSeconds(5000), MAX_FRAME_MS / 1000);
    assert.equal(frameSeconds(-20), 0);
    assert.equal(frameSeconds(Number.NaN), 0);
  });

  it('rampa de retomada: 0 → 1 em 400 ms, crescente e com saída suave', () => {
    assert.equal(RAMP_MS, 400);
    assert.equal(rampFactor(0), 0);
    assert.equal(rampFactor(-10), 0);
    assert.equal(rampFactor(400), 1);
    assert.equal(rampFactor(10_000), 1);
    let previous = 0;
    for (let t = 20; t < 400; t += 20) {
      const value = rampFactor(t);
      assert.ok(value > previous && value < 1, `rampa em ${t} ms`);
      previous = value;
    }
    assert.ok(rampFactor(200) > 0.5, 'ease-out: passa da metade antes da metade do tempo');
  });

  it('arredonda ao pixel físico', () => {
    assert.equal(snapToDevicePixel(10.4, 1), 10);
    assert.equal(snapToDevicePixel(10.4, 2), 10.5);
    close(snapToDevicePixel(10.4, 3), 31 / 3);
    assert.equal(snapToDevicePixel(-7.26, 2), -7.5);
    assert.equal(snapToDevicePixel(5.2, 0), 5);
  });
});

describe('arrasto e teclado', () => {
  it('arrasto 1:1: dedo para cima avança o texto', () => {
    assert.equal(dragOffset({ startOffset: 500, deltaY: -120, mirrorY: false, distance: 2000 }), 620);
    assert.equal(dragOffset({ startOffset: 500, deltaY: 80, mirrorY: false, distance: 2000 }), 420);
  });

  it('com inversão vertical o sinal se inverte (o texto segue o dedo na tela física)', () => {
    assert.equal(dragOffset({ startOffset: 500, deltaY: -120, mirrorY: true, distance: 2000 }), 380);
    assert.equal(dragOffset({ startOffset: 500, deltaY: 80, mirrorY: true, distance: 2000 }), 580);
  });

  it('arrasto não passa do início nem do fim', () => {
    assert.equal(dragOffset({ startOffset: 50, deltaY: 400, mirrorY: false, distance: 2000 }), 0);
    assert.equal(dragOffset({ startOffset: 1900, deltaY: -400, mirrorY: false, distance: 2000 }), 2000);
    assert.equal(dragOffset({ startOffset: 0, deltaY: -50, mirrorY: false, distance: 0 }), 0);
  });

  it('teclas ← → PageUp PageDown andam 1/3 da altura da área', () => {
    assert.equal(keyboardJump(900), 300);
    assert.equal(keyboardJump(-5), 0);
  });
});

describe('modo "Ajustar na tela"', () => {
  const rect = { left: 16, top: 63, width: 400, height: 800 };

  it('ponteiro vira fração da moldura, limitada entre 0 e 1', () => {
    assert.deepEqual(pointerToFraction({ x: 116, y: 263, rect, mirrorX: false, mirrorY: false }), { fx: 0.25, fy: 0.25 });
    assert.deepEqual(pointerToFraction({ x: 0, y: 2000, rect, mirrorX: false, mirrorY: false }), { fx: 0, fy: 1 });
  });

  it('espelhado, a fração se inverte (fx = 1 − fx; fy = 1 − fy)', () => {
    assert.deepEqual(pointerToFraction({ x: 116, y: 263, rect, mirrorX: true, mirrorY: false }), { fx: 0.75, fy: 0.25 });
    assert.deepEqual(pointerToFraction({ x: 116, y: 263, rect, mirrorX: false, mirrorY: true }), { fx: 0.25, fy: 0.75 });
    assert.deepEqual(pointerToFraction({ x: 116, y: 263, rect, mirrorX: true, mirrorY: true }), { fx: 0.75, fy: 0.75 });
  });

  it('moldura sem tamanho não gera NaN', () => {
    assert.deepEqual(pointerToFraction({ x: 10, y: 10, rect: { left: 0, top: 0, width: 0, height: 0 } }), { fx: 0, fy: 0 });
  });

  it('largura pela alça lateral: Centro simétrico, Esquerda = fx, Direita = 1 − fx', () => {
    close(widthFromPointer(0.85, 'center'), 0.7);
    close(widthFromPointer(0.15, 'center'), 0.7);
    close(widthFromPointer(0.6, 'left'), 0.6);
    close(widthFromPointer(0.4, 'right'), 0.6);
  });

  it('alça lateral muda só a largura, a da base só a altura, a do canto as duas', () => {
    assert.deepEqual(Object.keys(adjustPatch({ handle: 'right', fx: 0.9, fy: 0.3, position: 'center' })), ['areaWidth']);
    assert.deepEqual(adjustPatch({ handle: 'bottom', fx: 0.9, fy: 0.3, position: 'center' }), { areaHeight: 0.3 });
    const corner = adjustPatch({ handle: 'corner-right', fx: 0.6, fy: 0.45, position: 'left' });
    close(corner.areaWidth, 0.6);
    close(corner.areaHeight, 0.45);
    const cornerLeft = adjustPatch({ handle: 'corner-left', fx: 0.3, fy: 0.5, position: 'right' });
    close(cornerLeft.areaWidth, 0.7);
  });

  it('com espelho horizontal, arrastar a alça no lado físico certo dá a largura do reflexo', () => {
    // Área "Esquerda" com espelho aparece fisicamente à direita; a alça livre fica à esquerda física.
    const { fx } = pointerToFraction({ x: rect.left + 0.4 * rect.width, y: 300, rect, mirrorX: true, mirrorY: false });
    close(adjustPatch({ handle: 'right', fx, fy: 0, position: 'left' }).areaWidth, 0.6);
  });

  it('alças por posição: Centro dos dois lados; Esquerda só à direita; Direita só à esquerda', () => {
    assert.deepEqual(handlesFor('center'), HANDLES);
    assert.deepEqual(handlesFor('left'), ['right', 'bottom', 'corner-right']);
    assert.deepEqual(handlesFor('right'), ['left', 'bottom', 'corner-left']);
  });

  it('barra do ajuste no lado livre: área baixa → lado oposto ao que está presa; alta → lado em que está presa', () => {
    // Sem inversão a área fica presa no topo; com inversão vertical, embaixo.
    assert.equal(adjustBarAtBottom({ areaHeight: 0.2, mirrorY: false }), true);
    assert.equal(adjustBarAtBottom({ areaHeight: 0.5, mirrorY: false }), true);
    assert.equal(adjustBarAtBottom({ areaHeight: 0.51, mirrorY: false }), false);
    assert.equal(adjustBarAtBottom({ areaHeight: 1, mirrorY: false }), false);
    assert.equal(adjustBarAtBottom({ areaHeight: 0.3, mirrorY: true }), false);
    assert.equal(adjustBarAtBottom({ areaHeight: 0.6, mirrorY: true }), true);
    assert.equal(adjustBarAtBottom({ areaHeight: 1, mirrorY: true }), true);
  });

  it('barra do ajuste medida: fica no lado preferido, a menos que o outro cubra menos alças', () => {
    // Celular deitado, área a 55%: em cima (o preferido) a barra cobriria as alças laterais; embaixo, nada.
    assert.equal(adjustBarAtBottom({ areaHeight: 0.55, mirrorY: false, coverTop: 1568, coverBottom: 0 }), true);
    assert.equal(adjustBarAtBottom({ areaHeight: 0.55, mirrorY: true, coverTop: 0, coverBottom: 1568 }), false);
    // Empate (os dois livres ou os dois cobrindo o mesmo): vale a regra dos 50%.
    assert.equal(adjustBarAtBottom({ areaHeight: 0.55, mirrorY: false, coverTop: 0, coverBottom: 0 }), false);
    assert.equal(adjustBarAtBottom({ areaHeight: 0.3, mirrorY: false, coverTop: 500, coverBottom: 500 }), true);
    // Os dois cobrem: o que cobre menos.
    assert.equal(adjustBarAtBottom({ areaHeight: 0.7, mirrorY: false, coverTop: 900, coverBottom: 300 }), true);
    assert.equal(adjustBarAtBottom({ areaHeight: 0.3, mirrorY: false, coverTop: 300, coverBottom: 900 }), false);
  });

  it('centro de cada alça fica na borda da área (pegar a alça no centro não muda nada)', () => {
    const settings = { position: 'center', areaWidth: 0.7, areaHeight: 0.8 };
    for (const handle of HANDLES) {
      const { fx, fy } = handleAnchor({ handle, ...settings });
      const patch = adjustPatch({ handle, fx, fy, position: settings.position });
      if ('areaWidth' in patch) close(patch.areaWidth, 0.7);
      if ('areaHeight' in patch) close(patch.areaHeight, 0.8);
    }
    assert.deepEqual(handleAnchor({ handle: 'right', position: 'left', areaWidth: 0.5, areaHeight: 1 }), { fx: 0.5, fy: 0.5 });
    assert.deepEqual(handleAnchor({ handle: 'corner-left', position: 'right', areaWidth: 0.5, areaHeight: 0.4 }), { fx: 0.5, fy: 0.4 });
  });
});

describe('mapa de teclas (seção 7)', () => {
  const key = (k, extra = {}) => keyAction({ key: k, ...extra });

  it('mapeia cada tecla da especificação', () => {
    assert.equal(key(' '), 'toggle');
    assert.equal(key('Enter'), 'toggle');
    assert.equal(key('ArrowUp'), 'speed-up');
    assert.equal(key('ArrowDown'), 'speed-down');
    assert.equal(key('ArrowLeft'), 'back');
    assert.equal(key('PageUp'), 'back');
    assert.equal(key('ArrowRight'), 'forward');
    assert.equal(key('PageDown'), 'forward');
    assert.equal(key('+'), 'font-up');
    assert.equal(key('='), 'font-up');
    assert.equal(key('-'), 'font-down');
    assert.equal(key('_'), 'font-down');
    assert.equal(key('Home'), 'restart');
    assert.equal(key('m'), 'mirror');
    assert.equal(key('M'), 'mirror');
    assert.equal(key('Escape'), 'escape');
    assert.equal(key('x'), null);
  });

  it('com Ctrl, ⌘ ou Alt a tecla fica com o navegador', () => {
    assert.equal(key('+', { ctrlKey: true }), null);
    assert.equal(key('m', { metaKey: true }), null);
    assert.equal(key('ArrowUp', { altKey: true }), null);
    assert.equal(key('+', { shiftKey: true }), 'font-up');
  });

  it('segurar Espaço, Home, M ou Esc não repete; setas e ± repetem', () => {
    assert.equal(isRepeatable('toggle'), false);
    assert.equal(isRepeatable('restart'), false);
    assert.equal(isRepeatable('mirror'), false);
    assert.equal(isRepeatable('escape'), false);
    assert.equal(isRepeatable('speed-up'), true);
    assert.equal(isRepeatable('forward'), true);
  });

  it('campos de digitação ficam com as teclas; botões, controles deslizantes e rádios não', () => {
    assert.equal(isTextField({ tagName: 'TEXTAREA' }), true);
    assert.equal(isTextField({ tagName: 'INPUT', type: 'text' }), true);
    assert.equal(isTextField({ tagName: 'INPUT', type: 'search' }), true);
    assert.equal(isTextField({ tagName: 'DIV', isContentEditable: true }), true);
    assert.equal(isTextField({ tagName: 'INPUT', type: 'range' }), false);
    assert.equal(isTextField({ tagName: 'INPUT', type: 'radio' }), false);
    assert.equal(isTextField({ tagName: 'BUTTON' }), false);
    assert.equal(isTextField(null), false);
  });
});
