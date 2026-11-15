---
name: EZ Downloader
description: Locadora VHS em preto fosco, lombada creme e adesivo azul; cada download é uma fita com carretéis reais, e o laranja do tema é a única cor de ação.
colors:
  brasa: "#f97316"
  brasa-bright: "#fb923c"
  azul: "#38bdf8"
  azul-bright: "#7dd3fc"
  verde: "#34d399"
  verde-bright: "#6ee7b7"
  violeta: "#a78bfa"
  violeta-bright: "#c4b5fd"
  rosa: "#fb7185"
  rosa-bright: "#fda4af"
  on-accent: "#140d08"
  carcaca: "#0b0b0e"
  shell: "#161213"
  surface-1: "#1d181a"
  surface-2: "#261f21"
  surface-3: "#31292c"
  surface-4: "#3c3336"
  creme: "#f4efe3"
  creme-2: "#e6dfcd"
  tinta: "#17130f"
  tinta-2: "#4a4338"
  text: "#f1ede4"
  text-2: "#bab6ab"
  text-3: "#9a968c"
  adesivo-azul: "#2b5cf0"
  sucesso: "#4ade80"
  erro: "#f87171"
typography:
  display:
    fontFamily: "Archivo EZ, Segoe UI, system-ui, sans-serif"
    fontSize: "2.875rem"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 108"
  headline:
    fontFamily: "Archivo EZ, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo EZ, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Archivo EZ, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo EZ, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.5
  sticker:
    fontFamily: "Archivo EZ, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    letterSpacing: "0.06em"
  figure:
    fontFamily: "Archivo EZ, Segoe UI, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 105"
  mono:
    fontFamily: "ui-monospace, Cascadia Code, SF Mono, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  command: "22px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  stage-top: "36px"
components:
  button-primary:
    backgroundColor: "{colors.brasa}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.brasa-bright}"
  button-primary-lg:
    backgroundColor: "{colors.brasa}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 28px"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-4}"
  button-ghost:
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
  button-danger:
    backgroundColor: "{colors.erro}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    height: "36px"
  button-paper:
    backgroundColor: "{colors.creme}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    height: "36px"
  segmented:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-thumb:
    backgroundColor: "{colors.creme}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pill}"
  segmented-thumb-tape:
    backgroundColor: "{colors.brasa}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  command-bar:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.command}"
    padding: "8px"
  panel:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "20px"
  tapecard:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "14px 18px 14px 14px"
  popover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
  dialog:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "24px"
    width: "440px"
  toast:
    backgroundColor: "{colors.creme}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    padding: "12px 12px 14px 14px"
  tooltip:
    backgroundColor: "{colors.creme}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.sm}"
    padding: "7px 11px"
  sticker:
    backgroundColor: "{colors.adesivo-azul}"
    textColor: "#ffffff"
    typography: "{typography.sticker}"
    rounded: "5px"
    padding: "3px 9px"
  badge:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: EZ Downloader

## Overview

**Creative North Star: "A Locadora de Fitas"**

O app é uma locadora VHS em modo escuro: carcaça preta fosca, lombadas em creme, adesivo azul para o formato e um único laranja de ação que o usuário troca entre cinco temas. Cada download é uma fita com janela e dois carretéis, e a fila é uma prateleira, não uma lista de cartões iguais. A fita é o loader e o indicador de estado ao mesmo tempo: gira com o download, para na pausa, solta a fita ao falhar, e o adesivo PRONTO é carimbado ao concluir. O estado se lê sem texto.

A densidade é de ferramenta de uso diário: uma coluna central de 780px, uma barra de comando generosa (campo de URL, MP4/MP3 e Baixar numa linha) e poder avançado recolhido. O tom é tátil e confiante: botões primários têm uma aresta inferior que afunda ao pressionar, a barra de modo tem uma pílula deslizante, superfícies flutuantes em creme (toast, tooltip) destacam-se do preto como etiquetas coladas.

Rejeições confirmadas: controles nativos do SO (select, date, checkbox, dialog, tooltip title), halos coloridos de brilho, easing com bounce ou overshoot, e o arranjo padrão de formulário com lista de cartões idênticos.

**Key Characteristics:**
- Preto fosco levemente tingido pelo acento; creme e preto de tinta são fixos em todos os temas.
- Um acento por tema (cinco temas), aplicado a ação, progresso, foco e fita em movimento.
- Archivo variável com eixo de largura: títulos em peso 800, apertados e levemente expandidos.
- Fita SVG autoral como assinatura: pacote de fita proporcional ao progresso.
- Movimento reduzido tem alternativa real: pose parada desenhada, piscar por steps, troca de estado no lugar do movimento.
- Todos os controles são próprios (segmented, select, popover, seletor de data, diálogo, toast).

## Colors

Preto tingido, creme de etiqueta e um acento quente que muda de tema, com verde e vermelho só para estado.

### Primary
- **Brasa** (#f97316): acento padrão do tema Brasa. Fundo do botão primário, fita de progresso, foco, caret, seleção, janela da fita ativa, faixa da etiqueta da fita. Hover usa **Brasa Clara** (#fb923c), que também colore texto de opção selecionada, URLs em destaque e dicas.
- **Texto sobre acento** (#140d08): tinta quase preta para qualquer texto ou ícone sobre o acento.

### Secondary (os outros quatro temas, cada um com sua variante clara)
- **Azul** (#38bdf8, clara #7dd3fc), **Verde** (#34d399, clara #6ee7b7), **Violeta** (#a78bfa, clara #c4b5fd), **Rosa** (#fb7185, clara #fda4af). Trocam apenas as variáveis de acento e o preto de fundo; o resto do sistema não muda. O seletor de tema (bolinhas de 36px) mostra cada um.

### Tertiary
- **Adesivo Azul** (#2b5cf0): fixo em todos os temas, exclusivo do adesivo de formato (MP4, MP3) e do terço direito da fita de cor sob a barra superior. Não é acento de ação.

### Neutral
- **Carcaça** (#0b0b0e): fundo da janela (varia sutilmente por tema: #090b0e, #090c0b, #0b0a0f, #0d0a0b).
- **Casco, Superfície 1 a 4** (#161213, #1d181a, #261f21, #31292c, #3c3336): degraus tonais, cada um misturando 3% a 7% do acento no cinza-preto, por isso os valores mudam com o tema (os hex aqui são do tema Brasa). Barra superior, painéis e cartões, popovers e diálogos, estados de hover, trilhas.
- **Creme** (#f4efe3) e **Creme 2** (#e6dfcd): lombada da fita, pílula do segmented, toast, tooltip, bolinha do switch, botão papel. Fixos.
- **Tinta** (#17130f) e **Tinta 2** (#4a4338): texto sobre creme.
- **Texto** (#f1ede4), **Texto 2** (#bab6ab), **Texto 3** (#9a968c): primário, secundário e apoio sobre o preto. As linhas usam creme a 7% e 14% de opacidade.
- **Sucesso** (#4ade80) e **Erro** (#f87171): concluído e falha, com versões suaves a 14% de opacidade para fundos de ícone.

### Named Rules
**A Regra do Acento Único.** Cada tema tem exatamente um acento; ele é a única cor de ação e de fita em movimento. Verde e vermelho são estado, azul é adesivo; nenhum deles vira ação.

**A Regra Creme e Preto Fixos.** Creme, tinta, adesivo azul e o casco da fita não mudam com o tema. Só o acento e o tingimento das superfícies mudam.

## Typography

**Display Font:** Archivo EZ (variável, self-hosted, eixos de peso 100 a 900 e largura 62% a 125%, com Segoe UI e system-ui de reserva)
**Body Font:** Archivo EZ, mesma família
**Label/Mono Font:** pilha monoespaçada do sistema (ui-monospace, Cascadia Code, SF Mono, Consolas), usada para URLs, caminhos, comandos e logs

**Character:** uma única família grotesca com peso 800 nos títulos e largura aberta no herói e nos percentuais, o que dá o ar de impressão de lombada. A mono marca tudo que é dado técnico copiável.

### Hierarchy
- **Display** (800, clamp(2rem, 6vw, 2.875rem), 1.04, -0.04em, largura 108%): título do herói, recolhido depois do primeiro download.
- **Headline** (800, 1.125rem a 1.25rem, 1.3, -0.02em): título da prateleira, do diálogo e do vídeo.
- **Title** (700 a 800, 1rem a 1.0625rem, -0.015em): título de painel, de fita, do disclosure.
- **Body** (400, 0.9375rem, 1.5): texto corrido e campos. Textos longos ficam em até 52ch.
- **Label** (700, 0.8125rem a 0.875rem): rótulos de campo, botões, itens do segmented.
- **Sticker** (800, 0.75rem, 0.06em, maiúsculas curtas): adesivo de formato; carimbo usa 900, 0.8125rem, 0.1em.
- **Figure** (800, 1.875rem, tabular, largura 105%): percentual da fita.

### Named Rules
**A Regra dos Números Tabulares.** Percentual, tempos, tamanhos e contagens usam algarismos tabulares para não tremer enquanto atualizam.

**A Regra da Mono Técnica.** Mono só para dado que o usuário pode copiar ou comparar (URL, caminho, comando, log). Nunca para decoração.

## Layout

Uma coluna central de 780px (padding 36px 24px 64px), com 16px entre blocos, dentro de uma janela de altura fixa que rola só o palco. A barra superior tem 62px e uma fita de cor de 3px na base (acento, creme, adesivo azul em terços). A barra de comando agrupa campo, segmented MP4/MP3 e Baixar numa linha; o herói recolhe com transição de grid depois do primeiro uso. Painéis têm 20px de padding; a prateleira de fitas usa 12px de gap, e o cartão de fita é uma grade de 132px (fita), corpo flexível e coluna lateral com percentual. Avançado usa duas colunas com gap de 22px por 24px.

Abaixo de 680px: o nome da marca some, a barra de comando quebra em linhas (campo inteiro, segmented e botão dividem a largura), a fita do cartão cai para 84px e as colunas do Avançado viram uma. Em ponteiro grosso, alvos pequenos sobem para 44px.

## Elevation & Depth

Híbrido: camadas tonais para hierarquia (casco, superfície 1 a 4) e sombras só em três papéis: cartões e painéis, camadas flutuantes e o afundar do botão. Valores exatos no sidecar. Em repouso as superfícies são quase planas; a profundidade vem do degrau tonal e de uma linha de luz creme de 1px no topo dos cartões.

### Named Rules
**A Regra da Superfície Quase Plana.** Painéis e cartões usam uma sombra grande e escura, sem cor. Sombra com cor do acento não existe.

**A Regra da Etiqueta Colada.** O que flutua sobre a interface (toast, tooltip) vira creme, como uma etiqueta; popovers e diálogos ficam em superfície 2 com sombra de camada.

## Shapes

Cantos generosos e consistentes: 8px (opções, dias, tooltip), 12px (botões, campos), 18px (cartões de fita, popovers, disclosure), 24px (painéis, diálogos), 22px na barra de comando e pílula total (999px) em segmented, barras e badges. Adesivos e carimbos são a exceção deliberada: cantos de 5px e 6px, para parecerem etiqueta de papel, e o carimbo gira -6 graus. Contornos de 1px em creme a 14% (campos, secundário) ou 7% (cartões); a prateleira vazia usa borda tracejada de 1,5px. A fita SVG tem casco preto com contorno cinza, janela escura, carretéis cremes e pacote de fita marrom.

## Components

### Buttons
- **Shape:** cantos de 12px (8px no pequeno, 30px de altura; 52px no grande); texto 700.
- **Primary:** fundo do acento com texto de tinta, aresta inferior de 3px mais escura; sobe 1px no hover (acento claro) e afunda 2px ao pressionar. O botão Baixar (grande, 150px mínimo) fica verde por um instante ao iniciar.
- **Secondary:** superfície 3 com contorno de 14%; **Ghost:** transparente com texto 2, revela superfície 3 no hover; **Danger:** vermelho com aresta; **Paper:** creme com aresta creme 2.
- **Busy:** o ícone dá lugar a um spinner; em movimento reduzido vira um ponto que pisca.

### Segmented
Trilha em pílula com contorno; a pílula creme desliza por transform e largura (240ms). Variante tape usa pílula de acento, como o seletor MP4/MP3. Exposto como radiogroup, com tooltips nos itens.

### Fields e Select
Campo de 44px, fundo superfície 1, contorno 14%; hover clareia o contorno, foco muda o contorno para o acento e o fundo para superfície 2. Rótulo 700 acima, nota e erro abaixo; erro treme levemente. O select é um botão que abre um listbox em popover, com grupos em maiúsculas pequenas, a opção ativa em superfície 4 e a selecionada em acento claro com check.

### Toggle
Checkbox de 20px com cantos de 6px e switch de 40 por 24px com bolinha creme que se alonga ao pressionar; marcado preenche com o acento. O input real fica oculto, com foco desenhado no controle.

### Cartões, Painéis e Disclosure
Painel: superfície 1, 24px, 20px de padding. Cartão de fita: grade com a fita, título, adesivo de formato, meta em mono, percentual grande e ações; estado ativo ganha borda de foco e tinta do acento, falha borda vermelha suave, cancelado fita a 55%. Disclosure abre por grid-template-rows; a versão quieta não tem moldura.

### Diálogo, Popover, Toast, Tooltip, Seletor de Data
Todos próprios, dentro de uma camada raiz. Diálogo de 440px sobre scrim a 66%; popover com entrada de 6px e escala 0.98; toast creme com barra de tempo de 3px no acento, ícone redondo de tinta (verde ou vermelho escuros para sucesso e erro); tooltip creme de 280px no máximo. O seletor de data tem grade de 7 colunas, dia selecionado em acento e hoje com anel fino, mais passo de hora e minuto.

### Fita VHS (assinatura)
SVG com janela e dois carretéis; o pacote de fita muda de raio conforme o progresso. A cor da borda da janela dá o estado: acento (ativo), cinza (pausado), verde (pronto), vermelho (falha, com fio solto visível). Carretéis giram a 1,5s (0,9s ao carregar); fita tracejada corre. Etiqueta creme com faixa de acento e formato em tinta. É também o loader (112px) e o estado vazio da prateleira.

### Adesivo e Carimbo
Adesivo azul de formato em maiúsculas curtas; carimbo de contorno duplo (PRONTO em verde, falha em vermelho, cancelado em cinza) inclinado -6 graus, que cai de escala maior ao concluir.

### Navigation
Barra superior de 62px em casco: marca (miniatura de fita creme que gira 8 graus no hover), segmented Básico/Avançado e menu de ajustes com seletor de tema e diagnóstico.

## Do's and Don'ts

### Do:
- **Do** usar creme (#f4efe3) para o que flutua (toast, tooltip) e para a pílula de seleção, e preto de tinta (#17130f) sobre ele.
- **Do** manter um único acento por tema, vindo de `--accent`, e derivar superfícies, linhas e foco dele por mistura.
- **Do** mostrar o estado pela fita (carretéis, janela, fio solto) antes de qualquer texto.
- **Do** usar o easing de saída `cubic-bezier(0.16, 1, 0.3, 1)` e durações de 140, 240 e 420ms; entrada e saída de cartão em 520 e 320ms.
- **Do** dar a cada animação um equivalente em movimento reduzido: pose parada desenhada com o pacote no tamanho certo, piscar por `steps(1)`, ou troca de estado no lugar (cartão some com opacidade, carimbo aparece já no lugar, barra indeterminada pisca em largura total, spinner vira ponto).
- **Do** desenhar todo controle (select, data, diálogo, tooltip, scrollbar) com o sistema; foco por teclado em contorno de 2px no acento com 2px de afastamento.
- **Do** usar algarismos tabulares e mono para números e dados técnicos.

### Don't:
- **Don't** usar controles nativos do SO (select, input date, checkbox nativo, dialog ou title nativos).
- **Don't** usar easing com bounce ou overshoot na curva; o carimbo e o botão se movem por keyframes curtos e ainda param no lugar.
- **Don't** criar halos ou brilhos coloridos; elevação é sempre sombra escura.
- **Don't** usar mais de um acento por tema, nem promover verde, vermelho ou o adesivo azul a cor de ação.
- **Don't** trocar creme, tinta ou o casco da fita por cores do tema.
- **Don't** voltar ao arranjo de formulário com lista de cartões iguais; a fila é uma prateleira de fitas.
- **Don't** desligar o movimento no modo reduzido sem substituir: nada de estado que dependa só de animação.
- **Don't** usar fonte do sistema como display; Archivo EZ é a fonte de títulos.
