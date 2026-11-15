# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Gente comum que quer colar um link e baixar um vídeo ou áudio, sem linha de comando e sem configurar nada. Usuários avançados (fila, playlist, SponsorBlock, proxy, agendamento) são secundários: os recursos deles ficam recolhidos e nunca podem piorar o fluxo simples.

## Product Purpose
Aplicativo desktop (Tauri) que coloca o poder do yt-dlp numa interface simples. Cola a URL, escolhe o formato, baixa. Sucesso é o download concluir sem o usuário precisar entender yt-dlp, ffmpeg ou formatos.

## Positioning
Zero dependências para instalar: yt-dlp e ffmpeg vêm embutidos, e funciona em mais de 1000 sites. Open source e gratuito, MIT.

## Operating Context
Janela de desktop em Windows, macOS e Linux, webview do Tauri. A fila de downloads vive no backend Rust e sobrevive ao reinício do app. Foco em PC; Android só no futuro; iOS fora do mapa.

## Capabilities and Constraints
- Modo Básico (colar e baixar numa ação, MP4/MP3 lembrado, vários links de uma vez; "Entrar com o navegador" nos ajustes quando o YouTube exige login) e Modo Avançado (formato, corte, legendas, cookies, limite de velocidade, template de nome, presets, capa/capítulos/metadados, SponsorBlock, proxy, agendamento).
- Fila com pausa, retomada e histórico; playlist com seleção de itens; detecção de duplicatas.
- Anti-objetivo: nenhum recurso novo pode piorar o fluxo simples de colar a URL e baixar.
- Credenciais nunca são gravadas em texto puro (cookies guardam só o nome do navegador; proxy com usuário e senha é recusado).
- Builds do Windows saem por cross-compile em Docker (`cargo xwin`), sem as Build Tools do MSVC instaladas.
- Nada nativo na interface: select, checkbox, datepicker, tooltip, diálogo e toast são componentes próprios. Exceções do SO: seletor de pasta, notificações e menu do app.

## Brand Commitments
Nome EZ Downloader. Tom direto, em português do Brasil. Direção visual "Locadora de Fitas": cada download é uma fita VHS. Cinco temas de cor (Brasa padrão, Azul, Verde, Violeta, Rosa) sobre fundo escuro.

## Evidence on Hand
README com descrição e instalação, site em `site/`. Não há depoimentos, métricas de uso nem números de download registrados: não inventar.

## Product Principles
1. O caminho simples vem primeiro: colar, baixar, pronto.
2. Poder avançado fica recolhido, nunca no caminho de quem não precisa.
3. Zero configuração e zero dependências para o usuário instalar.
4. Segurança por padrão: nada de credencial em texto puro, nada de argumento livre para o yt-dlp.
5. A fila é confiável: o que foi pedido não se perde ao fechar o app.

## Accessibility & Inclusion
Navegação por teclado completa e respeito a `prefers-reduced-motion`. Interface em português do Brasil.
