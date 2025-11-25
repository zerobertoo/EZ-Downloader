const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

class DownloadManager {
  constructor(ytdlpPath, ffmpegPath) {
    this.ytdlpPath = ytdlpPath;
    this.ffmpegPath = ffmpegPath;
    this.downloadPath = path.join(os.homedir(), "Downloads");
    this.progressCallback = null;
    this.currentProcess = null;

    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }
  }

  /**
   * Obtém os formatos disponíveis para um vídeo
   * @param {string} url - URL do vídeo
   * @returns {Promise<Object>} Objeto com formatos, thumbnail e título
   */
  async getAvailableFormats(url) {
    try {
      console.log("[DownloadManager] Buscando formatos para:", url);

      const info = await this.executeYtDlp([
        "--dump-json",
        "--no-warnings",
        url,
      ]);

      const data = JSON.parse(info);

      if (!data.formats || data.formats.length === 0) {
        return {
          formats: [
            {
              id: "best",
              type: "best",
              label: "Melhor Qualidade (Automático)",
              ext: "mp4",
            },
          ],
          title: data.title || "Vídeo",
          thumbnail: this.getBestThumbnail(data),
        };
      }

      const formats = this.parseFormats(data);

      return {
        formats,
        title: data.title || "Vídeo",
        thumbnail: this.getBestThumbnail(data),
        duration: data.duration || null,
        uploader: data.uploader || null,
      };
    } catch (error) {
      throw new Error("Erro ao obter formatos: " + error.message);
    }
  }

  /**
   * Executa comando do yt-dlp
   * @param {Array} args - Argumentos do yt-dlp
   * @returns {Promise<string>} Saída do comando
   */
  executeYtDlp(args) {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const process = spawn(this.ytdlpPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Erro no yt-dlp (código: ${code})`));
        }
      });

      process.on("error", (error) => {
        reject(new Error(`Erro ao executar yt-dlp: ${error.message}`));
      });
    });
  }

  /**
   * Obtém a melhor thumbnail disponível
   * @param {Object} data - Dados do vídeo
   * @returns {string|null} URL da melhor thumbnail ou null
   */
  getBestThumbnail(data) {
    if (!data.thumbnails || data.thumbnails.length === 0) {
      return null;
    }

    let bestThumbnail = data.thumbnails[0];
    let maxResolution =
      (bestThumbnail.width || 0) * (bestThumbnail.height || 0);

    data.thumbnails.forEach((thumb) => {
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
   * @param {Object} data - Dados do vídeo
   * @returns {Array} Array de formatos formatados
   */
  parseFormats(data) {
    const formats = [];
    const videoFormats = new Map();
    const audioFormats = new Map();
    const combinedFormats = new Map();

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

    // Adicionar formatos combinados primeiro
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

      const args = [
        "-f",
        formatArg,
        "--merge-output-format",
        "mp4",
        "-o",
        outputTemplate,
        "--progress",
        "--no-warnings",
        "--ffmpeg-location",
        this.ffmpegPath,
        url,
      ];

      var cmds = args.join(" ");

      return await this.executeDownload(args, downloadDir);
    } catch (error) {
      console.error("[DownloadManager] Erro no download:", error);
      throw new Error("Erro no download: " + error.message);
    }
  }

  /**
   * Executa o download com progresso
   * @param {Array} args - Argumentos do yt-dlp
   * @param {string} downloadDir - Diretório de download
   * @returns {Promise<Object>} Resultado do download
   */
  executeDownload(args, downloadDir) {
    return new Promise((resolve, reject) => {
      let stderr = "";
      let lastProgress = 0;

      this.currentProcess = spawn(this.ytdlpPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.currentProcess.stdout.on("data", (data) => {
        const str = data.toString();

        // Detectar progresso
        const progressMatch = str.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (progressMatch) {
          const progress = parseFloat(progressMatch[1]);
          const now = Date.now();

          // Enviar progresso apenas a cada 500ms para evitar spam
          if (now - lastProgress > 500 || progress === 100) {
            this.emitProgress(progress);
            lastProgress = now;
          }
        }
      });

      this.currentProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      this.currentProcess.on("close", (code) => {
        this.currentProcess = null;

        if (code === 0) {
          resolve({
            success: true,
            path: downloadDir,
            message: "Download concluído com sucesso",
          });
        } else {
          const errorLines = stderr.split("\n").filter((line) => line.trim());
          const errorMessage =
            errorLines[errorLines.length - 1] ||
            `Erro no download (código: ${code})`;
          reject(new Error(errorMessage));
        }
      });

      this.currentProcess.on("error", (error) => {
        this.currentProcess = null;
        reject(new Error(`Erro ao executar download: ${error.message}`));
      });
    });
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
   * Registrar callback de progresso
   * @param {Function} callback - Função de callback
   */
  onProgress(callback) {
    this.progressCallback = callback;
  }

  /**
   * Cancela o download atual
   */
  cancelDownload() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
  }
}

module.exports = { DownloadManager };
