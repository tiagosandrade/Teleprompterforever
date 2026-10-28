# Teleprompter

Teleprompter minimalista para gravar vídeos no iPhone, no iPad ou no Android. O texto passa sozinho na tela, na velocidade que você escolher, e um toque em qualquer lugar pausa ou continua. **Enquanto você lê, a tela mostra só o texto.**

É um app web (PWA) em HTML, CSS e JavaScript puros: sem loja de apps, sem conta, sem nuvem e sem `node_modules`. O computador roda um servidor pequeno e o celular abre o app pela Wi-Fi.

## 1. Ligar no computador (Windows)

- **Duplo clique em `Iniciar Teleprompter.cmd`** (nesta pasta). Abre uma janela preta com os endereços.
- Ou, no terminal, dentro desta pasta: `npm start`.

Precisa do **Node.js 22 ou mais novo** ([nodejs.org](https://nodejs.org), versão LTS). Se ele não estiver instalado, o atalho avisa.

A janela mostra algo assim:

```
  Teleprompter no ar!

  Neste computador:   http://localhost:3210
  No celular/tablet:  http://192.168.0.10:3210   (Wi-Fi)
```

Deixe a janela aberta enquanto estiver gravando. Para parar: **Ctrl+C** ou feche a janela. Se a porta 3210 estiver ocupada por outro programa, o servidor usa a 3211, a 3212… e mostra qual escolheu. Se o teleprompter já estiver aberto em outra janela (mesmo numa dessas portas seguintes), o atalho só avisa e mostra o endereço, sem abrir um segundo servidor (em outra porta, o celular não acharia o texto e os ajustes salvos).

## 2. Abrir no iPhone, iPad ou Android

1. Conecte o aparelho na **mesma rede Wi-Fi** do computador.
2. No navegador (Safari no iPhone e iPad, Chrome no Android), digite o endereço **"No celular/tablet"** que a janela mostrou, por exemplo `http://192.168.0.10:3210`.
3. O editor abre. Cole o roteiro e toque em **Abrir teleprompter**.

O IP do computador pode mudar de um dia para o outro: use sempre o que a janela mostrar.

### Tela cheia no iPhone: "Adicionar à Tela de Início"

O Safari do iPhone não deixa uma página ocupar a tela inteira. Para gravar sem as barras do Safari:

1. Com o teleprompter aberto no Safari, toque em **Compartilhar** (o quadrado com a seta para cima).
2. Toque em **Adicionar à Tela de Início** e depois em **Adicionar**.
3. Abra sempre pelo ícone **Teleprompter** da Tela de Início: ele roda sem as barras do navegador.

No iPad e no Android, o teleprompter pede tela cheia sozinho quando abre, e o botão de tela cheia fica no topo, na pausa.

## 3. Como usar

### Editor

- **Cole ou digite** o roteiro. Ele fica salvo no aparelho, mesmo fechando o navegador.
- Embaixo aparecem as palavras e a duração na velocidade atual, por exemplo "1.240 palavras · 8 min 16 s a 150 ppm".
- **Importar**: abre um arquivo `.txt` ou `.md`. Markdown vira texto corrido: o título `# …` do começo sai, a formatação some e as tabelas viram linhas de texto.
- **Roteiros do PC**: lista os roteiros da pasta `Roteiros` (seção 4). Aparece quando o servidor do PC está rodando e acha pelo menos um roteiro.
- **Limpar**: apaga o texto. Por 6 segundos aparece **Desfazer**, que também vale para Importar e Roteiros do PC.
- **Abrir teleprompter**, ou **Ctrl+Enter** (⌘+Enter no Mac) num teclado.

### Teleprompter

| Gesto | O que faz |
|---|---|
| Um toque em qualquer lugar | começa, pausa e continua a rolagem |
| Arrastar para cima ou para baixo | volta ou avança o texto junto com o dedo (pausado ou rodando) |
| Toque durante a contagem regressiva | cancela a contagem |
| Pinça, toque duplo, toque longo | nada (não dá zoom nem seleciona texto) |

Na pausa aparecem os controles: **Voltar** ao editor, o tempo restante e **Tela cheia** e **Ajustes** no topo. Embaixo fica a pílula com **Recomeçar · − velocidade + · A− A+ · Reproduzir**. Rodando, nada aparece além do texto. No fim do texto a rolagem para sozinha e **Recomeçar** fica em destaque.

### Painel de ajustes (ícone de ajustes, na pausa)

Tudo vale na hora e fica salvo no aparelho:

- **Velocidade**: 40 a 320 palavras por minuto (ppm). O tempo de leitura é sempre palavras ÷ ppm, em qualquer tamanho de letra.
- **Tamanho do texto**: 16 a 160 px.
- **Posição do texto**: Esquerda, Centro ou Direita. Serve para deixar o texto perto da lente.
- **Área do texto**: Largura e Altura em %, ou **Ajustar na tela**, que mostra a borda da área com alças para arrastar com o dedo. Toque em **Concluir** quando terminar.
- **Espelhamento**: veja abaixo.
- **Contagem regressiva**: Desligada, 3 s ou 5 s, antes de começar do início.
- **Guia de leitura**: marca a linha de leitura com duas setinhas âmbar.
- **Restaurar padrões**: volta os ajustes, sem apagar o texto.

Para fechar o painel: o **×**, a tecla **Esc** ou um toque no texto, fora do painel. Esse toque só fecha, não começa a rolar.

### Vidro de teleprompter (espelhamento)

- Ligue **Espelhar horizontalmente**: na tela do celular o texto fica ao contrário e no reflexo do vidro fica certo.
- Com o espelho ligado, "Esquerda" e "Direita" são o que você vê **no reflexo**.
- Aparelho preso de cabeça para baixo: **Inverter verticalmente**. Os dois juntos equivalem a girar 180°.
- Os botões e o painel nunca ficam espelhados, porque você toca neles olhando direto para a tela.

### Teclado e controle Bluetooth

Valem com o teleprompter aberto e o painel fechado (o Esc vale sempre):

| Tecla | Ação |
|---|---|
| Espaço, Enter | começar, pausar ou continuar |
| ↑ / ↓ | velocidade +5 / −5 ppm |
| ← / PageUp | volta 1/3 da altura da área |
| → / PageDown | avança 1/3 da altura da área |
| `+` ou `=` / `-` ou `_` | texto +4 / −4 px |
| Home | recomeçar do início |
| M | liga ou desliga o espelho horizontal |
| Esc | fecha o painel ou o modo de ajuste; sem nada aberto e fora da leitura, volta ao editor |

Controles Bluetooth de virar página (como o iRig BlueTurn, que manda PageUp/PageDown, ↑/↓ ou ←/→) funcionam sem configuração. Os botões de volume de controles de selfie não chegam ao navegador.

## 4. Roteiros do PC

- O servidor lista os arquivos `Roteiros/AAAA-MM-DD-nome-do-video/Roteiro/fala.md` (a fala de cada roteiro, em texto corrido), do mais novo para o mais antigo, com título, data e número de palavras. O título é o primeiro `# ` do arquivo, sem o "Fala — "; sem título, vale o nome da pasta, sem a data.
- Tocar num roteiro carrega o texto no editor, substituindo o atual (com **Desfazer**).
- Por padrão a pasta é `../Roteiros`, ao lado da pasta do app. Para usar outra, defina `ROTEIROS_DIR` antes de iniciar. No PowerShell: `$env:ROTEIROS_DIR = "D:\Meus roteiros"; npm start`.
- Outras variáveis: `PORT` (padrão 3210) e `HOST` (padrão `0.0.0.0`, todas as redes). Com outro `HOST`, a janela mostra só o endereço em que o servidor escuta (com `HOST=127.0.0.1`, por exemplo, `http://127.0.0.1:3210`).

## 5. Limites de usar pela Wi-Fi (HTTP)

Pelo endereço da rede (`http://192.168…`), o navegador trata a página como "não segura". Na prática tudo funciona, com duas diferenças:

- **Não funciona offline.** O modo offline (service worker) só funciona em HTTPS ou no próprio computador (`http://localhost`). Então o servidor do PC precisa estar rodando, inclusive para o ícone da Tela de Início.
- **Tela acesa.** A função de manter a tela acesa (Wake Lock) não existe em HTTP. O teleprompter usa então um vídeo invisível e silencioso para o aparelho não apagar a tela. Esse truque pode pausar uma música que esteja tocando no celular.

## 6. Se o celular não conectar

1. Confira se o celular está na **mesma Wi-Fi** do computador, e não na rede de convidados. Alguns roteadores isolam os aparelhos entre si ("isolamento de AP" ou "isolamento de clientes").
2. **Firewall do Windows**: ele precisa permitir o Node.js no perfil da rede em uso (**Privada** ou **Pública**). Se o celular não conectar, libere o Node nos dois: Segurança do Windows → Firewall e proteção de rede → Permitir um aplicativo pelo firewall → Node.js → marque Privada e Pública.
3. Use o endereço **exato** que a janela mostrou (o IP muda).
4. No próprio computador, `http://localhost:3210` abre (com o `HOST` padrão)? Se não abrir, o servidor não está rodando.

## 7. Privacidade

- O roteiro e os ajustes ficam **só no aparelho** (armazenamento local do navegador). Nada vai para a internet.
- **Enquanto o servidor estiver rodando, qualquer pessoa conectada à mesma Wi-Fi pode abrir o app e ler os `fala.md` da pasta Roteiros.** Na rede de casa, tudo bem. Em rede pública (café, evento, coworking), feche o servidor quando não estiver usando.
- O servidor só lê os `fala.md` listados; ele não grava nada e não serve nenhum outro arquivo do computador.

## 8. Testes

- `npm test`: testes unitários com `node --test` (store, métricas, markdown, layout e servidor, incluindo tentativas de path traversal e a API).
- `npm run test:e2e`: testes de ponta a ponta com Playwright nos motores do iPhone/iPad (WebKit) e do Android (Chromium). O Playwright fica instalado **fora da pasta do app**, em `%LOCALAPPDATA%\teleprompter-e2e` (Windows) ou `~/.cache/teleprompter-e2e` (outros sistemas); `TELEPROMPTER_E2E_DIR` troca o lugar.
- Com `TELEPROMPTER_ROTEIROS_REAIS` apontando para uma pasta `Roteiros`, os testes também conferem os `fala.md` dela, supondo texto corrido com marcação só no título "# Fala — …"; sem a variável, esses dois testes são pulados.
- Argumentos extras seguem para o Playwright (`npm run test:e2e -- --project=iphone --grep "RF-06"`). `E2E_WORKERS` define quantos navegadores rodam juntos, e `E2E_FULL=1` liga o critério de aceite literal de 2 minutos (RF-01).
- Não é preciso rodar `npm install`: o app não tem dependências, e o `npm run test:e2e` instala o Playwright fora da pasta.

## 9. Estrutura

```
teleprompter/
├── Iniciar Teleprompter.cmd   atalho de duplo clique (Windows)
├── server.mjs                 servidor local: arquivos de public/ + API dos roteiros (só Node, sem pacotes)
├── package.json               scripts start, test e test:e2e
├── README.md, CHANGELOG.md
├── LICENSE, THIRD-PARTY-NOTICES.md   licença MIT e avisos de terceiros (ícones)
├── docs/                      ESPECIFICACAO.md (o que o app faz) e DESIGN-SYSTEM.md (como ele se parece)
├── public/                    o app, servido como está
│   ├── index.html, manifest.webmanifest, sw.js
│   ├── icons/                 ícone SVG e PNGs (192, 512, maskable, Tela de Início do iPhone)
│   ├── css/                   tokens · base · componentes · editor · painel · teleprompter
│   └── js/                    main, store, métricas, plataforma, ícones, editor, painel,
│                              markdown, roteiros e prompter/ (motor do teleprompter)
└── tests/
    ├── unit/                  node --test
    └── e2e/                   Playwright
```

## 10. Licença

MIT. Veja [LICENSE](LICENSE). Alguns ícones vêm do Lucide e do Feather (licenças ISC e MIT): veja [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
