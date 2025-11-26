const fs = require("fs");
const path = require("path");
const ffmpegStatic = require("ffmpeg-static");
const { default: YTDlpWrap } = require("yt-dlp-wrap");
const YtDlpWrap = require("yt-dlp-wrap").default;
const ytdlp = new YtDlpWrap();

class DependencyManager {
  constructor() {
    // Não precisamos mais de diretórios de dependências, pois os módulos gerenciam isso.
    this.progressCallback = null;
    this.ytdlpPath = null;
    this.ffmpegPath = ffmpegStatic;
  }

  /**
   * Verifica se um binário existe no caminho fornecido.
  // Para yt-dlp, o getBinaryPath() já garante que o binário foi baixado.
    // A verificação de existência deve ser feita após a inicialização.
   */
  // A função checkCommand não é mais necessária, pois a verificação é feita
  // implicitamente pelo getBinaryPath() e pela verificação de existência do ffmpeg-static.
  // Vamos manter a verificação de existência do ffmpeg-static.
  async checkCommand(commandPath) {
    if (!commandPath) return false;
    try {
      // Verifica se o arquivo existe e é executável (simulação)
      await fs.promises.access(
        commandPath,
        fs.constants.F_OK | fs.constants.X_OK
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Instala e verifica o yt-dlp.
   */
  async initializeYtDlp() {
    console.log("[DepManager] Inicializando yt-dlp...");
    try {
      // O yt-dlp-wrap baixa o binário para um local temporário e retorna o caminho.
      // Ele também verifica se o binário está atualizado.
      await YTDlpWrap.downloadFromGithub();

      this.ytdlpPath = ytdlp.getBinaryPath();
      console.log(`[DepManager] yt-dlp pronto. Caminho: ${this.ytdlpPath}`);
      return true;
    } catch (error) {
      throw new Error(`Erro ao inicializar yt-dlp: ${error.message}`);
    }
  }

  /**
   * Verifica se as dependências estão instaladas
   */
  async checkDependencies() {
    // O ytdlpPath é definido em initializeYtDlp, que é chamado em initialize()
    // A verificação de existência é feita pelo próprio getBinaryPath()
    const ytdlpExists = !!this.ytdlpPath;
    const ffmpegExists = await this.checkCommand(this.ffmpegPath);

    return {
      ytdlp: ytdlpExists,
      ffmpeg: ffmpegExists,
      all: ytdlpExists && ffmpegExists,
    };
  }

  /**
   * Obter caminho do yt-dlp
   */
  getYtDlpPath() {
    return this.ytdlpPath;
  }

  /**
   * Obter caminho do FFmpeg
   */
  getFFmpegPath() {
    return this.ffmpegPath;
  }

  /**
   * Inicializar e baixar dependências se necessário
   */
  async initialize() {
    console.log("[DepManager] Inicializando gerenciador de dependências...");

    // A inicialização do yt-dlp já é feita no checkDependencies
    await this.initializeYtDlp();

    const deps = await this.checkDependencies();

    if (deps.all) {
      console.log("[DepManager] Todas as dependências estão prontas.");
      return true;
    }

    // O ffmpeg-static e o yt-dlp-wrap já cuidam do download e atualização
    // durante a instalação do npm ou na chamada de getYtDlpPath.
    // Se não existirem, o problema está no empacotamento do Electron.

    if (!deps.ffmpeg) {
      console.error(
        `[DepManager] FFmpeg não encontrado em: ${this.ffmpegPath}`
      );
      throw new Error(
        "FFmpeg não encontrado. Verifique a instalação do 'ffmpeg-static'."
      );
    }

    if (!deps.ytdlp) {
      console.error(`[DepManager] yt-dlp não encontrado em: ${this.ytdlpPath}`);
      throw new Error(
        "yt-dlp não encontrado. Verifique a instalação do 'yt-dlp-wrap'."
      );
    }

    return true;
  }
}

module.exports = { DependencyManager };
