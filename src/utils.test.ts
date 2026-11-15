import { describe, expect, it } from "vitest";
import {
  errorMessage,
  formatDuration,
  formatFileSize,
  friendlyErrorMessage,
  isHttpUrl,
  looksLikePlaylist,
  parseUrlList,
  singleVideoUrlOf,
  urlHintFor,
} from "./utils";
import { UI_STRINGS } from "./state";

describe("errorMessage", () => {
  it("usa a mensagem de um Error", () => {
    expect(errorMessage(new Error("falhou"))).toBe("falhou");
  });

  it("converte qualquer outro valor em texto", () => {
    expect(errorMessage("texto")).toBe("texto");
    expect(errorMessage(42)).toBe("42");
  });
});

describe("isHttpUrl", () => {
  it("aceita http e https", () => {
    expect(isHttpUrl("https://youtu.be/abc")).toBe(true);
    expect(isHttpUrl("http://exemplo.com")).toBe(true);
  });

  it("rejeita outros protocolos e texto solto", () => {
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("nao e url")).toBe(false);
  });
});

describe("parseUrlList", () => {
  it("separa por espaço e quebra de linha", () => {
    const { urls, invalid } = parseUrlList("https://a.com/1\nhttps://b.com/2   https://c.com/3");
    expect(urls).toEqual(["https://a.com/1", "https://b.com/2", "https://c.com/3"]);
    expect(invalid).toEqual([]);
  });

  it("separa as entradas inválidas", () => {
    const { urls, invalid } = parseUrlList("https://a.com lixo ftp://x.com");
    expect(urls).toEqual(["https://a.com"]);
    expect(invalid).toEqual(["lixo", "ftp://x.com"]);
  });

  it("texto vazio não gera nada", () => {
    expect(parseUrlList("   \n ")).toEqual({ urls: [], invalid: [] });
  });
});

describe("formatDuration", () => {
  it("formata minutos e segundos", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("inclui horas quando há", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

describe("looksLikePlaylist", () => {
  it("detecta parâmetro list do YouTube", () => {
    expect(looksLikePlaylist("https://www.youtube.com/watch?v=x&list=PL1")).toBe(true);
  });

  it("detecta /playlist e /sets", () => {
    expect(looksLikePlaylist("https://www.youtube.com/playlist?x=1")).toBe(true);
    expect(looksLikePlaylist("https://soundcloud.com/user/sets/album")).toBe(true);
  });

  it("vídeo simples e texto inválido não são playlist", () => {
    expect(looksLikePlaylist("https://www.youtube.com/watch?v=x")).toBe(false);
    expect(looksLikePlaylist("nada")).toBe(false);
  });
});

describe("singleVideoUrlOf", () => {
  it("remove list, index e start_radio mantendo o vídeo", () => {
    const result = singleVideoUrlOf("https://www.youtube.com/watch?v=abc&list=PL1&index=3&start_radio=1");
    expect(result).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("devolve null quando não é vídeo dentro de playlist", () => {
    expect(singleVideoUrlOf("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(singleVideoUrlOf("https://www.youtube.com/playlist?list=PL1")).toBeNull();
    expect(singleVideoUrlOf("invalido")).toBeNull();
  });
});

describe("urlHintFor", () => {
  it("avisa que lote exige o modo Básico", () => {
    expect(urlHintFor("https://a.com https://b.com", "advanced")).toBe(UI_STRINGS.errorBatchNeedsBasicMode);
  });

  it("conta os links do lote no modo Básico", () => {
    expect(urlHintFor("https://a.com https://b.com", "basic")).toBe(`2 ${UI_STRINGS.hintBatch}`);
  });

  it("dá a dica de playlist", () => {
    expect(urlHintFor("https://youtube.com/playlist?list=PL1", "basic")).toBe(UI_STRINGS.hintPlaylist);
  });

  it("não diz nada para um link comum", () => {
    expect(urlHintFor("https://youtube.com/watch?v=x", "basic")).toBeNull();
  });
});

describe("friendlyErrorMessage", () => {
  it("traduz erros conhecidos do yt-dlp", () => {
    expect(friendlyErrorMessage("ERROR: Private video")).toContain("privado");
    expect(friendlyErrorMessage("Sign in to confirm you're not a bot")).toContain("robô");
    expect(friendlyErrorMessage("HTTP Error 429: Too Many Requests")).toContain("Muitas requisições");
    expect(friendlyErrorMessage("Unsupported URL: x")).toContain("não é suportado");
  });

  it("usa a mensagem genérica para erro desconhecido", () => {
    expect(friendlyErrorMessage("algo estranho")).toBe("Não foi possível concluir este download.");
  });
});

describe("formatFileSize", () => {
  it("formata em unidades legíveis", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
  });
});
