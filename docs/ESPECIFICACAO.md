# Teleprompter: especificação v1.0

**Data:** 2026-10-27 · **Produto:** teleprompter para celular e tablet · **Status:** implementada (app 1.0.2)

## 1. Objetivo

Um teleprompter para gravar vídeos, rodando no celular e no tablet. Uma única função: passar o texto na tela de forma suave e controlável. **Durante a leitura, a tela mostra só o texto**: nenhum botão, barra ou indicador.

## 2. Onde roda

| Aparelho | Como abrir | Tela cheia |
|---|---|---|
| iPhone (iOS 16.4+) | Safari ou ícone na Tela de Início | Só pela Tela de Início (o iPhone não tem a API de tela cheia para páginas) |
| iPad (iPadOS 16.4+) | Safari ou ícone na Tela de Início | API de tela cheia (prefixo `webkit`) ou Tela de Início |
| Android 10+ | Chrome ou app instalado | API de tela cheia ou app instalado |

- Retrato e paisagem; girar no meio da leitura mantém o ponto do texto.
- Larguras de 320 a 1366 px (iPhone SE a iPad Pro 12,9").
- Computador: funciona para testes, mas não é alvo de design.
- Formato: **PWA em HTML, CSS e JavaScript puros, sem build e sem dependências de runtime.** Abre em qualquer aparelho pelo navegador, instala na Tela de Início sem loja de apps, e a pasta do projeto não ganha milhares de arquivos de `node_modules` (ela pode ficar numa pasta sincronizada na nuvem).

## 3. Requisitos funcionais

Os seis primeiros são os requisitos centrais. Os demais são o mínimo para o app ser usável de verdade numa gravação.

### RF-01 Velocidade de passagem do texto
- Unidade: **palavras por minuto (ppm)**. Faixa 40–320, passo 5, padrão 150.
- Ajuste: botões − e + no HUD (±5), controle deslizante no painel, teclas ↑ e ↓.
- A velocidade em ppm vale para qualquer fonte e largura de área (fórmula na seção 9). O tempo total de leitura é sempre palavras ÷ ppm.
- Mudar a velocidade durante a leitura vale na hora, sem tranco e sem mover o texto.

Critérios de aceite:
- [ ] Um texto de 300 palavras a 150 ppm vai do início ao fim em 120 s (±3%), em qualquer tamanho de fonte.
- [ ] Mudar a velocidade não muda o ponto do texto, só o ritmo.
- [ ] O valor fica salvo e volta igual ao reabrir o app.

### RF-02 Espelhamento do texto
- Dois interruptores independentes: **"Espelhar horizontalmente"** (vidro de teleprompter, o caso comum) e **"Inverter verticalmente"** (aparelho montado de cabeça para baixo). Os dois juntos equivalem a girar 180°.
- Espelha o **palco inteiro**: texto, posição da área, guia de leitura, contagem regressiva e avisos rápidos. Os controles (HUD, painel, modo de ajuste) **nunca** espelham, porque são tocados olhando direto para a tela.
- "Esquerda" e "Direita" se referem ao que o apresentador vê no reflexo: com espelho horizontal, a área "Esquerda" aparece fisicamente à direita da tela.
- O arrasto sempre acompanha o dedo na tela física, com ou sem espelho.

Critérios de aceite:
- [ ] Ligar "Espelhar horizontalmente" vira o palco na hora, inclusive com o texto rodando (tecla M).
- [ ] Com espelho ligado, HUD e painel continuam legíveis (não espelhados).
- [ ] Tocar para pausar e arrastar funcionam igual com espelho e inversão.

### RF-03 Aumento e diminuição do tamanho do texto
- 16–160 px, passo 2. Botões A− e A+ no HUD (±4 px), controle deslizante no painel, teclas + e −.
- Padrão: 36 px no celular, 60 px no tablet (lado menor da tela ≥ 600 px).
- Ao mudar o tamanho, a linha que está sendo lida continua na linha de leitura.
- Fonte do sistema (SF Pro no iPhone/iPad), peso 600, entrelinha 1,4, alinhado à esquerda, sem hifenização. Exceção: a palavra de letras que não cabe na largura da área (coluna estreita ou letra grande) é hifenizada pelo navegador, para quebrar com hífen em vez de ser partida em qualquer letra. Só ela: as outras palavras nunca são hifenizadas, nem no fim da linha (seção 16, v1.0.3 e v1.0.4). E-mail, endereço e número que não cabem continuam partidos em qualquer letra, porque o navegador não os hifeniza.
- Na tela, o texto vai em NFC, e os espaços inseparáveis (U+00A0, U+202F, U+2007) viram espaço comum. Uma dupla com "/" entre letras ("entrada/saída", "km/h") conta como uma palavra. Se não cabe na coluna, ganha um ponto de quebra depois da barra ("entrada/" / "saída"), em vez de ser partida no meio sem hífen. Se cabe, o motor não mexe nela: com letra sem acento depois da barra, ela vai inteira para a linha seguinte (limitações na seção 16, v1.0.4). O roteiro salvo e a contagem de palavras não mudam.

Critérios de aceite:
- [ ] A+ aumenta 4 px por toque até 160 px; A− diminui até 16 px; no limite, o botão fica desativado.
- [ ] O progresso de leitura (%) muda menos de 2 pontos ao trocar o tamanho.

### RF-04 Local da tela por onde o texto passa
- **Esquerda | Centro | Direita** (controle segmentado no painel e no modo "Ajustar na tela"). Padrão: Centro.
- Define onde a área de leitura fica na horizontal, para deixar o texto perto da lente (ex.: celular deitado, com a câmera de um lado).
- Na vertical, a área fica encostada no topo da tela útil (onde fica a câmera frontal do celular em pé e do iPad deitado).
- Só faz diferença visível quando a largura da área é menor que 100%.

Critérios de aceite:
- [ ] Com largura 50%: "Esquerda" encosta a área na margem esquerda, "Direita" na margem direita e "Centro" centraliza.
- [ ] Em paisagem, a área respeita notch e Dynamic Island (áreas seguras).

### RF-05 Dimensionar a área do texto para qualquer tamanho
- Largura 25–100% e altura 20–100% da tela útil (tela menos áreas seguras e margem de 16 px).
- Dois jeitos: controles deslizantes "Largura" e "Altura" no painel, e o modo **"Ajustar na tela"**, com alças arrastadas direto sobre o teleprompter (seção 5.4).
- Padrões: celular 100% × 100%; tablet 70% × 100% (coluna estreita reduz o movimento dos olhos que aparece na câmera).
- O texto se reorganiza na hora, mantendo o ponto de leitura.

Critérios de aceite:
- [ ] Arrastar a alça lateral muda a largura em tempo real; a alça de baixo muda a altura; a do canto muda as duas.
- [ ] Os valores ficam salvos e valem em retrato e paisagem (são porcentagens).
- [ ] Nunca passa dos limites (mínimos de 25% e 20%; máximo de 100%).

### RF-06 Parar e continuar com um único toque em qualquer área
- Com o texto rodando, **um toque em qualquer ponto da tela** para a rolagem na hora. Um novo toque em qualquer ponto livre (fora dos botões que aparecem na pausa) volta a rolar.
- Toque = encostar e soltar movendo no máximo 10 px, em menos de 500 ms. Movimento maior é arrasto (RF-12): não pausa nem retoma.
- A pausa é imediata. A retomada acelera de 0 à velocidade em 400 ms, sem tranco.
- Zoom, seleção de texto, menu de contexto e toque duplo do navegador não interferem.
- Proteção contra toque duplo: os botões do HUD só aceitam toque 350 ms depois de aparecer, para o segundo toque de um toque duplo não acionar "Recomeçar" sem querer.

Critérios de aceite:
- [ ] Rodando, tocar em cada um dos 9 pontos de uma grade 3×3 da tela pausa.
- [ ] Pausado, tocar fora dos botões retoma; tocar num botão aciona só o botão.
- [ ] Depois do toque, o texto não anda mais que 1 quadro.
- [ ] Funciona em iPhone, iPad e Android, em retrato e paisagem, com e sem espelho.

### RF-07 Texto do roteiro (editor)
- Tela inicial = editor: campo grande para colar ou digitar, salvo automaticamente.
- Mostra palavras e duração estimada na velocidade atual: "1.240 palavras · 8 min 16 s a 150 ppm". Sem texto: "Nenhum texto ainda".
- Ações: **Importar arquivo** (.txt, .md ou texto), **Roteiros do PC** (RF-08), **Limpar** (com "Desfazer" por 6 s) e **Abrir teleprompter** (botão principal, desativado com texto vazio).
- Importar `.md` converte para texto corrido: remove o título H1 inicial (título do documento), remove marcações (`#`, `**`, `_`, `` ` ``, `>`, imagens, HTML, comentários `<!-- -->`), troca links pelo texto deles, transforma linhas de tabela em linhas de texto e mantém os parágrafos. Listas mantêm só o texto de cada item; os números ficam quando a lista numerada não começa em 1, ou quando um número não continua a contagem (um ano logo depois de uma lista: "2025. Esse foi o ano…"). Repetir o número ("1. 1. 1.") conta como continuar, e um "1." que recomeça uma lista sem números some, como numa lista nova. Uma linha "[rótulo]: …" só some quando é definição de link de verdade: não está no meio de um parágrafo, e o destino tem cara de endereço (https://…, www., logo.png, exemplo.com/pagina, <…>) ou o rótulo é usado no texto ("[texto][rótulo]"). Referência e nota de rodapé sem definição ficam com os colchetes; a linha que define uma nota de rodapé ("[^1]: …") sempre some inteira, também no meio de um parágrafo. O que parece marcação mas não é fica como está: `<seu nome>`, `<link>`, `2*3`, "[DICA]: sorria", "[CORTE]: 01:15", "[1][2]". Nenhuma palavra da fala pode sumir (exceções conhecidas na seção 16, v1.0.4).
- Primeiro uso: vem com um texto de exemplo que ensina os gestos (`SAMPLE_SCRIPT` em `store.js`).
- Atalho: Ctrl/⌘ + Enter abre o teleprompter.

Critérios de aceite:
- [ ] Importar um `fala.md` (a fala de um roteiro, com o título "# Fala — …") carrega só a fala, sem essa linha.
- [ ] Recarregar a página mantém o texto.
- [ ] Com texto vazio, o botão principal fica desativado e o campo mostra "Cole ou digite seu roteiro aqui…".

### RF-08 Roteiros do PC
- O servidor local lista os `fala.md` de `Roteiros/*/Roteiro/` (a fala de cada roteiro, em texto corrido).
- No editor, "Roteiros do PC" abre uma lista (mais novo primeiro) com título, data e número de palavras. Tocar num item carrega o texto, substituindo o atual, com "Desfazer".
- Se a API não responder (ex.: app hospedado em outro lugar), o botão não aparece.

Critérios de aceite:
- [ ] Com o servidor rodando, a lista mostra os roteiros da pasta `Roteiros` do PC, do mais novo para o mais antigo.
- [ ] Nenhum arquivo fora dos `fala.md` listados pode ser lido (tentativas com `..` ou ids inventados retornam 404).

### RF-09 Persistência
- Roteiro, ajustes e avisos dispensados ficam no aparelho (localStorage, chave `teleprompter.v1`), sem conta e sem nuvem.
- Dados corrompidos ou armazenamento bloqueado não quebram o app: ele volta aos padrões.
- "Restaurar padrões" (painel) volta só os ajustes; não apaga o texto.

### RF-10 Tela sempre acesa
- Com o teleprompter aberto, a tela não apaga nem bloqueia. Ao voltar para o editor, libera.
- Usa a Screen Wake Lock API quando existe. Sem ela (ex.: teste pela rede local em HTTP) ou no app da Tela de Início do iOS, liga também um vídeo invisível (seção 12). Reativa ao voltar para o app.

Critério de aceite:
- [ ] Com o bloqueio automático do iPhone em 30 s, o teleprompter pausado fica 2 min aberto sem apagar a tela.

### RF-11 Tela cheia
- Ao abrir o teleprompter (no próprio toque do botão), pede tela cheia onde a API existe (iPad, Android). Botão de tela cheia no HUD para entrar e sair; some onde a API não existe ou o app já está instalado.
- iPhone no Safari: aviso único e dispensável no editor: "Para tela cheia no iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”." Aberto pela Tela de Início, já roda sem barras.
- Manifest com `display: standalone` e `display_override: ["fullscreen", "standalone"]` (no Android, o app instalado esconde até a barra de status).

### RF-12 Arrastar para reposicionar
- Arrastar na vertical move o texto junto com o dedo (1:1), pausado ou rodando. Rodando, a rolagem automática fica suspensa durante o arrasto e continua ao soltar.
- No estado "fim", arrastar para trás volta para "pausado".

### RF-13 Contagem regressiva
- Desligada | 3 s | 5 s (padrão 3 s). Roda só ao começar do início (estado "pronto"); retomar uma pausa não tem contagem.
- Números grandes no centro da área, espelhados com o palco. Tocar durante a contagem cancela.

### RF-14 Guia de leitura
- Liga/desliga, padrão desligado. Marca a linha de leitura (30% da altura da área) com duas pequenas setas nas bordas da área e uma linha bem fraca, em âmbar.
- Sempre ativo: esmaecimento suave no topo e na base da área (o texto some aos poucos ao sair).

### RF-15 Controles na pausa (HUD)
- Aparecem só nos estados pronto, pausado e fim. Rodando ou em contagem, nada na tela além do texto.
- Topo: Voltar ao editor (esquerda); tempo restante "−4:12" com uma barra de progresso fina (centro); Tela cheia e Ajustes (direita).
- Base: pílula com **Recomeçar · − velocidade + · A− A+ · Reproduzir**. Acima dela, uma dica: "Toque em qualquer lugar para começar" (pronto), "Toque para continuar" (pausado) ou "Fim do texto" (fim).
- Em telas com menos de 360 px de largura, A− e A+ saem da pílula (continuam no painel).

### RF-16 Teclado e controle Bluetooth
Tabela na seção 7. Os atalhos valem com o teleprompter aberto e o painel fechado (Esc vale sempre). O atalho tem prioridade sobre o botão em foco: Espaço não "clica" o último botão tocado. Mudanças por teclado mostram um aviso rápido (1,2 s) dentro do palco, como "Velocidade 160 ppm", "Texto 52 px" e "Espelho ligado".

### RF-17 Fim do texto
- Quando a última linha chega à linha de leitura, a rolagem para sozinha: estado "fim", HUD visível, dica "Fim do texto" e o botão Recomeçar em destaque.
- No estado fim, um toque no palco não faz nada (evita recomeçar sem querer).

### RF-18 Instalação e uso offline
- Manifest, ícones (192, 512, maskable 512 e apple-touch-icon 180) e service worker "rede primeiro, cache como reserva".
- O service worker só registra em contexto seguro (HTTPS ou localhost). Pela rede local em HTTP, o app funciona normalmente, só não fica offline.

## 4. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 Fluidez | 60 quadros/s na rolagem em iPhone 11+ e iPad 8ª geração+. No loop, só se escreve `transform: translate3d()`; nenhuma leitura de layout por quadro. O `requestAnimationFrame` só roda no estado "rodando". Medidas de layout só quando um ajuste ou o tamanho da tela muda (ResizeObserver). |
| RNF-02 Zero dependências | Nenhum pacote npm no app nem no servidor. Nenhuma requisição externa (CDN, fontes, analytics). |
| RNF-03 Peso | JS + CSS do app abaixo de 200 KB sem compressão (sem build: o código fica legível e comentado). |
| RNF-04 Acessibilidade | Alvos de toque ≥ 44 px; contraste ≥ 4,5:1 nos textos da interface; todos os botões com `aria-label` em pt-BR; foco visível; `prefers-reduced-motion` desliga as animações de interface (a rolagem continua, é a função do app). |
| RNF-05 Idioma | Interface em pt-BR. Código: identificadores em inglês, comentários em português. |
| RNF-06 Robustez | Sem localStorage, Wake Lock, tela cheia ou service worker, o app continua funcionando (só perde o recurso). Texto vazio, texto de uma linha e texto de 20 mil palavras funcionam. |
| RNF-07 Privacidade | Texto e ajustes ficam só no aparelho. O servidor local só lê os `fala.md` e não grava nada. |
| RNF-08 Responsivo | 320–1366 px de largura, retrato e paisagem, áreas seguras (notch, Dynamic Island, indicador de início). |

## 5. Telas e fluxos

### 5.1 Editor (tela inicial)
- **Cabeçalho:** marca "Teleprompter" à esquerda. À direita, ações secundárias com ícone e rótulo: Roteiros do PC (quando disponível), Importar, Limpar. Abaixo de 600 px de largura, só ícone (com `aria-label`).
- **Campo de texto** ocupando o resto da tela: fonte 18 px, entrelinha 1,6, sem borda, rolando por dentro.
- **Rodapé fixo:** estatísticas (texto pequeno, apagado) e o botão principal "Abrir teleprompter" (largura total no celular; à direita no tablet).
- **Aviso do iPhone** (iPhone no Safari, fora da Tela de Início, ainda não dispensado): faixa discreta acima do rodapé com o texto do RF-11 e o botão "Entendi".
- Com o teclado do iOS aberto, o rodapé pode ficar coberto; aceitável. Se for simples, usar `visualViewport` para mantê-lo visível.

### 5.2 Teleprompter
Tela preta de ponta a ponta. A área de leitura fica dentro da moldura útil (seção 10). Estados e transições na seção 6; HUD no RF-15.

### 5.3 Painel de ajustes
- Abre pelo ícone de Ajustes do HUD. O HUD se esconde enquanto o painel está aberto; o palco continua visível atrás, para ver cada mudança ao vivo.
- Celular em pé (largura < 600 px): folha na parte de baixo, com altura máxima de 60% da tela e rolagem interna. Com "Inverter verticalmente" a linha de leitura vai para 70% da altura, e a folha desce do topo para não escondê-la. Ligar ou desligar a inversão com o painel aberto não move a folha: ela pularia sob o dedo, e o toque seguinte no mesmo lugar cairia em outro controle, como "Restaurar padrões". A nova posição vale na próxima vez que o painel abrir. Demais casos: painel lateral flutuante de 340 px. Ele fica do lado oposto ao da área na tela física: se a área aparece à direita, o painel vai para a esquerda; senão, para a direita. Lembre que o espelho horizontal inverte o lado físico.
- Fecha por: botão ×, Esc ou toque no palco fora do painel. Esse toque só fecha; não retoma a leitura.
- Seções, nesta ordem: Velocidade · Tamanho do texto · Posição do texto · Área do texto (Largura, Altura, "Ajustar na tela") · Espelhamento · Contagem regressiva · Guia de leitura · Restaurar padrões.
- Tudo aplica na hora, sem botão salvar. O painel também reflete mudanças feitas pelo HUD e pelo teclado.

### 5.4 Modo "Ajustar na tela"
- Entra pelo botão "Ajustar na tela" do painel (o painel fecha antes). O texto fica parado.
- Mostra a borda da área (âmbar, tracejada) e alças circulares de 28 px com área de toque de 44 px:
  - Posição Centro: alças nos dois lados (a largura muda simétrica).
  - Posição Esquerda: alça só no lado direito. Posição Direita: alça só no lado esquerdo.
  - Base: sempre. Canto: o(s) canto(s) inferior(es) do(s) lado(s) com alça.
- As alças ficam dentro do palco (espelham junto e coincidem com a área vista). Os textos ficam numa barra não espelhada, no topo ou na base, do lado em que ela não cobre as alças (medido na tela; seção 16, v1.0.2 e v1.0.3): "Largura 70% · Altura 100%", o segmentado Esquerda | Centro | Direita e o botão "Concluir".
- No celular deitado (paisagem, menos de 700 × 500 px) a barra tem uma linha só. Deitado e com menos de 560 px de largura, ela fica sem as medidas (a borda tracejada mostra a área). Com menos de 440 px (metade de um celular em tela dividida, 360 × 300), o "Concluir" fica só com o ✓, num alvo de 44 px; para o leitor de tela, o nome continua "Concluir". Assim as três posições cabem com o rótulo inteiro. Janela em pé e baixa (tela dividida do Android, 412 × 450) fica com as duas linhas.
- Nesse modo, toques fora das alças não pausam nem retomam. Esc ou "Concluir" saem e voltam ao estado anterior.
- Matemática na seção 10.

### 5.5 Roteiros do PC
- Diálogo com a lista: título (do H1 do `fala.md`, sem o prefixo "Fala — "), data (AAAA-MM-DD do nome da pasta) e palavras. Mais novo primeiro.
- Tocar num item carrega no editor e mostra "Roteiro carregado" com "Desfazer".
- Erro de rede: "Não foi possível carregar os roteiros do PC."

## 6. Máquina de estados do teleprompter

| Estado | Entra quando | HUD | Toque no palco | Arrasto |
|---|---|---|---|---|
| `ready` (pronto) | abre o teleprompter; Recomeçar; tecla Home | visível; "Toque em qualquer lugar para começar" | vai para `countdown` (contagem > 0) ou `playing` | move o texto; saindo do início, vai para `paused` |
| `countdown` | toque ou Espaço em `ready` com contagem > 0 | oculto | cancela e volta para `ready` | ignorado |
| `playing` | fim da contagem; toque ou Espaço em `ready` sem contagem ou em `paused` | oculto | vai para `paused` | suspende a rolagem e move o texto; ao soltar, segue `playing` (ou `ended`, se chegou ao fim) |
| `paused` | toque ou Espaço em `playing` | visível; "Toque para continuar" | vai para `playing` (rampa de 400 ms) | move o texto |
| `ended` | o texto chega ao fim rodando ou arrastando | visível; "Fim do texto"; Recomeçar em destaque | nada | para trás: vai para `paused` |

Regras extras:
- Painel aberto: um toque no palco só fecha o painel. Modo de ajuste: toques fora das alças são ignorados.
- Sair do app rodando ou em contagem (trocar de app, bloquear a tela) pausa: `playing` vai para `paused` e `countdown` volta para `ready`.
- Voltar ao editor e abrir de novo sempre começa em `ready`, no início do texto.
- `#prompter-screen` expõe o estado em `data-state`, para o CSS e para os testes.

## 7. Gestos e teclado

| Gesto | Ação |
|---|---|
| Toque (até 10 px, menos de 500 ms) | conforme a máquina de estados |
| Arrasto vertical | move o texto 1:1 com o dedo |
| Segundo dedo durante um gesto | cancela o toque (não pausa nem retoma) |
| Pinça, toque duplo, toque longo | sem efeito (zoom, seleção e menu do navegador bloqueados) |
| Voltar do sistema (botão do Android, gesto de voltar do Safari) | volta ao editor, igual ao botão Voltar do HUD; não sai do app |

| Tecla | Ação |
|---|---|
| Espaço, Enter | começar, pausar ou continuar (igual ao toque) |
| ↑ / ↓ | velocidade +5 / −5 ppm |
| ← / PageUp | volta 1/3 da altura da área |
| → / PageDown | avança 1/3 da altura da área |
| `+` ou `=` / `-` ou `_` | texto +4 / −4 px |
| Home | Recomeçar (`ready`, no início) |
| M | liga/desliga o espelho horizontal |
| Esc | fecha o painel ou o modo de ajuste; sem nada aberto e fora de `playing`, volta ao editor |

Controles Bluetooth de virar página (ex.: iRig BlueTurn, que pode mandar PageUp/PageDown, ↑/↓ ou ←/→, segundo a [loja Sweetwater](https://www.sweetwater.com/store/detail/BlueTurn)) funcionam sem configuração. Botões de volume (controles de selfie) não chegam ao navegador.

## 8. Modelo de dados

Implementado em `public/js/store.js` (fonte da verdade):

| Campo | Tipo | Faixa / valores | Padrão celular | Padrão tablet |
|---|---|---|---|---|
| `speed` | número | 40–320 ppm, passo 5 | 150 | 150 |
| `fontSize` | número | 16–160 px, passo 2 | 36 | 60 |
| `position` | texto | `left`, `center`, `right` | `center` | `center` |
| `areaWidth` | número | 0,25–1, passo 0,01 | 1 | 0,7 |
| `areaHeight` | número | 0,2–1, passo 0,01 | 1 | 1 |
| `mirrorX` | booleano | | false | false |
| `mirrorY` | booleano | | false | false |
| `countdown` | número | 0, 3, 5 | 3 | 3 |
| `guide` | booleano | | false | false |

Também: `script` (texto) e `flags` (ex.: `iosHintDismissed`). Passo dos botões −/+ e das teclas: `NUDGE` (velocidade 5, fonte 4).

## 9. Velocidade: de ppm para pixels

- `D` = distância de rolagem = altura do texto renderizado − altura de uma linha. Vai do início (primeira linha na linha de leitura) ao fim (última linha na linha de leitura).
- `W` = palavras do roteiro (`countWords`).
- `px/s = (ppm ÷ 60) × (D ÷ W)`, já pronto em `metrics.pxPerSecond({ wpm, words, distance })`.
- Tempo total = W × 60 ÷ ppm, igual à estimativa do editor, em qualquer fonte e largura.
- Deslocamento acumulado em ponto flutuante; desenhado arredondado ao pixel físico: `round(offset × dpr) ÷ dpr`.
- Loop com `requestAnimationFrame` e o tempo real entre quadros, limitado a 100 ms por quadro (não "pula" depois de um engasgo).
- Retomada: a velocidade sobe de 0 ao alvo em 400 ms (ease-out). Pausa: imediata.
- Implementação: o motor guarda o progresso `p = offset ÷ D` (0 a 1) e avança `(ppm ÷ 60) ÷ W` por segundo. É a mesma conta (`offset = p × D`), mas preserva o ponto de leitura em qualquer re-layout por construção. Um texto de uma linha (`D = 0`) fica parado na linha de leitura por W ÷ ppm minutos e então termina.

## 10. Layout da área

- **Moldura útil** = tela − áreas seguras − margem de 16 px em cada lado. A moldura é física (não espelha).
- Dentro dela, o **palco** (`.pr-stage`) recebe o espelhamento: `transform: scale(mx, my)`, com `mx = mirrorX ? −1 : 1`, `my = mirrorY ? −1 : 1` e origem no centro.
- **Área** em coordenadas lógicas, como frações da moldura: largura `w = areaWidth`, altura `h = areaHeight`, topo 0 e esquerda `x = { left: 0, center: (1 − w) ÷ 2, right: 1 − w }`. Aplicada por variáveis CSS (`--area-x`, `--area-w`, `--area-h`).
- **Linha de leitura** a 30% da altura da área. No início (`offset = 0`), o centro da primeira linha fica nela; no fim (`offset = D`), o centro da última linha.
- **Ponto de leitura preservado** em qualquer re-layout (fonte, área, giro da tela): guarda o progresso `p = offset ÷ D` antes e aplica `offset = p × D'` depois.
- **"Ajustar na tela"**: o ponteiro vira fração da moldura (`fx`, `fy` entre 0 e 1), invertida quando espelhada (`fx = 1 − fx` com mirrorX; `fy = 1 − fy` com mirrorY).
  - Alça lateral: Centro → `w = 2 × |fx − 0,5|`; Esquerda → `w = fx`; Direita → `w = 1 − fx`.
  - Alça da base: `h = fy`. Canto: as duas.
  - O resultado passa por `store.setSettings()`, que aplica limites e passo.
- As funções puras ficam em `public/js/prompter/layout.js`, com testes unitários.

## 11. Arquitetura

```
teleprompter/
├── README.md, CHANGELOG.md          como rodar, testar e usar; histórico de versões
├── package.json                     scripts start, test e test:e2e (sem dependências)
├── server.mjs                       servidor estático + API dos roteiros (só módulos nativos do Node)
├── Iniciar Teleprompter.cmd         atalho de duplo clique no Windows
├── docs/                            ESPECIFICACAO.md, DESIGN-SYSTEM.md
├── public/                          o app, servido como está
│   ├── index.html                   pontos de montagem
│   ├── manifest.webmanifest, sw.js, icons/
│   ├── css/  tokens.css · base.css · components.css · editor.css · panel.css · prompter.css
│   └── js/   main.js · store.js · metrics.js · platform.js · icons.js · editor.js · panel.js
│             markdown.js · roteiros.js · prompter/ (prompter.js, layout.js, wakelock.js, fullscreen.js…)
└── tests/
    ├── unit/                        node --test (store, metrics, markdown, layout, server)
    └── e2e/                         Playwright, instalado fora da pasta do projeto
```

### 11.1 Módulos

| Arquivos | Papel |
|---|---|
| `public/index.html`, `css/tokens.css`, `js/store.js`, `js/metrics.js`, `js/platform.js`, `js/icons.js` | Base: página, tokens, estado salvo, métricas, plataforma e ícones |
| `js/prompter/**`, `css/prompter.css` | Motor do teleprompter |
| `js/main.js`, `js/editor.js`, `js/panel.js`, `js/markdown.js`, `js/roteiros.js`, `css/base.css`, `css/components.css`, `css/editor.css`, `css/panel.css`, `manifest.webmanifest`, `sw.js`, `icons/*`, `server.mjs`, `Iniciar Teleprompter.cmd` | Casca do app, PWA e servidor |
| `tests/unit/*.test.mjs`, `tests/e2e/**` | Testes unitários e de ponta a ponta |

### 11.2 Contratos entre módulos

```js
// js/prompter/prompter.js
export function createPrompter({ root, store, onExit, onOpenPanel, onClosePanel }) {
  return {
    open(),            // mostra a tela em `ready`, no início do texto. É chamado DENTRO do clique
                       // (gesto do usuário): pede Wake Lock/vídeo e tela cheia de forma síncrona, sem await antes.
    close(),           // para tudo, libera a tela acesa, sai da tela cheia e esconde a tela
    isOpen(),
    setPanelOpen(open),// main avisa quando o painel abre ou fecha: o HUD some enquanto está aberto e
                       // um toque no palco chama onClosePanel() em vez de retomar
    enterAdjustMode(), // modo "Ajustar na tela"
    getState(),        // 'ready' | 'countdown' | 'playing' | 'paused' | 'ended'
  };
}

// js/panel.js
export function createPanel({ root, store, onAdjustArea, onOpenChange }) {
  return { open(), close(), isOpen() };
  // onOpenChange(aberto) a cada abrir/fechar; onAdjustArea() no botão "Ajustar na tela" (o painel fecha antes)
}

// js/editor.js
export function createEditor({ root, store, onStart }) {
  return { show(), hide() };
  // onStart() é chamado DENTRO do clique em "Abrir teleprompter" (ou Ctrl/⌘+Enter), sem await antes
}

// js/main.js: ligação
const store = createStore();
let prompter, editor;
const panel = createPanel({
  root: document.getElementById('panel-root'), store,
  onAdjustArea: () => prompter.enterAdjustMode(),
  onOpenChange: (open) => prompter.setPanelOpen(open),
});
prompter = createPrompter({
  root: document.getElementById('prompter-screen'), store,
  onExit: () => { panel.close(); prompter.close(); editor.show(); },
  onOpenPanel: () => panel.open(),
  onClosePanel: () => panel.close(),
});
editor = createEditor({
  root: document.getElementById('editor-screen'), store,
  onStart: () => { editor.hide(); prompter.open(); },
});
```

Regras:
- Os módulos só se falam por esses contratos e pelo `store`. `prompter/` não importa `panel.js`, e vice-versa.
- O teleprompter lê `store.getSettings()` e assina `store.subscribe()` para aplicar ao vivo as mudanças feitas no painel.
- HUD e teclado mudam ajustes por `store.nudge()` e `store.setSettings()`; o painel reflete essas mudanças porque também assina o store.
- O botão Voltar do HUD, a tecla Esc e o Voltar do sistema (evento `popstate`) chamam `onExit`. Ao abrir, o teleprompter cria uma entrada no histórico (`history.pushState`); ao sair pelo HUD ou pelo Esc, desfaz essa entrada (`history.back()`).
- `#dialog-root` é dos diálogos do editor (Roteiros do PC).

### 11.3 Ganchos estáveis para testes
- `#prompter-screen[data-state]`.
- Botões com `data-action`. HUD: `exit`, `fullscreen`, `settings`, `restart`, `speed-down`, `speed-up`, `font-down`, `font-up`, `toggle`. Modo de ajuste: `adjust-done`. Painel: `close-panel`, `adjust-area`, `reset`. Editor: `start`, `import`, `clear`, `roteiros`, `dismiss-hint`, `undo`.
- Campos do painel com `name` igual à chave do ajuste (`speed`, `fontSize`, `position`, `areaWidth`, `areaHeight`, `mirrorX`, `mirrorY`, `countdown`, `guide`). Campo do editor: `textarea[name="script"]`. No modo de ajuste, o segmentado usa `name="adjust-position"`.
- Alças do modo de ajuste: `[data-handle="left|right|bottom|corner-left|corner-right"]`.
- `window.__tp`, só leitura: `{ state(), offset(), distance(), pxPerSecond(), settings() }`.
- Atributos de estado em `#prompter-screen`, além de `data-state`: `data-hud` (HUD visível), `data-adjust`, `data-adjust-bar-bottom` (barra do modo de ajuste embaixo), `data-hyphenate` (alguma palavra hifenizada, RF-03), `data-empty`, `data-guide`, `data-mirror-x`, `data-mirror-y`. Aviso rápido do palco: `.pr-toast[data-show]`; status para leitores de tela: `.pr-sr`.
- Hifenização (RF-03): cada ocorrência das palavras que não cabem na coluna fica num `span.pr-hy` dentro de `.pr-text` (só nós de texto e spans; sem nenhuma, um nó de texto só). Numa dupla com "/" entre letras, o span tem um `<wbr>` depois da barra. Quando não cabe nenhuma palavra que o navegador hifenizaria (6 caracteres ou mais) e o texto não tem trecho misto com 6 letras seguidas (endereço, "snake_case", "Sério?Perfeito!"), o `.pr-text` ganha a classe `pr-text--hyphens` (texto todo hifenizado, com as mesmas quebras), e só as duplas com "/" continuam num `.pr-hy`.
- Véus do HUD: o motor grava em `#prompter-screen` as propriedades `--pr-veil-top` e `--pr-veil-bottom` (espaço, em px, entre cada barra e a linha que está na linha de leitura). Quando a linha não fica além da barra, a propriedade daquele lado é removida.
- Painel: `aside.sheet.pn` com `data-placement="bottom|top|left|right"` e a classe `is-open`; botões −/+ com `[data-nudge="speed|fontSize"][data-direction="-1|1"]` (não usam `data-action`, para não repetir os ganchos do HUD); saídas `output[for=pn-speed|pn-font-size|pn-area-width|pn-area-height]`.
- Editor: `.ed-stats`, aviso `.ed-toast` (`role=status`), faixa `.ed-hint`, `input[type=file].ed-file`; diálogo `.dialog.ed-dialog` com `.list__item`, `.ed-dialog-status` e `[data-action="close-dialog"]` (fundo e botão ×).

### 11.4 Convenções de código
- ES modules nativos, sem build. Caminhos relativos (o app funciona em qualquer subpasta).
- Identificadores em inglês; comentários em português, só onde explicam o porquê.
- Texto do usuário nunca entra por `innerHTML`: o roteiro usa `textContent`.
- CSS só com os tokens de `tokens.css`. Classes com prefixo por módulo: `.ed-` (editor), `.pn-` (painel), `.pr-` (teleprompter). Componentes compartilhados sem prefixo: `.btn`, `.pill`, `.seg`, `.slider`, `.switch`, `.sheet`, `.toast`, `.banner`, `.dialog`, `.list` (API em `DESIGN-SYSTEM.md`).

## 12. Decisões de plataforma (iOS e iPadOS)

- **Tela acesa:** o Safari 16.4+ tem a Screen Wake Lock API, mas só em contexto seguro (HTTPS ou localhost). No app da Tela de Início, segundo a [Progressier](https://progressier.com/pwa-capabilities/screen-wake-lock), ela só passou a funcionar no iOS 18.4 (o MDN ainda marca esse caso como não suportado). Por isso: tenta a API; se ela não existir ou falhar, ou se for iOS na Tela de Início, liga também um vídeo invisível, como faz o [NoSleep.js](https://github.com/richtr/NoSleep.js): MP4 minúsculo com faixa de áudio silenciosa, **sem** `muted` e **sem** `loop` (o NoSleep reinicia o vídeo por `timeupdate` em vez de usar `loop`), embutido como `data:` URI, fora da tela mas dentro do documento e iniciado dentro de um gesto do usuário. Todo toque no palco reativa o que tiver caído.
- **Tela cheia:** o iPhone não tem a API para elementos comuns, só para vídeo; o iPad tem, com prefixo `webkit` ([caniuse](https://caniuse.com/mdn-api_element_requestfullscreen)). No iPad em tela cheia, o Safari pode limitar teclas; confirmar no aparelho.
- **Gestos:** `touch-action: none` no teleprompter; `preventDefault()` em `gesturestart` (pinça do Safari); `user-select: none`, `-webkit-touch-callout: none` e `-webkit-tap-highlight-color: transparent`. Eventos de ponteiro (Pointer Events) para toque, mouse e caneta.
- **Altura da tela:** telas com `position: fixed; inset: 0` (evita o problema do `100vh` no Safari) e `overscroll-behavior: none`.
- **Zoom ao focar:** campos com fonte ≥ 16 px.
- **Status bar:** `apple-mobile-web-app-status-bar-style: black-translucent` + `viewport-fit=cover`; o conteúdo respeita `env(safe-area-inset-*)`.

## 13. Servidor local

- `npm start`, `node server.mjs` ou duplo clique em `Iniciar Teleprompter.cmd`. Node 22+ (o servidor sozinho também roda no 18+), só módulos nativos.
- Porta 3210, escutando em `0.0.0.0` para o celular acessar pela Wi-Fi. Variáveis: `PORT`, `HOST`, `ROTEIROS_DIR` (padrão `../Roteiros`). Espaços nas pontas de `HOST` são ignorados (o `set HOST=127.0.0.1 && node server.mjs` do cmd.exe deixa um no fim).
- Porta ocupada por outro programa: tenta as 10 seguintes.
  - Antes de subir, o servidor pergunta, de uma vez, o que há na porta pedida e nas 10 seguintes. Com `HOST` curinga (0.0.0.0 ou ::, em qualquer grafia) ou localhost, pergunta em 127.0.0.1 e em ::1; com outro `HOST`, nele.
  - A pergunta é um GET do manifesto, com três limites: até 3 s para conectar (o Windows só recusa a conexão ao IP do próprio PC na rede depois de ~2 s; conexão recusada quer dizer ninguém escutando), até 2,5 s para responder depois de conectar (um teleprompter lento porque o PC está sem memória continua sendo o teleprompter) e no máximo 64 KB de corpo.
  - Se o próprio teleprompter está numa delas (o atalho aberto duas vezes), avisa "O teleprompter já está rodando" com os endereços e não sobe outro, porque outra porta é outra origem no celular (o texto e os ajustes salvos ficariam para trás).
  - Senão, sobe na primeira em que ninguém escuta. Se nenhuma parece livre, tenta a pedida e as seguintes, em ordem.
  - Se a porta estiver ocupada na hora de subir (dois cliques quase juntos no atalho), pergunta de novo, com 0,5 s para responder (o teleprompter que acabou de subir, ou que a busca já acordou, responde em ~50 ms): sendo o teleprompter, avisa e não sobe. Se nenhuma porta servir, mostra o erro da última.
  - Uma porta em que outro programa escuta só em 127.0.0.1 ou só em ::1 conta como ocupada: o Windows deixaria subir em 0.0.0.0 nela, e "localhost" neste computador abriria o outro programa.
  - `PORT` fora de 1 a 65535 vale como 3210.
- Só responde a pedidos endereçados a `localhost`, a um IP ou ao nome deste computador (cabeçalho `Host`); outro nome recebe 421. Isso barra o DNS rebinding: uma página de fora que aponta o próprio domínio para o IP do PC não consegue ler a API dos roteiros pelo navegador de quem está na Wi-Fi.
- Ao subir, mostra os endereços de onde escuta. O IP é reconhecido pelo valor, não pela grafia.
  - `HOST` curinga (0.0.0.0 ou ::, também escrito ::0 ou 0:0:0:0:0:0:0:0): localhost e os IPv4 privados (10.x, 172.16–31.x e 192.168.x).
  - IP de loopback (127.x ou ::1, em qualquer grafia), localhost ou o nome do computador: só ele, na linha "Neste computador" (http://127.0.0.1:3210, http://[::1]:3210, http://localhost:3210, `http://<nome>:3210`).
  - Outro IP: só esse IP (IPv6 entre colchetes), na linha "No celular/tablet".
  - A linha "No celular/tablet" aparece só para endereços da rede. O aviso "O teleprompter já está rodando" segue a mesma regra, a partir do `HOST` de quem abriu.
- Arquivos de `public/` com o tipo MIME certo (inclui `.webmanifest` e `.mp4`), `Cache-Control: no-cache`, suporte a `Range` (resposta 206) e bloqueio de `..` (path traversal). Só GET e HEAD.
- API:
  - `GET /api/roteiros` → `{ "roteiros": [{ "id", "titulo", "data", "palavras" }] }`, mais novo primeiro.
  - `GET /api/roteiros/<id>` → conteúdo do `fala.md` (`text/markdown; charset=utf-8`). O `id` é o nome da pasta, validado contra a lista: nada fora dela é lido.
- Na mesma Wi-Fi, qualquer aparelho consegue abrir o app e ler os `fala.md` enquanto o servidor roda. Aceitável numa rede de casa, com conteúdo que vai virar vídeo; o README avisa.

## 14. Testes e definição de pronto

- **Unitários** (`npm test`, com `node --test`): store, metrics, markdown, layout e servidor (inclui path traversal e API).
- **E2E** (`npm run test:e2e`): Playwright instalado **fora da pasta do projeto** (`%LOCALAPPDATA%\teleprompter-e2e` no Windows, `~/.cache/teleprompter-e2e` nos outros sistemas), com projetos iPhone (WebKit), iPad (WebKit) e Android (Chromium). Cobre RF-01 a RF-17 e tira capturas de tela.
- **Pronto quando:** todos os critérios de aceite passam; testes verdes; revisão adversarial sem achado grave aberto; servidor rodando e acessível pelo IP da rede local.

## 15. Fora do escopo da v1

Rolagem guiada pela voz, gravação de vídeo no app, controle remoto por outro celular, biblioteca de roteiros, tema claro e cores de texto, formatação rica (negrito, cores, marcas de pausa), sincronização na nuvem e pinça para mudar o tamanho do texto.

## 16. Revisões

As medições e conferências citadas nesta seção foram feitas durante o desenvolvimento, com scripts que não fazem parte do repositório.

**v1.0.1 (2026-10-27): ajustes aceitos durante a implementação**
- RNF-03 passou de 120 KB para 160 KB: o app tem 137 KB de JS + CSS legíveis, sem build. Chegar a 120 KB exigiria minificar, o que não compensa num app servido pela rede local.
- Seção 9: o motor integra o progresso `p` em vez do deslocamento em pixels (mesma conta, ver nota da seção).
- Seção 11.3: ganchos extras do painel, do editor e do teleprompter documentados.
- Bloqueio de pinça (zoom) vale para o app todo, não só para o teleprompter: um zoom feito no editor seguiria para o teleprompter, onde não daria para desfazer.
- Importar arquivo também mostra "Desfazer"; arquivo vazio mostra "O arquivo está vazio." e mantém o texto atual.
- `package.json` exige Node 22+ para os testes (`node --test` com padrão de arquivos); o servidor sozinho roda no Node 18+.
- Servidor: também tenta a porta seguinte quando a porta está reservada pelo Windows (EACCES), envia ETag e bloqueia nomes de dispositivo do Windows (CON, NUL…) e links simbólicos para fora de `public/`.
- Ajustes visuais registrados no design system (seção 9 de DESIGN-SYSTEM.md).

**v1.0.2 (2026-10-27): correções da verificação final (testes E2E e revisão adversarial)**
- Painel fechando: deixa de receber toques na hora, não só no fim da animação de saída. O toque logo depois de fechar é do palco.
- Tempo estimado: a conta é W × 60 ÷ ppm, nesta ordem. A ordem inversa dava 8000,000000000001 s para 20 mil palavras a 150 ppm, e o relógio (que arredonda para cima) mostrava 1 s a mais.
- "Ajustar na tela": a barra fica do lado livre da tela. Com a área até 50% da altura, do lado oposto àquele em que a área está presa; acima disso, do lado em que ela está presa, longe da alça da altura. Antes, no celular, a barra de duas linhas cobria as alças laterais de uma área baixa. Durante o arrasto de uma alça a barra não muda de lado; muda ao soltar.
- Voltar do sistema volta ao editor (seções 7 e 11.2). Antes, o Voltar do Android ou o gesto do Safari saía do app no meio da leitura.
- Servidor: detecta o próprio teleprompter já rodando na porta e valida o cabeçalho `Host` (seção 13).
- Importar `.md`: link, ênfase e tag HTML que começam numa linha e terminam na seguinte (texto quebrado em 80 colunas) também são convertidos. A marcação em linha é tirada de cada parágrafo inteiro, e as quebras de linha ficam onde estavam.
- Aviso do teclado ("Velocidade 155 ppm"): centralizado no palco, não na área. Com a área estreita, o texto passava da borda da pílula.

**v1.0.3 (2026-10-28): correções da segunda verificação (revisão adversarial e uso de ponta a ponta)**
- "Ajustar na tela": o motor mede a barra em cima e embaixo e deixa onde ela cobre menos alças (empate: a regra dos 50% da v1.0.2), também ao girar a tela. No celular deitado (estreito e baixo) a barra tem uma linha só. Antes, em 667 × 375 e 640 × 360, a barra de duas linhas (114 px) cobria as alças laterais de 51% a 70% de altura.
- RF-03: com alguma palavra mais larga que a coluna, a hifenização automática liga. Antes o navegador partia a palavra sem hífen, em qualquer letra ("paralelepí" / "pedo"). Contam só palavras de letras (e-mail, endereço e número não, porque o navegador não os hifeniza), e as mais largas são medidas no tamanho de letra da vez. Pedaços de pelo menos 3 letras de cada lado do hífen.
- Servidor: o segundo início olha a porta pedida e as 10 seguintes, em 127.0.0.1 e em [::1], então acha o teleprompter que subiu na seguinte porque a pedida estava com outro programa (seção 13). Dois cliques quase juntos no atalho também não sobem dois servidores. Antes, nos dois casos, subia um segundo.
- Importar `.md` (RF-07), sem perder palavras:
  - ênfase: cada fechamento casa com a abertura mais próxima (antes, um `*.md` solto engolia texto até o `*muito*` da linha seguinte); `*` entre algarismos ("2*3") é conta;
  - HTML: só sai o que é HTML de verdade (fechamento, tag com atributo, elemento vazio, abertura com o fechamento no mesmo parágrafo, elemento de bloco sozinho na linha). `carro<velho … ->`, `<seu nome>`, `<Enter>`, `List<String>` e `Fotos/<ano>/` ficam;
  - link: destino sem espaço, como no CommonMark ("[pão e queijo](para o lanche)" fica como texto);
  - listas: o recuo decide em que item a linha está, como no CommonMark. "   2024. O rio…" recuado dentro de um item continua a frase, com o número; no meio de um parágrafo, só "1." ou "1)" começa lista; lista numerada que não começa em 1 nem continua a numeração anterior mantém os números;
  - "[DICA]: sorria…" é fala, não definição de link; código dentro de citação; "-" abaixo de um parágrafo é sublinhado de título; "[" sem fechamento não deixa a conversão lenta (20 mil deles levavam 3 s; agora, 3 ms).
  - Num fuzz diferencial de 80 mil entradas, a versão nova nunca fica com menos palavras que a v1.0.2. (Correção, v1.0.4: o sorteador do fuzz entrava num ciclo curto, e eram só cerca de 1,5 mil entradas distintas.)
- Painel (seção 5.3): no celular em pé com inversão vertical, a folha desce do topo.
- Editor: a duração estimada arredonda os segundos para cima, como o relógio do HUD; o texto de exemplo (39,2 s) mostrava "39 s" no editor e "−0:40" no teleprompter. No celular deitado, estatísticas e botão ficam numa linha e o cabeçalho é mais baixo.
- Texto de exemplo: o arrasto para cima avança (antes a frase sugeria o contrário) e os botões de baixo mudam a velocidade (A− e A+ somem da pílula abaixo de 360 px).
- Ícone Importar: seta entrando na bandeja. A seta saindo era igual ao Compartilhar do iOS, citado no aviso do iPhone logo abaixo.
- Véus do HUD sólidos atrás de toda a barra; fora dela esmaecem em 32 px (em cima) e 48 px (embaixo). Antes, o alto das letras da linha seguinte aparecia ao lado da dica como pontinhos cinza.

**v1.0.4 (2026-10-28): correções da terceira verificação (revisão adversarial)**
- RF-03, hifenização só na palavra que não cabe na coluna:
  - Cada ocorrência dela vai num `span.pr-hy`; o resto do texto continua `hyphens: manual` (seção 11.3). Antes, uma palavra larga ligava a hifenização do texto todo, e o navegador hifenizava fins de linha comuns, partindo também palavras que cabem na coluna ("cal-/çada"). Agora todas as quebras têm hífen e caem só em palavras que não cabem.
  - O motor ordena uma vez por texto as palavras hifenizáveis pela largura a 100 px. A cada medida, mede no canvas, no tamanho de letra da vez, as que podem não caber. Quando o conjunto muda, mexe só nas palavras que entraram ou saíram.
  - Margem da medida: de 2% para 0,5% (canvas e texto da tela diferem bem menos que isso nos dois motores). Antes, uma palavra que cabia por pouco ligava a hifenização do texto todo, e palavras que cabem ganhavam hífen no fim da linha.
  - Quando não cabe nenhuma palavra que o navegador hifenizaria (6 caracteres ou mais; letra enorme numa coluna estreita), o texto todo é hifenizado, sem um span por palavra. As linhas são as mesmas do modo por palavra. Com um trecho misto com 6 letras seguidas (endereço, "snake_case", "Sério?Perfeito!"), fica o modo por palavra: no texto todo, o navegador hifenizaria as letras dele ("calca-das" dentro de um endereço).
  - Texto da tela em NFC, com o espaço inseparável trocado por espaço comum. Antes, "paralelepípedo quadrado" (com espaço inseparável) era partido no meio, sem hífen, e uma palavra com acento combinado (NFD) não contava.
  - Duplas com "/" entre letras: antes, "entrada/saída" e "Canon/Nikon" numa coluna estreita eram partidas no meio, sem hífen ("entrada/sa" / "ída"), porque o navegador não quebra depois da barra seguida de letra sem acento. Agora só a dupla que não cabe ganha um ponto de quebra (`<wbr>`) depois da barra. As que cabem ("km/h", "e/ou", "I/O") vão inteiras para a linha seguinte: 0 de 200 partidas no iPhone a 36 px, contra 26 com um ponto de quebra em toda "/" (com letra sem acento depois da barra; ver as limitações).
- Painel (seção 5.3): inverter com a folha aberta não a move. Antes, a folha pulava de baixo para cima, e o segundo toque no mesmo lugar caía em "Restaurar padrões" (19% das posições de rolagem em 360 × 640), que zera tudo sem desfazer.
- Véus do HUD: esmaecem só até antes da caixa da linha que está na linha de leitura (linha de leitura ± meia linha + 4 px). Antes, numa área baixa ou invertida, essa linha ficava em parte sob o véu. Quando a própria barra cobre a linha (área ainda mais baixa), ela continua coberta.
- "Ajustar na tela" (seção 5.4): a barra de uma linha só vale só em paisagem; deitado com menos de 560 px, sem as medidas; com menos de 440 px, o "Concluir" fica só com o ✓. Antes, em 480 × 320 e em janelas de tela dividida (412 × 450, 360 × 400, 458 × 412, 360 × 300), os rótulos das posições eram cortados, com opções de 18 a 59 px de largura. Agora têm 85 px ou mais.
- Importar `.md` (RF-07):
  - Indicações de cena com um termo só depois dos dois-pontos ("[DICA]: sorria", "[00:42]: sorria", "[LENTE]: EF-4.1", "[CORTE]: plano-geral (lento)") ficam, também no meio de um parágrafo, menos quando o termo tem cara de endereço (ver as limitações abaixo). Antes sumiam como definição de link.
  - "[1][2]" e "[^a-z]" sem definição ficam. "[site]" com "[site]: https://…" no documento vira "site".
  - Listas: um ano logo depois de uma lista numerada não some mais; "2. [ ] item" vira "2. item"; um "1." que recomeça uma lista sem números continua sumindo. Troca aceita: numa lista "1. 2. 2. 5.", o "5." aparece.
  - Código: `` ```npm start``` sobe… `` no começo da linha é código em linha; código aberto numa citação acaba quando a citação acaba (a cerca de fechamento digitada sem "> " também fecha); `` - ```bash `` abre o código do item, que vai até a cerca de fechamento ou até o item seguinte. Antes, nesses casos, uma linha sumia ou o resto do roteiro saía com marcação crua.
  - HTML: só `<br>`, `<hr>` e `<wbr>` saem sozinhos (`Cole o <link> na descrição` e `Acesse <link do produto>` ficam); tag de bloco vira espaço (`<li>um</li><li>dois</li>` → "um dois"); tag de bloco no começo da linha sai (`<p>Texto` → "Texto").
  - Comentário: `<!--` no começo da linha vai até o `-->`, ou até o fim do texto, como antes. No meio da linha, só sai o comentário completo que não passa por linha em branco: `Use a seta <!-- ou não.` fica. Antes, um `<!--` no meio de uma frase apagava o resto do documento.
  - Tempo: e-mail sem ">" num token de 100 mil caracteres, de 4,4 s para 1 ms; 20 mil `<!--` sem fechamento, 3 ms.
  - Validação: fuzz diferencial contra a v1.0.2 com 370 mil entradas distintas, em 3 sementes: as que ficam com menos palavras perdem marcação que a v1.0.2 mostrava por engano, dentro de um bloco de código falso (info string de cerca, número de lista que começa em 1, caixa de tarefa, nome de tag, destino de link, definição, linha de nota de rodapé). Exceções: a primeira limitação abaixo e algumas palavras grudadas pelo código em linha (`` ` palavra `canal `` → "palavracanal"), como já acontecia na v1.0.2.
- Servidor (seção 13):
  - A busca pergunta pelo manifesto com `node:http`: até 3 s para conectar, 2,5 s para responder e no máximo 64 KB de corpo. Antes era 1 s para tudo: com `HOST` igual ao IP do Wi-Fi, toda porta parecia ocupada (o Windows leva ~2 s para recusar), e 2 ou 3 inícios com até ~1 s de intervalo subiam 2 ou 3 servidores; um teleprompter que levava mais de 1 s para responder virava "outro programa"; um corpo sem fim era lido inteiro (mais de 200 MB em meio segundo).
  - Sem porta livre na busca, tenta a pedida e as 10 seguintes, perguntando de novo (0,5 s para responder) quem está em cada porta ocupada na hora de subir, sem tentativas às cegas. Se nenhuma servir, mostra o erro da última.
  - Espaços nas pontas de `HOST` são ignorados. `HOST` curinga ou de loopback escrito de outro jeito (::0, 0:0:0:0:0:0:0:0, 0:0:0:0:0:0:0:1, ::ffff:127.0.0.1) é reconhecido pelo valor do IP: mesmos endereços e mesma busca que 0.0.0.0, ::, ::1 ou 127.0.0.1.
  - Os endereços mostrados (janela, aviso "já está rodando" e as `urls` de `startServer`) seguem onde o servidor escuta. Antes, com `HOST` igual ao IP do Wi-Fi, o localhost mostrado era recusado; com o nome do computador, os dois endereços falhavam; com 127.0.0.1 e outro programa em ::1, o localhost abria o outro programa.
  - Custo aceito: uma porta com um programa que aceita a conexão e não responde atrasa o início em 2,5 s (antes, 1 s). Sem nenhuma porta livre na busca e com programas mudos nas 11 portas, o erro sai em ~8 s (antes, 1,3 s). Com `HOST` igual ao nome do computador, o início leva ~3 s. Com um `HOST` que não existe (erro de digitação, como `HOST=0`), o erro leva ~16 s para aparecer (antes, ~3 s), porque a busca consulta esse nome em cada uma das 11 portas.
- RNF-03 passou de 160 KB para 200 KB: as correções desta revisão (conversor de Markdown e hifenização por palavra, com seus comentários) levaram o JS + CSS de 154,8 KB para 173,8 KB. Ficar abaixo de 160 KB exigiria minificar ou tirar comentários, o que não compensa num app servido pela rede local.
- Limitações conhecidas, sem correção nesta versão:
  - Importar `.md`: código aberto na linha de um item (`` - ```bash ``) sem cerca de fechamento, seguido de um parágrafo sem recuo em vez de outro item, deixa o resto do roteiro dentro do código, com a marcação crua; se a cerca seguinte é o começo de outro bloco de código, as linhas dele são lidas como texto. Cerca aberta em linha própria dentro de um item, sem fechamento, também não acaba no item seguinte (como na v1.0.2). Código aberto numa citação (`` > ```bash ``) com as linhas seguintes sem "> ", inclusive a cerca de fechamento, acaba na primeira linha sem "> "; essa cerca abre outro bloco, e o resto do roteiro sai com a marcação crua. A v1.0.3 tratava esse caso; a v1.0.2 e o CommonMark fazem como agora.
  - Importar `.md`, casos raros: comentário dentro de código ("`<!-- TODO -->`") sai; "[rótulo]: …" some quando o rótulo só é usado numa referência dentro de código; fora do meio de um parágrafo, uma indicação cujo termo tem cara de endereço some como definição: arquivo ("[CORTE]: video.mp4 (lento)"), "#" ou "/" no começo ("[SLIDE]: #3", "[CENA]: /inicio"), "mailto:" ou texto entre < > (`[Nota]: <seu nome>`); `**3**4` fica cru; uma lista que começa em 3 depois de um título perde o "3." se a lista anterior acabou em 2; item ou citação na primeira linha seguidos de "===" somem com o título; "- > citação" e "- # Título" mantêm o ">" e o "#"; o "_" some de endereços soltos (`https://exemplo.com/_privado_/y`); 20 mil blocos de uma palavra levam até ~170 ms.
  - Servidor: um programa que escuta só no IP do Wi-Fi não é visto pela busca, e o endereço "No celular/tablet" abriria esse programa. O aviso "já está rodando" mostra os endereços pelo `HOST` de quem abriu, não pelo do servidor que está rodando. Com as 11 portas vistas como ocupadas, o servidor pode subir em 0.0.0.0 ao lado de um programa que escuta só no loopback.
  - Duplas com "/": a que cabe ainda pode ser quebrada na barra no fim da linha quando a letra depois da barra tem acento ("luz/" / "ângulo", "vídeo/" / "áudio"), como na v1.0.3, porque os dois motores só deixam de quebrar ali com letra sem acento. Na que não cabe, o segundo pedaço pode sair hifenizado mesmo cabendo sozinho ("pergunta/res-" / "posta", visto no Chromium). Dupla com número ou ponto ("React/Node.js", "TCP/IPv6") que não cabe continua partida em qualquer letra, como na v1.0.3.
  - Desempenho da hifenização: com centenas a milhares de palavras hifenizadas (num texto de 20 mil palavras, com letra grande ou coluna estreita), os passos de letra e de largura ficam um pouco mais lentos que na v1.0.3, e o estilo de cada quadro rodando custa um pouco mais. O passo de largura com palavras hifenizadas continua mais lento que o passo sem hifenização.
  - "Ajustar na tela" deitado com menos de 360 px de largura (340 × 300, 320 × 300): os rótulos das posições ficam no limite. No Chromium, "Esquerda" mede 2 a 6 px a mais que a opção, embora apareça inteiro nas capturas.
