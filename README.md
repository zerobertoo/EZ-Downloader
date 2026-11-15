<div align="center">

# EZ Downloader

**Baixe vídeos e áudios de qualquer lugar, sem complicação.**

Interface gráfica moderna para o [yt-dlp](https://github.com/yt-dlp/yt-dlp), sem linha de comando, sem configuração, sem dependências para instalar.

[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-orange?style=flat-square)](LICENSE)
[![Plataformas](https://img.shields.io/badge/plataformas-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)](#-instalação)
[![yt-dlp](https://img.shields.io/badge/powered%20by-yt--dlp-grey?style=flat-square)](https://github.com/yt-dlp/yt-dlp)

</div>

---

## ✨ O que é?

EZ Downloader é um aplicativo desktop que coloca o poder do **yt-dlp** em uma interface simples e bonita. Cole uma URL, escolha o formato e clique em baixar, é só isso.

Funciona com **YouTube, TikTok, Instagram, Twitter/X, Twitch, Facebook** e mais de **1000 outros sites**.

---

## 📥 Instalação

Acesse a página de [Releases](https://github.com/zerobertoo/EZ-Downloader/releases/latest) e baixe o instalador para o seu sistema:

| Sistema | Arquivo |
| :--- | :--- |
| Windows | `.exe` (instalador automático) |
| macOS Intel | `.dmg` |
| macOS Apple Silicon | `.dmg` (ARM64) |
| Linux | `.deb`, `.rpm` ou `.AppImage` |

> Não é necessário instalar o yt-dlp nem o ffmpeg, tudo já vem embutido.

> ⚠️ **No Windows, o Chrome ou o SmartScreen podem avisar que o arquivo "não é baixado com frequência" ou é "malicioso".** É falso positivo: o app não tem certificado de assinatura de código (custa caro, é um projeto pessoal e gratuito), e não porque contenha algo malicioso. Pra baixar/instalar mesmo assim: no aviso do Chrome, clique em "Mostrar mais" → "Manter mesmo assim"; no SmartScreen, clique em "Mais informações" → "Executar assim mesmo".

---

## 🚀 Como usar

**Modo Básico** (padrão): cole o link, deixe **MP4** ou **MP3** marcado (a escolha fica lembrada) e clique em **Baixar** (ou aperte Enter). O download entra na prateleira e começa sozinho. Vários links separados por espaço também funcionam.

**Modo Avançado**: use o alternador no topo para escolher formato e resolução, corte, legendas, SponsorBlock, proxy, agendamento, presets e mais.

Atalhos (Ctrl, ou Cmd no macOS): `L` foca o link, `M` alterna o modo, `H` abre o histórico, `J` abre os downloads simultâneos, `E` abre os ajustes e `Enter` executa a ação principal.

> Se o YouTube pedir para confirmar que você não é um robô, abra os **Ajustes** e escolha um navegador em "Entrar com o navegador". O Firefox é o que funciona de forma confiável: Chrome, Edge e Brave costumam bloquear a leitura dos cookies.

---

## ⚙️ Funcionalidades

- 🎞️ **Prateleira de fitas**: cada download é uma fita VHS com progresso, velocidade e tempo restante, e carimbo ao terminar
- ⏯️ **Fila confiável**: pausa, retomada, prioridade e limite de downloads simultâneos; sobrevive ao fechamento do app
- 📋 **Playlists e duplicatas**: seleção de itens, "só este vídeo" e aviso de link já baixado
- 🛠️ **Otimizar compatibilidade**: gera uma cópia MP4 (H.264) de arquivos com codec pouco compatível, na pasta que você escolher
- 🔎 **Detalhes técnicos**: comando e log do yt-dlp dentro de cada item, para diagnóstico
- 🎨 **Cinco temas de cor**: Brasa, Azul, Verde, Violeta e Rosa, com respeito a `prefers-reduced-motion`
- ⌨️ **Acessível**: navegação completa por teclado e componentes próprios, sem controles nativos
- 🌐 **+1000 sites suportados**: qualquer plataforma que o yt-dlp suporte
- 📦 **Zero dependências**: yt-dlp e ffmpeg já estão incluídos no app
- 🖥️ **Multiplataforma**: Windows, macOS (Intel e Apple Silicon) e Linux

---

## 🛠️ Para desenvolvedores

<details>
<summary>Expandir</summary>

### Pré-requisitos

- **Node.js** 24.22.1+ (ou 26.12.1+). Versões anteriores têm a falha CVE-2026-111497 (Brotli) e o `npm install` recusa. Com `nvm`, `nvm use` já escolhe a versão certa pelo `.nvmrc`
- **Rust** (via [rustup](https://rustup.rs/)), o backend é uma app Tauri
- Dependências de sistema do Tauri no Linux (Ubuntu/Debian): `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` (ver [pré-requisitos oficiais](https://tauri.app/start/prerequisites/) para Windows/macOS)
- **yt-dlp** e **ffmpeg** no PATH (em produção são embutidos pelo build via `resources/bin/<platform>/`)

### Setup

```bash
git clone https://github.com/zerobertoo/EZ-Downloader.git
cd EZ-Downloader
npm install
npm run tauri dev
```

### Comandos

```bash
npm run tauri dev    # Modo desenvolvimento (janela nativa + hot reload do frontend)
npx tsc --noEmit     # Type-check do frontend TypeScript
cargo test --manifest-path src-tauri/Cargo.toml   # Testes do backend Rust
npm run tauri build  # Gera instalador para a plataforma atual
```

### Arquitetura

Tauri: backend Rust (processo nativo) + frontend TypeScript rodando na webview do sistema, comunicando via `invoke`/`emit`.

```
src-tauri/src/
├── lib.rs                 # Bootstrap do app, janela, menu, plugins (updater, logging)
├── commands.rs             # Comandos invocáveis do frontend (get_formats, start_download, ...)
├── download_manager.rs     # Spawna yt-dlp, stream de progresso, cancelamento
├── queue.rs                # Fila persistente (pausa, retomada, agendamento)
├── convert.rs              # Otimização de compatibilidade (H.264) com pasta de saída opcional
├── playlist.rs             # Listagem de itens de playlist
├── history.rs, settings.rs # Histórico e configurações persistidas
├── output_template.rs      # Templates de nome de arquivo
├── url_tools.rs            # Normalização e checagem de duplicatas
├── format_parser.rs        # Deduplicação de formatos e mapeamento de erros
├── process_runner.rs       # Wrapper de spawn com timeout e streaming
├── dependency_checker.rs   # Checagem de yt-dlp/ffmpeg no boot
├── paths.rs                # Resolução dos binários empacotados (prefere cópia atualizada)
└── ytdlp_updater.rs        # Atualiza o yt-dlp embutido em runtime (menu Ajuda → Atualizar yt-dlp)

src/
├── main.ts                 # Inicialização e ligação dos eventos do backend
├── app.ts                  # Monta a tela e controla fase e modo
├── download.ts, downloads.ts # Fluxo de envio à fila e prateleira de fitas
├── bridge.ts               # Wrapper tipado sobre @tauri-apps/api (invoke/listen)
├── prefs.ts, mode.ts, theme.ts # Preferências, modo e tema (localStorage)
├── shortcuts.ts            # Atalhos de teclado
├── components/             # Componentes próprios (segmented, select, popover, diálogo, fita SVG...)
├── ui/                     # Formulário avançado, histórico, seleção e área de transferência
└── styles/                 # CSS puro: tokens, base, components e app (Locadora de Fitas)

index.html                  # Só o contêiner #app; a tela inteira é montada por src/app.ts
```

O design está documentado em [PRODUCT.md](PRODUCT.md) e [DESIGN.md](DESIGN.md).

Logs de runtime ficam no diretório de logs do app (via `tauri-plugin-log`): `~/.local/share/com.ezdownloader.app/logs/` no Linux, `%APPDATA%/com.ezdownloader.app/logs/` no Windows e `~/Library/Logs/com.ezdownloader.app/` no macOS.

O `yt-dlp` e o `ffmpeg` ficam em `resources/bin/<platform>/`, baixados por `scripts/download-yt-dlp.cjs` e embutidos como resources do Tauri (ver `bundle.resources` em `src-tauri/tauri.conf.json`).

---

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE).

## 🤝 Contribuições

Issues e pull requests são bem-vindos!

## 🔗 Créditos

Feito com [yt-dlp](https://github.com/yt-dlp/yt-dlp) e [Tauri](https://tauri.app/).
