const { parseFormats, classifyYtdlpError } = require('../formatParser');

const COMBINED_FORMAT = (id, ext, height) => ({
  format_id: id, ext, height, width: height * 16 / 9,
  fps: 30, vcodec: 'avc1', acodec: 'mp4a', filesize: 50_000_000,
});

const VIDEO_FORMAT = (id, ext, height) => ({
  format_id: id, ext, height, width: height * 16 / 9,
  fps: 30, vcodec: 'vp9', acodec: 'none', filesize: 40_000_000,
});

const AUDIO_FORMAT = (id, ext, abr) => ({
  format_id: id, ext, height: null, width: null,
  vcodec: 'none', acodec: 'opus', abr, filesize: 5_000_000,
});

describe('parseFormats', () => {
  it('prepends best option when formats exist', () => {
    const result = parseFormats({ formats: [COMBINED_FORMAT('22', 'mp4', 720)] });
    expect(result[0].id).toBe('best');
    expect(result[0].type).toBe('best');
  });

  it('returns only best when formats array is empty', () => {
    const result = parseFormats({ formats: [] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('best');
  });

  it('returns only best when formats key is absent', () => {
    const result = parseFormats({});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('best');
  });

  it('deduplicates combined formats by ext+resolution', () => {
    const formats = [
      COMBINED_FORMAT('22',  'mp4', 720),
      COMBINED_FORMAT('23',  'mp4', 720), // duplicate key mp4-720p
      COMBINED_FORMAT('137', 'mp4', 1080),
    ];
    const result = parseFormats({ formats });
    const combined = result.filter((f) => f.type === 'combined');
    const keys = combined.map((f) => `${f.ext}-${f.height}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(combined).toHaveLength(2);
  });

  it('deduplicates video-only formats by ext+resolution', () => {
    const formats = [
      VIDEO_FORMAT('248', 'webm', 1080),
      VIDEO_FORMAT('249', 'webm', 1080), // duplicate
    ];
    const result = parseFormats({ formats });
    const videos = result.filter((f) => f.type === 'video');
    expect(videos).toHaveLength(1);
  });

  it('deduplicates audio formats by ext+bitrate', () => {
    const formats = [
      AUDIO_FORMAT('140', 'm4a', 128),
      AUDIO_FORMAT('141', 'm4a', 128), // duplicate
    ];
    const result = parseFormats({ formats });
    const audio = result.filter((f) => f.type === 'audio');
    expect(audio).toHaveLength(1);
  });

  it('orders: best → combined → video → audio', () => {
    const formats = [
      AUDIO_FORMAT('140', 'm4a', 128),
      VIDEO_FORMAT('248', 'webm', 1080),
      COMBINED_FORMAT('22', 'mp4', 720),
    ];
    const result = parseFormats({ formats });
    const types = result.map((f) => f.type);
    expect(types[0]).toBe('best');
    expect(types.indexOf('combined')).toBeLessThan(types.indexOf('video'));
    expect(types.indexOf('video')).toBeLessThan(types.indexOf('audio'));
  });

  it('includes filesize in format objects', () => {
    const result = parseFormats({ formats: [COMBINED_FORMAT('22', 'mp4', 720)] });
    const combined = result.find((f) => f.type === 'combined');
    expect(combined?.filesize).toBe(50_000_000);
  });

  it('skips formats without format_id', () => {
    const formats = [
      { ext: 'mp4', height: 720, vcodec: 'avc1', acodec: 'mp4a' }, // no format_id
      COMBINED_FORMAT('22', 'mp4', 720),
    ];
    const result = parseFormats({ formats });
    const combined = result.filter((f) => f.type === 'combined');
    expect(combined).toHaveLength(1);
  });

  it('uses zero height fallback when height is null', () => {
    const format = { ...COMBINED_FORMAT('22', 'mp4', 720), height: null };
    const result = parseFormats({ formats: [format] });
    const combined = result.find((f) => f.type === 'combined');
    expect(combined?.height).toBe(0);
  });
});

describe('classifyYtdlpError', () => {
  it('classifies unavailable video', () => {
    expect(classifyYtdlpError('Video unavailable')).toMatch(/indisponível/);
  });

  it('classifies auth required', () => {
    expect(classifyYtdlpError('Sign in to confirm your age')).toMatch(/autenticação/);
  });

  it('classifies missing ffmpeg', () => {
    expect(classifyYtdlpError('ffmpeg not installed')).toMatch(/ffmpeg/);
  });

  it('classifies rate limit', () => {
    expect(classifyYtdlpError('HTTP Error 429: Too Many Requests')).toMatch(/Muitas requisições/);
  });

  it('classifies invalid URL', () => {
    expect(classifyYtdlpError('is not a valid URL')).toMatch(/URL inválida/);
  });

  it('classifies unable to extract', () => {
    expect(classifyYtdlpError('Unable to extract video data')).toMatch(/processar/);
  });

  it('returns a generic message for unknown errors', () => {
    const msg = classifyYtdlpError('something completely unknown');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});
