import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { markdownToPlain } from '../../public/js/markdown.js';

// Pasta Roteiros de verdade, só quando indicada (TELEPROMPTER_ROTEIROS_REAIS=<pasta>). Sem ela, o último teste é pulado.
const ROTEIROS_REAIS = process.env.TELEPROMPTER_ROTEIROS_REAIS;
const FALAS =
  ROTEIROS_REAIS && existsSync(ROTEIROS_REAIS) && statSync(ROTEIROS_REAIS).isDirectory()
    ? readdirSync(ROTEIROS_REAIS)
        .map((name) => join(ROTEIROS_REAIS, name, 'Roteiro', 'fala.md'))
        .filter((file) => existsSync(file))
    : [];

test('entrada vazia ou ausente vira texto vazio', () => {
  assert.equal(markdownToPlain(''), '');
  assert.equal(markdownToPlain(null), '');
  assert.equal(markdownToPlain(undefined), '');
  assert.equal(markdownToPlain('\n\n  \n'), '');
});

test('texto sem marcação passa igual (só normaliza fim de linha e espaços nas pontas)', () => {
  const text = 'Primeiro parágrafo, com e-mail, 3.1 e 1.240 palavras.\n\nSegundo: Arroz & Feijão — 50% (x < y).';
  assert.equal(markdownToPlain(`\n${text}\n`), text);
  assert.equal(markdownToPlain('Linha um\r\nLinha dois\rLinha três'), 'Linha um\nLinha dois\nLinha três');
  assert.equal(markdownToPlain('﻿Com BOM'), 'Com BOM');
});

test('remove o H1 inicial (título do documento), mas não um H1 do meio', () => {
  assert.equal(markdownToPlain('# Fala — Título\n\nTexto da fala.'), 'Texto da fala.');
  assert.equal(markdownToPlain('\n\n# Título\nTexto.'), 'Texto.');
  assert.equal(markdownToPlain('Título\n======\n\nTexto.'), 'Texto.');
  assert.equal(markdownToPlain('Intro.\n\n# Parte 2\n\nMais.'), 'Intro.\n\nParte 2\n\nMais.');
  assert.equal(markdownToPlain('## Subtítulo\n\nTexto.'), 'Subtítulo\n\nTexto.');
  assert.equal(markdownToPlain('#hashtag no começo'), '#hashtag no começo');
});

test('títulos viram linhas comuns', () => {
  assert.equal(markdownToPlain('Intro\n\n### Três ###\n\n###### Seis'), 'Intro\n\nTrês\n\nSeis');
  assert.equal(markdownToPlain('Intro\n\nSubtítulo\n---------\nTexto'), 'Intro\n\nSubtítulo\n\nTexto');
  assert.equal(markdownToPlain('Intro\n\n# C#'), 'Intro\n\nC#');
});

test('ênfase, tachado e código em linha', () => {
  assert.equal(markdownToPlain('Um **negrito**, um __forte__, um *itálico* e um _leve_.'), 'Um negrito, um forte, um itálico e um leve.');
  assert.equal(markdownToPlain('***tudo*** e ~~riscado~~'), 'tudo e riscado');
  assert.equal(markdownToPlain('Rode `npm start` ou ``a `b` c``.'), 'Rode npm start ou a `b` c.');
  assert.equal(markdownToPlain('Código: `**não** é ênfase`'), 'Código: **não** é ênfase');
});

test('não confunde * e _ que não são ênfase', () => {
  assert.equal(markdownToPlain('2 * 3 * 4 = 24'), '2 * 3 * 4 = 24');
  assert.equal(markdownToPlain('use snake_case_name aqui'), 'use snake_case_name aqui');
  assert.equal(markdownToPlain('https://exemplo.com/a_b_c'), 'https://exemplo.com/a_b_c');
  assert.equal(markdownToPlain('Escapes: \\*não\\* e \\_nem\\_ \\# isso'), 'Escapes: *não* e _nem_ # isso');
});

test('blocos de código: tira as cercas e mantém o texto de dentro', () => {
  assert.equal(markdownToPlain('Antes\n\n```js\nconst a = 1;\n```\n\nDepois'), 'Antes\n\nconst a = 1;\n\nDepois');
  assert.equal(markdownToPlain('~~~\n**literal**\n~~~'), '**literal**');
});

test('citações, listas e tarefas mantêm só o texto', () => {
  assert.equal(markdownToPlain('> Citação\n> > aninhada'), 'Citação\naninhada');
  assert.equal(markdownToPlain('- um\n* dois\n+ três\n1. quatro\n2. cinco\n\n1) seis\n2) sete'), 'um\ndois\ntrês\nquatro\ncinco\n\nseis\nsete');
  assert.equal(markdownToPlain('  - recuado\n    - mais recuado'), 'recuado\nmais recuado');
  assert.equal(markdownToPlain('- [ ] fazer\n- [x] feito'), 'fazer\nfeito');
  assert.equal(markdownToPlain('> - item citado'), 'item citado');
  assert.equal(markdownToPlain('1.240 palavras'), '1.240 palavras');
});

test('links viram o próprio texto; imagens somem', () => {
  assert.equal(markdownToPlain('Veja [a doc](https://x.com/a_(b)) e [isto][ref].\n\n[ref]: https://y.com'), 'Veja a doc e isto.');
  assert.equal(markdownToPlain('Antes ![foto](img.png "título") depois'), 'Antes depois');
  assert.equal(markdownToPlain('[![logo](logo.png)](https://x.com)Texto'), 'Texto');
  assert.equal(markdownToPlain('Fonte: <https://exemplo.com> e <fulano@exemplo.com>'), 'Fonte: https://exemplo.com e fulano@exemplo.com');
  assert.equal(markdownToPlain('Nota[^1] aqui.\n\n[^1]: rodapé'), 'Nota aqui.');
});

test('HTML e comentários somem; entidades viram caracteres', () => {
  assert.equal(markdownToPlain('Um <b>negrito</b> e <span class="x">span</span>.'), 'Um negrito e span.');
  assert.equal(markdownToPlain('Antes<!-- comentário -->depois'), 'Antesdepois');
  assert.equal(markdownToPlain('A\n\n<!--\nvárias\nlinhas\n-->\n\nB'), 'A\n\nB');
  assert.equal(markdownToPlain('linha<br>quebrada'), 'linha\nquebrada');
  assert.equal(markdownToPlain('Arroz &amp; Feijão &mdash; &#233;&#x00E9; &lt;b&gt;'), 'Arroz & Feijão — éé <b>');
});

test('réguas horizontais somem', () => {
  assert.equal(markdownToPlain('A\n\n---\n\nB\n\n***\n\nC\n\n_ _ _\n\nD'), 'A\n\nB\n\nC\n\nD');
});

test('tabelas viram linhas de texto com células separadas por " · "', () => {
  const md = '| Item | Preço |\n|---|:---:|\n| **Microfone** | R$ 199 |\n| Tripé | [R$ 89](https://x.com) |';
  assert.equal(markdownToPlain(md), 'Item · Preço\nMicrofone · R$ 199\nTripé · R$ 89');
  assert.equal(markdownToPlain('a | b\n--|--\n1 | 2'), 'a · b\n1 · 2');
  assert.equal(markdownToPlain('| só \\| um pipe escapado |'), 'só | um pipe escapado');
  assert.equal(markdownToPlain('Isto | não é tabela'), 'Isto | não é tabela');
});

test('junta 3+ quebras de linha em uma linha em branco e apara espaços', () => {
  assert.equal(markdownToPlain('A   \n\n\n\n\nB  com   espaços'), 'A\n\nB com espaços');
});

test('texto quebrado em várias linhas: link, ênfase e HTML atravessam a quebra (que fica onde estava)', () => {
  assert.equal(
    markdownToPlain('Veja o [guia de\ninstalação](https://exemplo.com/guia) antes de gravar.'),
    'Veja o guia de\ninstalação antes de gravar.',
  );
  assert.equal(markdownToPlain('É **muito\nimportante** e _bem\nleve_ e ~~não\nisso~~.'), 'É muito\nimportante e bem\nleve e não\nisso.');
  assert.equal(markdownToPlain('Veja o <a\nhref="https://x.com">site</a> agora.'), 'Veja o site agora.');
  assert.equal(markdownToPlain('> Uma [citação\n> quebrada](https://x.com).'), 'Uma citação\nquebrada.');
  assert.equal(markdownToPlain('- item com [link\n  quebrado](https://x.com)\n- outro'), 'item com link\nquebrado\noutro');
});

test('ênfase casa com a abertura mais próxima: * e _ soltos não engolem o texto até a linha seguinte', () => {
  assert.equal(markdownToPlain('Use o filtro *.md na busca. Isso é\n*muito* útil.'), 'Use o filtro *.md na busca. Isso é\nmuito útil.');
  assert.equal(markdownToPlain('Use o filtro *.md na busca. Isso é *muito* útil.'), 'Use o filtro *.md na busca. Isso é muito útil.');
  assert.equal(markdownToPlain('A pasta _rascunhos fica no Drive. Isso é\n_importante_ lembrar.'), 'A pasta _rascunhos fica no Drive. Isso é\nimportante lembrar.');
  // Marcador solto entre espaços não abre nem fecha; _ dentro da palavra também não.
  assert.equal(markdownToPlain('*a * b* e **c ** d** e _x snake_case y_'), 'a * b e c ** d e x snake_case y');
});

test('texto que parece tag ou link mas não é fica inteiro (nenhuma palavra some)', () => {
  assert.equal(
    markdownToPlain('O carro<velho e o gás\nacabou -> fomos a pé -> chegamos.'),
    'O carro<velho e o gás\nacabou -> fomos a pé -> chegamos.',
  );
  assert.equal(markdownToPlain('O carro<velho e o gas acabou -> fomos a pe.'), 'O carro<velho e o gas acabou -> fomos a pe.');
  assert.equal(markdownToPlain('x <3 e a<b>c</b>'), 'x <3 e ac');
  assert.equal(markdownToPlain('Leve [pão, queijo e\nfrutas](para o lanche) na viagem'), 'Leve [pão, queijo e\nfrutas](para o lanche) na viagem');
  // Destino entre < > pode ter espaço; título entre aspas pode quebrar a linha.
  assert.equal(markdownToPlain('Veja [a doc](<meu arquivo.md>) e [b](url "título\nquebrado").'), 'Veja a doc e b.');
  assert.equal(markdownToPlain('<img src="x.png" alt=\'a b\'> foto'), 'foto');
});

test('número no começo de uma linha quebrada continua a frase; lista numerada no meio do texto só começa em 1', () => {
  assert.equal(
    markdownToPlain('Choveu muito em março de\n2024. O rio subiu dois metros.'),
    'Choveu muito em março de\n2024. O rio subiu dois metros.',
  );
  assert.equal(markdownToPlain('Ele mora na casa\n12. A rua é longa.'), 'Ele mora na casa\n12. A rua é longa.');
  assert.equal(markdownToPlain('subiu para\n8) e ficou'), 'subiu para\n8) e ficou');
  assert.equal(markdownToPlain('Itens:\n1. primeiro\n2. segundo\n3. terceiro'), 'Itens:\nprimeiro\nsegundo\nterceiro');
  assert.equal(markdownToPlain('Itens:\n2. segundo\n3. terceiro'), 'Itens:\n2. segundo\n3. terceiro');
  assert.equal(markdownToPlain('1. a\ncontinua\n2. b'), 'a\ncontinua\nb');
  assert.equal(markdownToPlain('- item escrito em\n2024. O resto'), 'item escrito em\n2024. O resto');
  assert.equal(markdownToPlain('Texto\n- tópico\n* outro'), 'Texto\ntópico\noutro');
  // Subtópicos recuados dentro do item 3: o 4 continua a lista de fora.
  assert.equal(
    markdownToPlain('1. um\n2. dois\n3. três:\n   - a;\n   - b.\n   Mais do três.\n4. quatro\n\nFim.'),
    'um\ndois\ntrês:\na;\nb.\nMais do três.\nquatro\n\nFim.',
  );
  // Parágrafo recuado (depois de linha em branco ou de código) ainda é do item; sem recuo, a lista acabou.
  assert.equal(markdownToPlain('1. um:\n   - a.\n\n   Nota do um.\n2. dois'), 'um:\na.\n\nNota do um.\ndois');
  assert.equal(markdownToPlain('1. um:\n   ```\n   x\n   ```\n   Nota.\n2. dois'), 'um:\n   x\nNota.\ndois');
  assert.equal(markdownToPlain('1. um\n\nTexto solto.\n2. dois'), 'um\n\nTexto solto.\n2. dois');
  assert.equal(markdownToPlain('1. um\n## Título\n   recuado\n2. dois'), 'um\nTítulo\nrecuado\n2. dois');
});

test('dentro de lista, o recuo decide: linha recuada até o texto do item continua a frase, com o número', () => {
  // Continuação recuada (o jeito do Prettier) de um item numerado ou de um tópico.
  assert.equal(
    markdownToPlain('1. Choveu muito em março de\n   2024. O rio subiu dois metros.\n2. Segundo item.'),
    'Choveu muito em março de\n2024. O rio subiu dois metros.\nSegundo item.',
  );
  assert.equal(markdownToPlain('- tópico\n  1. sub\n- outro que fala de\n  12. A rua é longa.'), 'tópico\nsub\noutro que fala de\n12. A rua é longa.');
  // Na citação, o recuo conta depois do ">".
  assert.equal(markdownToPlain('> 1. um\n>\n>    Nota do um.\n> 2. dois'), 'um\n\nNota do um.\ndois');
  // Irmão de uma sublista: mesmo nível, mesmo marcador.
  assert.equal(markdownToPlain('- a\n  1. b\n   2. c\n- d'), 'a\nb\nc\nd');
  // Lista numerada que começa do nada fora do 1 (um ano quebrado abaixo de um tópico) mantém o número;
  // a que continua a numeração anterior (2 → 3, com subtópicos mal recuados no meio) não.
  assert.equal(markdownToPlain('- item escrito em\n2024. O resto'), 'item escrito em\n2024. O resto');
  assert.equal(markdownToPlain('1. a\n2. b:\n  - x;\n  - y.\n3. c'), 'a\nb:\nx;\ny.\nc');
  assert.equal(markdownToPlain('16. a\n17. b'), '16. a\n17. b'); // lista que começa no 16: o número é parte do texto
});

test('tag que não é HTML de verdade fica como texto', () => {
  assert.equal(markdownToPlain('O carro<velho e o motor>novo, sem pressa.'), 'O carro<velho e o motor>novo, sem pressa.');
  assert.equal(markdownToPlain('Digite <seu nome> no campo e <sua senha> embaixo.'), 'Digite <seu nome> no campo e <sua senha> embaixo.');
  assert.equal(markdownToPlain('Abra http://<ip-do-pc>:3210, tecle <Enter>; em Java, List<String>.'), 'Abra http://<ip-do-pc>:3210, tecle <Enter>; em Java, List<String>.');
  assert.equal(markdownToPlain('Salve em Fotos/<ano>/viagem.md.'), 'Salve em Fotos/<ano>/viagem.md.');
  // HTML de verdade continua saindo: par no parágrafo, atributo, <br>/<hr>/<wbr>, fechamento, bloco no começo da linha.
  assert.equal(markdownToPlain('Um <kbd>Ctrl</kbd> e <u>isto</u>, <hr> fim.'), 'Um Ctrl e isto, fim.');
  assert.equal(markdownToPlain('<details>\n<summary>Mais</summary>\n\nConteúdo.\n\n</details>'), 'Mais\n\nConteúdo.');
});

test('casos que antes trocavam ou apagavam texto', () => {
  assert.equal(markdownToPlain('2*3 e 4*5, 2**10'), '2*3 e 4*5, 2**10'); // conta, não ênfase
  assert.equal(markdownToPlain('[DICA]: sorria e continua.'), '[DICA]: sorria e continua.'); // fala, não definição
  assert.equal(markdownToPlain('Texto\n-\nmais'), 'Texto\nmais'); // sublinhado de título
  assert.equal(markdownToPlain('> ```\n> x = a*b*c\n> ```\n> Fim.'), 'x = a*b*c\nFim.'); // código dentro de citação
  assert.equal(markdownToPlain('1. passo:\n\n     ```\n     npm *start*\n     ```'), 'passo:\n\n     npm *start*'); // código recuado no item
});

test('parágrafo enorme com marcadores sem par não trava (pior caso)', () => {
  const fast = (label, text) => {
    const start = performance.now();
    markdownToPlain(text);
    const ms = performance.now() - start;
    assert.ok(ms < 500, `${label}: ${Math.round(ms)} ms`);
  };
  for (const unit of ['a *b c ', 'a _b c ', 'a **b c ', 'a <b c d ', 'a [b](c d ', 'a ~~b c ', 'a * b ** c _ d ', '![a ', '[^a ', '[a ', '<b x ']) {
    fast(JSON.stringify(unit), unit.repeat(Math.ceil(20000 / unit.split(' ').length)));
  }
  // "<!--" sem fechamento, 20 mil vezes: cada um procuraria o "-->" até o fim do texto.
  for (const unit of ['<!-- ', 'a <!-- ']) fast(JSON.stringify(unit), unit.repeat(20000));
  // E-mail sem ">" num token só de ~100 mil caracteres: cada ponto voltaria a varrer o resto.
  fast('"<a@" + "a." × 50 mil', '<a@' + 'a.'.repeat(50000));
});

test('a marcação não atravessa parágrafo, item de lista, título nem código', () => {
  assert.equal(markdownToPlain('**um\n\ndois**'), '**um\n\ndois**');
  assert.equal(markdownToPlain('- **um\n- dois**'), '**um\ndois**');
  assert.equal(markdownToPlain('Texto *a\n## Título*'), 'Texto *a\nTítulo*');
  assert.equal(markdownToPlain('**a\n```\nb**\n```'), '**a\nb**');
});

test('linha parecida com definição de link é fala; só some a definição usada ou com destino de endereço', () => {
  const cues = [
    '[DICA]: sorria', '[00:42]: sorria', '[CORTE]: plano-geral (lento)', '[MÚSICA]: (sobe)', '[Nota]: 2025',
    '[CORTE]: 01:15', '[LENTE]: EF-4.1', '[Nota]: v1.5', '[Fonte]: Norte/Sul', '[SLIDE]: foto#3', '[DICA]: sorria…',
  ];
  for (const cue of cues) {
    assert.equal(markdownToPlain(cue), cue);
    assert.equal(markdownToPlain(`Fala.\n\n${cue}\n\nContinua.`), `Fala.\n\n${cue}\n\nContinua.`);
    // No meio do parágrafo, nem definição de verdade interrompe (CommonMark).
    assert.equal(markdownToPlain(`Primeira frase da fala\n${cue}\ne segue a fala.`), `Primeira frase da fala\n${cue}\ne segue a fala.`);
  }
  assert.equal(markdownToPlain('> [DICA]: sorria'), '[DICA]: sorria');
  assert.equal(markdownToPlain('Veja\n[ref]: https://y.com'), 'Veja\n[ref]: https://y.com');
  assert.equal(markdownToPlain('- Primeiro ponto\n[ref]: https://y.com\n- Segundo ponto'), 'Primeiro ponto\n[ref]: https://y.com\nSegundo ponto');
  // Continua saindo: destino com cara de endereço, ou rótulo usado no texto (maiúsculas e espaços não contam).
  for (const definition of ['[ref]: https://y.com', '[logo]: logo.png "Logo"', '[1]: <meu arquivo.md>', '[a]: www.exemplo.com', '[b]: exemplo.com/pagina', '[c]: ./docs/guia', '[d]: #secao']) {
    assert.equal(markdownToPlain(`Texto.\n\n${definition}`), 'Texto.');
  }
  assert.equal(markdownToPlain('Veja [isto][nota].\n\n[nota]: qualquer'), 'Veja isto.');
  assert.equal(markdownToPlain('Veja a [Nota  Fiscal][].\n\n[nota fiscal]: qualquer'), 'Veja a Nota Fiscal.');
  assert.equal(markdownToPlain('Texto[^x].\n\n[^x]: Nota de rodapé com várias palavras.'), 'Texto.');
  // "<" no destino só vale na forma <…>: "<!--" sem fechamento não faz da linha uma definição.
  assert.equal(markdownToPlain('[ref]:\t<!--\n```'), '[ref]:\t<!--');
});

test('referência e nota de rodapé sem definição ficam como estão', () => {
  assert.equal(markdownToPlain('O tripé custa R$ 120 [1][2] na loja.'), 'O tripé custa R$ 120 [1][2] na loja.');
  assert.equal(markdownToPlain('Use a regex [^a-z] para filtrar.'), 'Use a regex [^a-z] para filtrar.');
  assert.equal(markdownToPlain('Veja o [texto][] e a ![foto][img].'), 'Veja o [texto][] e a ![foto][img].');
  assert.equal(markdownToPlain('[DICA]\n\n[DICA]: sorria'), '[DICA]\n\n[DICA]: sorria');
  // Com definição: completa, recolhida e curta viram o texto; imagem por referência some. Vale na tabela também.
  assert.equal(markdownToPlain('Veja o [site].\n\n[site]: https://x.com'), 'Veja o site.');
  assert.equal(markdownToPlain('Veja o [Site][] e a ![foto][img] aqui.\n\n[site]: https://x.com\n[img]: foto.png'), 'Veja o Site e a aqui.');
  assert.equal(markdownToPlain('Fonte [1][2] e [3].\n\n[2]: https://a.com\n[3]: https://b.com'), 'Fonte 1 e 3.');
  assert.equal(markdownToPlain('| a | b |\n|---|---|\n| [x][r] | [y][z] |\n\n[r]: https://r.com'), 'a · b\nx · [y][z]');
});

test('número que não continua a lista numerada fica no texto (ano depois de uma lista)', () => {
  assert.equal(
    markdownToPlain('Os três pontos:\n\n1. Luz.\n2. Som.\n3. Enquadramento.\n\n2025. Esse foi o ano em que tudo mudou.'),
    'Os três pontos:\n\nLuz.\nSom.\nEnquadramento.\n\n2025. Esse foi o ano em que tudo mudou.',
  );
  // Linha quebrada sem recuo, ou com recuo menor que o texto do item (2 espaços no "1.", 3 no "10.").
  const expected = 'Choveu muito em março de\n2024. O rio subiu dois metros.\nSegundo item.';
  assert.equal(markdownToPlain('1. Choveu muito em março de\n2024. O rio subiu dois metros.\n2. Segundo item.'), expected);
  assert.equal(markdownToPlain('1. Choveu muito em março de\n  2024. O rio subiu dois metros.\n2. Segundo item.'), expected);
  const nine = Array.from({ length: 9 }, (_, i) => `${i + 1}. item`).join('\n');
  assert.equal(markdownToPlain(`${nine}\n10. Choveu em\n   2024. O rio subiu.`), `${'item\n'.repeat(9)}Choveu em\n2024. O rio subiu.`);
  // Dentro de citação e depois de uma sublista.
  assert.equal(markdownToPlain('> 1. a\n> 2. b\n\n2025. O ano em que tudo mudou.'), 'a\nb\n\n2025. O ano em que tudo mudou.');
  assert.equal(markdownToPlain('1. a\n   - sub\n2025. b'), 'a\nsub\n2025. b');
  // A lista continua do irmão: o "4." depois do ano ainda é dela. Número repetido ("1. 1. 1.") também conta.
  assert.equal(markdownToPlain('1. a\n2. b\n3. c\n2025. ano\n4. d'), 'a\nb\nc\n2025. ano\nd');
  assert.equal(markdownToPlain('1. a\n1. b\n1. c'), 'a\nb\nc');
  assert.equal(markdownToPlain('2. a\n3. b\n1. c'), '2. a\n3. b\n1. c'); // lista com números: o "1." fica
  // Troca aceita: numa lista com número repetido e salto, o número que salta aparece.
  assert.equal(markdownToPlain('1. a\n2. b\n2. c\n5. d'), 'a\nb\nc\n5. d');
});

test('"1." que recomeça uma lista sem números é lista nova: o número some', () => {
  assert.equal(markdownToPlain('1. a\n2. b\n\n1. c\n2. d'), 'a\nb\n\nc\nd');
  assert.equal(markdownToPlain('1. Primeiro passo\n2. Segundo passo\n1. Outro começo'), 'Primeiro passo\nSegundo passo\nOutro começo');
  assert.equal(markdownToPlain('1) a\n2) b\n1) c\n2) d'), 'a\nb\nc\nd');
});

test('caixa de tarefa sai também quando o número fica', () => {
  assert.equal(markdownToPlain('2. [ ] revisar roteiro\n3. [x] gravar'), '2. revisar roteiro\n3. gravar');
});

test('três crases com crase depois, na mesma linha, são código em linha, não cerca', () => {
  assert.equal(
    markdownToPlain('Intro.\n\n```npm start``` sobe o servidor na porta certa.\n\nDepois, **abra** o app.\n\n## Fim'),
    'Intro.\n\nnpm start sobe o servidor na porta certa.\n\nDepois, abra o app.\n\nFim',
  );
  assert.equal(markdownToPlain('Para subir, rode\n```npm start``` no terminal.'), 'Para subir, rode\nnpm start no terminal.');
  assert.equal(markdownToPlain('> ```npm start``` sobe o servidor.'), 'npm start sobe o servidor.');
  // Cerca com info sem crase abre; na de til, a info pode ter crase.
  assert.equal(markdownToPlain('``` js title\nconst a = 1;\n```'), 'const a = 1;');
  assert.equal(markdownToPlain('~~~ a ``` b\n**x**\n~~~'), '**x**');
});

test('código aberto numa citação acaba com a citação', () => {
  assert.equal(markdownToPlain('> ```\n> x = 1\n\nTexto **normal** com _ênfase_.\n\n## Título\n\n- item'), 'x = 1\n\nTexto normal com ênfase.\n\nTítulo\n\nitem');
  assert.equal(markdownToPlain('> ```\n> x\nTexto **a**'), 'x\nTexto a');
  // A cerca de fechamento digitada sem "> " fecha o código e some.
  assert.equal(markdownToPlain('> ```\n> code\n```\n\nTexto **b** e o [link](https://x.com).\n\n## Parte 2'), 'code\n\nTexto b e o link.\n\nParte 2');
  // Só saem os níveis de ">" da cerca; com menos níveis, a citação de dentro acabou.
  assert.equal(markdownToPlain('> ```\n> > npm start\n> ```'), '> npm start');
  assert.equal(markdownToPlain('> > ```\n> > a\n> b'), 'a\nb');
});

test('cerca na linha do marcador de item abre o código do item', () => {
  assert.equal(
    markdownToPlain('Passos:\n\n- ```bash\n  npm start\n  ```\n- Depois **abra** o app.\n\nTexto **final**.'),
    'Passos:\n\n  npm start\nDepois abra o app.\n\nTexto final.',
  );
  assert.equal(markdownToPlain('- a\n- ```\n  b\n\n\n  ```\n- c'), 'a\n  b\n\nc'); // exemplo do CommonMark
  assert.equal(markdownToPlain('1. ```\n   npm start\n   ```\n2. Abra o **app**.\n\n## Fim'), 'npm start\nAbra o app.\n\nFim');
  assert.equal(markdownToPlain('> - ```\n>   x\n>   ```\n> - **dois**\n\nFim **aqui**.'), 'x\ndois\n\nFim aqui.');
  // Com caixa de tarefa; e numa lista que começa no 2, o número fica antes do código.
  assert.equal(markdownToPlain('- [ ] ```\n  x\n  ```\n- y'), 'x\ny');
  assert.equal(markdownToPlain('Antes.\n\n2. ```\n   x\n   ```\n3. y'), 'Antes.\n\n2.\n   x\n3. y');
});

test('cerca sem fechamento na linha do marcador acaba no item seguinte com menos recuo', () => {
  assert.equal(
    markdownToPlain('Passos:\n\n- ```bash\n  npm start\n- Depois **abra** o app.\n\n## Parte 2\n\nTexto **final**.'),
    'Passos:\n\n  npm start\nDepois abra o app.\n\nParte 2\n\nTexto final.',
  );
  // O "```" de um bloco de código depois abre esse bloco, em vez de fechar a cerca do item.
  assert.equal(
    markdownToPlain('Passos:\n\n- ```bash\n  npm start\n- Depois **abra** o app.\n\n```\n[aviso]: http://x\n```\n\nTexto **final**.'),
    'Passos:\n\n  npm start\nDepois abra o app.\n\n[aviso]: http://x\n\nTexto final.',
  );
  assert.equal(markdownToPlain('* ```js\n  a\n* b **c**'), 'a\nb c');
  assert.equal(markdownToPlain('- a\n  - ```js\n    x\n- b **c**'), 'a\n    x\nb c');
  assert.equal(markdownToPlain('> - ```\n>   x\n> - **dois**'), 'x\ndois');
  // Linha recuada até o texto do item fica no código, mesmo com cara de item; código sem recuo também.
  assert.equal(markdownToPlain('Lista:\n\n- ```yaml\n  - nome: x\n  ```\n- y'), 'Lista:\n\n  - nome: x\ny');
  assert.equal(markdownToPlain('- ```bash\nnpm start\n```\n\nTexto **x**.'), 'npm start\n\nTexto x.');
});

test('nome de elemento vazio sem atributo é texto; só <br>, <hr> e <wbr> saem sozinhos', () => {
  for (const text of ['Cole o <link> na descrição e o <input> no campo.', 'Acesse <link do produto> agora.', 'A <meta de vendas> é alta.', 'Veja o <source code> aqui.', 'Acesse <LINK> e veja a <img>.']) {
    assert.equal(markdownToPlain(text), text);
  }
  // Com atributo "=" ou com par no parágrafo, sai como qualquer tag.
  assert.equal(markdownToPlain('Foto <img src="x.png"> e <link rel="icon" href="a.ico"> aqui.'), 'Foto e aqui.');
  assert.equal(markdownToPlain('Um <hr> e pal<wbr>avra<br/>nova.'), 'Um e palavra\nnova.');
});

test('tag de bloco removida vira espaço e não gruda palavras; tag em linha não deixa espaço', () => {
  assert.equal(markdownToPlain('<ul><li>um</li><li>dois</li></ul>'), 'um dois');
  assert.equal(markdownToPlain('<p>Primeiro</p><p>Segundo</p>'), 'Primeiro Segundo');
  assert.equal(markdownToPlain('<table><tr><td>Célula 1</td><td>Célula 2</td></tr></table>'), 'Célula 1 Célula 2');
  assert.equal(markdownToPlain('Antes<hr>depois'), 'Antes depois');
  assert.equal(markdownToPlain('pal<b>avra</b> e <span class="x">jun</span>to e <a href="u">li</a>nk'), 'palavra e junto e link');
});

test('tag de bloco no começo da linha sai mesmo com texto depois; no meio da linha, sem par, fica', () => {
  assert.equal(markdownToPlain('<p>Texto'), 'Texto');
  assert.equal(markdownToPlain('<li>Item'), 'Item');
  assert.equal(markdownToPlain('  <div>Recuado'), 'Recuado');
  assert.equal(markdownToPlain('<ul>\n<li>Primeiro item\n<li>Segundo item\n</ul>'), 'Primeiro item\nSegundo item');
  assert.equal(markdownToPlain('<p>Primeiro parágrafo em HTML.\n\nSegundo.</p>'), 'Primeiro parágrafo em HTML.\n\nSegundo.');
  assert.equal(markdownToPlain('Use <details open> em linha.'), 'Use <details open> em linha.');
  assert.equal(markdownToPlain('Veja a <section> do site.'), 'Veja a <section> do site.');
});

test('comentário HTML: "<!--" no começo da linha é bloco; no meio da linha, só o comentário completo sai', () => {
  assert.equal(markdownToPlain('Use a seta <!-- ou não.\n\nSegundo parágrafo inteiro.'), 'Use a seta <!-- ou não.\n\nSegundo parágrafo inteiro.');
  assert.equal(markdownToPlain('Texto <!-- a\n\nb --> fim'), 'Texto <!-- a\n\nb --> fim'); // passaria por linha em branco
  assert.equal(markdownToPlain('a <!--> b c d\n\ne f'), 'a b c d\n\ne f');
  assert.equal(markdownToPlain('a <!---> b'), 'a b');
  assert.equal(markdownToPlain('Veja <!-- nota\nque continua --> isto.'), 'Veja isto.');
  // No começo da linha (até 3 espaços), vai até o "-->" ou até o fim, como antes.
  assert.equal(markdownToPlain('A\n\n   <!-- rascunho\nsem fim\n\nB'), 'A');
  assert.equal(markdownToPlain('A\n<!-- x -->\nB'), 'A\n\nB');
});

test('fala.md de verdade (TELEPROMPTER_ROTEIROS_REAIS) vira só os parágrafos falados', { skip: !FALAS.length && 'defina TELEPROMPTER_ROTEIROS_REAIS com uma pasta Roteiros' }, () => {
  for (const file of FALAS) {
    const source = readFileSync(file, 'utf8');
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    if (!/^# Fala/.test(lines[0])) continue;
    // Sem diff na falha: o texto do roteiro não vai para o log, só o nome da pasta dele.
    const same = markdownToPlain(source) === lines.slice(1).join('\n').trim();
    assert.ok(same, `${basename(dirname(dirname(file)))}: a fala convertida não é o texto sem o título`);
  }
});
