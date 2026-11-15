import { afterEach, describe, expect, it, vi } from "vitest";
import { select, type SelectControl, type SelectOption } from "./select";

const OPTIONS: SelectOption[] = [
  { value: "mp4", label: "MP4" },
  { value: "mp3", label: "MP3" },
  { value: "webm", label: "WebM", detail: "sem áudio" },
];

function mount(overrides: Partial<Parameters<typeof select>[0]> = {}): SelectControl {
  const control = select({ label: "Formato", options: OPTIONS, ...overrides });
  document.body.appendChild(control.element);
  return control;
}

function press(control: SelectControl, key: string) {
  control.element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const optionNodes = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
const activeLabel = () => document.querySelector(".select__option.is-active .select__option-label")?.textContent;

afterEach(() => vi.useRealTimers());

describe("select: estado inicial", () => {
  it("mostra o rótulo da primeira opção por padrão", () => {
    const control = mount();
    expect(control.value).toBe("mp4");
    expect(control.element.textContent).toContain("MP4");
  });

  it("respeita o valor inicial", () => {
    expect(mount({ value: "mp3" }).value).toBe("mp3");
  });

  it("valor fora da lista mostra o placeholder", () => {
    const control = mount({ value: "xyz", placeholder: "Escolha" });
    const text = control.element.querySelector(".select__value")!;
    expect(text.textContent).toBe("Escolha");
    expect(text.classList.contains("is-placeholder")).toBe(true);
  });

  it("expõe atributos de acessibilidade do combobox", () => {
    const { element } = mount();
    expect(element.getAttribute("role")).toBe("combobox");
    expect(element.getAttribute("aria-label")).toBe("Formato");
    expect(element.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("select: abrir e fechar", () => {
  it("abre com clique e monta a lista de opções", () => {
    const control = mount();
    control.element.click();
    expect(control.element.getAttribute("aria-expanded")).toBe("true");
    expect(optionNodes().map((node) => node.querySelector(".select__option-label")!.textContent)).toEqual(["MP4", "MP3", "WebM"]);
    expect(optionNodes()[2].querySelector(".select__option-detail")!.textContent).toBe("sem áudio");
  });

  it("marca a opção atual como selecionada e ativa", () => {
    const control = mount({ value: "mp3" });
    control.element.click();
    expect(optionNodes().map((node) => node.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(activeLabel()).toBe("MP3");
  });

  it("clicar de novo fecha e devolve o foco ao botão", () => {
    const control = mount();
    control.element.click();
    control.element.click();
    expect(listbox()).toBeNull();
    expect(control.element.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(control.element);
  });

  it("Esc fecha sem mudar o valor", () => {
    const onChange = vi.fn();
    const control = mount({ onChange });
    control.element.click();
    press(control, "ArrowDown");
    press(control, "Escape");
    expect(listbox()).toBeNull();
    expect(control.value).toBe("mp4");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clique fora fecha a lista", () => {
    const control = mount();
    control.element.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(listbox()).toBeNull();
  });

  it("Tab fecha a lista", () => {
    const control = mount();
    control.element.click();
    press(control, "Tab");
    expect(listbox()).toBeNull();
  });

  it("desabilitado não abre e fechar ao desabilitar", () => {
    const control = mount();
    control.setDisabled(true);
    control.element.click();
    expect(listbox()).toBeNull();

    control.setDisabled(false);
    control.element.click();
    expect(listbox()).not.toBeNull();
    control.setDisabled(true);
    expect(listbox()).toBeNull();
  });
});

describe("select: seleção", () => {
  it("clicar numa opção troca o valor, fecha e avisa", () => {
    const onChange = vi.fn();
    const control = mount({ onChange });
    control.element.click();
    optionNodes()[1].click();
    expect(control.value).toBe("mp3");
    expect(control.element.textContent).toContain("MP3");
    expect(listbox()).toBeNull();
    expect(onChange).toHaveBeenCalledExactlyOnceWith("mp3");
  });

  it("escolher a opção já selecionada não dispara onChange", () => {
    const onChange = vi.fn();
    const control = mount({ onChange });
    control.element.click();
    optionNodes()[0].click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("agrupa opções com cabeçalho por grupo", () => {
    const control = mount({
      options: [
        { value: "a", label: "A", group: "Vídeo" },
        { value: "b", label: "B", group: "Vídeo" },
        { value: "c", label: "C", group: "Áudio" },
      ],
    });
    control.element.click();
    expect(Array.from(document.querySelectorAll(".select__group")).map((node) => node.textContent)).toEqual(["Vídeo", "Áudio"]);
  });
});

describe("select: teclado", () => {
  it("ArrowDown abre; setas e Home/End movem o item ativo", () => {
    const control = mount();
    press(control, "ArrowDown");
    expect(listbox()).not.toBeNull();
    expect(activeLabel()).toBe("MP4");

    press(control, "ArrowDown");
    expect(activeLabel()).toBe("MP3");
    press(control, "End");
    expect(activeLabel()).toBe("WebM");
    press(control, "ArrowDown");
    expect(activeLabel()).toBe("WebM");
    press(control, "Home");
    expect(activeLabel()).toBe("MP4");
    press(control, "ArrowUp");
    expect(activeLabel()).toBe("MP4");
  });

  it("aria-activedescendant acompanha o item ativo", () => {
    const control = mount();
    press(control, "ArrowDown");
    press(control, "ArrowDown");
    const activeId = control.element.getAttribute("aria-activedescendant");
    expect(document.getElementById(activeId!)?.textContent).toContain("MP3");
  });

  it("Enter confirma o item ativo", () => {
    const onChange = vi.fn();
    const control = mount({ onChange });
    press(control, "Enter");
    press(control, "ArrowDown");
    press(control, "Enter");
    expect(control.value).toBe("mp3");
    expect(onChange).toHaveBeenCalledWith("mp3");
    expect(listbox()).toBeNull();
  });

  it("Espaço abre a lista", () => {
    const control = mount();
    press(control, " ");
    expect(listbox()).not.toBeNull();
  });

  it("combinações com Ctrl são ignoradas", () => {
    const control = mount();
    control.element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", ctrlKey: true, bubbles: true }));
    expect(listbox()).toBeNull();
  });

  it("digitar uma letra com a lista fechada pula para a opção", () => {
    const onChange = vi.fn();
    const control = mount({ onChange });
    press(control, "w");
    expect(control.value).toBe("webm");
    expect(onChange).toHaveBeenCalledWith("webm");
  });

  it("digitar com a lista aberta só move o item ativo", () => {
    const onChange = vi.fn();
    const control = mount({ onChange });
    press(control, "ArrowDown");
    press(control, "w");
    expect(activeLabel()).toBe("WebM");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("letra sem correspondência é ignorada e o buffer expira depois de 600ms", () => {
    vi.useFakeTimers();
    const control = mount();
    press(control, "z");
    expect(control.value).toBe("mp4");

    // sem esperar, o buffer vira "zm" e nada casa
    press(control, "m");
    expect(control.value).toBe("mp4");

    vi.advanceTimersByTime(700);
    press(control, "m");
    expect(control.value).toBe("mp3");
  });

  it("letras seguidas formam um prefixo", () => {
    vi.useFakeTimers();
    const control = mount({ options: [{ value: "a", label: "Alfa" }, { value: "b", label: "Beta" }, { value: "c", label: "Bravo" }] });
    press(control, "b");
    press(control, "r");
    expect(control.value).toBe("c");
  });
});

describe("select: API", () => {
  it("setValue é silencioso por padrão e avisa quando pedido", () => {
    const onChange = vi.fn();
    const control = mount({ onChange });
    control.setValue("mp3");
    expect(control.value).toBe("mp3");
    expect(onChange).not.toHaveBeenCalled();
    control.setValue("webm", false);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("webm");
  });

  it("setOptions mantém o valor se ainda existe, senão cai na primeira opção", () => {
    const control = mount({ value: "mp3" });
    control.setOptions([{ value: "mp3", label: "MP3 novo" }, { value: "ogg", label: "OGG" }]);
    expect(control.value).toBe("mp3");
    expect(control.element.textContent).toContain("MP3 novo");

    control.setOptions([{ value: "ogg", label: "OGG" }]);
    expect(control.value).toBe("ogg");
  });

  it("setOptions com valor explícito troca a seleção", () => {
    const control = mount();
    control.setOptions(OPTIONS, "webm");
    expect(control.value).toBe("webm");
  });

  it("lista vazia gera valor vazio", () => {
    const control = mount({ options: [] });
    expect(control.value).toBe("");
    control.element.click();
    expect(optionNodes()).toHaveLength(0);
  });
});
