import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmDialog, openDialog } from "./dialog";

const dialogNode = () => document.querySelector<HTMLElement>('[role="alertdialog"]');
const scrimNode = () => document.querySelector<HTMLElement>(".scrim");
const buttonByLabel = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".dialog__actions button")).find((node) => node.textContent?.includes(label))!;

function pressEscape() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

afterEach(() => vi.useRealTimers());

describe("openDialog", () => {
  it("renderiza título, corpo e ações com semântica de alertdialog", () => {
    void openDialog({
      title: "Apagar?",
      body: "Isso não pode ser desfeito",
      actions: [
        { label: "Cancelar", value: "cancel", variant: "ghost" },
        { label: "Apagar", value: "delete", variant: "danger" },
      ],
    });
    const dialog = dialogNode()!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.querySelector(".dialog__title")!.textContent).toBe("Apagar?");
    expect(dialog.querySelector(".dialog__body")!.textContent).toBe("Isso não pode ser desfeito");
    expect(dialog.getAttribute("aria-labelledby")).toBe(dialog.querySelector(".dialog__title")!.id);
    expect(dialog.getAttribute("aria-describedby")).toBe(dialog.querySelector(".dialog__body")!.id);
    expect(dialog.querySelectorAll(".dialog__actions button")).toHaveLength(2);
  });

  it("aceita um elemento como corpo", () => {
    const body = document.createElement("strong");
    body.textContent = "negrito";
    void openDialog({ title: "T", body, actions: [{ label: "Ok", value: "ok" }] });
    expect(dialogNode()!.querySelector(".dialog__body strong")).toBe(body);
  });

  it("clicar numa ação resolve com o valor dela e remove o diálogo", async () => {
    vi.useFakeTimers();
    const result = openDialog({ title: "T", body: "B", actions: [{ label: "Cancelar", value: "cancel" }, { label: "Sim", value: "yes", variant: "primary" }] });
    buttonByLabel("Sim").click();
    await expect(result).resolves.toBe("yes");
    vi.advanceTimersByTime(400);
    expect(scrimNode()).toBeNull();
  });

  it("Esc resolve com o valor de dispensa explícito", async () => {
    const result = openDialog({ title: "T", body: "B", dismissValue: "fechou", actions: [{ label: "Ok", value: "ok", variant: "primary" }] });
    pressEscape();
    await expect(result).resolves.toBe("fechou");
  });

  it("sem dismissValue, Esc usa a primeira ação neutra", async () => {
    const result = openDialog({
      title: "T",
      body: "B",
      actions: [
        { label: "Apagar", value: "delete", variant: "danger" },
        { label: "Voltar", value: "back", variant: "secondary" },
      ],
    });
    pressEscape();
    await expect(result).resolves.toBe("back");
  });

  it("sem ação neutra, Esc resolve com 'cancel'", async () => {
    const result = openDialog({ title: "T", body: "B", actions: [{ label: "Ok", value: "ok", variant: "primary" }] });
    pressEscape();
    await expect(result).resolves.toBe("cancel");
  });

  it("clicar no fundo dispensa, mas clicar dentro do diálogo não", async () => {
    let settled = false;
    const result = openDialog({ title: "T", body: "B", dismissValue: "fundo", actions: [{ label: "Ok", value: "ok" }] }).then((value) => {
      settled = true;
      return value;
    });
    dialogNode()!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await Promise.resolve();
    expect(settled).toBe(false);
    scrimNode()!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await expect(result).resolves.toBe("fundo");
  });

  it("foca por padrão a primeira ação que não é primária nem perigosa", () => {
    void openDialog({
      title: "T",
      body: "B",
      actions: [
        { label: "Apagar", value: "delete", variant: "danger" },
        { label: "Voltar", value: "back", variant: "ghost" },
      ],
    });
    expect(document.activeElement).toBe(buttonByLabel("Voltar"));
  });

  it("initialFocus escolhe o botão focado", () => {
    void openDialog({
      title: "T",
      body: "B",
      initialFocus: "delete",
      actions: [
        { label: "Apagar", value: "delete", variant: "danger" },
        { label: "Voltar", value: "back", variant: "ghost" },
      ],
    });
    expect(document.activeElement).toBe(buttonByLabel("Apagar"));
  });

  it("devolve o foco a quem abriu o diálogo", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const result = openDialog({ title: "T", body: "B", actions: [{ label: "Ok", value: "ok" }] });
    expect(document.activeElement).not.toBe(opener);
    buttonByLabel("Ok").click();
    await result;
    expect(document.activeElement).toBe(opener);
  });

  it("depois de fechar, Esc não faz mais nada", async () => {
    const result = openDialog({ title: "T", body: "B", actions: [{ label: "Ok", value: "ok" }] });
    buttonByLabel("Ok").click();
    await result;
    expect(() => pressEscape()).not.toThrow();
  });
});

describe("confirmDialog", () => {
  it("confirmar devolve true", async () => {
    const result = confirmDialog({ title: "T", body: "B", confirmLabel: "Baixar de novo" });
    buttonByLabel("Baixar de novo").click();
    await expect(result).resolves.toBe(true);
  });

  it("cancelar e Esc devolvem false", async () => {
    const cancelled = confirmDialog({ title: "T", body: "B", confirmLabel: "Sim" });
    buttonByLabel("Cancelar").click();
    await expect(cancelled).resolves.toBe(false);

    const dismissed = confirmDialog({ title: "T", body: "B", confirmLabel: "Sim" });
    pressEscape();
    await expect(dismissed).resolves.toBe(false);
  });

  it("usa o rótulo de cancelar personalizado e a variante perigosa", () => {
    void confirmDialog({ title: "T", body: "B", confirmLabel: "Apagar", cancelLabel: "Manter", danger: true });
    expect(buttonByLabel("Manter")).toBeDefined();
    expect(buttonByLabel("Apagar").classList.contains("btn--danger")).toBe(true);
  });

  it("o foco inicial cai em Cancelar, não na ação de confirmar", () => {
    void confirmDialog({ title: "T", body: "B", confirmLabel: "Apagar", danger: true });
    expect(document.activeElement).toBe(buttonByLabel("Cancelar"));
  });
});
