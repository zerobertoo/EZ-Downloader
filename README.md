# EZ Downloader

Uma interface gráfica intuitiva e moderna para o [yt-dlp](https://github.com/yt-dlp/yt-dlp), permitindo download de vídeos e áudio de YouTube, TikTok, Instagram, Facebook, Twitch e muitas outras plataformas.

## Características

- **Interface Simplificada**: Design intuitivo e fácil de usar
- **Múltiplos Formatos**: Suporte para vídeo (MP4, WebM, etc.) e áudio (MP3, WAV, etc.)
- **Melhor Qualidade**: Download automático na melhor qualidade disponível
- **Multiplataforma**: Windows, macOS e Linux
- **Atualizações Automáticas**: Sistema de atualização integrado via GitHub (Corrigido e Otimizado)
- **Seleção de Diretório**: Escolha onde salvar seus downloads
- **Modo Avançado**: (Futuro) Configurações avançadas do yt-dlp

## Requisitos

- **Node.js** 18+ e npm
- **yt-dlp** instalado e acessível via linha de comando (Necessário para desenvolvimento, mas empacotado no build final)
- **FFmpeg** (opcional, para conversão de formatos)

### Instalação de Dependências

#### Windows

```bash
# Instalar yt-dlp
pip install yt-dlp

# Instalar FFmpeg (opcional)
choco install ffmpeg
```

#### macOS

```bash
# Instalar yt-dlp
brew install yt-dlp

# Instalar FFmpeg (opcional)
brew install ffmpeg
```

#### Linux (Ubuntu/Debian)

```bash
# Instalar yt-dlp
sudo apt-get install yt-dlp

# Instalar FFmpeg (opcional)
sudo apt-get install ffmpeg
```

## Instalação

### Desenvolvimento

1. Clone o repositório:

```bash
git clone https://github.com/zerobertoo/ez-downloader.git
cd yt-dlp-gui
```

2. Instale as dependências:

```bash
npm install
```

3. Inicie a aplicação em modo desenvolvimento:

```bash
npm start
```

### Build

Para criar instaláveis para sua plataforma:

```bash
# Build para Windows
npm run build:win

# Build para macOS
npm run build:mac

# Build para Linux
npm run build:linux

# Build para todas as plataformas
npm run build:all
```

Os instaláveis estarão no diretório `dist/`.

## Estrutura do Projeto

```
ez-downloader/
├── src/
│   ├── main.js              # Arquivo principal do Electron
│   ├── preload.js           # Script de preload para segurança
│   └── downloadManager.js   # Gerenciador de downloads
├── public/
│   ├── index.html           # HTML principal
│   ├── styles.css           # Estilos CSS
│   └── renderer.js          # Lógica da interface
├── assets/
│   └── icons/               # Ícones da aplicação
├── .github/
│   └── workflows/           # GitHub Actions workflows
├── package.json             # Configuração do Node.js
└── README.md                # Este arquivo
```

## Configuração do GitHub Workflows

O projeto está configurado para builds automáticos e releases via GitHub Actions. Para ativar:

1. Vá para as configurações do repositório
2. Ative GitHub Actions
3. Crie um token de acesso pessoal (PAT) com permissão `repo`
4. Adicione como secret `GITHUB_TOKEN`

## Uso

### Modo Simplificado (MVP)

1. Cole a URL do vídeo no campo de entrada
2. Clique em "Buscar Formatos"
3. Selecione o formato desejado
4. Escolha o diretório de download
5. Clique em "Iniciar Download"

### Formatos Suportados

- **Vídeo**: MP4, WebM, MKV, AVI, MOV
- **Áudio**: MP3, WAV, M4A, OPUS, VORBIS

## Atualizações Automáticas

A aplicação verifica automaticamente por atualizações ao iniciar. Se uma atualização estiver disponível, você será notificado e poderá instalar imediatamente.

## Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Roadmap

- [x] **Correção do Progresso de Download em Tempo Real**
- [ ] Histórico de downloads
- [ ] Fila de downloads
- [ ] Suporte a temas (claro/escuro)
- [ ] Integração com gerenciador de downloads do SO
- [ ] Suporte a plugins

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## Créditos

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - O excelente projeto de download de vídeos
- [Electron](https://www.electronjs.org/) - Framework para aplicações desktop

## Suporte

Se encontrar problemas ou tiver sugestões, por favor abra uma [issue](https://github.com/zerobertoo/ez-downloader/issues).

## Changelog

### v1.1.0 (Otimização e Correção)

- Interface simplificada de download
- Seleção de formatos
- Suporte multiplataforma
- Atualizações automáticas via GitHub
