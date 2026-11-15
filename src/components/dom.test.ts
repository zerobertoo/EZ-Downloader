import { describe, expect, it, vi } from "vitest";
import { clamp, h, safeStorageGet, safeStorageRemove, safeStorageSet, shortenPath, shortcutLabel, uid } from "./dom";

describe("h", () => {
  it("cria elemento com classe, atributos e filhos", () => {
    const element = h("div", { class: ["a", false, "b"], title: "dica" }, "texto", 7, null, false);
    expect(element.className).toBe("a b");
    expect(element.getAttribute("title")).toBe("dica");
    expect(element.textContent).toBe("texto7");
  });

  it("registra eventos on*", () => {
    const onClick = vi.fn();
    const element = h("button", { onclick: onClick });
    element.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("aplica propriedades de DOM e ignora valores vazios", () => {
    const input = h("input", { value: "abc", disabled: true, placeholder: null, hidden: false });
    expect(input.value).toBe("abc");
    expect(input.disabled).toBe(true);
    expect(input.hasAttribute("placeholder")).toBe(false);
  });

  it("aceita dataset, aria e style", () => {
    const element = h("span", { dataset: { kind: "x" }, aria: { label: "rótulo", hidden: false }, style: { "--cor": "red" } });
    expect(element.dataset.kind).toBe("x");
    expect(element.getAttribute("aria-label")).toBe("rótulo");
    expect(element.hasAttribute("aria-hidden")).toBe(false);
    expect(element.style.getPropertyValue("--cor")).toBe("red");
  });

  it("atributo booleano verdadeiro vira atributo vazio", () => {
    expect(h("div", { "data-ativo": true }).getAttribute("data-ativo")).toBe("");
  });

  it("não interpreta HTML nos filhos", () => {
    const element = h("div", null, "<b>x</b>");
    expect(element.children.length).toBe(0);
  });
});

describe("uid", () => {
  it("gera ids únicos com o prefixo", () => {
    const first = uid("t");
    const second = uid("t");
    expect(first).not.toBe(second);
    expect(first.startsWith("t-")).toBe(true);
  });
});

describe("clamp", () => {
  it("limita ao intervalo", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe("shortenPath", () => {
  it("mantém caminhos curtos", () => {
    expect(shortenPath("C:\\a\\b")).toBe("C:\\a\\b");
  });

  it("abrevia caminhos do Windows", () => {
    expect(shortenPath("C:\\Users\\Jose\\Videos\\musicas")).toBe("…\\Videos\\musicas");
  });

  it("abrevia caminhos POSIX", () => {
    expect(shortenPath("/home/jose/videos/musicas", 2)).toBe("…/videos/musicas");
  });
});

describe("shortcutLabel", () => {
  it("usa Ctrl fora do macOS", () => {
    expect(shortcutLabel("L")).toBe("Ctrl+L");
  });
});

describe("safeStorage", () => {
  it("lê, grava e remove", () => {
    safeStorageSet("chave", "valor");
    expect(safeStorageGet("chave")).toBe("valor");
    safeStorageRemove("chave");
    expect(safeStorageGet("chave")).toBeNull();
  });

  it("não lança quando o armazenamento está indisponível", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(safeStorageGet("x")).toBeNull();
    spy.mockRestore();

    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => safeStorageSet("x", "y")).not.toThrow();
    setSpy.mockRestore();
  });
});
