const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

class DownloadManager {
  constructor() {
    this.currentProcess = null;
    this.downloadPath = path.join(os.homedir(), "Downloads");
    this.progressCallback = null;

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

      const ytProcess = spawn("yt-dlp", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      ytProcess.stdout.on("data", (data) => (stdout += data.toString()));
      ytProcess.stderr.on("data", (data) => (stderr += data.toString()));

      ytProcess.on("close", (code) => {
        if (code === 0) {
          try {
            const data = JSON.parse(stdout);
            const formats = this.parseFormats(data);
            resolve(formats);
          } catch (err) {
            reject(new Error("Erro ao processar formatos: " + err.message));
          }
        } else {
          reject(new Error(stderr || "Erro ao obter formatos"));
        }
      });

      ytProcess.on("error", () => {
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
    const combinedFormats = new Map();

    if (!data.formats || data.formats.length === 0) {
      // Se não há formatos específicos, retornar apenas "best"
      return [
        {
          id: "best",
          type: "best",
          label: "Melhor Qualidade (Automático)",
          ext: "mp4",
        },
      ];
    }

    // Processar formatos
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
    return new Promise((resolve, reject) => {
      const downloadDir = outputPath || this.downloadPath;

      // Garantir que o diretório existe
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      const outputTemplate = path.join(downloadDir, "%(title)s.%(ext)s");

      // Construir argumentos
      const args = [
        "-f",
        format === "best" ? "bestvideo+bestaudio/best" : format,
        ...(format === "best" ? ["--merge-output-format", "mp4"] : []),
        "-o",
        outputTemplate,
        "--progress",
        "--no-warnings",
        url,
      ];

      this.currentProcess = spawn("yt-dlp", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      let lastProgress = 0;
      let downloadStarted = false;

      this.currentProcess.stdout.on("data", (data) => {
        const str = data.toString();

        // Detectar progresso
        const progressMatch = str.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (progressMatch) {
          downloadStarted = true;
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
          // Tentar extrair mensagem de erro mais útil
          const errorLines = stderr.split("\n").filter((line) => line.trim());
          const errorMessage =
            errorLines[errorLines.length - 1] ||
            `Erro no download (código: ${code})`;

          reject(new Error(errorMessage));
        }
      });

      this.currentProcess.on("error", (error) => {
        this.currentProcess = null;
        reject(
          new Error(
            "yt-dlp não encontrado. Certifique-se de que está instalado e acessível via PATH."
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
