import { afterEach } from "vitest";

// O jsdom não implementa scrollIntoView, que os componentes usam para acompanhar o item ativo.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  document.body.innerHTML = "";
});
