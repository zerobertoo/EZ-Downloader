'use strict';

const path = require('path');

function getYtdlpBin(isPackaged) {
  if (!isPackaged) return 'yt-dlp';
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return path.join(process.resourcesPath, 'bin', process.platform, binName);
}

module.exports = { getYtdlpBin };
