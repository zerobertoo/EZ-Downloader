const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");
const os = require("os");
const zlib = require("zlib");
const tar = require("tar");

class DependencyManager {
  constructor() {
    // Diretório de dependências no AppData (Windows) ou home (outros SOs)
    if (process.platform === "win32") {
      this.depsDir = path.join(
        process.env.APPDATA || process.env.HOME,
        "EZDownloader",
        "deps"
      );
    } else {
      this.depsDir = path.join(process.env.HOME, ".ez-downloader", "deps");
    }

    this.ytdlpPath = path.join(this.depsDir, "yt-dlp");
    this.ffmpegDir = path.join(this.depsDir, "ffmpeg");
    this.progressCallback = null;

    // Garantir que o diretório existe
    if (!fs.existsSync(this.depsDir)) {
      fs.mkdirSync(this.depsDir, { recursive: true });
    }
  }

  /**
   * Download de arquivo com progresso
   */
  async downloadFile(url, destination, onProgress) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destination);

      https
        .get(url, (response) => {
          const totalSize = parseInt(response.headers["content-length"], 10);
          let downloadedSize = 0;

          response.on("data", (chunk) => {
            downloadedSize += chunk.length;
            const progress = Math.round((downloadedSize / totalSize) * 100);
            if (onProgress) onProgress(progress);
          });

          response.pipe(file);

          file.on("finish", () => {
            file.close();
            resolve();
          });

          file.on("error", (err) => {
            fs.unlink(destination, () => {});
            reject(err);
          });
        })
        .on("error", reject);
    });
  }

  /**
   * Obter versão mais recente do yt-dlp
   */
  async getYtDlpLatestVersion() {
    return new Promise((resolve, reject) => {
      https
        .get(
          "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
          {
            headers: { "User-Agent": "EZ-Downloader" },
          },
          (response) => {
            let data = "";
            response.on("data", (chunk) => (data += chunk));
            response.on("end", () => {
              try {
                const json = JSON.parse(data);
                const version = json.tag_name.replace("v", "");
                resolve(version);
              } catch (e) {
                reject(e);
              }
            });
          }
        )
        .on("error", reject);
    });
  }

  /**
   * Download do yt-dlp
   */
  async downloadYtDlp(onProgress) {
    console.log("[DepManager] Baixando yt-dlp...");

    try {
      const version = await this.getYtDlpLatestVersion();
      let url;
      let filename;

      if (process.platform === "win32") {
        filename = "yt-dlp.exe";
        url = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp.exe`;
      } else if (process.platform === "darwin") {
        filename = "yt-dlp-macos";
        url = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp_macos`;
      } else {
        filename = "yt-dlp";
        url = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp`;
      }

      const downloadPath = path.join(this.depsDir, filename);

      if (fs.existsSync(downloadPath)) {
        console.log("[DepManager] yt-dlp já existe");
        return downloadPath;
      }

      await this.downloadFile(url, downloadPath, onProgress);

      // Tornar executável em Linux e macOS
      if (process.platform !== "win32") {
        fs.chmodSync(downloadPath, "0755");
      }

      console.log("[DepManager] yt-dlp baixado com sucesso");
      return downloadPath;
    } catch (error) {
      throw new Error(`Erro ao baixar yt-dlp: ${error.message}`);
    }
  }

  /**
   * Download do FFmpeg
   */
  async downloadFFmpeg(onProgress) {
    console.log("[DepManager] Baixando FFmpeg...");

    try {
      // URLs dos builds estáticos do FFmpeg
      let url;
      let filename;

      if (process.platform === "win32") {
        filename = "ffmpeg-win64.zip";
        url =
          "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n6.0-latest-win64-gpl-6.0.zip";
      } else if (process.platform === "darwin") {
        filename = "ffmpeg-macos.zip";
        url =
          "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n6.0-latest-macos64-gpl-6.0.zip";
      } else {
        filename = "ffmpeg-linux.tar.xz";
        url =
          "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n6.0-latest-linux64-gpl-6.0.tar.xz";
      }

      const downloadPath = path.join(this.depsDir, filename);

      if (fs.existsSync(this.ffmpegDir)) {
        console.log("[DepManager] FFmpeg já existe");
        return this.ffmpegDir;
      }

      await this.downloadFile(url, downloadPath, onProgress);

      // Extrair arquivo
      console.log("[DepManager] Extraindo FFmpeg...");
      await this.extractFile(downloadPath, this.ffmpegDir);

      // Remover arquivo de download
      fs.unlinkSync(downloadPath);

      console.log("[DepManager] FFmpeg baixado e extraído com sucesso");
      return this.ffmpegDir;
    } catch (error) {
      throw new Error(`Erro ao baixar FFmpeg: ${error.message}`);
    }
  }

  /**
   * Extrair arquivo (zip ou tar.xz)
   */
  async extractFile(source, destination) {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    if (source.endsWith(".zip")) {
      // Usar unzip nativo ou biblioteca
      const AdmZip = require("adm-zip");
      const zip = new AdmZip(source);
      zip.extractAllTo(destination, true);
    } else if (source.endsWith(".tar.xz")) {
      // Extrair tar.xz
      await tar.x({
        file: source,
        cwd: destination,
        strip: 1,
      });
    }
  }

  /**
   * Verificar se as dependências estão instaladas
   */
  checkDependencies() {
    const ytdlpExists =
      fs.existsSync(this.ytdlpPath) || fs.existsSync(this.ytdlpPath + ".exe");
    const ffmpegExists = fs.existsSync(this.ffmpegDir);

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
    if (process.platform === "win32") {
      return path.join(this.depsDir, "yt-dlp.exe");
    }
    return path.join(this.depsDir, "yt-dlp");
  }

  /**
   * Obter caminho do FFmpeg
   */
  getFFmpegPath() {
    const binDir = path.join(this.ffmpegDir, "bin");
    if (process.platform === "win32") {
      return path.join(binDir, "ffmpeg.exe");
    }
    return path.join(binDir, "ffmpeg");
  }

  /**
   * Inicializar e baixar dependências se necessário
   */
  async initialize(onProgress) {
    console.log("[DepManager] Inicializando gerenciador de dependências...");

    const deps = this.checkDependencies();

    if (deps.all) {
      console.log("[DepManager] Todas as dependências estão presentes");
      return true;
    }

    if (!deps.ytdlp) {
      await this.downloadYtDlp((progress) => {
        if (onProgress) onProgress({ type: "ytdlp", progress });
      });
    }

    if (!deps.ffmpeg) {
      await this.downloadFFmpeg((progress) => {
        if (onProgress) onProgress({ type: "ffmpeg", progress });
      });
    }

    return true;
  }

  onProgress(callback) {
    this.progressCallback = callback;
  }
}

module.exports = { DependencyManager };
