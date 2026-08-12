<div align="center">

# EZ Downloader

**Baixe vídeos e áudios de qualquer lugar, sem complicação.**

Interface gráfica moderna para o [yt-dlp](https://github.com/yt-dlp/yt-dlp) — sem linha de comando, sem configuração, sem dependências para instalar.

[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-orange?style=flat-square)](LICENSE)
[![Plataformas](https://img.shields.io/badge/plataformas-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)](#-instalação)
[![yt-dlp](https://img.shields.io/badge/powered%20by-yt--dlp-grey?style=flat-square)](https://github.com/yt-dlp/yt-dlp)

</div>

---

## ✨ O que é?

EZ Downloader é um aplicativo desktop que coloca o poder do **yt-dlp** em uma interface simples e bonita. Cole uma URL, escolha o formato e clique em baixar — é só isso.

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

> Não é necessário instalar o yt-dlp nem o ffmpeg — tudo já vem embutido.

---

## 🚀 Como usar

1. **Cole a URL** do vídeo que deseja baixar
2. Clique em **Buscar** e aguarde carregar as informações
3. **Escolha o formato** — melhor qualidade, resolução específica ou só o áudio
4. Selecione a **pasta de destino**
5. Clique em **Iniciar Download** e acompanhe o progresso em tempo real

---

## ⚙️ Funcionalidades

- 🎞️ **Múltiplos formatos** — vídeo em várias resoluções, áudio em MP3/M4A e mais
- ⚡ **Progresso em tempo real** — percentual, velocidade e tempo restante
- 🗂️ **Seleção de pasta** — escolha onde salvar cada download
- 🌐 **+1000 sites suportados** — qualquer plataforma que o yt-dlp suporte
- 📦 **Zero dependências** — yt-dlp e ffmpeg já estão incluídos no app
- 🖥️ **Multiplataforma** — Windows, macOS (Intel e Apple Silicon) e Linux

---

## 🛠️ Para desenvolvedores

<details>
<summary>Expandir</summary>

### Pré-requisitos

- **Node.js** 18+
- **Rust** (via [rustup](https://rustup.rs/)) — o backend é uma app Tauri
- Dependências de sistema do Tauri — no Linux (Ubuntu/Debian): `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` (ver [pré-requisitos oficiais](https://tauri.app/start/prerequisites/) para Windows/macOS)
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
├── format_parser.rs        # Deduplicação de formatos e mapeamento de erros
├── process_runner.rs       # Wrapper de spawn com timeout e streaming
├── dependency_checker.rs   # Checagem de yt-dlp/ffmpeg no boot
├── paths.rs                # Resolução dos binários empacotados (prefere cópia atualizada)
└── ytdlp_updater.rs        # Atualiza o yt-dlp embutido em runtime (menu Ajuda → Atualizar yt-dlp)

src/
├── main.ts                # Lógica de UI e máquina de estados (showSection)
├── bridge.ts               # Wrapper tipado sobre @tauri-apps/api (invoke/listen)
├── mode.ts                 # Modo Básico/Avançado (persistido em localStorage)
├── theme.ts                # Temas de cor (persistidos em localStorage)
└── styles.css               # Design system Obsidian & Ember (CSS custom properties)

index.html                  # Markup com todos os IDs usados por main.ts
```

Logs de runtime ficam no diretório de logs do app (via `tauri-plugin-log`): `~/.local/share/com.ezdownloader.app/logs/` no Linux, `%APPDATA%/com.ezdownloader.app/logs/` no Windows e `~/Library/Logs/com.ezdownloader.app/` no macOS.

O `yt-dlp` e o `ffmpeg` ficam em `resources/bin/<platform>/`, baixados por `scripts/download-yt-dlp.cjs` e embutidos como resources do Tauri (ver `bundle.resources` em `src-tauri/tauri.conf.json`).

### Publicando uma release

Releases são 100% automatizadas via GitHub Actions:

1. Vá em **GitHub → Actions → Release → Run workflow**
2. Informe a versão (ex: `1.7.0` ou `1.7.0-beta.1`)
3. O workflow faz o bump no `package.json`, cria a tag e publica os binários para todas as plataformas automaticamente

> ⚠️ Nunca crie tags nem edite a versão no `package.json` manualmente.

Versões com sufixo `-` (ex: `1.7.0-beta.1`) são marcadas automaticamente como pré-release.

</details>

---

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE).

## 🤝 Contribuições

Issues e pull requests são bem-vindos!

## 🔗 Créditos

Feito com [yt-dlp](https://github.com/yt-dlp/yt-dlp) e [Tauri](https://tauri.app/).
