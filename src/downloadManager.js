const { YtDlp } = require("ytdlp-nodejs");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Tentar importar ffmpeg-static se disponível
let ffmpegPath = null;
try {
  ffmpegPath = require("ffmpeg-static");
} catch (e) {
  console.warn(
    "[DownloadManager] ffmpeg-static não está instalado. Usando FFmpeg do sistema."
  );
}

class DownloadManager {
  constructor() {
    // Configurar YtDlp com paths customizados
    const ytdlpConfig = {};

    if (ffmpegPath) {
      ytdlpConfig.ffmpegPath = ffmpegPath;
    }

    this.ytdlp = new YtDlp(ytdlpConfig);

    this.downloadPath = path.join(os.homedir(), "Downloads");
    this.progressCallback = null;
    this.isInitialized = false;
    this.initPromise = null;

    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }
  }

  /**
   * Inicializa o gerenciador e verifica/baixa dependências
   * @returns {Promise<boolean>} True se inicializado com sucesso
   */
  async initialize() {
    // Se já está inicializando, aguarde a promise
    if (this.initPromise) {
      return this.initPromise;
    }

    // Se já inicializado, retorne imediatamente
    if (this.isInitialized) {
      return true;
    }

    // Criar promise para gerenciar inicialização
    this.initPromise = (async () => {
      try {
        console.log(
          "[DownloadManager] Verificando instalação de dependências..."
        );

        try {
          // Tentar fazer download do FFmpeg se não estiver presente
          console.log("[DownloadManager] Baixando/verificando FFmpeg...");
          this.emitInitProgress({
            status: "downloading_ffmpeg",
            message: "Preparando dependências (primeira inicialização)...",
          });

          await this.ytdlp.downloadFFmpeg();
          console.log("[DownloadManager] FFmpeg pronto");
        } catch (ffmpegError) {
          console.warn(
            "[DownloadManager] Aviso ao processar FFmpeg:",
            ffmpegError.message
          );
          // Continuar mesmo se houver erro com FFmpeg
          // O yt-dlp pode funcionar sem FFmpeg em alguns casos
        }

        console.log("[DownloadManager] yt-dlp e dependências estão prontos");
        this.isInitialized = true;

        this.emitInitProgress({
          status: "ready",
          message: "Aplicação pronta!",
        });

        return true;
      } catch (error) {
        console.error("[DownloadManager] Erro crítico ao inicializar:", error);
        this.initPromise = null;
        throw new Error(`Erro ao inicializar: ${error.message}`);
      }
    })();

    return this.initPromise;
  }

  /**
   * Obtém os formatos disponíveis para um vídeo
   * @param {string} url - URL do vídeo
   * @returns {Promise<Object>} Objeto com formatos, thumbnail e título
   */
  async getAvailableFormats(url) {
    try {
      await this.initialize();

      console.log("[DownloadManager] Buscando formatos para:", url);
      const info = await this.ytdlp.getInfoAsync(url);

      if (!info.formats || info.formats.length === 0) {
        return {
          formats: [
            {
              id: "best",
              type: "best",
              label: "Melhor Qualidade (Automático)",
              ext: "mp4",
            },
          ],
          title: info.title || "Vídeo",
          thumbnail: this.getBestThumbnail(info),
        };
      }

      const formats = this.parseFormats(info);

      return {
        formats,
        title: info.title || "Vídeo",
        thumbnail: this.getBestThumbnail(info),
        duration: info.duration || null,
        uploader: info.uploader || null,
      };
    } catch (error) {
      throw new Error("Erro ao obter formatos: " + error.message);
    }
  }

  /**
   * Obtém a melhor thumbnail disponível
   * @param {Object} info - Informações do vídeo
   * @returns {string|null} URL da melhor thumbnail ou null
   */
  getBestThumbnail(info) {
    if (!info.thumbnails || info.thumbnails.length === 0) {
      return null;
    }

    // Procurar pela thumbnail com melhor resolução
    let bestThumbnail = info.thumbnails[0];
    let maxResolution =
      (bestThumbnail.width || 0) * (bestThumbnail.height || 0);

    info.thumbnails.forEach((thumb) => {
      const resolution = (thumb.width || 0) * (thumb.height || 0);
      if (resolution > maxResolution) {
        maxResolution = resolution;
        bestThumbnail = thumb;
      }
    });

    return bestThumbnail.url || null;
  }

  /**
   * Faz o parse dos formatos disponíveis
   * @param {Object} info - Dados da informação do vídeo
   * @returns {Array} Array de formatos formatados
   */
  parseFormats(info) {
    const formats = [];
    const videoFormats = new Map();
    const audioFormats = new Map();
    const combinedFormats = new Map();

    const data = info;

    if (!data.formats || data.formats.length === 0) {
      return [
        {
          id: "best",
          type: "best",
          label: "Melhor Qualidade (Automático)",
          ext: "mp4",
        },
      ];
    }

    data.formats.forEach((format) => {
      if (!format.format_id) return;

      // Formatos combinados (vídeo + áudio)
      if (format.vcodec !== "none" && format.acodec !== "none") {
        const key = `${format.ext}-${format.height || 0}p`;
        if (!combinedFormats.has(key)) {
          combinedFormats.set(key, {
            format_id: format.format_id,
            ext: format.ext || "mp4",
            height: format.height || 0,
            width: format.width || 0,
            fps: format.fps || 0,
            vcodec: format.vcodec,
            acodec: format.acodec,
            filesize: format.filesize,
          });
        }
      }
      // Formatos de vídeo puro
      else if (format.vcodec !== "none" && format.acodec === "none") {
        const key = `${format.ext}-${format.height || 0}p`;
        if (!videoFormats.has(key)) {
          videoFormats.set(key, {
            format_id: format.format_id,
            ext: format.ext || "mp4",
            height: format.height || 0,
            width: format.width || 0,
            fps: format.fps || 0,
            vcodec: format.vcodec,
            filesize: format.filesize,
          });
        }
      }
      // Formatos de áudio puro
      else if (format.acodec !== "none" && format.vcodec === "none") {
        const key = `${format.ext}-${format.abr || "unknown"}`;
        if (!audioFormats.has(key)) {
          audioFormats.set(key, {
            format_id: format.format_id,
            ext: format.ext || "m4a",
            abr: format.abr || 0,
            acodec: format.acodec,
            filesize: format.filesize,
          });
        }
      }
    });

    // Adicionar formatos combinados primeiro (melhor qualidade)
    combinedFormats.forEach((f) => {
      formats.push({
        id: f.format_id,
        type: "combined",
        label: `${f.ext.toUpperCase()} - ${f.height}p (Vídeo + Áudio)`,
        ext: f.ext,
        height: f.height,
        width: f.width,
        fps: f.fps,
        filesize: f.filesize,
      });
    });

    // Adicionar formatos de vídeo
    videoFormats.forEach((f) => {
      formats.push({
        id: f.format_id,
        type: "video",
        label: `${f.ext.toUpperCase()} - ${f.height}p (Vídeo)`,
        ext: f.ext,
        height: f.height,
        width: f.width,
        fps: f.fps,
        filesize: f.filesize,
      });
    });

    // Adicionar formatos de áudio
    audioFormats.forEach((f) => {
      formats.push({
        id: f.format_id,
        type: "audio",
        label: `${f.ext.toUpperCase()} - ${f.abr || "Unknown"} kbps (Áudio)`,
        ext: f.ext,
        abr: f.abr,
        filesize: f.filesize,
      });
    });

    // Adicionar formato de melhor qualidade automático no início
    formats.unshift({
      id: "best",
      type: "best",
      label: "Melhor Qualidade (Automático)",
      ext: "mp4",
    });

    return formats;
  }

  /**
   * Faz o download de um vídeo
   * @param {string} url - URL do vídeo
   * @param {string} format - Formato desejado
   * @param {string} outputPath - Caminho de saída
   * @returns {Promise<Object>} Resultado do download
   */
  async download(url, format, outputPath = null) {
    try {
      await this.initialize();

      const downloadDir = outputPath || this.downloadPath;

      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      console.log("[DownloadManager] Iniciando download:", {
        url,
        format,
        downloadDir,
      });

      const formatArg = format === "best" ? "bestvideo+bestaudio/best" : format;
      const outputTemplate = path.join(downloadDir, "%(title)s.%(ext)s");

      const output = await this.ytdlp.downloadAsync(url, {
        format: formatArg,
        mergeOutputFormat: "mp4",
        output: outputTemplate,
        onProgress: (progress) => {
          this.emitProgress(progress.percentage);
        },
      });

      console.log("[DownloadManager] Download concluído com sucesso");

      return {
        success: true,
        path: downloadDir,
        message: "Download concluído com sucesso",
        output: output,
      };
    } catch (error) {
      console.error("[DownloadManager] Erro no download:", error);
      throw new Error("Erro no download: " + error.message);
    }
  }

  /**
   * Executa comando customizado do yt-dlp (máxima versatilidade)
   * @param {string} url - URL do vídeo
   * @param {Object} options - Opções customizadas
   * @returns {Promise<string>} Saída do comando
   */
  async executeCustom(url, options = {}) {
    try {
      await this.initialize();

      console.log(
        "[DownloadManager] Executando comando customizado para:",
        url
      );

      const output = await this.ytdlp.execAsync(url, {
        onProgress: (progress) => {
          this.emitProgress(progress.percentage);
        },
        ...options,
      });

      return output;
    } catch (error) {
      throw new Error("Erro ao executar comando: " + error.message);
    }
  }

  /**
   * Faz o stream de um vídeo
   * @param {string} url - URL do vídeo
   * @param {string} format - Formato desejado
   * @returns {Object} Objeto com métodos pipe e pipeAsync
   */
  stream(url, format = "best") {
    this.initialize().catch((error) => {
      console.error(
        "[DownloadManager] Erro ao inicializar para stream:",
        error
      );
    });

    const formatArg = format === "best" ? "bestvideo+bestaudio/best" : format;

    return this.ytdlp.stream(url, {
      format: formatArg,
      onProgress: (progress) => {
        this.emitProgress(progress.percentage);
      },
    });
  }

  /**
   * Obtém informações do vídeo
   * @param {string} url - URL do vídeo
   * @returns {Promise<Object>} Informações do vídeo
   */
  async getVideoInfo(url) {
    try {
      await this.initialize();
      return await this.ytdlp.getInfoAsync(url);
    } catch (error) {
      throw new Error("Erro ao obter informações do vídeo: " + error.message);
    }
  }

  /**
   * Obtém o título do vídeo
   * @param {string} url - URL do vídeo
   * @returns {Promise<string>} Título do vídeo
   */
  async getTitle(url) {
    try {
      await this.initialize();
      return await this.ytdlp.getTitleAsync(url);
    } catch (error) {
      throw new Error("Erro ao obter título: " + error.message);
    }
  }

  /**
   * Obtém as thumbnails do vídeo
   * @param {string} url - URL do vídeo
   * @returns {Promise<Array>} Array de thumbnails
   */
  async getThumbnails(url) {
    try {
      await this.initialize();
      return await this.ytdlp.getThumbnailsAsync(url);
    } catch (error) {
      throw new Error("Erro ao obter thumbnails: " + error.message);
    }
  }

  /**
   * Emitir evento de progresso
   * @param {number} progress - Percentual de progresso
   */
  emitProgress(progress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Emitir evento de inicialização
   * @param {Object} data - Dados do evento
   */
  emitInitProgress(data) {
    if (this.progressCallback) {
      this.progressCallback({
        type: "init",
        ...data,
      });
    }
  }

  /**
   * Registrar callback de progresso
   * @param {Function} callback - Função de callback
   */
  onProgress(callback) {
    this.progressCallback = callback;
  }

  /**
   * Verifica se o gerenciador está inicializado
   * @returns {boolean} True se inicializado
   */
  isReady() {
    return this.isInitialized;
  }
}

module.exports = { DownloadManager };
