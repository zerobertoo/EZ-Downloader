'use strict';

function classifyYtdlpError(stderr) {
  if (stderr.includes('Video unavailable')) return 'Vídeo indisponível ou privado.';
  if (stderr.includes('Sign in')) return 'Este conteúdo requer autenticação.';
  if (stderr.includes('not installed')) return 'Erro ao processar o vídeo: ffmpeg não encontrado.';
  if (stderr.includes('Unable to extract')) return 'Não foi possível processar a URL.';
  if (stderr.includes('HTTP Error 429')) return 'Muitas requisições. Aguarde e tente novamente.';
  if (stderr.includes('is not a valid URL')) return 'URL inválida ou não suportada.';
  return 'Erro ao processar o vídeo. Verifique a URL e tente novamente.';
}

function parseFormats(data) {
  const formats = [];
  const videoFormats = new Map();
  const audioFormats = new Map();
  const combinedFormats = new Map();

  if (!data.formats || data.formats.length === 0) {
    return [{ id: 'best', type: 'best', label: 'Melhor Qualidade (Automático)', ext: 'mp4' }];
  }

  data.formats.forEach((format) => {
    if (!format.format_id) return;

    if (format.vcodec !== 'none' && format.acodec !== 'none') {
      const key = `${format.ext}-${format.height || 0}p`;
      if (!combinedFormats.has(key)) {
        combinedFormats.set(key, {
          format_id: format.format_id,
          ext: format.ext || 'mp4',
          height: format.height || 0,
          width: format.width || 0,
          fps: format.fps || 0,
          vcodec: format.vcodec,
          acodec: format.acodec,
          filesize: format.filesize,
        });
      }
    } else if (format.vcodec !== 'none' && format.acodec === 'none') {
      const key = `${format.ext}-${format.height || 0}p`;
      if (!videoFormats.has(key)) {
        videoFormats.set(key, {
          format_id: format.format_id,
          ext: format.ext || 'mp4',
          height: format.height || 0,
          width: format.width || 0,
          fps: format.fps || 0,
          vcodec: format.vcodec,
          filesize: format.filesize,
        });
      }
    } else if (format.acodec !== 'none' && format.vcodec === 'none') {
      const key = `${format.ext}-${format.abr || 'unknown'}`;
      if (!audioFormats.has(key)) {
        audioFormats.set(key, {
          format_id: format.format_id,
          ext: format.ext || 'm4a',
          abr: format.abr || 0,
          acodec: format.acodec,
          filesize: format.filesize,
        });
      }
    }
  });

  combinedFormats.forEach((f) => {
    formats.push({
      id: f.format_id,
      type: 'combined',
      label: `${f.ext.toUpperCase()} - ${f.height}p (Vídeo + Áudio)`,
      ext: f.ext,
      height: f.height,
      width: f.width,
      fps: f.fps,
      filesize: f.filesize,
    });
  });

  videoFormats.forEach((f) => {
    formats.push({
      id: f.format_id,
      type: 'video',
      label: `${f.ext.toUpperCase()} - ${f.height}p (Vídeo)`,
      ext: f.ext,
      height: f.height,
      width: f.width,
      fps: f.fps,
      filesize: f.filesize,
    });
  });

  audioFormats.forEach((f) => {
    formats.push({
      id: f.format_id,
      type: 'audio',
      label: `${f.ext.toUpperCase()} - ${f.abr || 'Unknown'} kbps (Áudio)`,
      ext: f.ext,
      abr: f.abr,
      filesize: f.filesize,
    });
  });

  formats.unshift({ id: 'best', type: 'best', label: 'Melhor Qualidade (Automático)', ext: 'mp4' });

  return formats;
}

module.exports = { parseFormats, classifyYtdlpError };
