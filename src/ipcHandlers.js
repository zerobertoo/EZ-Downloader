'use strict';

const config = require('./config');

function createHandlers({ downloadManager, getMainWindow, app, dialog, shell }) {
  return {
    'get-version': () => config.version,

    'get-app-info': () => ({
      version: config.version,
      name: config.app.displayName,
      description: config.description,
      author: config.author,
      repository: config.repository,
    }),

    'get-formats': async (_, url) => {
      if (!url || typeof url !== 'string') {
        return { success: false, error: 'URL inválida' };
      }
      try {
        const { formats, title, thumbnail, uploader } = await downloadManager.getAvailableFormats(url);
        return { success: true, formats, title, thumbnail, uploader };
      } catch (err) {
        console.error('Erro ao buscar formatos:', err);
        return { success: false, error: err.message || 'Erro desconhecido ao buscar formatos' };
      }
    },

    'start-download': async (_, { url, format, outputPath } = {}) => {
      if (!url || !format || !outputPath) {
        return { success: false, error: 'URL, formato ou caminho de saída inválido' };
      }
      try {
        const result = await downloadManager.download(url, format, outputPath);
        return { success: true, result };
      } catch (err) {
        console.error('Erro no download:', err);
        return { success: false, error: err.message || 'Erro desconhecido no download' };
      }
    },

    'select-download-path': async () => {
      try {
        const result = await dialog.showOpenDialog(getMainWindow(), {
          properties: ['openDirectory'],
        });
        return result.filePaths[0] || null;
      } catch (err) {
        console.error('Erro ao selecionar diretório:', err);
        return null;
      }
    },

    'open-path': async (_, filePath) => {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Caminho inválido' };
      }
      try {
        await shell.openPath(filePath);
        return { success: true };
      } catch (err) {
        console.error('Erro ao abrir caminho:', err);
        return { success: false, error: err.message };
      }
    },

    getDownloadsPath: () => {
      try {
        return app.getPath('downloads');
      } catch (err) {
        console.error('Erro ao obter caminho de downloads:', err);
        return null;
      }
    },

    'cancel-download': () => {
      try {
        downloadManager.cancelDownload();
        return { success: true };
      } catch (err) {
        console.error('Erro ao cancelar download:', err);
        return { success: false, error: err.message };
      }
    },
  };
}

module.exports = { createHandlers };
