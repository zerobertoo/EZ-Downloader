import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./bridge", () => ({
  bridge: {
    startDownload: vi.fn(),
    cancelDownload: vi.fn(),
    analyzeMedia: vi.fn(),
    startConversion: vi.fn(),
    cancelConversion: vi.fn(),
    openPath: vi.fn(),
    selectDownloadPath: vi.fn(),
  },
}));
vi.mock("./ui/history", () => ({ loadHistory: vi.fn() }));
vi.mock("./components/toast", () => ({ toast: vi.fn() }));

import { bridge, type QueueItem } from "./bridge";
import {
  enqueueDownload,
  formatLabelFor,
  handleConversionFinished,
  handleDebugCommand,
  handleDebugLine,
  handleDownloadFinished,
  startOptimization,
  syncQueue,
  updateConversionProgress,
  updateDownloadProgress,
} from "./downloads";
import { state } from "./state";

const mocked = vi.mocked(bridge);

function queueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "a",
    url: "https://youtu.be/a",
    format: "quick-mp4",
    title: "Titulo",
    outputDir: "C:\\videos",
    options: {
      section: null,
      subLangs: null,
      extraArgs: null,
      cookiesBrowser: null,
      limitRate: null,
      nameTemplate: null,
      embedThumbnail: false,
      embedChapters: false,
      embedMetadata: false,
      sponsorblock: null,
      proxy: null,
    },
    status: "queued",
    scheduledAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.downloads.clear();
  vi.clearAllMocks();
});

describe("formatLabelFor", () => {
  it("traduz os formatos rápidos", () => {
    expect(formatLabelFor("quick-mp3")).toBe("MP3");
    expect(formatLabelFor("quick-mp4")).toBe("MP4");
    expect(formatLabelFor("best")).toBe("MP4");
  });

  it("mantém o id de formatos específicos", () => {
    expect(formatLabelFor("137+140")).toBe("137+140");
  });
});

describe("syncQueue", () => {
  it("cria itens restaurados da fila do backend", () => {
    syncQueue([queueItem({ id: "x", status: "paused", format: "quick-mp3" })]);
    const item = state.downloads.get("x")!;
    expect(item.phase).toBe("paused");
    expect(item.formatLabel).toBe("MP3");
    expect(item.outputPath).toBe("C:\\videos");
  });

  it("converte as opções do backend para as de início", () => {
    syncQueue([
      queueItem({
        id: "o",
        scheduledAt: 123,
        options: { ...queueItem().options, section: ["00:00:10", "00:00:20"], embedThumbnail: false, sponsorblock: "mark" },
      }),
    ]);
    const { options } = state.downloads.get("o")!;
    expect(options.scheduledAt).toBe(123);
    expect(options.sectionStart).toBe("00:00:10");
    expect(options.sectionEnd).toBe("00:00:20");
    expect(options.embedThumbnail).toBeUndefined();
    expect(options.sponsorblock).toBe("mark");
  });

  it("atualiza a fase de itens pendentes já conhecidos", () => {
    syncQueue([queueItem({ status: "queued" })]);
    syncQueue([queueItem({ status: "active" })]);
    expect(state.downloads.get("a")!.phase).toBe("active");
  });

  it("não reabre item que já terminou", () => {
    syncQueue([queueItem()]);
    handleDownloadFinished({ id: "a", status: "done", path: "C:\\videos", filePath: null, error: null });
    syncQueue([queueItem({ status: "active" })]);
    expect(state.downloads.get("a")!.phase).toBe("done");
  });
});

describe("enqueueDownload", () => {
  const params = {
    url: "https://youtu.be/a",
    format: "quick-mp4",
    formatLabel: "MP4",
    title: "T",
    outputPath: "C:\\videos",
    options: {},
  };

  it("cria o item em fila com o id devolvido pelo backend", async () => {
    mocked.startDownload.mockResolvedValue("novo");
    await enqueueDownload(params);
    expect(state.downloads.get("novo")!.phase).toBe("queued");
    expect(mocked.startDownload).toHaveBeenCalledWith(params.url, params.format, params.outputPath, "T", {});
  });

  it("completa o rótulo quando o evento da fila chegou antes do retorno", async () => {
    mocked.startDownload.mockImplementation(async () => {
      syncQueue([queueItem({ id: "cedo" })]);
      return "cedo";
    });
    await enqueueDownload({ ...params, formatLabel: "720p" });
    expect(state.downloads.get("cedo")!.formatLabel).toBe("720p");
  });

  it("propaga o erro do backend sem criar item", async () => {
    mocked.startDownload.mockRejectedValue(new Error("opção inválida"));
    await expect(enqueueDownload(params)).rejects.toThrow("opção inválida");
    expect(state.downloads.size).toBe(0);
  });
});

describe("progresso e término", () => {
  beforeEach(() => syncQueue([queueItem({ status: "active" })]));

  it("limita o percentual a 0-100", () => {
    updateDownloadProgress({ id: "a", percent: 140, speed: "1MB/s", eta: "00:10" });
    const item = state.downloads.get("a")!;
    expect(item.percent).toBe(100);
    expect(item.speed).toBe("1MB/s");
    expect(item.eta).toBe("00:10");
  });

  it("ignora progresso de item que não está ativo ou não existe", () => {
    handleDownloadFinished({ id: "a", status: "cancelled", path: null, filePath: null, error: null });
    updateDownloadProgress({ id: "a", percent: 50, speed: null, eta: null });
    updateDownloadProgress({ id: "fantasma", percent: 50, speed: null, eta: null });
    expect(state.downloads.get("a")!.percent).toBe(0);
  });

  it("conclusão marca 100% e guarda os caminhos", () => {
    mocked.analyzeMedia.mockResolvedValue({ videoCodec: "h264", audioCodec: "aac", needsConversion: false, encoder: "CPU (x264)", gpu: false });
    handleDownloadFinished({ id: "a", status: "done", path: "C:\\videos", filePath: "C:\\videos\\a.mp4", error: null });
    const item = state.downloads.get("a")!;
    expect(item.phase).toBe("done");
    expect(item.percent).toBe(100);
    expect(item.resultPath).toBe("C:\\videos");
    expect(item.filePath).toBe("C:\\videos\\a.mp4");
  });

  it("falha guarda o erro e não oferece otimização", () => {
    handleDownloadFinished({ id: "a", status: "failed", path: null, filePath: null, error: "boom" });
    expect(state.downloads.get("a")!.error).toBe("boom");
    expect(mocked.analyzeMedia).not.toHaveBeenCalled();
  });

  it("não analisa o arquivo de uma playlist", () => {
    syncQueue([queueItem({ id: "pl", url: "https://youtube.com/playlist?list=PL1", status: "active" })]);
    handleDownloadFinished({ id: "pl", status: "done", path: "C:\\videos", filePath: "C:\\videos\\ultimo.mp4", error: null });
    expect(mocked.analyzeMedia).not.toHaveBeenCalled();
  });

  it("evento de término de id desconhecido é ignorado", () => {
    expect(() => handleDownloadFinished({ id: "nada", status: "done", path: null, filePath: null, error: null })).not.toThrow();
  });
});

describe("log técnico", () => {
  it("guarda comando e linhas que chegaram antes do item existir", () => {
    handleDebugCommand({ id: "cedo", command: "yt-dlp ..." });
    handleDebugLine({ id: "cedo", stream: "stderr", text: "aviso" });
    syncQueue([queueItem({ id: "cedo" })]);
    const item = state.downloads.get("cedo")!;
    expect(item.debugCommand).toBe("yt-dlp ...");
    expect(item.debugLines).toEqual([{ stream: "stderr", text: "aviso" }]);
  });

  it("mantém só as últimas 500 linhas", () => {
    syncQueue([queueItem()]);
    for (let index = 0; index < 520; index++) handleDebugLine({ id: "a", stream: "stdout", text: `linha ${index}` });
    const { debugLines } = state.downloads.get("a")!;
    expect(debugLines).toHaveLength(500);
    expect(debugLines[0].text).toBe("linha 20");
    expect(debugLines[debugLines.length - 1].text).toBe("linha 519");
  });
});

describe("otimização", () => {
  const report = { videoCodec: "av1", audioCodec: "opus", needsConversion: true, encoder: "CPU (x264)", gpu: false };

  function prepareDoneItem() {
    syncQueue([queueItem({ status: "active" })]);
    const item = state.downloads.get("a")!;
    item.phase = "done";
    item.filePath = "C:\\videos\\a.webm";
    item.conversion = { phase: "offer", report };
    return item;
  }

  it("inicia a conversão e entra em running", async () => {
    const item = prepareDoneItem();
    mocked.startConversion.mockResolvedValue(undefined);
    await startOptimization("a");
    expect(mocked.startConversion).toHaveBeenCalledWith("a", "C:\\videos\\a.webm", undefined);
    expect(item.conversion?.phase).toBe("running");
  });

  it("volta para failed quando o backend recusa", async () => {
    const item = prepareDoneItem();
    mocked.startConversion.mockRejectedValue(new Error("sem ffmpeg"));
    await startOptimization("a");
    expect(item.conversion).toMatchObject({ phase: "failed", error: "sem ffmpeg" });
  });

  it("não reinicia uma conversão já em andamento", async () => {
    const item = prepareDoneItem();
    item.conversion = { phase: "running", report, percent: 10 };
    await startOptimization("a");
    expect(mocked.startConversion).not.toHaveBeenCalled();
  });

  it("atualiza o progresso só durante a execução", () => {
    const item = prepareDoneItem();
    updateConversionProgress({ id: "a", percent: 50 });
    expect(item.conversion?.phase).toBe("offer");
    item.conversion = { phase: "running", report, percent: 0 };
    updateConversionProgress({ id: "a", percent: 250 });
    expect(item.conversion).toMatchObject({ percent: 100 });
  });

  it("término com sucesso guarda o caminho; cancelado volta à oferta", () => {
    const item = prepareDoneItem();
    item.conversion = { phase: "running", report, percent: 50 };
    handleConversionFinished({ id: "a", status: "done", path: "C:\\videos\\a.h264.mp4", error: null });
    expect(item.conversion).toEqual({ phase: "done", outputPath: "C:\\videos\\a.h264.mp4" });

    item.conversion = { phase: "running", report, percent: 50 };
    handleConversionFinished({ id: "a", status: "cancelled", path: null, error: null });
    expect(item.conversion?.phase).toBe("offer");

    item.conversion = { phase: "running", report, percent: 50 };
    handleConversionFinished({ id: "a", status: "failed", path: null, error: "erro" });
    expect(item.conversion).toMatchObject({ phase: "failed", error: "erro" });
  });
});
