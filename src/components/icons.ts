const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Um traço só, 24x24, arredondado: todos os ícones do app saem daqui para manter o mesmo peso. */
const ICON_PATHS = {
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-up": '<path d="m6 15 6-6 6 6"/>',
  "chevron-left": '<path d="m15 6-6 6 6 6"/>',
  "chevron-right": '<path d="m9 6 6 6-6 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  terminal: '<path d="m5 8 4 4-4 4"/><path d="M12 17h7"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  trash: '<path d="M5 7h14"/><path d="M10 7V5h4v2"/><path d="m7 7 1 12h8l1-12"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5H5V6h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  clipboard: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4h6v1"/><path d="M9 11h6M9 15h4"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3 1.5"/>',
  warning: '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4M12 17v.5"/>',
  sparkle: '<path d="M12 3c.6 4.5 2.5 6.4 7 7-4.5.6-6.4 2.5-7 7-.6-4.5-2.5-6.4-7-7 4.5-.6 6.4-2.5 7-7z"/>',
  film: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l9-11h-6z"/>',
  cassette: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="12.5" r="2"/><circle cx="15.5" cy="12.5" r="2"/><path d="M8.5 8.5h7"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function icon(name: IconName, size = 18, className?: string): SVGSVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, "svg");
  element.setAttribute("viewBox", "0 0 24 24");
  element.setAttribute("width", String(size));
  element.setAttribute("height", String(size));
  element.setAttribute("fill", "none");
  element.setAttribute("stroke", "currentColor");
  element.setAttribute("stroke-width", "2");
  element.setAttribute("stroke-linecap", "round");
  element.setAttribute("stroke-linejoin", "round");
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("focusable", "false");
  if (className) element.setAttribute("class", className);
  element.innerHTML = ICON_PATHS[name];
  return element;
}
