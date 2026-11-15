import { h, uid } from "./dom";
import { icon } from "./icons";
import { layerRoot, placeBelow } from "./layer";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  detail?: string;
}

export interface SelectOptions {
  label: string;
  options: SelectOption[];
  value?: string;
  placeholder?: string;
  id?: string;
  onChange?: (value: string) => void;
  mono?: boolean;
}

export interface SelectControl {
  element: HTMLButtonElement;
  readonly value: string;
  setValue(value: string, silent?: boolean): void;
  setOptions(options: SelectOption[], value?: string): void;
  setDisabled(disabled: boolean): void;
}

/**
 * Select próprio (botão + listbox): mesmo visual e mesmo teclado em qualquer sistema.
 * Setas, Home/End, Enter/Espaço, Esc e digitar para pular ao item (typeahead).
 */
export function select(config: SelectOptions): SelectControl {
  let options = config.options;
  let current = config.value ?? options[0]?.value ?? "";
  let activeIndex = -1;
  let opened = false;
  let typeBuffer = "";
  let typeTimer: ReturnType<typeof setTimeout> | null = null;

  const listId = uid("listbox");
  const valueText = h("span", { class: "select__value" });
  const trigger = h(
    "button",
    {
      type: "button",
      class: ["select", config.mono && "select--mono"],
      id: config.id ?? uid("select"),
      role: "combobox",
      "aria-label": config.label,
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-controls": listId,
    },
    valueText,
    h("span", { class: "select__chevron" }, icon("chevron-down", 16))
  );
  const list = h("div", { class: "select__list", role: "listbox", id: listId, tabindex: "-1", "aria-label": config.label });
  const panel = h("div", { class: "popover popover--list", "data-layer": "" }, list);

  function labelOf(value: string): string {
    return options.find((option) => option.value === value)?.label ?? config.placeholder ?? "";
  }

  function paintValue() {
    valueText.textContent = labelOf(current);
    valueText.classList.toggle("is-placeholder", !options.some((option) => option.value === current));
  }

  function buildList() {
    list.replaceChildren();
    let lastGroup: string | undefined;
    options.forEach((option, index) => {
      if (option.group && option.group !== lastGroup) {
        list.appendChild(h("div", { class: "select__group", role: "presentation" }, option.group));
      }
      lastGroup = option.group;
      list.appendChild(
        h(
          "div",
          {
            class: "select__option",
            role: "option",
            id: `${listId}-${index}`,
            "aria-selected": String(option.value === current),
            dataset: { index: String(index) },
            onPointermove: () => setActive(index, false),
            onClick: () => commit(index),
          },
          h("span", { class: "select__option-label" }, option.label),
          option.detail ? h("span", { class: "select__option-detail" }, option.detail) : null,
          option.value === current ? h("span", { class: "select__check" }, icon("check", 14)) : null
        )
      );
    });
  }

  function setActive(index: number, scroll = true) {
    activeIndex = Math.min(Math.max(index, 0), options.length - 1);
    list.querySelectorAll(".select__option").forEach((node, position) => node.classList.toggle("is-active", position === activeIndex));
    const node = list.querySelector<HTMLElement>(`#${listId}-${activeIndex}`);
    if (node) {
      trigger.setAttribute("aria-activedescendant", node.id);
      if (scroll) node.scrollIntoView({ block: "nearest" });
    }
  }

  function reposition() {
    const placement = placeBelow(trigger, list.scrollHeight + 12, { matchWidth: true, minWidth: 160, gap: 6 });
    panel.style.top = `${Math.round(placement.top)}px`;
    panel.style.left = `${Math.round(placement.left)}px`;
    panel.style.width = `${Math.round(placement.width ?? trigger.offsetWidth)}px`;
    panel.style.maxHeight = `${Math.round(placement.maxHeight)}px`;
    panel.dataset.placement = placement.above ? "top" : "bottom";
  }

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (panel.contains(target) || trigger.contains(target)) return;
    close(false);
  };

  function open() {
    if (opened || trigger.disabled) return;
    opened = true;
    buildList();
    layerRoot().appendChild(panel);
    trigger.setAttribute("aria-expanded", "true");
    reposition();
    requestAnimationFrame(() => panel.classList.add("is-open"));
    setActive(Math.max(0, options.findIndex((option) => option.value === current)));
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
  }

  function close(returnFocus = true) {
    if (!opened) return;
    opened = false;
    panel.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    panel.remove();
    if (returnFocus) trigger.focus({ preventScroll: true });
  }

  function commit(index: number) {
    const option = options[index];
    if (!option) return;
    const changed = option.value !== current;
    current = option.value;
    paintValue();
    close(true);
    if (changed) config.onChange?.(current);
  }

  function typeahead(character: string) {
    typeBuffer += character.toLowerCase();
    if (typeTimer) clearTimeout(typeTimer);
    typeTimer = setTimeout(() => (typeBuffer = ""), 600);
    const from = opened ? activeIndex : options.findIndex((option) => option.value === current);
    const ordered = [...options.keys()].map((_, offset) => (from + 1 + offset) % options.length);
    const match = ordered.find((index) => options[index].label.toLowerCase().startsWith(typeBuffer));
    if (match === undefined) return;
    if (opened) setActive(match);
    else {
      current = options[match].value;
      paintValue();
      config.onChange?.(current);
    }
  }

  trigger.addEventListener("click", () => (opened ? close(true) : open()));
  trigger.addEventListener("blur", (event) => {
    const next = event.relatedTarget as Node | null;
    if (opened && !(next && panel.contains(next))) close(false);
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (!opened) open();
        else setActive(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
        break;
      case "Home":
        if (opened) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (opened) {
          event.preventDefault();
          setActive(options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (opened) commit(activeIndex);
        else open();
        break;
      case "Escape":
        if (opened) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
        break;
      case "Tab":
        if (opened) close(false);
        break;
      default:
        if (event.key.length === 1) typeahead(event.key);
    }
  });

  paintValue();

  return {
    element: trigger,
    get value() {
      return current;
    },
    setValue(value, silent = true) {
      current = value;
      paintValue();
      if (!silent) config.onChange?.(value);
    },
    setOptions(next, value) {
      options = next;
      if (value !== undefined) current = value;
      else if (!options.some((option) => option.value === current)) current = options[0]?.value ?? "";
      paintValue();
    },
    setDisabled(disabled) {
      trigger.disabled = disabled;
      if (disabled) close(false);
    },
  };
}
