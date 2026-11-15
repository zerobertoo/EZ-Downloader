import { bridge } from "../bridge";
import { UI_STRINGS, elements } from "../state";
import { setFieldError } from "./feedback";

const MIN_CONCURRENT = 1;
const MAX_CONCURRENT = 10;

export function initConcurrencyUI(current: number) {
  const select = elements.maxConcurrentSelect;
  if (!select) return;
  for (let value = MIN_CONCURRENT; value <= MAX_CONCURRENT; value++) {
    select.append(new Option(String(value), String(value)));
  }
  let applied = current;
  select.value = String(applied);

  select.addEventListener("change", async () => {
    try {
      applied = (await bridge.setMaxConcurrent(Number(select.value))).maxConcurrent;
    } catch (error) {
      console.error("Erro ao alterar o limite de downloads:", error);
      setFieldError(elements.urlError, UI_STRINGS.errorMaxConcurrent);
    }
    select.value = String(applied);
  });
}
