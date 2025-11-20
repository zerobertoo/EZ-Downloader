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

  parseFormats(data) {
    const formats = [];
    const videoMap = new Map();
    const audioMap = new Map();

    (data.formats || []).forEach((format) => {
      if (format.vcodec !== "none" && format.acodec === "none") {
        const key = `${format.ext}-${format.height}`;
        if (!videoMap.has(key)) {
          videoMap.set(key, format);
        }
      }
      if (format.acodec !== "none" && format.vcodec === "none") {
        const key = `${format.ext}-${format.abr}`;
        if (!audioMap.has(key)) {
          audioMap.set(key, format);
        }
      }
    });

    videoMap.forEach((f) =>
      formats.push({
        id: f.format_id,
        type: "video",
        label: `${f.ext.toUpperCase()} - ${f.height}p`,
        ext: f.ext,
        height: f.height,
        width: f.width,
        fps: f.fps,
        filesize: f.filesize,
      })
    );

    audioMap.forEach((f) =>
      formats.push({
        id: f.format_id,
        type: "audio",
        label: `${f.ext.toUpperCase()} - ${f.abr || "Unknown"} kbps`,
        ext: f.ext,
        abr: f.abr,
        filesize: f.filesize,
      })
    );

    // Melhor qualidade automático
    formats.unshift({
      id: "best",
      type: "best",
      label: "Melhor Qualidade (Automático)",
      ext: "mp4",
    });

    return formats;
  }

  async download(url, format, outputPath = null) {
    return new Promise((resolve, reject) => {
      const downloadDir = outputPath || this.downloadPath;
      if (!fs.existsSync(downloadDir))
        fs.mkdirSync(downloadDir, { recursive: true });

      const outputTemplate = path.join(downloadDir, "%(title)s.%(ext)s");

      const args = [
        "-f",
        format === "best" ? "best" : format,
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

      this.currentProcess.stdout.on("data", (data) => {
        const str = data.toString();
        const match = str.match(/(\d+(?:\.\d+)?)%/);
        if (match) {
          const progress = parseFloat(match[1]);
          if (Date.now() - lastProgress > 500) {
            this.emitProgress(progress);
            lastProgress = Date.now();
          }
        }
      });

      this.currentProcess.stderr.on(
        "data",
        (data) => (stderr += data.toString())
      );

      this.currentProcess.on("close", (code) => {
        this.currentProcess = null;
        if (code === 0)
          resolve({
            success: true,
            path: downloadDir,
            message: "Download concluído",
          });
        else reject(new Error(stderr || `Erro no download (código: ${code})`));
      });

      this.currentProcess.on("error", () => {
        this.currentProcess = null;
        reject(
          new Error(
            "yt-dlp não encontrado. Certifique-se de que está instalado."
          )
        );
      });
    });
  }

  emitProgress(progress) {
    if (this.progressCallback) this.progressCallback(progress);
  }

  onProgress(callback) {
    this.progressCallback = callback;
  }

  cancelDownload() {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
  }
}

module.exports = { DownloadManager };
