# EZ Downloader

Uma interface gráfica moderna para o **yt-dlp**, projetada para simplificar o download de vídeos e áudio de centenas de plataformas como YouTube, TikTok, Instagram, Twitter, Twitch e muito mais.

## Funcionalidades

| Funcionalidade | Detalhes |
| :--- | :--- |
| **Interface dark moderna** | Tema Obsidian & Ember com glassmorphism, animações suaves e tipografia refinada |
| **Multiplataforma** | Suporte completo para **Windows**, **macOS** (x64 + ARM) e **Linux** |
| **Dependências embutidas** | `yt-dlp` e `ffmpeg` incluídos no instalador — nada para instalar |
| **Progresso em tempo real** | Percentual, velocidade e ETA atualizados continuamente durante o download |
| **Seleção de formato** | Escolha entre melhor qualidade, formatos de vídeo específicos ou áudio |
| **Seleção de diretório** | Escolha fácil do local de salvamento com memória do último caminho |

## Desenvolvimento

### Pré-requisitos

- **Node.js** 18+
- **yt-dlp** no PATH (dev mode — em produção é embutido pelo build)
- **ffmpeg** no PATH (dev mode — em produção é fornecido pelo pacote `ffmpeg-static`)

### Instalação

```bash
git clone https://github.com/zerobertoo/EZ-Downloader.git
cd EZ-Downloader
npm install
npm start
```

### Comandos

```bash
npm start          # Modo desenvolvimento (electron-forge start)
npm test           # Testes (vitest, 41 testes)
npm run package    # Empacota sem instalador
npm run make       # Gera instaladores para a plataforma atual
npm run publish    # Publica no GitHub Releases (requer GITHUB_TOKEN no .env)
```

## Build e Releases

Releases são totalmente automatizados via GitHub Actions. Para publicar uma nova versão:

1. Acesse **GitHub → Actions → Release → Run workflow**
2. Informe a versão (ex: `1.7.0` ou `1.7.0-beta.1`)
3. O workflow faz o bump do `package.json`, cria a tag, compila para 4 plataformas e publica o release automaticamente

> **Nunca crie tags nem edite a versão no `package.json` manualmente** — o workflow faz tudo isso.

Versões com sufixo `-` (ex: `1.7.0-beta.1`) são marcadas automaticamente como pré-release.

### Plataformas de build

| Plataforma | Artefato |
| :--- | :--- |
| Windows x64 | Instalador `.exe` (Squirrel) |
| macOS x64 | `.zip` (App bundle) |
| macOS ARM64 | `.zip` (Apple Silicon) |
| Linux x64 | `.deb` + `.rpm` |

## Licença

MIT — veja o arquivo [LICENSE](LICENSE) para detalhes.

## Créditos

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [Electron](https://www.electronjs.org/)
- [Electron Forge](https://www.electronforge.io/)
