import { beforeEach, describe, expect, it } from "vitest";
import { currentMode, initMode, setMode } from "./mode";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});

describe("mode", () => {
  it("começa no modo Básico", () => {
    expect(initMode()).toBe("basic");
    expect(document.getElementById("app")!.dataset.mode).toBe("basic");
  });

  it("restaura o modo salvo", () => {
    localStorage.setItem("ez-mode", "advanced");
    expect(initMode()).toBe("advanced");
  });

  it("ignora valor salvo inválido", () => {
    localStorage.setItem("ez-mode", "turbo");
    expect(initMode()).toBe("basic");
  });

  it("setMode aplica e persiste", () => {
    setMode("advanced");
    expect(currentMode()).toBe("advanced");
    expect(localStorage.getItem("ez-mode")).toBe("advanced");
  });

  it("currentMode devolve o padrão sem o elemento #app", () => {
    document.body.innerHTML = "";
    expect(currentMode()).toBe("basic");
  });
});
