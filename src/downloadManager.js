'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { parseFormats, classifyYtdlpError } = require('./formatParser');
const { spawnProcess } = require('./processRunner');

const PROGRESS_THROTTLE_MS = 500;

class DownloadManager {
  constructor(ytdlpBin = 'yt-dlp', ffmpegBin = null) {
    this.ytdlpBin = ytdlpBin;
    this.ffmpegBin = ffmpegBin;
    this.currentProcess = null;
    this.downloadPath = path.join(os.homedir(), 'Downloads');
    this.progressCallback = null;

    if (!fs.existsSync(this.downloadPath)) {
      fs.mkdirSync(this.downloadPath, { recursive: true });
    }
  }

  async getAvailableFormats(url) {
    const args = ['--dump-json', '--no-warnings', url];
    const { promise } = spawnProcess(this.ytdlpBin, args, { timeoutMs: 30_000 });

    try {
      const { code, stdout, stderr } = await promise;
      if (code === 0) {
        try {
          const data = JSON.parse(stdout);
          return {
            formats: parseFormats(data),
            title: data.title || null,
            thumbnail: data.thumbnail || null,
            uploader: data.uploader || data.channel || null,
          };
        } catch (err) {
          throw new Error('Erro ao processar formatos: ' + err.message);
        }
      } else {
        throw new Error(classifyYtdlpError(stderr));
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error('yt-dlp não encontrado. Certifique-se de que está instalado.');
      }
      throw err;
    }
  }

  async download(url, format, outputPath = null) {
    if (this.currentProcess) {
      return Promise.reject(new Error('Um download já está em andamento'));
    }

    const downloadDir = outputPath || this.downloadPath;
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const outputTemplate = path.join(downloadDir, '%(title)s.%(ext)s');
    const args = [
      '-f', format === 'best' ? 'bestvideo+bestaudio/best' : format,
      ...(format === 'best' ? ['--merge-output-format', 'mp4'] : []),
      ...(this.ffmpegBin ? ['--ffmpeg-location', this.ffmpegBin] : []),
      '-o', outputTemplate,
      '--progress',
      '--no-warnings',
      url,
    ];

    let lastProgress = 0;

    const { proc, promise } = spawnProcess(this.ytdlpBin, args, {
      onStdout: (str) => {
        const match = str.match(
          /\[download\]\s+([\d.]+)%(?:.*?at\s+(\S+\/s).*?ETA\s+([\d:]+))?/
        );
        if (match) {
          const percent = parseFloat(match[1]);
          const now = Date.now();
          if (now - lastProgress > PROGRESS_THROTTLE_MS || percent === 100) {
            this.emitProgress({ percent, speed: match[2] || null, eta: match[3] || null });
            lastProgress = now;
          }
        }
      },
    });

    this.currentProcess = proc;

    try {
      const { code, stderr } = await promise;
      this.currentProcess = null;

      if (code === 0) {
        return { success: true, path: downloadDir, message: 'Download concluído com sucesso' };
      } else {
        throw new Error(classifyYtdlpError(stderr));
      }
    } catch (err) {
      this.currentProcess = null;
      if (err.code === 'ENOENT') {
        throw new Error('yt-dlp não encontrado. Certifique-se de que está instalado e acessível via PATH.');
      }
      throw err;
    }
  }

  emitProgress(data) {
    if (this.progressCallback) this.progressCallback(data);
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
