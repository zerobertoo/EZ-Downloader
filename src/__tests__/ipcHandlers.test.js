const { createHandlers } = require('../ipcHandlers');

describe('IPC handlers', () => {
  let handlers;
  let mockDownloadManager;
  let mockApp;
  let mockDialog;
  let mockShell;

  beforeEach(() => {
    mockDownloadManager = {
      getAvailableFormats: vi.fn(),
      download: vi.fn(),
      cancelDownload: vi.fn(),
    };
    mockApp = {
      getPath: vi.fn().mockReturnValue('/home/user/Downloads'),
    };
    mockDialog = {
      showOpenDialog: vi.fn().mockResolvedValue({ filePaths: ['/selected/path'] }),
    };
    mockShell = {
      openPath: vi.fn().mockResolvedValue(undefined),
    };

    handlers = createHandlers({
      downloadManager: mockDownloadManager,
      getMainWindow: () => null,
      app: mockApp,
      dialog: mockDialog,
      shell: mockShell,
    });
  });

  describe('get-version', () => {
    it('returns a non-empty version string', () => {
      const version = handlers['get-version']();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });
  });

  describe('get-app-info', () => {
    it('returns object with version and name', () => {
      const info = handlers['get-app-info']();
      expect(typeof info.version).toBe('string');
      expect(typeof info.name).toBe('string');
    });
  });

  describe('get-formats', () => {
    it('returns error when url is null', async () => {
      const result = await handlers['get-formats'](null, null);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/URL/);
    });

    it('returns error when url is not a string', async () => {
      const result = await handlers['get-formats'](null, 42);
      expect(result.success).toBe(false);
    });

    it('returns formats on success', async () => {
      const mockFormats = [{ id: 'best', label: 'Best Quality' }];
      mockDownloadManager.getAvailableFormats.mockResolvedValue({
        formats: mockFormats,
        title: 'Test Video',
        thumbnail: 'https://example.com/thumb.jpg',
        uploader: 'Test Channel',
      });

      const result = await handlers['get-formats'](null, 'https://youtube.com/watch?v=abc');
      expect(result.success).toBe(true);
      expect(result.formats).toEqual(mockFormats);
      expect(result.title).toBe('Test Video');
      expect(mockDownloadManager.getAvailableFormats).toHaveBeenCalledWith('https://youtube.com/watch?v=abc');
    });

    it('returns classified error when getAvailableFormats throws', async () => {
      mockDownloadManager.getAvailableFormats.mockRejectedValue(new Error('Vídeo indisponível ou privado.'));

      const result = await handlers['get-formats'](null, 'https://youtube.com/watch?v=private');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Vídeo indisponível ou privado.');
    });

    it('returns generic error message when thrown error has no message', async () => {
      mockDownloadManager.getAvailableFormats.mockRejectedValue(new Error());

      const result = await handlers['get-formats'](null, 'https://youtube.com/watch?v=x');
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    });
  });

  describe('start-download', () => {
    it('returns error when all fields are missing', async () => {
      const result = await handlers['start-download'](null, {});
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/inválido/);
    });

    it('returns error when url is empty', async () => {
      const result = await handlers['start-download'](null, { url: '', format: 'best', outputPath: '/tmp' });
      expect(result.success).toBe(false);
    });

    it('returns error when format is missing', async () => {
      const result = await handlers['start-download'](null, { url: 'https://y.com/v', format: '', outputPath: '/tmp' });
      expect(result.success).toBe(false);
    });

    it('returns error when outputPath is missing', async () => {
      const result = await handlers['start-download'](null, { url: 'https://y.com/v', format: 'best', outputPath: '' });
      expect(result.success).toBe(false);
    });

    it('returns success on completed download', async () => {
      const mockResult = { success: true, path: '/home/user/Downloads', message: 'Done' };
      mockDownloadManager.download.mockResolvedValue(mockResult);

      const result = await handlers['start-download'](null, {
        url: 'https://youtube.com/watch?v=abc',
        format: 'best',
        outputPath: '/home/user/Downloads',
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockResult);
      expect(mockDownloadManager.download).toHaveBeenCalledWith(
        'https://youtube.com/watch?v=abc', 'best', '/home/user/Downloads'
      );
    });

    it('returns error when download throws', async () => {
      mockDownloadManager.download.mockRejectedValue(new Error('Um download já está em andamento'));

      const result = await handlers['start-download'](null, {
        url: 'https://youtube.com/watch?v=abc',
        format: 'best',
        outputPath: '/home/user/Downloads',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Um download já está em andamento');
    });
  });

  describe('cancel-download', () => {
    it('calls cancelDownload and returns success', () => {
      const result = handlers['cancel-download']();
      expect(result.success).toBe(true);
      expect(mockDownloadManager.cancelDownload).toHaveBeenCalledOnce();
    });

    it('returns error when cancelDownload throws', () => {
      mockDownloadManager.cancelDownload.mockImplementation(() => {
        throw new Error('nada para cancelar');
      });
      const result = handlers['cancel-download']();
      expect(result.success).toBe(false);
      expect(result.error).toBe('nada para cancelar');
    });
  });

  describe('getDownloadsPath', () => {
    it('returns the path from app.getPath', () => {
      const result = handlers['getDownloadsPath']();
      expect(result).toBe('/home/user/Downloads');
      expect(mockApp.getPath).toHaveBeenCalledWith('downloads');
    });

    it('returns null when app.getPath throws', () => {
      mockApp.getPath.mockImplementation(() => { throw new Error('no path'); });
      const result = handlers['getDownloadsPath']();
      expect(result).toBeNull();
    });
  });

  describe('open-path', () => {
    it('returns error for null path', async () => {
      const result = await handlers['open-path'](null, null);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Caminho inválido/);
    });

    it('returns error for non-string path', async () => {
      const result = await handlers['open-path'](null, 123);
      expect(result.success).toBe(false);
    });

    it('opens the path and returns success', async () => {
      const result = await handlers['open-path'](null, '/some/valid/path');
      expect(result.success).toBe(true);
      expect(mockShell.openPath).toHaveBeenCalledWith('/some/valid/path');
    });

    it('returns error when openPath throws', async () => {
      mockShell.openPath.mockRejectedValue(new Error('permission denied'));
      const result = await handlers['open-path'](null, '/restricted');
      expect(result.success).toBe(false);
      expect(result.error).toBe('permission denied');
    });
  });

  describe('select-download-path', () => {
    it('returns selected path from dialog', async () => {
      const result = await handlers['select-download-path']();
      expect(result).toBe('/selected/path');
    });

    it('returns null when no path selected', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({ filePaths: [] });
      const result = await handlers['select-download-path']();
      expect(result).toBeNull();
    });

    it('returns null when dialog throws', async () => {
      mockDialog.showOpenDialog.mockRejectedValue(new Error('dialog error'));
      const result = await handlers['select-download-path']();
      expect(result).toBeNull();
    });
  });
});
