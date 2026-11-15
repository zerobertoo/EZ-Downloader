import { clamp } from "./dom";

export type TapeState = "queued" | "active" | "paused" | "done" | "failed" | "cancelled" | "loading";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LEFT_CENTER = { x: 42, y: 53 };
const RIGHT_CENTER = { x: 78, y: 53 };
const PACK_MAX_RADIUS = 14.2;
const PACK_MIN_RADIUS = 8.2;

export interface TapeControl {
  element: SVGSVGElement;
  update(state: TapeState, percent: number): void;
}

const spokes = (cx: number, cy: number) =>
  [0, 60, 120].map((angle) => `<rect x="${cx - 0.9}" y="${cy - 6}" width="1.8" height="12" rx="0.9" transform="rotate(${angle} ${cx} ${cy})"/>`).join("");

/**
 * Fita VHS desenhada à mão em SVG. O progresso é a fita passando de um carretel ao outro:
 * o pacote da esquerda encolhe e o da direita cresce. Em movimento reduzido os carretéis ficam
 * parados, mas o tamanho dos pacotes continua dizendo quanto falta.
 */
export function createTape(format: string): TapeControl {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 120 76");
  svg.setAttribute("class", "tape");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = `
    <rect class="tape__shell" x="1" y="1" width="118" height="74" rx="8"/>
    <rect class="tape__screw" x="5" y="5" width="3" height="3" rx="1.5"/>
    <rect class="tape__screw" x="112" y="5" width="3" height="3" rx="1.5"/>
    <rect class="tape__label" x="9" y="8" width="102" height="24" rx="3"/>
    <rect class="tape__label-band" x="9" y="8" width="102" height="7" rx="3"/>
    <rect class="tape__label-band tape__label-band--flat" x="9" y="12" width="102" height="3"/>
    <text class="tape__format" x="14" y="27" font-size="9" font-weight="800">${format.replace(/[<>&"]/g, "")}</text>
    <rect class="tape__rule" x="46" y="22" width="58" height="1.2" rx="0.6"/>
    <rect class="tape__rule" x="46" y="26.5" width="42" height="1.2" rx="0.6"/>
    <rect class="tape__window" x="21" y="38" width="78" height="31" rx="15.5"/>
    <circle class="tape__pack tape__pack--left" cx="${LEFT_CENTER.x}" cy="${LEFT_CENTER.y}" r="${PACK_MAX_RADIUS}"/>
    <circle class="tape__pack tape__pack--right" cx="${RIGHT_CENTER.x}" cy="${RIGHT_CENTER.y}" r="${PACK_MIN_RADIUS}"/>
    <path class="tape__strand" d="M${LEFT_CENTER.x + 1} 67.4 L${RIGHT_CENTER.x - 1} 67.4"/>
    <g class="tape__hub tape__hub--left"><circle class="tape__hub-ring" cx="${LEFT_CENTER.x}" cy="${LEFT_CENTER.y}" r="7.4"/><g class="tape__spokes">${spokes(LEFT_CENTER.x, LEFT_CENTER.y)}</g><circle class="tape__hub-core" cx="${LEFT_CENTER.x}" cy="${LEFT_CENTER.y}" r="2.1"/></g>
    <g class="tape__hub tape__hub--right"><circle class="tape__hub-ring" cx="${RIGHT_CENTER.x}" cy="${RIGHT_CENTER.y}" r="7.4"/><g class="tape__spokes">${spokes(RIGHT_CENTER.x, RIGHT_CENTER.y)}</g><circle class="tape__hub-core" cx="${RIGHT_CENTER.x}" cy="${RIGHT_CENTER.y}" r="2.1"/></g>
    <path class="tape__loose" d="M78 67 C 70 76, 60 70, 52 74 S 36 72, 30 75"/>
  `;

  const left = svg.querySelector<SVGCircleElement>(".tape__pack--left")!;
  const right = svg.querySelector<SVGCircleElement>(".tape__pack--right")!;

  return {
    element: svg,
    update(state, percent) {
      const progress = state === "done" ? 1 : clamp(percent, 0, 100) / 100;
      // área da fita se conserva: o raio acompanha a raiz do que sobra e do que foi enrolado
      const radius = (share: number) => Math.sqrt(PACK_MIN_RADIUS ** 2 + (PACK_MAX_RADIUS ** 2 - PACK_MIN_RADIUS ** 2) * share);
      left.setAttribute("r", radius(1 - progress).toFixed(2));
      right.setAttribute("r", radius(progress).toFixed(2));
      svg.dataset.state = state;
    },
  };
}
