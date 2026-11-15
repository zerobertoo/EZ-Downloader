import { button } from "./button";
import { h, uid } from "./dom";
import { icon } from "./icons";
import { popover } from "./popover";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export interface DateTimePickerOptions {
  label: string;
  placeholder?: string;
  onChange?: (value: Date | null) => void;
}

export interface DateTimePickerControl {
  element: HTMLElement;
  trigger: HTMLButtonElement;
  readonly value: Date | null;
  setValue(value: Date | null, silent?: boolean): void;
}

const pad = (value: number) => String(value).padStart(2, "0");

function formatValue(value: Date): string {
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} às ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Seletor de data e hora próprio no lugar do `datetime-local` nativo.
 * Grade de dias navegável por setas (grid ARIA); horas e minutos em passos de botão.
 */
export function dateTimePicker(config: DateTimePickerOptions): DateTimePickerControl {
  let value: Date | null = null;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let draft = new Date();
  draft.setMinutes(draft.getMinutes() + 30, 0, 0);

  const valueText = h("span", { class: "select__value is-placeholder" }, config.placeholder ?? "Escolher data e hora");
  const trigger = h(
    "button",
    { type: "button", class: "select", "aria-label": config.label },
    h("span", { class: "select__lead" }, icon("calendar", 16)),
    valueText,
    h("span", { class: "select__chevron" }, icon("chevron-down", 16))
  );
  const content = h("div", { class: "datepicker" });
  const pop = popover({ anchor: trigger, content, label: config.label, align: "start", width: 292 });

  function paintTrigger() {
    valueText.textContent = value ? formatValue(value) : config.placeholder ?? "Escolher data e hora";
    valueText.classList.toggle("is-placeholder", !value);
  }

  function render() {
    content.replaceChildren();
    const gridId = uid("days");
    const header = h(
      "div",
      { class: "datepicker__head" },
      button({ icon: "chevron-left", variant: "ghost", size: "sm", ariaLabel: "Mês anterior", onClick: () => shiftMonth(-1) }),
      h("strong", { class: "datepicker__title", "aria-live": "polite" }, `${MONTHS[viewMonth]} de ${viewYear}`),
      button({ icon: "chevron-right", variant: "ghost", size: "sm", ariaLabel: "Próximo mês", onClick: () => shiftMonth(1) })
    );

    const grid = h("div", { class: "datepicker__grid", role: "grid", id: gridId, "aria-label": `${MONTHS[viewMonth]} de ${viewYear}` });
    grid.appendChild(
      h("div", { class: "datepicker__row", role: "row" }, ...WEEKDAYS.map((day, index) => h("span", { class: "datepicker__weekday", role: "columnheader", "aria-label": ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][index] }, day)))
    );

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const total = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let row = h("div", { class: "datepicker__row", role: "row" });
    for (let blank = 0; blank < firstDay; blank++) row.appendChild(h("span", { role: "gridcell" }));
    for (let day = 1; day <= total; day++) {
      const date = new Date(viewYear, viewMonth, day);
      const past = date < startOfToday;
      const selected = sameDay(date, draft);
      const cell = h(
        "button",
        {
          type: "button",
          class: ["datepicker__day", selected && "is-selected", sameDay(date, today) && "is-today"],
          role: "gridcell",
          disabled: past,
          tabIndex: selected || (!draftInView() && day === 1) ? 0 : -1,
          "aria-selected": String(selected),
          "aria-label": `${day} de ${MONTHS[viewMonth]} de ${viewYear}`,
          dataset: { day: String(day) },
          onClick: () => {
            draft = new Date(viewYear, viewMonth, day, draft.getHours(), draft.getMinutes());
            render();
            content.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus();
          },
        },
        String(day)
      );
      row.appendChild(cell);
      if ((firstDay + day) % 7 === 0 || day === total) {
        grid.appendChild(row);
        row = h("div", { class: "datepicker__row", role: "row" });
      }
    }
    grid.addEventListener("keydown", onGridKey);

    const stepper = (label: string, current: number, max: number, set: (next: number) => void) =>
      h(
        "div",
        { class: "datepicker__stepper" },
        button({ icon: "chevron-up", variant: "ghost", size: "sm", ariaLabel: `Aumentar ${label}`, onClick: () => { set((current + 1) % (max + 1)); render(); focusStepper(label); } }),
        h("output", { class: "datepicker__time mono", "aria-label": label }, pad(current)),
        button({ icon: "chevron-down", variant: "ghost", size: "sm", ariaLabel: `Diminuir ${label}`, onClick: () => { set((current - 1 + max + 1) % (max + 1)); render(); focusStepper(label); } })
      );

    const time = h(
      "div",
      { class: "datepicker__timebar" },
      icon("clock", 16),
      stepper("hora", draft.getHours(), 23, (next) => draft.setHours(next)),
      h("span", { class: "datepicker__colon", "aria-hidden": "true" }, ":"),
      stepper("minuto", draft.getMinutes(), 59, (next) => draft.setMinutes(next))
    );

    const footer = h(
      "div",
      { class: "datepicker__foot" },
      button({ label: "Limpar", variant: "ghost", size: "sm", onClick: () => commit(null) }),
      button({ label: "Confirmar", variant: "primary", size: "sm", onClick: () => commit(new Date(draft)) })
    );
    content.append(header, grid, time, footer);
  }

  function focusStepper(label: string) {
    content.querySelector<HTMLElement>(`[aria-label="Aumentar ${label}"]`)?.focus();
  }

  function draftInView(): boolean {
    return draft.getFullYear() === viewYear && draft.getMonth() === viewMonth;
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    viewYear = next.getFullYear();
    viewMonth = next.getMonth();
    render();
  }

  function onGridKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const day = Number(target.dataset.day);
    if (!day) return;
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in delta)) return;
    event.preventDefault();
    const next = new Date(viewYear, viewMonth, day + delta[event.key]);
    draft = new Date(next.getFullYear(), next.getMonth(), next.getDate(), draft.getHours(), draft.getMinutes());
    viewYear = next.getFullYear();
    viewMonth = next.getMonth();
    render();
    content.querySelector<HTMLElement>(`[data-day="${next.getDate()}"]`)?.focus();
  }

  function commit(next: Date | null) {
    value = next;
    paintTrigger();
    pop.close(true);
    config.onChange?.(value);
  }

  trigger.addEventListener("click", () => {
    if (!pop.isOpen) {
      const base = value ?? draft;
      viewYear = base.getFullYear();
      viewMonth = base.getMonth();
      if (value) draft = new Date(value);
      render();
    }
    pop.toggle();
  });

  paintTrigger();

  return {
    element: trigger,
    trigger,
    get value() {
      return value;
    },
    setValue(next, silent = true) {
      value = next;
      paintTrigger();
      if (!silent) config.onChange?.(value);
    },
  };
}
