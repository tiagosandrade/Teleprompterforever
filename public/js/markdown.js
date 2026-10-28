// Markdown → texto corrido para o teleprompter: tira as marcações e mantém os parágrafos.
// Módulo puro (sem DOM): usado pelo editor (importar .md, Roteiros do PC), pelo servidor e pelos testes.

// Caracteres escapados (\*, \_, \#…) e o conteúdo de código viram caracteres de uso privado durante
// a conversão, para não serem lidos como marcação; no fim, voltam a ser o caractere original.
const PROTECT_BASE = 0xe000;
const ASCII_PUNCT = /[!-/:-@[-`{-~]/g;
const protect = (text) => text.replace(ASCII_PUNCT, (ch) => String.fromCharCode(PROTECT_BASE + ch.charCodeAt(0)));
const unprotect = (text) => text.replace(/[-]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - PROTECT_BASE));

// Cerca de código com qualquer recuo: dentro de item de lista ela vem recuada.
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
/** Abre cerca? Na de crases, o resto da linha não tem crase: "```npm start``` sobe…" é código em linha. */
const isFence = (text) => {
  const open = FENCE.exec(text);
  return open && !(open[1][0] === '`' && text.includes('`', open[0].length)) ? open : null;
};
/** Fecha a cerca `mark`? Mesmo caractere, pelo menos o mesmo tamanho e nada depois. */
const closesFence = (text, mark) => {
  const close = FENCE.exec(text);
  return Boolean(close) && close[1][0] === mark[0] && close[1].length >= mark.length && !text.slice(close[0].length).trim();
};
const QUOTE_MARKS = /^(?:[ \t]*>[ \t]?)+/;
const HR = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_H1 = /^ {0,3}=+[ \t]*$/;
// "-" ou "--" logo abaixo de um parágrafo: sublinhado de título (com 3 ou mais, já saiu como régua).
const SETEXT_H2 = /^-{1,2}[ \t]*$/;
const ATX_H1 = /^ {0,3}#(?:[ \t]|$)/;
const HEADING = /^#{1,6}(?:[ \t]+|$)/;
const LIST = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)/;
const ORDERED = /^(\d{1,9})([.)])/;
// Marcador que pode interromper um parágrafo (CommonMark): tópico ou "1." / "1)", com texto depois.
const INTERRUPTS = /^(?:[-*+]|1[.)])[ \t]+\S/;
const TASK = /^\[[ xX]\][ \t]+/;
// Definição de link ("[ref]: https://…"): rótulo, destino (com "<" só na forma <…>) e título opcional, nada mais
// na linha. Nota de rodapé ("[^1]: …") sai inteira.
const REF_DEF = /^\[([^\]]+)\]:[ \t]*(<[^<>]*>|[^\s<]\S*)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^()]*\)))?[ \t]*$/;
// Destino com cara de endereço: <…>, esquema com //, mailto:, tel:, www., caminho (/, ./, ../), âncora (#) ou
// extensão e domínio no fim, com caminho opcional (logo.png, exemplo.com/pagina, exemplo.com.br).
const ADDRESS = /^<|^[a-z][a-z0-9+.-]*:\/\/|^(?:mailto|tel):|^www\.|^\.{0,2}\/|^#|\.[a-z][a-z0-9]{0,7}(?:[/?#]\S*)?$/i;
const FOOTNOTE_DEF = /^\[\^([^\]]+)\]:/;
// Referência completa ou recolhida a uma definição: "[texto][rótulo]", "[rótulo][]".
const FULL_REF = /\[([^[\]]+)\]\[([^[\]]*)\]/g;
// Imagem por referência ("![alt][rótulo]"), referência curta ("[rótulo]" sem "(", "[" ou ":" logo depois) e nota.
const IMAGE_REF = /!\[([^[\]]*)\]\[([^[\]]*)\]/g;
const SHORT_REF = /(?<!!)\[([^[\]]+)\](?![([:])/g;
const NOTE_REF = /\[\^([^[\]]+)\]/g;
/** Rótulo sem diferença de maiúsculas nem de espaços: "[Meu  Site]" e "[meu site]" são o mesmo. */
const labelKey = (label) => label.trim().replace(/\s+/g, ' ').toLowerCase();
const TABLE_SEP = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', bull: '•', deg: '°',
  copy: '©', reg: '®', trade: '™',
};

function decodeEntities(text) {
  return text.replace(/&(#\d{1,7}|#x[\da-f]{1,6}|[a-z]{2,8});/gi, (match, name) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? match;
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

// Destino de link ou imagem como no CommonMark: sem espaço (ou entre < >), um nível de parênteses e título
// opcional. "[pão e queijo](para o lanche)" não é link: o texto fica, em vez de sumir "(para o lanche)".
// O texto entre colchetes não passa por outro "[": um "[" sem fechamento não faz a conversão ficar quadrática.
const DEST = String.raw`\(\s*(?:<[^<>\n]*>|(?:[^\s()]|\([^\s()]*\))*)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)`;
const IMAGE = new RegExp(String.raw`!\[[^[\]]*\]${DEST}`, 'g');
const LINK = new RegExp(String.raw`\[([^[\]]*)\]${DEST}`, 'g');

// Tag HTML: nome ASCII e atributos válidos ("carro<velho e o gás… ->" nem chega a parecer tag).
const ATTRIBUTE = String.raw`\s+[a-zA-Z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>\x60]+|'[^']*'|"[^"]*"))?`;
const TAG = new RegExp(String.raw`<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:${ATTRIBUTE})*)\s*\/?>`, 'g');
const CLOSING_TAG = /<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/g;
// Elementos que agem sem atributo, então sozinhos já são HTML. "<img>" ou "<link>" sem atributo não fazem nada:
// numa fala, são texto ("Cole o <link> na descrição").
const BARE_TAGS = new Set(['br', 'hr', 'wbr']);
// Elementos de bloco: no começo da linha são HTML mesmo sem par no parágrafo ("<details>", "<p>Texto").
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'audio', 'blockquote', 'center', 'details', 'dialog', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'header', 'li', 'main', 'nav', 'ol', 'p', 'picture', 'pre', 'section',
  'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'video',
]);

/** A tag em `start` abre a linha (só espaço ou tab antes dela)? */
function atLineStart(text, start) {
  let before = start;
  while (before > 0 && (text[before - 1] === ' ' || text[before - 1] === '\t')) before--;
  return before === 0 || text[before - 1] === '\n';
}

/**
 * Tira só o que é HTML de verdade: fechamento ("</b>"), tag com atributo ('class="x"'), "<br>", "<hr>" e
 * "<wbr>", abertura com o fechamento no mesmo parágrafo ("<b>…</b>") ou elemento de bloco no começo da linha.
 * O resto fica como texto, porque numa fala é texto: "<seu nome>", "<Enter>", "<link do produto>",
 * "List<String>", "Fotos/<ano>/". Tag de bloco e "<hr>" viram espaço, para não grudar palavras
 * ("<li>um</li><li>dois</li>" → "um dois").
 */
function stripTags(text) {
  const closed = new Set(Array.from(text.matchAll(CLOSING_TAG), (match) => match[1].toLowerCase()));
  return text.replace(TAG, (tag, closing, name, attributes, offset) => {
    const lower = (closing ?? name).toLowerCase();
    const removed = BLOCK_TAGS.has(lower) || lower === 'hr' ? ' ' : '';
    if (closing || attributes.includes('=') || BARE_TAGS.has(lower) || closed.has(lower)) return removed;
    return BLOCK_TAGS.has(lower) && atLineStart(text, offset) ? removed : tag;
  });
}

/**
 * Marcações em linha de um parágrafo: código, imagens, links, HTML e ênfase. O parágrafo pode ter várias
 * linhas (texto quebrado em 80 colunas): link, tag e ênfase atravessam a quebra; código fica numa linha só.
 * Cada fechamento de ênfase casa com a abertura mais próxima antes dele (como no CommonMark): o conteúdo não
 * passa por outro marcador igual, só por um solto entre espaços ("a * b") ou, no _, dentro da palavra
 * (snake_case). Assim um "*.md" solto não engole o texto até o "*muito*" da linha seguinte. "*" entre
 * algarismos é conta ("2*3"), não ênfase. Referência ("[texto][rótulo]", "[rótulo][]", "[rótulo]",
 * "![alt][rótulo]") e nota ("[^1]") só saem quando o documento define o rótulo (`refs`): sem definição,
 * "[1][2]" e "[^a-z]" são texto.
 */
function inline(text, refs) {
  let plain = text.replace(/(`+)(.+?)\1(?!`)/g, (_, ticks, code) => protect(code.trim())).replace(IMAGE, '');
  // Sem definição no documento (o comum numa fala), nenhuma referência muda: as buscas delas nem rodam.
  const linked = refs.defined.size > 0;
  if (linked) plain = plain.replace(IMAGE_REF, (ref, alt, label) => (refs.defined.has(labelKey(label || alt)) ? '' : ref));
  plain = plain.replace(LINK, '$1');
  if (linked) {
    plain = plain
      .replace(FULL_REF, (ref, content, label) => (refs.defined.has(labelKey(label || content)) ? content : ref))
      .replace(SHORT_REF, (ref, label) => (refs.defined.has(labelKey(label)) ? label : ref));
  }
  if (refs.footnotes.size) plain = plain.replace(NOTE_REF, (ref, label) => (refs.footnotes.has(labelKey(label)) ? '' : ref));
  plain = plain
    .replace(/<((?:https?|mailto):[^\s<>]+)>/gi, '$1')
    // Domínio em partes sem ponto: um token enorme de "a.a.a…" sem ">" não é varrido de novo a cada ponto.
    .replace(/<([^\s<>@]+@[^\s<>.]+(?:\.[^\s<>.]+)+)>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n');
  return stripTags(plain)
    .replace(/(\d)(\*+)(?=\d)/g, (_, digit, stars) => digit + protect(stars))
    .replace(/\*\*(?=\S)((?:\s\*\*(?=\s)|(?!\*\*)[\s\S])*?\S)\*\*/g, '$1')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)((?:\s__(?=\s)|(?!__)[\s\S])*?\S)__(?![\p{L}\p{N}_])/gu, '$1$2')
    .replace(/~~(?=\S)((?:\s~~(?=\s)|(?!~~)[\s\S])*?\S)~~/g, '$1')
    .replace(/\*(?=[^\s*])((?:\s\*(?=\s)|[^*])*?[^\s*])\*/g, '$1')
    .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])((?:\s_(?=\s)|[\p{L}\p{N}]_(?=[\p{L}\p{N}])|[^_])*?[^\s_])_(?![\p{L}\p{N}_])/gu, '$1$2');
}

/** Linha sem as marcas de citação, com o recuo que vem depois delas ("> ␣␣texto" → "␣␣texto"). */
const dequote = (line) => line.replace(QUOTE_MARKS, '');
/** Tira recuo e marcas de citação ("> > texto" → "texto"). */
const unquote = (line) => dequote(line).replace(/^[ \t]+/, '');
/**
 * Para o código numa citação: tira até `max` marcas ("> > x" com `max` 1 → "> x") e diz quantas tirou. As
 * outras linhas usam dequote(), mais rápido.
 */
function dequoteLevels(line, max = Infinity) {
  let end = 0;
  let levels = 0;
  // Cada marca: recuo, ">" e um espaço opcional.
  for (let at = 0; levels < max; levels++) {
    while (line[at] === ' ' || line[at] === '\t') at++;
    if (line[at] !== '>') break;
    at++;
    if (line[at] === ' ' || line[at] === '\t') at++;
    end = at;
  }
  return { text: line.slice(end), levels };
}

/** Recuo em colunas (tab vai até o próximo múltiplo de 4): diz em que item de lista a linha está. */
function indentOf(text) {
  let column = 0;
  for (const ch of text) {
    if (ch === ' ') column++;
    else if (ch === '\t') column += 4 - (column % 4);
    else break;
  }
  return column;
}

const isTableSeparator = (line) => line !== undefined && line.includes('|') && TABLE_SEP.test(unquote(line));

/** Linha de tabela → células separadas por " · " (célula vazia some). */
function tableRow(line, refs) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row
    .split('|')
    .map((cell) => inline(cell, refs).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ');
}

/** Remove o título H1 do início (é o título do documento, não faz parte da fala). */
function dropLeadingTitle(lines) {
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) return;
  if (ATX_H1.test(lines[first])) lines.splice(first, 1);
  else if (SETEXT_H1.test(lines[first + 1] ?? '')) lines.splice(first, 2);
}

/**
 * Tira os comentários HTML. "<!--" no começo da linha (até 3 espaços antes) abre um bloco, que vai até o "-->"
 * ou até o fim do texto. No meio da linha, só sai o comentário completo ("<!-->", "<!--->" ou "<!-- … -->")
 * que não passa por linha em branco: "Use a seta <!-- ou não." é texto. O próximo "-->" e a próxima linha em
 * branco ficam guardados e só andam para a frente: muitos "<!--" sem fechamento não deixam a conversão lenta.
 */
function stripComments(text) {
  const blankLine = /\n[ \t]*\n/g;
  let plain = '';
  let copied = 0; // o texto antes disto já está em `plain` (ou era comentário)
  let close = -1; // próximo "-->" (Infinity: não tem mais)
  let blank = -1; // próxima linha em branco (Infinity: não tem mais)
  let open = text.indexOf('<!--');
  while (open !== -1) {
    if (close < open + 2) {
      const at = text.indexOf('-->', open + 2);
      close = at === -1 ? Infinity : at;
    }
    let start = open;
    while (start > 0 && open - start < 3 && text[start - 1] === ' ') start--;
    let end = -1;
    if (start === 0 || text[start - 1] === '\n') {
      end = Math.min(close + 3, text.length);
    } else {
      if (blank < open) {
        blankLine.lastIndex = open;
        blank = blankLine.exec(text)?.index ?? Infinity;
      }
      if (close < blank) end = close + 3;
    }
    if (end === -1) {
      open = text.indexOf('<!--', open + 4);
      continue;
    }
    plain += text.slice(copied, open);
    copied = end;
    open = text.indexOf('<!--', end);
  }
  return plain + text.slice(copied);
}

/**
 * Converte Markdown em texto corrido: tira o H1 inicial, títulos viram linhas comuns, some a marcação
 * (ênfase, código, citação, imagens, HTML, comentários, réguas), links viram o próprio texto, linhas de
 * tabela viram "célula · célula" e listas mantêm só o texto de cada item. Parágrafos são preservados.
 */
export function markdownToPlain(markdown) {
  if (markdown == null) return '';
  const normalized = String(markdown)
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n');
  const source = stripComments(normalized).replace(/\\([!-/:-@[-`{-~])/g, (_, ch) => protect(ch));
  const lines = source.split('\n');
  dropLeadingTitle(lines);

  // Referências: os rótulos que o texto usa ("[texto][rótulo]") saem de uma busca antes do laço; os definidos
  // (as definições que somem) e as notas de rodapé, do laço, que sabe se há parágrafo aberto. A marcação em
  // linha sai depois do laço, quando já se sabe tudo o que está definido: a definição costuma vir no fim.
  const referenced = new Set(Array.from(source.matchAll(FULL_REF), (match) => labelKey(match[2] || match[1])));
  const refs = { defined: new Set(), footnotes: new Set() };
  // Saída: linhas prontas (código, linha em branco) e blocos que passam por inline() no fim.
  const out = [];
  // Linhas seguidas de um parágrafo (ou de um item de lista): a marcação em linha sai do bloco inteiro de
  // uma vez, e as quebras de linha ficam onde estavam.
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    out.push({ paragraph: paragraph.join('\n') });
    paragraph = [];
  };
  // Bloco de código aberto: { mark: ``` ou ~~~, levels: níveis de citação em que abriu, col: coluna do texto do
  // item, só na cerca aberta na linha do marcador }.
  let fence = null;
  let inTable = false;
  // Itens de lista abertos, do mais externo ao mais interno, como no CommonMark: `col` é a coluna do texto do
  // item (recuo do marcador + o marcador). Uma linha com recuo menor que isso está fora do item. `keep` e
  // `number` são da lista: se ela mostra os números e em que número está a contagem.
  const items = [];
  /** Fecha os itens que não cabem neste recuo e devolve o mais externo deles (o irmão do item novo). */
  const closeItems = (indent) => {
    let closed = null;
    while (items.length && items[items.length - 1].col > indent) closed = items.pop();
    return closed;
  };
  // Lista numerada da vez (tipo, se mostra os números e em que número está a contagem): um "18." logo depois do
  // "17." continua a mesma numeração, mesmo que subtópicos mal recuados entre os dois tenham fechado a lista.
  let lastOrdered = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (fence) {
      // Código numa citação perde só os níveis de ">" da cerca: "> > npm start" no nível 1 → "> npm start".
      const { text, levels } = dequoteLevels(raw, fence.levels);
      const closes = closesFence(text, fence.mark);
      // A cerca aberta na linha do marcador ("- ```bash") acaba com o item, mesmo sem fechamento, quando vem um item
      // novo com menos recuo (CommonMark). Código sem recuo que não começa com marcador continua no código.
      const ends = fence.col !== undefined && !closes && indentOf(text) < fence.col && LIST.test(text.replace(/^[ \t]+/, ''));
      if (levels === fence.levels && !ends) {
        if (closes) fence = null;
        else out.push(text); // código: o texto de dentro fica como está
        continue;
      }
      // Linha com menos ">" (ou em branco), ou item novo: a citação ou o item acabou, e o código com ele. A cerca
      // de fechamento digitada sem "> " some; outra linha segue como linha comum.
      fence = null;
      if (closes) continue;
    }
    const text = dequote(raw);
    const indent = indentOf(text);
    const open = isFence(text);
    if (open) {
      flush();
      closeItems(indent);
      fence = { mark: open[1], levels: dequoteLevels(raw).levels };
      inTable = false;
      continue;
    }

    const line = text.replace(/^[ \t]+/, '');
    if (!line || HR.test(line)) {
      flush();
      out.push('');
      inTable = false;
      if (line) closeItems(indent); // régua (linha em branco não fecha: itens espaçados são a mesma lista)
      continue;
    }
    const footnote = FOOTNOTE_DEF.exec(line);
    if (SETEXT_H1.test(line) || footnote) {
      flush();
      if (footnote) refs.footnotes.add(labelKey(footnote[1]));
      continue;
    }
    // Definição de link: não interrompe parágrafo (CommonMark) e só some quando o rótulo é usado no texto ou o
    // destino tem cara de endereço. "[DICA]: sorria" e "[CORTE]: 01:15" são fala.
    const definition = !paragraph.length && REF_DEF.exec(line);
    if (definition && (referenced.has(labelKey(definition[1])) || ADDRESS.test(definition[2]))) {
      refs.defined.add(labelKey(definition[1]));
      continue;
    }
    if (line.includes('|') && TABLE_SEP.test(line)) {
      flush();
      inTable = true;
      continue;
    }
    if (line.includes('|') && (inTable || line.startsWith('|') || isTableSeparator(lines[i + 1]))) {
      flush();
      inTable = true;
      closeItems(indent);
      out.push({ row: line });
      continue;
    }
    inTable = false;

    const heading = HEADING.exec(line);
    if (heading) {
      // Título: uma linha só, sem juntar com o parágrafo de antes nem com o de depois.
      flush();
      closeItems(indent);
      paragraph.push(line.slice(heading[0].length).replace(/(?:^|[ \t]+)#+[ \t]*$/, ''));
      flush();
      continue;
    }
    // Fora do item aberto (recuo menor que o texto dele): no nível da lista, onde qualquer marcador abre item.
    const outside = items.length > 0 && items[items.length - 1].col > indent;
    if (paragraph.length && !outside && SETEXT_H2.test(line)) {
      flush();
      continue;
    }
    // Item de lista: dentro de um item com parágrafo em andamento (ou fora de lista), só abre o que o CommonMark
    // deixa interromper parágrafo, então "   2024. O rio…" numa linha quebrada continua a frase, com o número.
    const marker = LIST.exec(line);
    if (marker && (!paragraph.length || outside || INTERRUPTS.test(line))) {
      flush();
      const ordered = ORDERED.exec(line);
      const kind = ordered ? ordered[2] : line[0];
      const number = ordered ? Number(ordered[1]) : null;
      const sibling = closeItems(indent);
      // Lista numerada que não começa em 1 nem continua a anterior (ex.: "2025." logo abaixo de um tópico)
      // mantém os números na fala.
      let keep = Boolean(ordered) && number !== 1;
      let list = { keep, number };
      if (sibling?.kind === kind) {
        // Do irmão, só continua a lista o número seguinte ou o mesmo ("1. 1. 1."); numa lista sem os números, um
        // "1." recomeça a contagem. Outro ("2025." logo depois do "3.") fica como texto, e a lista continua a do
        // irmão: um "4." depois ainda é dela.
        const continues = !ordered || number === sibling.number + 1 || number === sibling.number || (number === 1 && !sibling.keep);
        list = { keep: sibling.keep, number: continues ? number : sibling.number };
        keep = continues ? sibling.keep : true;
      } else if (ordered && lastOrdered?.kind === kind && number === lastOrdered.number + 1) {
        list = { keep: lastOrdered.keep, number };
        keep = lastOrdered.keep;
      }
      if (ordered) lastOrdered = { kind, ...list };
      const col = indent + marker[0].length;
      items.push({ col, kind, ...list });
      // A caixa de tarefa sai mesmo quando o número fica ("2. [ ] item" → "2. item").
      const content = line.slice(marker[0].length).replace(TASK, '');
      const fenced = isFence(content);
      if (fenced) {
        // Cerca na linha do marcador ("- ```bash"): o código começa no próprio item (o número, se fica, antes).
        if (keep) paragraph.push(marker[0]);
        flush();
        fence = { mark: fenced[1], levels: dequoteLevels(raw).levels, col };
      } else {
        paragraph.push(keep ? marker[0] + content : content);
      }
      continue;
    }
    // Parágrafo novo: recuado até o texto do item, continua nele; com menos recuo, a lista acabou. Linha que
    // continua um parágrafo fica no mesmo bloco, com ou sem recuo.
    if (!paragraph.length) closeItems(indent);
    paragraph.push(line);
  }
  flush();

  const plain = out.flatMap((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry.row !== undefined) return tableRow(entry.row, refs);
    return inline(entry.paragraph, refs).split('\n').map((text) => text.replace(/[ \t]{2,}/g, ' ').trim());
  });
  return unprotect(decodeEntities(plain.join('\n')))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
