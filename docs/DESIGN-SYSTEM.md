# Design system: Teleprompter

Simples, escuro e silencioso. A interface existe para sair da frente do texto.

## 1. Princípios

1. **O texto é o produto.** Lendo, a tela mostra só o texto.
2. **Escuro por padrão.** Palco em preto puro (`#000`): é o que o vidro do teleprompter precisa (preto fica transparente no reflexo) e economiza bateria em tela OLED. O editor também é escuro, para não ofuscar no set.
3. **Controles flutuam e somem.** Aparecem só na pausa, em superfícies translúcidas sobre o palco.
4. **Uma cor de destaque.** Âmbar (`--c-accent`), só para a ação principal, interruptor ligado, preenchimento do controle deslizante, foco e guia de leitura.
5. **Feito para o dedo.** Alvo mínimo de 44 × 44 px; nada depende de hover.

## 2. Tokens

Todos em `public/css/tokens.css`. Nenhum outro arquivo define cor, fonte, espaço, raio, duração ou camada fora destas variáveis.

### Cor

| Token | Valor | Uso |
|---|---|---|
| `--c-stage` | `#000` | fundo do teleprompter |
| `--c-bg` | `#0b0b0c` | fundo do editor |
| `--c-surface` | `rgba(28,28,30,.78)` + `--blur` | HUD, painel, diálogos, avisos |
| `--c-surface-solid` | `#1c1c1e` | a mesma superfície onde não há `backdrop-filter` |
| `--c-surface-strong` | `rgba(28,28,30,.95)` + `--blur` | painel de ajustes e diálogos: ficam legíveis sobre o texto mesmo sem o desfoque |
| `--c-surface-raised` | branco 8% | botão secundário, trilho, campo, segmentado |
| `--c-surface-pressed` | branco 16% | estado pressionado, interruptor desligado |
| `--c-border` | branco 10% | bordas e divisórias |
| `--c-text` | `#f5f5f7` | texto da interface (≈ 18:1 sobre `--c-bg`) |
| `--c-text-muted` | 64% | rótulos, estatísticas, dicas (≈ 7,5:1) |
| `--c-text-faint` | 40% | só decoração e desativado (≈ 3,5:1, nunca para texto que precisa ser lido) |
| `--c-prompter` | `#fff` | texto do teleprompter |
| `--c-accent` | `#ffb020` | destaque (≈ 10,8:1 sobre `--c-bg`) |
| `--c-accent-pressed` | `#e09400` | destaque pressionado |
| `--c-on-accent` | `#1a1200` | texto sobre o destaque (≈ 10,8:1) |
| `--c-danger` | `#ff453a` | erro |
| `--c-focus` | `#ffb020` | anel de foco |
| `--c-scrim` | preto 50% | fundo atrás de diálogos |

### Tipografia

| Token | Valor | Uso |
|---|---|---|
| `--font-ui` | fontes do sistema (SF Pro Text no iOS) | interface |
| `--font-prompter` | fontes do sistema (SF Pro Display no iOS) | texto do teleprompter |
| `--fs-caption` | 13 px | rótulos de seção, metadados |
| `--fs-body` | 16 px | texto padrão; mínimo em campos (evita zoom do iOS) |
| `--fs-headline` | 17 px | títulos de painel e diálogo, botões |
| `--fs-title` | 20 px | marca do editor |
| `--fs-display` | 32 px | números grandes |
| `--lh-prompter` / `--fw-prompter` | 1,4 / 600 | entrelinha e peso do teleprompter |

Números que mudam (velocidade, tamanho, tempo) usam `font-variant-numeric: tabular-nums` para não "tremer".

### Espaço, raio, toque, elevação, movimento, camadas

- Espaço (base 4): `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 24 · `--space-6` 32 · `--space-7` 48 · `--gutter` 16.
- Raio: `--radius-sm` 8 · `--radius-md` 12 · `--radius-lg` 20 · `--radius-pill` 999.
- Toque: `--hit` 44 px · `--hit-lg` 52 px (botão primário).
- Elevação: `--shadow-float` (só em superfícies flutuantes) e `--blur` (sempre com o prefixo `-webkit-backdrop-filter` junto, por causa do Safari).
- Movimento: `--dur-fast` 120 ms (pressionar) · `--dur-base` 200 ms (aparecer/sumir) · `--dur-slow` 320 ms (painéis). Curva `--ease-out`. Com `prefers-reduced-motion`, as durações viram 0.
- Camadas: `--z-stage` 0 · `--z-hud` 10 · `--z-panel` 20 · `--z-adjust` 30 · `--z-dialog` 40 · `--z-toast` 50.
- Áreas seguras: `--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left`.

## 3. Componentes

Classes compartilhadas (sem prefixo) ficam em `css/components.css`. Estilo específico de tela fica no CSS da tela, com prefixo (`.ed-`, `.pn-`, `.pr-`). Ícones vêm de `js/icons.js` (`icon(nome, tamanho)`).

### Botão

```html
<button class="btn btn--primary" type="button" data-action="start">Abrir teleprompter</button>
<button class="btn btn--secondary" type="button">Cancelar</button>
<button class="btn btn--ghost" type="button">{ícone} <span class="btn__label">Importar</span></button>
<button class="btn btn--icon" type="button" aria-label="Ajustes">{ícone}</button>
<button class="btn btn--icon btn--glass" type="button" aria-label="Voltar ao texto">{ícone}</button>
```

| Variante | Visual |
|---|---|
| `btn--primary` | fundo `--c-accent`, texto `--c-on-accent`, peso 600, altura `--hit-lg`, raio pill |
| `btn--secondary` | fundo `--c-surface-raised`, texto `--c-text`, altura `--hit`, raio `--radius-md` |
| `btn--ghost` | sem fundo, texto `--c-text-muted`, que vira `--c-text` ao pressionar; altura `--hit` |
| `btn--icon` | 44 × 44, raio pill, sem fundo; ícone de 24 px |
| `btn--glass` | combina com `btn--icon`: fundo `--c-surface` + `--blur`, para flutuar sobre o texto |
| `btn--sm` | 36 × 36 visual, mas com área de toque de 44 px (pseudo-elemento) |

Estados: `:active` → `transform: scale(.96)` e fundo `--c-surface-pressed` (no primário, `--c-accent-pressed`), em `--dur-fast`. `:focus-visible` → contorno de 2 px em `--c-focus` com afastamento de 2 px. `:disabled` → opacidade .38, sem toque. Hover só dentro de `@media (hover: hover)`. `.btn__label` some abaixo de 400 px quando o botão também tem ícone (o `aria-label` continua).

### Pílula

Barra flutuante horizontal (a base do HUD).

```html
<div class="pill">
  <button class="btn btn--icon" aria-label="Recomeçar do início">…</button>
  <span class="pill__sep" aria-hidden="true"></span>
  <button class="btn btn--icon" aria-label="Diminuir velocidade">…</button>
  <span class="pill__value"><b>150</b><small>ppm</small></span>
  <button class="btn btn--icon" aria-label="Aumentar velocidade">…</button>
</div>
```

Fundo `--c-surface` + `--blur`, borda 1 px `--c-border`, raio pill, sombra `--shadow-float`, espaçamento interno `--space-1`, `gap: --space-1`. `.pill__sep`: 1 × 24 px em `--c-border`. `.pill__value`: largura mínima 64 px, centralizado, número em 17 px peso 600 tabular e unidade em `--fs-caption` `--c-text-muted`.

### Controle segmentado

```html
<div class="seg" role="radiogroup" aria-label="Posição do texto">
  <label class="seg__opt"><input type="radio" name="position" value="left"><span>Esquerda</span></label>
  <label class="seg__opt"><input type="radio" name="position" value="center"><span>Centro</span></label>
  <label class="seg__opt"><input type="radio" name="position" value="right"><span>Direita</span></label>
</div>
```

Contêiner com fundo `--c-surface-raised`, raio `--radius-md`, 2 px de espaçamento interno, altura `--hit`. Opções dividem a largura igualmente. Selecionada: fundo `--c-text` e texto `--c-bg` (alto contraste, neutro). O rádio nativo fica visualmente escondido, mas acessível; o foco aparece no `span` (`:focus-visible` dentro).

### Controle deslizante

```html
<div class="slider">
  <div class="slider__head">
    <label for="pn-speed">Velocidade</label>
    <output for="pn-speed">150 ppm</output>
  </div>
  <div class="slider__row">
    <button class="btn btn--icon btn--sm" type="button" aria-label="Diminuir velocidade">{minus}</button>
    <input id="pn-speed" type="range" name="speed" min="40" max="320" step="5" style="--fill: 39%">
    <button class="btn btn--icon btn--sm" type="button" aria-label="Aumentar velocidade">{plus}</button>
  </div>
</div>
```

`-webkit-appearance: none`. Altura do `input` 44 px (área de toque); trilho de 4 px, raio pill, fundo `--c-surface-raised` com a parte preenchida em `--c-accent` (gradiente usando `--fill`, atualizado pelo JS). Polegar de 28 px, branco, com sombra leve. `output` em `--fs-body`, tabular, `--c-text`.

### Interruptor

```html
<label class="switch">
  <span class="switch__text">Espelhar horizontalmente<small>Para vidro de teleprompter</small></span>
  <input type="checkbox" name="mirrorX" role="switch">
  <span class="switch__track" aria-hidden="true"></span>
</label>
```

Linha com altura mínima `--hit`, texto à esquerda e trilho à direita. Trilho 51 × 31, raio pill: desligado `--c-surface-pressed`, ligado `--c-accent`. Polegar de 27 px, branco, desliza 20 px em `--dur-base`. `small` em `--fs-caption`, `--c-text-muted`, em linha própria.

### Folha / painel

```html
<aside class="sheet sheet--bottom" role="dialog" aria-modal="false" aria-labelledby="pn-title">
  <header class="sheet__header">
    <h2 class="sheet__title" id="pn-title" tabindex="-1">Ajustes</h2>
    <button class="btn btn--icon" data-action="close-panel" aria-label="Fechar ajustes">{close}</button>
  </header>
  <div class="sheet__body">
    <section class="sheet__section"><h3 class="sheet__label">Velocidade</h3>…</section>
  </div>
</aside>
```

Fundo `--c-surface-strong` + `--blur` (sem suporte a `backdrop-filter`: `--c-surface-solid`), borda `--c-border`, sombra `--shadow-float`. O diálogo usa o mesmo fundo. Corpo com rolagem interna e `overscroll-behavior: contain`. `.sheet__label` em `--fs-caption`, `--c-text-muted`, peso 600. Seções separadas por 1 px de `--c-border` e `--space-4` de respiro.

- `sheet--bottom` (celular em pé): presa embaixo, raio `--radius-lg` só nos cantos de cima, altura máxima 60% da tela (`60dvh`, com `60vh` de reserva), espaço extra de `--safe-bottom`. Entra subindo (`translateY`), em `--dur-slow`.
- `sheet--top` (celular em pé com "Inverter verticalmente"): a mesma folha presa em cima, raio só nos cantos de baixo, espaço extra de `--safe-top`. Entra descendo. Invertida, a linha de leitura fica a 70% da altura, e a folha de baixo a esconderia.
- `sheet--side` (demais casos): flutuante, 340 px (no máximo a largura da tela menos 2 × `--gutter`), afastada `--gutter` + área segura das bordas, raio `--radius-lg`. Modificadores `sheet--left` e `sheet--right`. Entra deslizando de lado, em `--dur-slow`.

### Diálogo

Para "Roteiros do PC". No celular, usa o visual de `sheet--bottom`; no tablet, centralizado com 480 px de largura e altura máxima de 70%. Fundo `--c-scrim` atrás (`.dialog__scrim`), foco preso dentro, Esc e toque no fundo fecham.

```html
<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ed-roteiros-title">
  <div class="dialog__scrim" data-action="close-dialog"></div>
  <div class="dialog__box">
    <header class="sheet__header">…</header>
    <ul class="list">
      <li><button class="list__item" type="button"><span class="list__title">Teleprompter: letra e distância</span><span class="list__meta">2026-10-25 · 20 palavras</span></button></li>
    </ul>
  </div>
</div>
```

`.list__item`: altura mínima 56 px, largura total, alinhado à esquerda, divisória de 1 px `--c-border`; título em `--fs-body` peso 500; meta em `--fs-caption` `--c-text-muted`.

### Aviso rápido (toast)

```html
<div class="toast" role="status" aria-live="polite">Roteiro carregado <button class="btn btn--ghost toast__action" data-action="undo">Desfazer</button></div>
```

Pílula com `--c-surface` + `--blur`, texto 15 px peso 500, espaçamento 10 × 16 px. Aparece com opacidade + deslocamento de 8 px em `--dur-base`. No editor, fica 6 s, centralizado acima do rodapé; a ação usa `--c-accent`. No teleprompter (`.pr-toast`, dentro do palco), fica 1,2 s, sem ação, centralizado no palco.

### Faixa de dica (banner)

```html
<div class="banner" role="note">
  <p>Para tela cheia no iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p>
  <button class="btn btn--ghost" data-action="dismiss-hint">Entendi</button>
</div>
```

Fundo `--c-surface-raised`, raio `--radius-md`, espaçamento 12 × 16 px, texto `--fs-body` em `--c-text-muted`.

## 4. Padrões de tela

### Editor
- Coluna: cabeçalho (altura `--hit` + respiro, marca em `--fs-title` peso 600) · campo de texto · rodapé.
- Campo: `--fs-body` × 1,125 (18 px), `--lh-editor`, sem borda nem fundo, espaçamento lateral `--gutter`, largura máxima de leitura 72ch centralizada no tablet. Placeholder em `--c-text-muted`. Cursor (`caret-color`) em `--c-accent`.
- Rodapé: fundo `--c-bg` com borda superior `--c-border`; estatísticas em `--fs-caption` `--c-text-muted`, tabular; botão primário.
- Tudo respeita as áreas seguras.

### Teleprompter
- Palco preto de ponta a ponta. A área de leitura não tem borda nem fundo; só o texto e o esmaecimento (gradiente de `--c-stage` para transparente) no topo (18% da área, até 160 px) e na base (12%, até 120 px).
- HUD (só na pausa):
  - Topo: botões `btn--icon btn--glass` (Voltar à esquerda; Tela cheia e Ajustes à direita). No centro, o tempo restante em `--fs-caption` tabular `--c-text-muted`, sobre uma barra de 2 × 120 px (trilho `--c-surface-raised`, preenchimento `--c-text-muted`).
  - Base: `.pill` centralizada a `max(--gutter, --safe-bottom + 8 px)` da borda. O botão Reproduzir é `btn--icon` com fundo `--c-accent` e ícone `--c-on-accent`. No estado fim, Recomeçar ganha o mesmo destaque.
  - Dica acima da pílula: `--fs-body` `--c-text-muted`, com `text-shadow: 0 1px 12px #000` para ler por cima do texto.
  - Aparece e some com opacidade + 8 px de deslocamento em `--dur-base`. Escondido: `opacity: 0; visibility: hidden; pointer-events: none`.
- Guia de leitura (dentro do palco): dois triângulos de 10 px em `--c-accent` nas bordas da área, apontando para dentro, na linha de leitura, mais uma linha de 2 px em `--c-accent` com 18% de opacidade.
- Contagem regressiva (dentro do palco): número centralizado na área, `min(40vmin, 240px)`, peso 600, tabular, branco a 90%. A cada segundo, entra com escala 1,15 → 1 e opacidade 0 → 1 em `--dur-slow` (sem animação com reduced motion).
- Modo "Ajustar na tela": borda tracejada de 2 px em `--c-accent` na área; alças circulares de 28 px, brancas, com borda de 3 px em `--c-accent` e área de toque de 44 px; barra não espelhada (no topo ou na base, ver seção 9) usando `.pill` com o texto de medidas, o segmentado e o botão "Concluir" (`btn--primary` compacto).

## 5. Ícones

`js/icons.js`, grade 24 × 24, traço 2 px, pontas arredondadas, `currentColor`, sempre decorativos (`aria-hidden`; o botão leva o `aria-label`).

| Nome | Onde |
|---|---|
| `back` | HUD: voltar ao editor |
| `settings` | HUD: abrir ajustes |
| `fullscreen`, `fullscreen-exit` | HUD: tela cheia |
| `restart` | HUD: recomeçar |
| `minus`, `plus` | velocidade e tamanho (HUD e painel) |
| `play`, `pause` | HUD: reproduzir/pausar |
| `close` | fechar painel e diálogo |
| `import`, `trash`, `computer` | editor: importar (seta entrando na bandeja; a seta saindo é o Compartilhar do iOS), limpar, roteiros do PC |
| `undo` | ação "Desfazer" |
| `check` | botão "Concluir" do modo de ajuste |
| `mirror-x`, `mirror-y` | painel: interruptores de espelhamento |
| `area` | painel: "Ajustar na tela" |

Os botões A− e A+ usam texto ("A" em 14 px e "A" em 20 px, peso 600) com um sinal pequeno, em vez de ícone.

## 6. Layout responsivo

| Condição | Mudança |
|---|---|
| largura < 360 px | pílula do HUD sem A− e A+ |
| largura < 600 px | rótulos dos botões do cabeçalho do editor somem (só ícone) |
| largura < 600 px e retrato | painel de ajustes como `sheet--bottom` (`sheet--top` com "Inverter verticalmente") |
| demais | painel `sheet--side`, do lado oposto ao da área na tela |
| altura < 500 px (celular deitado) | HUD compacto: `--space-2` de margem no lugar de `--gutter`; dica escondida |
| paisagem, largura < 700 px e altura < 500 px | barra do "Ajustar na tela" numa linha só; sem as medidas abaixo de 560 px de largura; "Concluir" só com o ✓ abaixo de 440 px |
| tablet (≥ 768 px) | editor com coluna de 72ch centralizada; botão primário à direita do rodapé |

## 7. Acessibilidade

- Contraste mínimo de 4,5:1 para texto que precisa ser lido (ver tabela de cor).
- `lang="pt-BR"`. Todos os botões só de ícone têm `aria-label` em português.
- Foco visível em tudo que é interativo. Ao abrir, painel e diálogo levam o foco ao título e devolvem ao fechar; Esc fecha.
- Região `role="status"` anuncia "Lendo", "Pausado" e "Fim do texto" no teleprompter.
- `prefers-reduced-motion`: sem animações de interface. A rolagem do texto continua, porque é a função do app.

## 8. Texto da interface

Português do Brasil, direto, sem jargão. Verbos no infinitivo nos botões ("Abrir teleprompter", "Importar", "Recomeçar"). Unidades: "ppm" (com `title="palavras por minuto"`), "px", "%" e "s". Números no formato brasileiro (1.240).

## 9. Ajustes feitos na implementação (v1.0.1 a v1.0.4, 2026-10-27 e 2026-10-28)

Decididos olhando as telas renderizadas em iPhone, iPad e Android:
- **Véu atrás do HUD:** um gradiente escuro atrás da barra de cima e da pílula de baixo, só enquanto o HUD aparece. Sem ele, a dica e o tempo restante ficavam ilegíveis sobre o texto branco. É sólido atrás de toda a barra e só esmaece fora dela: 32 px abaixo da de cima, 48 px acima da de baixo. Numa faixa ainda translúcida, o alto das letras da linha seguinte aparecia ao lado da dica como pontinhos cinza. O esmaecimento para antes da linha que está na linha de leitura: o motor mede o espaço entre cada barra e a caixa dessa linha (linha de leitura ± meia linha + 4 px) e o passa em `--pr-veil-top` e `--pr-veil-bottom`. O véu esmaece o menor entre 32 px (em cima) ou 48 px (embaixo) e esse espaço. Longe das barras, fica como antes; se a própria barra cobre a linha, ela continua coberta.
- **Contagem regressiva:** o texto fica a 25% de opacidade durante a contagem, para o número se destacar e ficar claro que a leitura ainda não começou.
- **Guia de leitura:** os triângulos ficam na margem, logo fora da área, apontando para dentro, para nunca cobrirem a primeira ou a última letra da linha.
- **Esmaecimentos:** passam 2 px da borda da área, porque no Chromium uma fileira de pixels da próxima linha escapava do recorte durante a rolagem.
- **Barra do modo de ajuste:** fundo `--c-surface-solid` (a borda tracejada não aparece através dela). Abaixo de 700 px vira duas linhas (medidas e Concluir em cima, segmentado embaixo). No celular deitado (paisagem, menos de 700 px de largura e de 500 px de altura) volta a ser uma linha só, com as medidas uma sobre a outra: em duas linhas, com 114 px de altura, ela cobria as alças laterais de qualquer lado em parte das alturas. Deitado e com menos de 560 px de largura, a barra perde as medidas (a borda tracejada mostra a área). Com menos de 440 px (metade de um celular em tela dividida, 360 × 300), o "Concluir" fica só com o ícone ✓, num círculo de 44 px; o rótulo continua no botão, escondido só da vista. Assim as três posições cabem com o rótulo inteiro: 83 px ou mais de largura entre 360 e 560 px (o mínimo é em 440 px, onde o "Concluir" volta a mostrar o rótulo). Janela em pé e baixa (tela dividida do Android, 412 × 450) fica com duas linhas: numa linha só, os rótulos eram cortados. Fica do lado livre da tela: o motor mede a barra em cima e embaixo e deixa onde ela cobre menos alças. No empate vale a regra dos 50%: com a área até 50% da altura, do lado oposto àquele em que a área está presa (embaixo, ou em cima com "Inverter verticalmente"); acima de 50%, do lado em que ela está presa, longe da alça da altura. Só muda de lado ao soltar a alça ou ao girar a tela.
- **Hifenização:** desligada (RF-03), menos nas palavras que não cabem na largura da coluna. O motor mede no canvas, no tamanho de letra da vez, as palavras de letras (pré-selecionadas pela largura a 100 px), com margem de 0,5%: e-mail, endereço e número não contam, porque o navegador não os hifeniza. Cada ocorrência das que não cabem vai num `<span class="pr-hy">`, o único lugar com `hyphens: auto` (pedaços de pelo menos 3 letras de cada lado do hífen). O resto do texto continua `hyphens: manual`, e nenhuma palavra que cabe é hifenizada no fim da linha. Uma dupla com "/" entre letras conta como uma palavra; no `.pr-hy`, ela ganha um `<wbr>` depois da barra. Quando não cabe nenhuma palavra que o navegador hifenizaria (6 caracteres ou mais) e o texto não tem endereço ou outro trecho misto com 6 letras seguidas, o `.pr-text` inteiro ganha `hyphens: auto` (classe `pr-text--hyphens`): as mesmas quebras, sem um span por palavra. Na tela, o texto vai em NFC, e o espaço inseparável vira espaço comum.
- **Editor no celular deitado** (menos de 500 px de altura): estatísticas e botão numa linha, como no tablet, e cabeçalho, rodapé e margem do campo mais justos. Empilhados, sobrava uma linha de texto à vista.
- **Aviso do teclado** (`.pr-toast`): centralizado no palco, não na área. Numa área estreita (25%) o texto "Velocidade 155 ppm" não cabia na pílula.
- **Pílula do HUD:** abaixo de 420 px, os botões usam `btn--sm` (36 px visíveis, 44 px de área de toque); a margem lateral é área segura + 8 px. Assim a pílula inteira cabe em 360 px.
- **Mensagem de texto vazio** ("Nenhum texto. Volte e cole seu roteiro."): fica na camada do HUD, sem espelhar, porque é lida olhando direto para a tela.
- **Fim do texto:** Reproduzir fica desativado e Recomeçar ganha o destaque âmbar.
- **Cabeçalho do editor:** os rótulos dos botões somem abaixo de 600 px (não 400 px): marca e três ações rotuladas precisam de cerca de 561 px.
- **`btn--glass`:** anel interno de 1 px em `--c-border`, para o botão não sumir sobre o preto puro. `prefers-reduced-transparency` troca as superfícies translúcidas por `--c-surface-solid`.
