---
name: EZ Downloader
description: Downloader de mídia para desktop, escuro e direto, com um único acento de cor sobre superfícies quase pretas.
colors:
  night-bg: "#08080b"
  ember-accent: "#f97316"
  ember-bright: "#fb923c"
  on-accent: "#100c08"
  text-primary: "#edf0f5"
  text-secondary: "#8892a0"
  text-muted: "#7a828d"
  success-green: "#34d399"
  error-red: "#f87171"
  azure-accent: "#38bdf8"
  verdant-accent: "#34d399"
  violet-accent: "#a78bfa"
  rose-accent: "#fb7185"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.18
    letterSpacing: "-0.045em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.08em"
  field:
    fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  field: "12px"
  button-small: "8px"
  card: "24px"
  pill: "9999px"
spacing:
  card-padding: "22px"
  field-height: "44px"
components:
  button-accent:
    backgroundColor: "{colors.ember-accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.field}"
  button-accent-hover:
    backgroundColor: "{colors.ember-bright}"
  field-input:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.field}"
    height: "{spacing.field-height}"
  pill:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    height: "28px"
---

# Design System: EZ Downloader

## Overview

**Creative North Star: "A Bancada Escura"**

Uma bancada de trabalho apagada onde só a ferramenta em uso acende. O fundo é quase preto, as superfícies sobem em degraus sutis de luminosidade e uma única cor de acento marca o que é acionável ou está em andamento. O app existe para uma tarefa curta (colar, baixar), então a interface fica quieta e deixa a ação principal em primeiro plano.

A densidade é baixa no Modo Básico e média no Avançado: tudo que é poder extra fica recolhido em "Opções avançadas". O acento muda com o tema escolhido pelo usuário, e as demais superfícies se derivam dele por mistura de cor, o que mantém os cinco temas coerentes sem listas de cores paralelas.

**Key Characteristics:**
- Fundo quase preto com superfícies empilhadas em quatro degraus tingidos pelo acento.
- Um acento por vez, trocável em cinco temas.
- Tipografia do sistema; monoespaçada só em campos de entrada e saída técnica.
- Cantos generosos (12 px em campos, 24 px em cartões) e bordas finas de baixo contraste.
- Movimento curto, de opacidade e deslocamento, sempre com alternativa para movimento reduzido.

## Colors

Paleta de um acento sobre noite fria, com verde e vermelho fixos reservados para resultado.

### Primary
- **Brasa** (#f97316): acento padrão. Botão principal, foco, ponto de estado, barra de progresso e rótulos de campo. Em `--on-accent` (#100c08) o texto sobre ele passa em AA.
- **Brasa Clara** (#fb923c): hover do botão principal e texto de estado selecionado.

### Secondary
- **Temas alternativos:** Azure (#38bdf8), Verdant (#34d399), Violet (#a78bfa) e Rose (#fb7185). Cada um troca só `--bg`, `--accent` e `--accent-bright`; o resto deriva.

### Neutral
- **Noite** (#08080b): fundo da janela. Os temas alternativos variam o fundo em poucos pontos de luminosidade.
- **Texto** (#edf0f5): texto principal.
- **Texto Secundário** (#8892a0): valores de campo e botões secundários.
- **Texto Apagado** (#7a828d): rótulos, notas e placeholders.
- **Verde de Sucesso** (#34d399) e **Vermelho de Erro** (#f87171): feedback fixo, não seguem o tema.

### Named Rules
**The One Voice Rule.** Existe um único acento por tema. Verde e vermelho aparecem só para resultado (concluído, falhou, confirmar exclusão), nunca como decoração.
**The Derived Surface Rule.** Superfícies, bordas de foco e fundos suaves derivam do acento por `color-mix`; não se adicionam cores de superfície avulsas.

## Typography

**Display e Body:** fonte do sistema (-apple-system, Segoe UI, system-ui).
**Mono:** SF Mono, Cascadia Code, Fira Code, Consolas, para campos de entrada, caminhos e saída técnica.

**Character:** neutra e nativa de propósito, para o app parecer parte do sistema operacional. Peso 650 em semibold porque a fonte variável do sistema responde bem a ele.

### Hierarchy
- **Display** (800, 1.5rem, 1.18): a pergunta do topo ("O que você quer baixar hoje?"), com tracking negativo.
- **Title** (650, 1rem, 1.4): título do vídeo e cabeçalhos de painel.
- **Body** (400, 0.875rem, 1.55): texto corrido e valores.
- **Label** (700, 0.6875rem, +0.08em, maiúsculas): rótulos de campo e cabeçalhos de seção, em cor apagada.
- **Field** (mono, 0.75rem): conteúdo de campos de entrada e caminhos.

### Named Rules
**The Quiet Label Rule.** Rótulos são pequenos, em caixa alta e apagados; quem chama atenção é o valor do campo, não o rótulo.

## Layout

Coluna única centralizada dentro de uma janela de desktop, com rolagem vertical dentro do `main` e sem rolagem da janela. A tela é progressiva: as regiões (vídeo, formato, destino) aparecem conforme a fase, e as opções avançadas ficam num `details` recolhido. Cartões usam 22 px de padding interno e separadores finos que sangram até a borda do cartão. Campos têm 44 px de altura; em ponteiro grosso, pílulas e alvos sobem para 44 px.

## Elevation & Depth

Híbrido contido: a profundidade vem sobretudo de degraus tonais (quatro superfícies cada vez mais claras), com sombras neutras e escuras só em cartões e popovers.

### Shadow Vocabulary
- **Cartão** (`0 1px 0 rgba(255,255,255,0.03) inset, 0 10px 28px rgba(0,0,0,0.38)`): cartões principais.
- **Cartão pequeno** (`0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 22px rgba(0,0,0,0.32)`): itens de lista.
- **Popover** (`0 12px 32px rgba(0,0,0,0.45)`): seletor de tema.
- **Acento** (`0 4px 20px` do acento a 40%, mais um brilho interno de 1 px): somente o botão principal em repouso; sobe no hover.
- **Foco de campo** (`0 0 0 3px` do acento a 14%): anel de foco, sem halo difuso.

### Named Rules
**The No Halo Rule.** Sem brilhos coloridos em ícones, barras, pontos de estado nem botões de confirmação. Estado se mostra por borda, fundo e cor, não por halo. O único tom de sombra colorida permitido é o do botão principal.

## Shapes

Cantos arredondados em escala curta: 12 px em campos e botão principal, 8 px em botões secundários e fantasmas, 24 px em cartões, pílula completa em chips e marcadores. Bordas de 1 px em branco a 5,5% (10% no estado mais forte); a borda de foco usa o acento a 55%.

## Components

### Buttons
- **Primary (`btn-accent`):** acento sólido, texto escuro, raio 12 px, brilho interno sutil por gradiente branco a 15%. Hover sobe 1 px e clareia; ativo escala a 0,98. Confirmação destrutiva troca o fundo para uma mistura de vermelho com acento.
- **Secondary:** superfície 3 com borda forte, raio 8 px, texto secundário que clareia no hover.
- **Ghost:** transparente com borda fina; no hover vira vermelho suave (usado para ações destrutivas como remover e cancelar).

### Chips
- **Pill:** 28 px de altura, borda fina, superfície 2. Estado pressionado usa fundo e borda do acento e texto no acento claro. Em ponteiro grosso vira alvo de 44 px.

### Cards / Containers
- **Corner Style:** 24 px. **Background:** superfície 1. **Border:** 1 px de baixo contraste. **Entrada:** sobe 10 px com fade em 220 ms, desligada com movimento reduzido.

### Inputs / Fields
- **Style:** 44 px de altura, raio 12 px, superfície 2, texto mono em tom secundário.
- **Focus:** borda do acento a 55%, texto sobe para cor principal e anel de 3 px do acento a 14%.
- **Error:** texto vermelho de 0,6875rem com ícone de alerta por máscara; dica usa o acento no lugar do vermelho.

### Cartão de download
- Ícone de estado em anel, barra de progresso em gradiente do acento com brilho que corre, estado em texto ("Na fila", "Agendado para…", "Pausado") e ações Pausar, Retomar, Cancelar e Abrir pasta. Concluído e falhou usam borda e fundo verdes ou vermelhos, sem halo.

## Do's and Don'ts

### Do:
- **Do** manter um único acento por tema e derivar superfícies dele com `color-mix`.
- **Do** esconder qualquer poder novo dentro de "Opções avançadas"; o caminho de colar e baixar não pode ganhar passos.
- **Do** usar a escala de raios (12, 8, 24 px, pílula) e a altura de campo de 44 px.
- **Do** dar a cada animação uma alternativa com `prefers-reduced-motion`.
- **Do** mostrar foco de teclado em todo elemento interativo, incluindo `summary` e checkbox.

### Don't:
- **Don't** usar halos ou brilhos coloridos para indicar estado (ícones, barras, pontos, botões de confirmação).
- **Don't** usar easing com bounce ou elástico; a curva padrão é `cubic-bezier(0.4, 0, 0.2, 1)` e o botão principal usa uma de saída suave.
- **Don't** adicionar cores de superfície fora dos quatro degraus derivados.
- **Don't** usar verde ou vermelho como decoração; são só de resultado.
- **Don't** colocar texto abaixo de 11 px nem rótulo em cor mais apagada que o token de texto apagado.
