const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

class DownloadManager {
  constructor() {
    this.currentProcess = null;
    this.downloadPath = path.join(os.homedir(), "Downloads", "yt-dlp-gui");
    this.progressCallback = null;

    // Criar diretório de downloads se não existir
    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }
  }

  /**
   * Obtém os formatos disponíveis para um vídeo
   * @param {string} url - URL do vídeo
   * @returns {Promise<Array>} Array de formatos disponíveis
   */
  async getAvailableFormats(url) {
    return new Promise((resolve, reject) => {
      const args = ["--dump-json", "--no-warnings", url];

      const process = spawn("yt-dlp", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          try {
            const data = JSON.parse(stdout);
            const formats = this.parseFormats(data);
            resolve(formats);
          } catch (error) {
            reject(new Error("Erro ao processar formatos: " + error.message));
          }
        } else {
          reject(new Error(stderr || "Erro ao obter formatos"));
        }
      });

      process.on("error", (error) => {
        reject(
          new Error(
            "yt-dlp não encontrado. Certifique-se de que está instalado."
          )
        );
      });
    });
  }

  /**
   * Faz o parse dos formatos disponíveis
   * @param {Object} data - Dados JSON do yt-dlp
   * @returns {Array} Array de formatos formatados
   */
  parseFormats(data) {
    const formats = [];
    const videoFormats = new Map();
    const audioFormats = new Map();

    if (data.formats) {
      data.formats.forEach((format) => {
        // Formatos de vídeo
        if (format.vcodec !== "none" && format.acodec === "none") {
          const key = `${format.ext}-${format.height}p`;
          if (!videoFormats.has(key)) {
            videoFormats.set(key, {
              format_id: format.format_id,
              ext: format.ext,
              height: format.height,
              width: format.width,
              fps: format.fps,
              vcodec: format.vcodec,
              filesize: format.filesize,
            });
          }
        }
        // Formatos de áudio
        if (format.acodec !== "none" && format.vcodec === "none") {
          const key = `${format.ext}-${format.abr}`;
          if (!audioFormats.has(key)) {
            audioFormats.set(key, {
              format_id: format.format_id,
              ext: format.ext,
              abr: format.abr,
              acodec: format.acodec,
              filesize: format.filesize,
            });
          }
        }
      });
    }

    // Adicionar formatos de vídeo
    videoFormats.forEach((format) => {
      formats.push({
        id: format.format_id,
        type: "video",
        label: `${format.ext.toUpperCase()} - ${format.height}p`,
        ext: format.ext,
        height: format.height,
        width: format.width,
        fps: format.fps,
        filesize: format.filesize,
      });
    });

    // Adicionar formatos de áudio
    audioFormats.forEach((format) => {
      formats.push({
        id: format.format_id,
        type: "audio",
        label: `${format.ext.toUpperCase()} - ${format.abr || "Unknown"} kbps`,
        ext: format.ext,
        abr: format.abr,
        filesize: format.filesize,
      });
    });

    // Adicionar formato de melhor qualidade (padrão)
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
    return new Promise((resolve, reject) => {
      const downloadDir = outputPath || this.downloadPath;

      // Garantir que o diretório existe
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      const outputTemplate = path.join(downloadDir, "%(title)s.%(ext)s");

      let args = [];

      if (format === "best") {
        // Melhor qualidade automática
        args = [
          "-f",
          "best",
          "-o",
          outputTemplate,
          "--progress",
          "--no-warnings",
          url,
        ];
      } else {
        // Formato específico
        args = [
          "-f",
          format,
          "-o",
          outputTemplate,
          "--progress",
          "--no-warnings",
          url,
        ];
      }

      this.currentProcess = spawn("yt-dlp", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      let stdout = "";
      let lastProgressUpdate = 0;

      this.currentProcess.stdout.on("data", (data) => {
        stdout += data.toString();
        const output = data.toString();

        // Extrair progresso
        const progressMatch = output.match(/\[(\d+)%\]/);
        if (progressMatch) {
          const progress = parseInt(progressMatch[1]);
          const now = Date.now();

          // Enviar progresso apenas a cada 500ms para evitar spam
          if (now - lastProgressUpdate > 500) {
            this.emitProgress(progress);
            lastProgressUpdate = now;
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
            message: "Download concluído com sucesso",
            path: downloadDir,
          });
        } else {
          reject(new Error(stderr || `Erro no download (código: ${code})`));
        }
      });

      this.currentProcess.on("error", (error) => {
        this.currentProcess = null;
        reject(
          new Error(
            "yt-dlp não encontrado. Certifique-se de que está instalado."
          )
        );
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
    console.log(`Progresso: ${progress}%`);
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
