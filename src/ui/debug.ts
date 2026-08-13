import type { DebugLine } from "../bridge";
import { elements, state } from "../state";
import { toggle } from "../utils";

/* ════════════════════════════════════════════════════════════════
   MODO NERD — comando montado + log ao vivo do ÚLTIMO download iniciado
   ════════════════════════════════════════════════════════════════ */

const DEBUG_LOG_MAX_LINES = 500;

// O evento "download-debug-command" pode chegar antes da promise de
// start_download resolver (dois canais IPC distintos, sem ordem garantida),
// ou seja, antes de setDebugDownload registrar o id como "atual". Sem isso o
// comando some silenciosamente. Guarda por id até o registro acontecer.
const pendingCommands = new Map<string, string>();
const pendingLines = new Map<string, { stream: "stdout" | "stderr"; text: string }[]>();

export function toggleNerdMode() {
  state.nerdMode = !state.nerdMode;
  elements.nerdModeBtn?.setAttribute("aria-pressed", String(state.nerdMode));
  toggle(elements.debugPanel, state.nerdMode);
  if (state.nerdMode) replayDebugLog();
}

function replayDebugLog() {
  if (!elements.debugLog) return;
  elements.debugLog.innerHTML = "";
  for (const line of state.debugLines) {
    const el = document.createElement("div");
    el.className = "debug-log-line" + (line.stream === "stderr" ? " is-stderr" : "");
    el.textContent = line.text;
    elements.debugLog.appendChild(el);
  }
  elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
}

/** Chamado a cada novo download iniciado — o painel passa a seguir ele. */
export function setDebugDownload(id: string) {
  state.debugDownloadId = id;
  state.debugLines = [];
  if (elements.debugCommand) elements.debugCommand.textContent = "";
  if (elements.debugLog) elements.debugLog.innerHTML = "";

  const pendingCommand = pendingCommands.get(id);
  if (pendingCommand !== undefined) {
    if (elements.debugCommand) elements.debugCommand.textContent = pendingCommand;
    pendingCommands.delete(id);
  }
  const bufferedLines = pendingLines.get(id);
  if (bufferedLines) {
    for (const line of bufferedLines) appendDebugLine({ id, ...line });
    pendingLines.delete(id);
  }
}

export function showDebugCommand(id: string, command: string) {
  if (id !== state.debugDownloadId) {
    pendingCommands.set(id, command);
    return;
  }
  if (elements.debugCommand) elements.debugCommand.textContent = command;
}

export function appendDebugLine(line: DebugLine) {
  if (line.id !== state.debugDownloadId) {
    const buffered = pendingLines.get(line.id) ?? [];
    buffered.push({ stream: line.stream, text: line.text });
    pendingLines.set(line.id, buffered);
    return;
  }

  state.debugLines.push({ stream: line.stream, text: line.text });
  if (state.debugLines.length > DEBUG_LOG_MAX_LINES) {
    state.debugLines.splice(0, state.debugLines.length - DEBUG_LOG_MAX_LINES);
  }
  if (!state.nerdMode || !elements.debugLog) return;

  const el = document.createElement("div");
  el.className = "debug-log-line" + (line.stream === "stderr" ? " is-stderr" : "");
  el.textContent = line.text;
  elements.debugLog.appendChild(el);
  elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
}
