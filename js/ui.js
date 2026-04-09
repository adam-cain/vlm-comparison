/**
 * ui.js
 *
 * General UI interactions: pane resizer, live/benchmark mode toggle,
 * prompt-engineering modal, and memory-warning display.
 */

import state from "./state.js";
import { saveSettings, updateCustomIntervalVisibility } from "./utils.js";
import { validateBenchmarkReady } from "./benchmark.js";

// ---------------------------------------------------------------------------
// Pane resizer
// ---------------------------------------------------------------------------

/**
 * Attach mouse-event listeners that let the user drag the horizontal
 * resizer bar to adjust the top/bottom pane split.
 */
export function initResizer() {
  const resizer = document.getElementById("resizer");
  const topPane = document.getElementById("topPane");
  const bottomPane = document.getElementById("bottomPane");
  let isResizing = false;

  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    resizer.classList.add("resizing");
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    const containerRect = document.querySelector(".app-container").getBoundingClientRect();
    const containerHeight = containerRect.height;
    const resizerHeight = resizer.offsetHeight;
    const mouseY = e.clientY - containerRect.top;

    const minTopHeight = 100;
    const minBottomHeight = 150;
    const maxTopHeight = containerHeight - minBottomHeight - resizerHeight;
    const newTopHeight = Math.max(minTopHeight, Math.min(mouseY, maxTopHeight));

    topPane.style.flex = "none";
    topPane.style.height = newTopHeight + "px";
    bottomPane.style.flex = "1";
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  });
}

// ---------------------------------------------------------------------------
// Mode toggle (Live ↔ Benchmark)
// ---------------------------------------------------------------------------

/**
 * Switch between "live" and "benchmark" application modes, toggling
 * the appropriate panels.
 *
 * @param {"live"|"benchmark"} newMode
 */
export function toggleMode(newMode) {
  if (state.appMode === newMode) return;

  if (state.isProcessing) {
    alert("Please stop processing before switching modes.");
    return;
  }
  if (state.benchmarkSession && state.benchmarkSession.status === "running") {
    alert("Please wait for or cancel the benchmark before switching modes.");
    return;
  }

  state.appMode = newMode;

  const liveModeBtn = document.getElementById("liveModeBtn");
  const benchmarkModeBtn = document.getElementById("benchmarkModeBtn");
  const liveModeControls = document.getElementById("liveModeControls");
  const benchmarkPanel = document.getElementById("benchmarkPanel");
  const responseSection = document.getElementById("responseSection");
  const resultsContainer = document.getElementById("resultsContainer");

  if (state.appMode === "live") {
    liveModeBtn.classList.add("active");
    benchmarkModeBtn.classList.remove("active");
    liveModeControls.classList.remove("hidden");
    benchmarkPanel.classList.add("hidden");
    responseSection.classList.remove("hidden");
    resultsContainer.classList.add("hidden");
  } else {
    liveModeBtn.classList.remove("active");
    benchmarkModeBtn.classList.add("active");
    liveModeControls.classList.add("hidden");
    benchmarkPanel.classList.remove("hidden");
    responseSection.classList.add("hidden");
    if (
      state.benchmarkSession &&
      state.benchmarkSession.results &&
      state.benchmarkSession.results.length > 0
    ) {
      resultsContainer.classList.remove("hidden");
    }
  }

  validateBenchmarkReady();
}

// ---------------------------------------------------------------------------
// Prompt-engineering modal
// ---------------------------------------------------------------------------

export function openPromptModal() {
  const instructionText = document.getElementById("instructionText");
  document.getElementById("systemPromptInput").value = state.systemPrompt;
  document.getElementById("userInstructionInput").value = instructionText.value;
  updatePromptCharCounts();
  document.getElementById("promptModal").classList.remove("hidden");
}

export function closePromptModal() {
  document.getElementById("promptModal").classList.add("hidden");
}

export function applyPromptSettings() {
  const instructionText = document.getElementById("instructionText");
  state.systemPrompt = document.getElementById("systemPromptInput").value.trim();
  instructionText.value =
    document.getElementById("userInstructionInput").value.trim() || "What do you see?";

  const preview = instructionText.value;
  const tooltip =
    (state.systemPrompt ? "[System] " + state.systemPrompt + "\n" : "") + preview;

  document.getElementById("promptPreviewText").textContent = preview;
  document.getElementById("promptPreviewText").title = tooltip;
  document.getElementById("benchmarkPromptPreview").textContent = preview;
  document.getElementById("benchmarkPromptPreview").title = tooltip;

  saveSettings();
  closePromptModal();
}

export function applyPreset(btn) {
  document.getElementById("systemPromptInput").value = btn.dataset.system || "";
  document.getElementById("userInstructionInput").value = btn.dataset.instruction || "";
  updatePromptCharCounts();
}

export function updatePromptCharCounts() {
  const sysVal = document.getElementById("systemPromptInput").value;
  const usrVal = document.getElementById("userInstructionInput").value;
  document.getElementById("systemPromptCharCount").textContent = sysVal.length + " chars";
  document.getElementById("userInstructionCharCount").textContent = usrVal.length + " chars";
}
