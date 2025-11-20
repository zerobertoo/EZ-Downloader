# EZ Downloader

Uma interface gráfica intuitiva e moderna para o **yt-dlp**, projetada para simplificar o download de vídeos e áudio de diversas plataformas como YouTube, TikTok, Instagram, Facebook, Twitch e muitas outras.

## 🚀 Funcionalidades Principais

| Funcionalidade               | Detalhes                                                                           | Status |
| :--------------------------- | :--------------------------------------------------------------------------------- | :----- |
| **Interface Intuitiva**      | Design limpo e focado na experiência do usuário.                                   | ✅     |
| **Multiplataforma**          | Suporte completo para **Windows**, **macOS** e **Linux**.                          | ✅     |
| **Atualizações Automáticas** | Verifica e instala novas versões automaticamente via GitHub Releases.              | ✅     |
| **Progresso em Tempo Real**  | Exibição precisa do progresso de download do `yt-dlp`.                             | ✅     |
| **Seleção de Formato**       | Permite escolher entre a melhor qualidade ou formatos específicos (vídeo e áudio). | ✅     |
| **Seleção de Diretório**     | Escolha fácil do local de salvamento dos arquivos.                                 | ✅     |
| **Modo Avançado**            | Configurações avançadas do `yt-dlp` (Roadmap).                                     | 🚧     |

## 🛠️ Configuração para Desenvolvimento

Este projeto utiliza **Electron Forge** para empacotamento e build.

### Pré-requisitos

- **Node.js** (versão 18+ recomendada)
- **yt-dlp** instalado e acessível via PATH (necessário para o desenvolvimento e para o binário final, caso não seja empacotado separadamente).
- **FFmpeg** (opcional, mas altamente recomendado para mesclagem de áudio/vídeo e conversão de formatos).

### Instalação

1.  **Clone o repositório:**

    ```bash
    git clone https://github.com/seu-usuario/ez-downloader.git
    cd ez-downloader
    ```

2.  **Instale as dependências:**

    ```bash
    npm install
    ```

3.  **Inicie em modo desenvolvimento:**
    ```bash
    npm start
    ```

## 📦 Build e Distribuição (CI/CD)

O projeto está configurado para usar **Electron Forge** e **GitHub Actions** para automatizar o processo de build e publicação de releases.

### Builds Locais

Para gerar instaláveis para sua plataforma:

```bash
# Empacota o aplicativo
npm run package

# Cria o instalável (depende do seu OS)
npm run make
```

### Pipeline de CI/CD com GitHub Actions

O arquivo `.github/workflows/release.yml` configura o fluxo de trabalho para build e release automáticos.

| Plataforma  | Maker (Forge)           | Tipo de Artefato   |
| :---------- | :---------------------- | :----------------- |
| **Windows** | `MakerSquirrel`         | `exe` (Instalador) |
| **macOS**   | `MakerZIP`              | `zip` (App bundle) |
| **Linux**   | `MakerDeb` / `MakerRpm` | `deb` / `rpm`      |

**Como Funciona:**

1.  **Gatilho:** O workflow é acionado sempre que uma nova **tag** no formato `v*.*.*` é enviada ao repositório (ex: `git tag v1.1.0` e `git push --tags`).
2.  **Publicação:** O **Electron Forge** utiliza o `PublisherGithub` para fazer o upload dos artefatos de build para a seção **Releases** do seu repositório.

**Ação Necessária (Secrets):**

Para que o pipeline de publicação funcione, você **DEVE** configurar um Secret chamado `GITHUB_TOKEN` no seu repositório GitHub. Este token deve ter a permissão `repo` para criar e gerenciar releases.

## 🐛 Correção de Progresso em Tempo Real (v1.1.0)

A lógica de comunicação entre o processo principal e o processo de renderização foi ajustada para garantir que as atualizações de progresso do `yt-dlp` sejam enviadas corretamente para a interface.

- **`src/main.js`:** O `downloadManager.onProgress` agora envia o progresso para a janela principal.
- **`src/downloadManager.js`:** A emissão de progresso foi otimizada para evitar spam de eventos e garantir que o valor de **100%** seja enviado imediatamente ao ser detectado.

## 📜 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🤝 Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para abrir Issues ou Pull Requests.

## 🔗 Créditos

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [Electron](https://www.electronjs.org/)
- [Electron Forge](https://www.electronforge.io/)
- [update-electron-app](https://github.com/electron/update-electron-app)
