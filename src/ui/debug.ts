import type { DebugLine } from "../bridge";
import { elements, state } from "../state";
import { toggle } from "../utils";

/* ════════════════════════════════════════════════════════════════
   MODO NERD — comando montado + log ao vivo
   ════════════════════════════════════════════════════════════════ */

const DEBUG_LOG_MAX_LINES = 500;

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

export function clearDebugLog() {
  state.debugLines = [];
  if (elements.debugCommand) elements.debugCommand.textContent = "";
  if (elements.debugLog) elements.debugLog.innerHTML = "";
}

export function showDebugCommand(command: string) {
  if (elements.debugCommand) elements.debugCommand.textContent = command;
}

export function appendDebugLine(line: DebugLine) {
  state.debugLines.push(line);
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
