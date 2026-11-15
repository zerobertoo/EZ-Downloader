import { beforeEach, describe, expect, it } from "vitest";
import { THEMES, currentThemeId, initTheme, resolveTheme, setTheme } from "./theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = '<link id="favicon" rel="icon" href="">';
});

describe("theme", () => {
  it("usa o tema salvo", () => {
    localStorage.setItem("ez-theme", "violet");
    expect(resolveTheme().id).toBe("violet");
  });

  it("sem tema salvo (ou inválido) sorteia um tema existente", () => {
    localStorage.setItem("ez-theme", "inexistente");
    expect(THEMES.map((theme) => theme.id)).toContain(resolveTheme().id);
  });

  it("initTheme aplica atributo e favicon", () => {
    localStorage.setItem("ez-theme", "azure");
    initTheme();
    expect(currentThemeId()).toBe("azure");
    const favicon = document.getElementById("favicon") as HTMLLinkElement;
    expect(decodeURIComponent(favicon.href)).toContain("#38bdf8");
  });

  it("setTheme persiste e ignora id inválido", () => {
    setTheme("rose");
    expect(localStorage.getItem("ez-theme")).toBe("rose");
    setTheme("nao-existe");
    expect(currentThemeId()).toBe("rose");
  });

  it("currentThemeId cai no primeiro tema sem atributo", () => {
    expect(currentThemeId()).toBe(THEMES[0].id);
  });
});
