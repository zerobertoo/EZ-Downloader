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
| macOS Intel | `.zip` |
| macOS Apple Silicon | `.zip` (ARM64) |
| Linux | `.deb` ou `.rpm` |

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
- **yt-dlp** no PATH (em produção é embutido pelo build)
- **ffmpeg** no PATH (em produção vem do pacote `ffmpeg-static`)

### Setup

```bash
git clone https://github.com/zerobertoo/EZ-Downloader.git
cd EZ-Downloader
npm install
npm start
```

### Comandos

```bash
npm start          # Modo desenvolvimento
npm test           # Roda os testes (vitest, 41 testes)
npm run package    # Empacota sem gerar instalador
npm run make       # Gera instalador para a plataforma atual
npm run publish    # Publica no GitHub Releases (requer GITHUB_TOKEN no .env)
```

### Arquitetura

Electron com separação estrita entre processo principal e renderer via `contextBridge`.

```
src/
├── main.js              # Ciclo de vida do app, criação de janela, menu
├── ipcHandlers.js       # Handlers de IPC (get-formats, start-download, cancel, ...)
├── downloadManager.js   # Spawna yt-dlp, stream de progresso, cancelamento
├── formatParser.js      # Deduplicação de formatos e mapeamento de erros
├── processRunner.js     # Wrapper de spawn com timeout e streaming
├── preload.js           # Bridge contextBridge → window.electronAPI
└── ...

public/
├── index.html           # Markup do renderer com todos os IDs de IPC
├── renderer.js          # Lógica de UI e máquina de estados (showSection)
└── styles.css           # Design system Obsidian & Ember (CSS custom properties)
```

O `yt-dlp` fica em `resources/bin/<platform>/` e o `ffmpeg` é extraído do pacote `ffmpeg-static` via `asarUnpack`.

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

Feito com [yt-dlp](https://github.com/yt-dlp/yt-dlp), [Electron](https://www.electronjs.org/) e [Electron Forge](https://www.electronforge.io/).
