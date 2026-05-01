'use strict';

const path = require('path');

function getFfmpegBin(isPackaged) {
  if (!isPackaged) {
    return require('ffmpeg-static') || 'ffmpeg';
  }
  const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'ffmpeg-static',
    binName
  );
}

module.exports = { getFfmpegBin };
