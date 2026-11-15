import { beforeEach, describe, expect, it } from "vitest";
import { prefs } from "./prefs";

beforeEach(() => localStorage.clear());

describe("prefs", () => {
  it("formato rápido padrão é mp4 e valor desconhecido cai nele", () => {
    expect(prefs.quickFormat).toBe("mp4");
    localStorage.setItem("ez-quick-format", "avi");
    expect(prefs.quickFormat).toBe("mp4");
  });

  it("guarda mp3", () => {
    prefs.quickFormat = "mp3";
    expect(prefs.quickFormat).toBe("mp3");
  });

  it("navegador de cookies só aceita valores conhecidos", () => {
    expect(prefs.cookiesBrowser).toBe("");
    prefs.cookiesBrowser = "firefox";
    expect(prefs.cookiesBrowser).toBe("firefox");
    localStorage.setItem("ez-cookies-browser", "netscape");
    expect(prefs.cookiesBrowser).toBe("");
  });

  it("flags começam desligadas e persistem", () => {
    expect(prefs.pasteToDownload).toBe(false);
    prefs.pasteToDownload = true;
    expect(prefs.pasteToDownload).toBe(true);
    prefs.pasteToDownload = false;
    expect(prefs.pasteToDownload).toBe(false);

    prefs.autoOptimize = true;
    prefs.technicalOpen = true;
    expect(prefs.autoOptimize).toBe(true);
    expect(prefs.technicalOpen).toBe(true);
  });
});
