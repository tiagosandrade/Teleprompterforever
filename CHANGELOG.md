# Changelog

## 1.0.2 — 2026-10-28

Correções da terceira verificação (revisão adversarial).

### Teleprompter
- Coluna estreita ou letra grande: só a palavra que não cabe na largura ganha hífen. As que cabem não são mais hifenizadas no fim da linha ("cal-/çada").
- "entrada/saída" e "Canon/Nikon" numa coluna estreita quebram depois da barra; duplas curtas que cabem ("km/h", "e/ou") vão inteiras para a linha seguinte. Palavras ligadas por espaço inseparável não são mais partidas no meio.
- Letra enorme numa coluna estreita: o texto todo é hifenizado de uma vez, com as mesmas quebras e sem o custo de marcar palavra por palavra (se o roteiro não tiver endereço ou e-mail).
- Antes de começar, na pausa e no fim, os véus atrás dos controles não escondem mais a linha que está sendo lida numa área baixa ou invertida. Numa área ainda mais baixa, em que a própria barra fica sobre a linha, ela continua coberta.
- Painel de ajustes: ligar ou desligar "Inverter verticalmente" com o painel aberto não o move mais, e o segundo toque não cai em "Restaurar padrões". A nova posição vale na próxima vez que o painel abrir.
- "Ajustar na tela": a barra de uma linha só vale só com o celular deitado, e a janela em pé de tela dividida fica com duas linhas. Deitado e estreito, a barra esconde as medidas; abaixo de 440 px, o "Concluir" fica só com o ✓. Esquerda, Centro e Direita ficam legíveis.

### Editor
- Importar `.md` e Roteiros do PC:
  - indicações como "[DICA]: sorria" e "[CORTE]: 01:15" não somem mais, nem no meio de um parágrafo;
  - citações "[1][2]" e "[^a-z]" ficam como estão;
  - um ano logo depois de uma lista numerada continua na fala ("2025. Esse foi o ano…"), e "2. [ ] item" vira "2. item";
  - código com três crases no começo da linha e código dentro de citação, com "> " em todas as linhas, não deixam mais o resto do roteiro com asteriscos e cerquilhas (se só a primeira linha do código tem "> ", o resto agora sai cru); o código aberto na linha de um item ("- ```bash") acaba na cerca de fechamento ou no item seguinte;
  - `<link>` e `<img>` sem atributo ficam como texto, e listas e tabelas em HTML não grudam palavras;
  - um `<!--` solto no meio de uma frase não apaga mais o resto do texto (no começo da linha, continua valendo até o `-->`).

### Servidor
- Com `HOST` igual ao IP do Wi-Fi, abrir o atalho duas ou três vezes seguidas sobe um servidor só; as outras janelas avisam que ele já está rodando.
- Um teleprompter que demora para responder (PC sem memória) não é mais confundido com outro programa: o segundo clique avisa, em vez de abrir outro servidor na porta seguinte.
- Um programa que responde sem parar numa das portas seguintes não faz mais o início ocupar centenas de MB de memória.
- Os endereços mostrados são os que funcionam: com `HOST=127.0.0.1`, http://127.0.0.1:3210; com `HOST` igual ao IP do Wi-Fi, só esse IP; com `HOST` igual ao nome do computador, `http://<nome>:3210`.
- `HOST` com espaço no fim (`set HOST=127.0.0.1 && node server.mjs` no cmd.exe) funciona.

## 1.0.1 — 2026-10-28

Correções da segunda verificação (revisão adversarial e uso de ponta a ponta nos 5 tamanhos de tela).

### Teleprompter
- "Ajustar na tela" no celular deitado: a barra tem uma linha só e fica do lado em que não cobre nenhuma alça (o app mede os dois lados, também ao girar a tela). Antes, com a área entre 51% e 70% da altura, ela cobria as alças laterais.
- Coluna estreita ou letra grande: a palavra que não cabe na largura quebra com hífen, em vez de ser partida em qualquer letra. Com a coluna larga, nada é hifenizado, e um e-mail ou endereço comprido não liga a hifenização.
- Painel no celular em pé com "Inverter verticalmente": desce do topo, para não esconder a linha de leitura.
- Pontinhos cinza ao lado da dica, na pausa, não aparecem mais: o véu fica sólido atrás de toda a barra.

### Editor
- A duração estimada arredonda para cima, como o relógio do teleprompter: os dois mostram o mesmo tempo.
- No celular deitado, estatísticas e botão ficam numa linha, e sobra mais campo de texto.
- Importar `.md` não apaga mais palavras: `*` e `_` soltos, `<seu nome>`, `2*3`, "[DICA]: sorria…" e "[texto](com espaço)" ficam como estão, e um número no começo de uma linha quebrada ("2024. O rio…") continua na frase, também dentro de listas. Um "[" sem fechamento não deixa mais a conversão lenta.
- Texto de exemplo corrigido: arrastar para cima avança o texto.
- Ícone Importar com a seta entrando, para não ser confundido com o Compartilhar do iPhone.

### Servidor
- Aberto duas vezes com a porta 3210 ocupada por outro programa, o atalho acha o teleprompter que já está rodando na 3211 e só avisa, em vez de abrir um segundo servidor. O mesmo vale para dois cliques quase juntos e para programas que escutam só no endereço IPv6 do computador.

## 1.0.0 — 2026-10-27

Primeira versão.

### Teleprompter
- Rolagem suave com velocidade em palavras por minuto (40–320 ppm): o tempo de leitura é sempre palavras ÷ ppm, em qualquer tamanho de letra ou largura de área.
- Um toque em qualquer lugar pausa; outro toque continua, com retomada suave. Arrastar move o texto junto com o dedo.
- Tamanho do texto de 16 a 160 px, com a linha que está sendo lida mantida no lugar.
- Posição do texto (Esquerda, Centro, Direita) e área de leitura com largura e altura livres, pelo painel ou pelo modo "Ajustar na tela", com alças.
- Espelhamento horizontal (vidro de teleprompter) e inversão vertical.
- Contagem regressiva (desligada, 3 s ou 5 s), guia de leitura e esmaecimento no topo e na base.
- Controles só na pausa: voltar, tempo restante, tela cheia, ajustes, recomeçar, velocidade, tamanho e reproduzir.
- O Voltar do Android e o gesto de voltar do Safari voltam ao editor, sem sair do app.
- Atalhos de teclado e suporte a controles Bluetooth de virar página.
- Tela sempre acesa (Wake Lock, com vídeo invisível como reserva) e tela cheia onde o aparelho permite.

### Editor
- Campo para colar ou digitar, salvo automaticamente no aparelho, com contagem de palavras e duração estimada.
- Importar arquivos `.txt` e `.md` (Markdown convertido em texto corrido, sem o título do documento).
- "Roteiros do PC": lista e carrega os `fala.md` da pasta `Roteiros`.
- "Limpar" e trocas de texto com "Desfazer" por 6 segundos.
- Aviso único no iPhone sobre "Adicionar à Tela de Início" para usar em tela cheia.

### Painel de ajustes
- Velocidade, tamanho do texto, posição, área, espelhamento, contagem regressiva, guia de leitura e "Restaurar padrões", tudo aplicado na hora.
- Folha embaixo no celular em pé; painel lateral no tablet e no celular deitado, do lado oposto ao texto.

### App e servidor
- PWA instalável (manifest, ícones e service worker "rede primeiro"); offline em HTTPS ou localhost.
- Servidor local sem dependências (`npm start` ou "Iniciar Teleprompter.cmd"): mostra os endereços da rede Wi-Fi, serve o app e a API dos roteiros com proteção contra path traversal e DNS rebinding, e avisa em vez de abrir um segundo servidor quando o atalho é aberto duas vezes.
- Testes unitários (`npm test`) e de ponta a ponta com Playwright (`npm run test:e2e`).
