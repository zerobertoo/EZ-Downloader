import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dateTimePicker, type DateTimePickerControl } from "./datetime-picker";

// 15/11/2026, 10:30 local: dia 15 é domingo, então a grade de novembro começa sem células em branco.
const NOW = new Date(2026, 10, 15, 10, 30, 0);

function mount(onChange?: (value: Date | null) => void): DateTimePickerControl {
  const control = dateTimePicker({ label: "Agendar", onChange });
  document.body.appendChild(control.element);
  return control;
}

const popoverNode = () => document.querySelector<HTMLElement>(".popover");
const title = () => document.querySelector(".datepicker__title")!.textContent;
const dayButton = (day: number) => document.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)!;
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const timeOf = (label: string) => document.querySelector(`output[aria-label="${label}"]`)!.textContent;
const footerButton = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".datepicker__foot button")).find((node) => node.textContent?.includes(label))!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("dateTimePicker: gatilho", () => {
  it("começa vazio, com o placeholder", () => {
    const control = mount();
    expect(control.value).toBeNull();
    const text = control.trigger.querySelector(".select__value")!;
    expect(text.textContent).toBe("Escolher data e hora");
    expect(text.classList.contains("is-placeholder")).toBe(true);
  });

  it("respeita um placeholder personalizado", () => {
    const control = dateTimePicker({ label: "x", placeholder: "Quando?" });
    expect(control.trigger.textContent).toContain("Quando?");
  });

  it("setValue mostra a data formatada e é silencioso por padrão", () => {
    const onChange = vi.fn();
    const control = mount(onChange);
    control.setValue(new Date(2026, 11, 3, 7, 5));
    expect(control.trigger.textContent).toContain("03/12/2026 às 07:05");
    expect(onChange).not.toHaveBeenCalled();

    control.setValue(null, false);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(control.trigger.textContent).toContain("Escolher data e hora");
  });
});

describe("dateTimePicker: abertura", () => {
  it("abre ao clicar e mostra o mês atual", () => {
    const control = mount();
    control.trigger.click();
    expect(popoverNode()).not.toBeNull();
    expect(title()).toBe("novembro de 2026");
    expect(control.trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("desabilita os dias passados e mantém hoje habilitado", () => {
    const control = mount();
    control.trigger.click();
    expect(dayButton(14).disabled).toBe(true);
    expect(dayButton(1).disabled).toBe(true);
    expect(dayButton(15).disabled).toBe(false);
    expect(dayButton(30).disabled).toBe(false);
    expect(dayButton(15).classList.contains("is-today")).toBe(true);
  });

  it("o rascunho inicial é daqui a 30 minutos", () => {
    const control = mount();
    control.trigger.click();
    expect(timeOf("hora")).toBe("11");
    expect(timeOf("minuto")).toBe("00");
    expect(dayButton(15).getAttribute("aria-selected")).toBe("true");
  });

  it("gera 30 células de dia em novembro e 31 em dezembro", () => {
    const control = mount();
    control.trigger.click();
    expect(document.querySelectorAll(".datepicker__day")).toHaveLength(30);
    byLabel("Próximo mês").click();
    expect(title()).toBe("dezembro de 2026");
    expect(document.querySelectorAll(".datepicker__day")).toHaveLength(31);
  });
});

describe("dateTimePicker: navegação", () => {
  it("troca de mês e vira o ano", () => {
    const control = mount();
    control.trigger.click();
    byLabel("Próximo mês").click();
    byLabel("Próximo mês").click();
    expect(title()).toBe("janeiro de 2027");
    byLabel("Mês anterior").click();
    byLabel("Mês anterior").click();
    byLabel("Mês anterior").click();
    expect(title()).toBe("outubro de 2026");
  });

  it("setas movem o dia, atravessando o fim do mês", () => {
    const control = mount();
    control.trigger.click();
    dayButton(15).focus();
    const press = (key: string) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

    press("ArrowRight");
    expect(document.activeElement).toBe(dayButton(16));
    press("ArrowDown");
    expect(document.activeElement).toBe(dayButton(23));
    press("ArrowDown");
    expect(document.activeElement).toBe(dayButton(30));
    press("ArrowRight");
    expect(title()).toBe("dezembro de 2026");
    expect(document.activeElement).toBe(dayButton(1));
    press("ArrowLeft");
    expect(title()).toBe("novembro de 2026");
    expect(document.activeElement).toBe(dayButton(30));
  });

  it("tecla que não é de navegação é ignorada", () => {
    const control = mount();
    control.trigger.click();
    dayButton(15).focus();
    dayButton(15).dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(title()).toBe("novembro de 2026");
  });
});

describe("dateTimePicker: hora e minuto", () => {
  it("incrementa e decrementa com volta nos limites", () => {
    const control = mount();
    control.trigger.click();
    byLabel("Diminuir minuto").click();
    expect(timeOf("minuto")).toBe("59");
    byLabel("Aumentar minuto").click();
    expect(timeOf("minuto")).toBe("00");

    for (let step = 0; step < 13; step++) byLabel("Aumentar hora").click();
    expect(timeOf("hora")).toBe("00");
    byLabel("Diminuir hora").click();
    expect(timeOf("hora")).toBe("23");
  });
});

describe("dateTimePicker: confirmar e limpar", () => {
  it("confirmar devolve a data e a hora escolhidas e fecha o painel", () => {
    const onChange = vi.fn();
    const control = mount(onChange);
    control.trigger.click();
    dayButton(20).click();
    byLabel("Aumentar hora").click();
    footerButton("Confirmar").click();

    const chosen = control.value!;
    expect(chosen.getFullYear()).toBe(2026);
    expect(chosen.getMonth()).toBe(10);
    expect(chosen.getDate()).toBe(20);
    expect(chosen.getHours()).toBe(12);
    expect(chosen.getMinutes()).toBe(0);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(chosen);
    expect(control.trigger.textContent).toContain("20/11/2026 às 12:00");
    expect(popoverNode()).toBeNull();
  });

  it("limpar zera o valor e avisa com null", () => {
    const onChange = vi.fn();
    const control = mount(onChange);
    control.setValue(new Date(2026, 11, 3, 7, 5));
    control.trigger.click();
    footerButton("Limpar").click();
    expect(control.value).toBeNull();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("ao reabrir, mostra o mês e a hora do valor já escolhido", () => {
    const control = mount();
    control.setValue(new Date(2027, 1, 9, 8, 45));
    control.trigger.click();
    expect(title()).toBe("fevereiro de 2027");
    expect(timeOf("hora")).toBe("08");
    expect(timeOf("minuto")).toBe("45");
    expect(dayButton(9).getAttribute("aria-selected")).toBe("true");
  });

  it("Esc fecha sem alterar o valor", () => {
    const onChange = vi.fn();
    const control = mount(onChange);
    control.trigger.click();
    dayButton(25).click();
    document.querySelector(".popover")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(popoverNode()).toBeNull();
    expect(control.value).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
