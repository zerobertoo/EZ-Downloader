let root: HTMLElement | null = null;

/** Camada única para tudo que flutua (popovers, listas, tooltips, diálogos), fora de qualquer overflow. */
export function layerRoot(): HTMLElement {
  if (root && root.isConnected) return root;
  root = document.createElement("div");
  root.id = "layer-root";
  document.body.appendChild(root);
  return root;
}

export function isInsideLayer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-layer]") !== null;
}

export interface Placement {
  top: number;
  left: number;
  width?: number;
  maxHeight: number;
  above: boolean;
}

/** Posiciona um painel junto a um âncora, virando para cima quando falta espaço embaixo. */
export function placeBelow(anchor: HTMLElement, panelHeight: number, options: { align?: "start" | "end"; minWidth?: number; matchWidth?: boolean; gap?: number; panelWidth?: number } = {}): Placement {
  const gap = options.gap ?? 8;
  const rect = anchor.getBoundingClientRect();
  const margin = 12;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const above = panelHeight > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, (above ? spaceAbove : spaceBelow) - gap);
  const height = Math.min(panelHeight, maxHeight);
  const top = above ? rect.top - gap - height : rect.bottom + gap;

  const width = options.matchWidth ? Math.max(rect.width, options.minWidth ?? 0) : options.panelWidth;
  const effectiveWidth = width ?? options.minWidth ?? rect.width;
  let left = options.align === "end" ? rect.right - effectiveWidth : rect.left;
  left = Math.min(Math.max(margin, left), window.innerWidth - effectiveWidth - margin);

  return { top, left, width, maxHeight, above };
}
