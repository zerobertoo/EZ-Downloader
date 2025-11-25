const fs = require("fs");
const path = require("path");
const https = require("https");
const tar = require("tar");
const config = require("./config");

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

    // Define o caminho final do executável yt-dlp
    this.ytdlpPath = path.join(this.depsDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
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

      // Adiciona User-Agent para evitar bloqueio do GitHub e lida com redirecionamentos
      https.get(url, { headers: { 'User-Agent': 'EZ-Downloader' } }, (response) => {
          // Lidar com redirecionamentos (status 3xx)
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            console.log(`[DepManager] Redirecionando para: ${response.headers.location}`);
            // Fecha a conexão atual e chama downloadFile recursivamente com a nova URL
            response.destroy();
            return this.downloadFile(response.headers.location, destination, onProgress)
              .then(resolve)
              .catch(reject);
          }

          if (response.statusCode !== 200) {
            // Se o arquivo já existe, o createWriteStream pode ter aberto, então precisa fechar e deletar
            file.close();
            fs.unlink(destination, () => {});
            return reject(new Error(`Falha ao baixar arquivo: ${response.statusCode} ${response.statusMessage} de ${url}`));
          }

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
          config.dependencies.ytdlp.apiEndpoint,
          {
            headers: { "User-Agent": "EZ-Downloader" },
          },
          (response) => {
            let data = "";
            response.on("data", (chunk) => (data += chunk));
            response.on("end", () => {
              try {
                const json = JSON.parse(data);
                // Retorna a tag_name completa (ex: '2024.05.27')
                const version = json.tag_name;
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

      if (process.platform === "win32") {
        url = config.dependencies.ytdlp.windows(version);
      } else if (process.platform === "darwin") {
        url = config.dependencies.ytdlp.macos(version);
      } else {
        url = config.dependencies.ytdlp.linux(version);
      }

      if (fs.existsSync(this.ytdlpPath)) {
        console.log("[DepManager] yt-dlp já existe");
        if (process.platform !== "win32") {
          fs.chmodSync(this.ytdlpPath, "0755");
        }
        return this.ytdlpPath;
      }

      console.log(`[DepManager] Baixando yt-dlp de: ${url}`);
      await this.downloadFile(url, this.ytdlpPath, onProgress);

      console.log("[DepManager] Arquivo baixado, definindo permissões...");

      try {
        // A permissão 0755 é necessária para executáveis em sistemas Unix-like
        if (process.platform !== "win32") {
            fs.chmodSync(this.ytdlpPath, "0755");
        }
        console.log("[DepManager] Permissões definidas com sucesso");
      } catch (chmodError) {
        console.warn(
          "[DepManager] Aviso ao definir permissões:",
          chmodError.message
        );
      }

      console.log("[DepManager] yt-dlp baixado com sucesso");
      return this.ytdlpPath;
    } catch (error) {
      throw new Error(`Erro ao baixar yt-dlp: ${error.message}`);
    }
  }

  /**
   * Obter URL de download do FFmpeg da API do GitHub
   */
  async getFFmpegDownloadUrl() {
    return new Promise((resolve, reject) => {
      https
        .get(
          config.dependencies.ffmpeg.apiEndpoint,
          {
            headers: { "User-Agent": "EZ-Downloader" },
          },
          (response) => {
            let data = "";
            response.on("data", (chunk) => (data += chunk));
            response.on("end", () => {
              try {
                const json = JSON.parse(data);
                const assets = json.assets;
                let url = null;
                let filename = null;

                // O nome do arquivo deve ser dinâmico para garantir que a última versão seja baixada
                // O BtbN/FFmpeg-Builds usa o formato: ffmpeg-master-latest-{os}{arch}-gpl.{ext}
                let osName;
                let archName = "64"; // Assumindo x64

                if (process.platform === "win32") {
                  osName = "win";
                  filename = `ffmpeg-master-latest-${osName}${archName}-gpl.zip`;
                } else if (process.platform === "darwin") {
                  osName = "macos";
                  filename = `ffmpeg-master-latest-${osName}${archName}-gpl.zip`;
                } else {
                  osName = "linux";
                  filename = `ffmpeg-master-latest-${osName}${archName}-gpl.tar.xz`;
                }

                console.log("Procurando por:", filename);
                const asset = assets.find(a => a.name.includes(filename));
                console.log("Asset encontrado:", asset ? asset.name : "Nenhum");

                if (asset) {
                  url = asset.browser_download_url;
                }

                if (url) {
                  resolve({ url, filename });
                } else {
                  reject(new Error(`Asset do FFmpeg não encontrado para ${process.platform} com o nome ${filename}`));
                }
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
   * Download do FFmpeg
   */
  async downloadFFmpeg(onProgress) {
    console.log("[DepManager] Baixando FFmpeg...");

    try {
      const { url, filename } = await this.getFFmpegDownloadUrl();

      const downloadPath = path.join(this.depsDir, filename);

      // Verifica se o executável do FFmpeg existe dentro do diretório de destino
      if (fs.existsSync(this.ffmpegDir) && fs.existsSync(this.getFFmpegPath())) {
        console.log("[DepManager] FFmpeg já existe");
        return this.ffmpegDir;
      }

      console.log(`[DepManager] Baixando FFmpeg de: ${url}`);
      await this.downloadFile(url, downloadPath, onProgress);

      console.log("[DepManager] Extraindo FFmpeg...");
      await this.extractFile(downloadPath, this.ffmpegDir);

      // Remove o arquivo compactado após a extração
      fs.unlinkSync(downloadPath);

      // Garante permissão de execução para o binário do FFmpeg em sistemas Unix-like
      if (process.platform !== "win32") {
        try {
            fs.chmodSync(this.getFFmpegPath(), "0755");
            console.log("[DepManager] Permissões do FFmpeg definidas com sucesso");
        } catch (chmodError) {
            console.warn(
                "[DepManager] Aviso ao definir permissões do FFmpeg:",
                chmodError.message
            );
        }
      }

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
      // AdmZip precisa ser instalado ou estar disponível no ambiente
      const AdmZip = require("adm-zip");
      const zip = new AdmZip(source);
      // Extrai para o diretório de destino, sobrescrevendo arquivos existentes
      zip.extractAllTo(destination, true);
    } else if (source.endsWith(".tar.xz")) {
      // tar precisa ser instalado ou estar disponível no ambiente
      await tar.x({
        file: source,
        cwd: destination,
        strip: 1, // Remove o primeiro diretório do arquivo (comum em arquivos tar de binários)
      });
    } else {
        throw new Error(`Formato de arquivo não suportado para extração: ${source}`);
    }
  }

  /**
   * Verificar se as dependências estão instaladas
   */
  checkDependencies() {
    // Verifica se o binário do yt-dlp existe no caminho esperado
    const ytdlpExists = fs.existsSync(this.ytdlpPath);
    // Verifica se o binário do FFmpeg existe no caminho esperado
    const ffmpegExists = fs.existsSync(this.getFFmpegPath());

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
    // O FFmpeg é extraído para this.ffmpegDir, e o binário está em 'bin/ffmpeg' (ou 'bin/ffmpeg.exe')
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

  /**
   * Registrar callback de progresso
   */
  onProgress(callback) {
    this.progressCallback = callback;
  }
}

module.exports = { DependencyManager };
