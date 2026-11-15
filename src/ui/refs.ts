import type { SegmentedControl } from "../components/segmented";
import type { SelectControl } from "../components/select";
import type { MessageSlot } from "./feedback";
import type { AppMode } from "../mode";

/** Nós e controles que mais de um módulo precisa alcançar; preenchido uma vez por `buildApp`. */
export interface Refs {
  app: HTMLElement;
  urlInput: HTMLInputElement;
  goButton: HTMLButtonElement;
  formatSegmentElement: HTMLElement;
  modeSegment: SegmentedControl<AppMode>;
  message: MessageSlot;
  playlistHint: HTMLElement;
  playlistHintText: HTMLElement;
  destinationPath: HTMLElement;
  offer: HTMLElement;
  offerUrl: HTMLElement;
  offerUse: HTMLButtonElement;
  offerDismiss: HTMLButtonElement;
  loadingPanel: HTMLElement;
  videoPanel: HTMLElement;
  videoThumbnail: HTMLImageElement;
  videoTitle: HTMLElement;
  videoUploader: HTMLElement;
  configPanel: HTMLElement;
  formatSelect: SelectControl;
  formatInfo: HTMLElement;
  downloadButton: HTMLButtonElement;
  selectionPanel: HTMLElement;
  selectionTitle: HTMLElement;
  selectionCount: HTMLElement;
  selectionNote: HTMLElement;
  selectionList: HTMLElement;
  selectionAll: HTMLButtonElement;
  selectionNone: HTMLButtonElement;
  selectionSingle: HTMLButtonElement;
  selectionConfirm: HTMLButtonElement;
  selectionCancel: HTMLButtonElement;
  shelfSection: HTMLElement;
  shelfList: HTMLElement;
  shelfCount: HTMLElement;
  shelfEmpty: HTMLElement;
  historyToggle: () => void;
  historySearch: HTMLInputElement;
  historyList: HTMLElement;
  historyEmpty: HTMLElement;
  historyClear: HTMLButtonElement;
  settingsButton: HTMLButtonElement;
  openSettings: () => void;
  focusConcurrency: () => void;
  applyConcurrency: (value: string) => void;
  version: HTMLElement;
  clipboardSwitch: HTMLInputElement;
}

export const refs = {} as Refs;
