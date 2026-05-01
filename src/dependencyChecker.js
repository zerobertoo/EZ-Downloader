'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function checkDependency(name) {
  try {
    await execFileAsync(name, ['--version']);
    return { name, available: true };
  } catch {
    return { name, available: false };
  }
}

async function checkDependencies(ytdlpBin = 'yt-dlp', ffmpegBin = 'ffmpeg') {
  const [ytdlp, ffmpeg] = await Promise.all([
    checkDependency(ytdlpBin),
    checkDependency(ffmpegBin),
  ]);
  return { ytdlp, ffmpeg };
}

module.exports = { checkDependencies };
