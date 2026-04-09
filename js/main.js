/**
 * main.js
 *
 * Application entry point. Imports every feature module, wires DOM
 * event listeners, restores persisted settings, and runs one-time
 * initialisation on DOMContentLoaded.
 */

import state from "./state.js";
import { MODEL_CONFIGS } from "./config.js";
import {
  saveSettings,
  loadSettings,
  updateCustomIntervalVisibility,
  updateBenchmarkCustomIntervalVisibility,
} from "./utils.js";
import {
  handleModelChange,
  updateMemoryWarning,
} from "./model-loader.js";
import { handleStart, handleStop } from "./live-mode.js";
import {
  handleVideoUpload,
  handleScreenShareBtn,
  startRecording,
  stopRecording,
} from "./video-source.js";
import {
  runBenchmark,
  cancelBenchmark,
  updateModelChecklist,
  toggleSelectAllModels,
  validateBenchmarkReady,
} from "./benchmark.js";
import {
  exportToJSON,
  exportToCSV,
  clearBenchmarkResults,
  closeCellModal,
  syncTableToVideo,
} from "./results.js";
import {
  initResizer,
  toggleMode,
  openPromptModal,
  closePromptModal,
  applyPromptSettings,
  applyPreset,
  updatePromptCharCounts,
} from "./ui.js";

// ---------------------------------------------------------------------------
// Prompt modal event listeners
// ---------------------------------------------------------------------------

document.getElementById("openPromptModalBtn").addEventListener("click", openPromptModal);
document.getElementById("benchmarkPromptBtn").addEventListener("click", openPromptModal);
document.getElementById("promptModalClose").addEventListener("click", closePromptModal);
document.getElementById("promptModalCancel").addEventListener("click", closePromptModal);
document.getElementById("promptModalApply").addEventListener("click", applyPromptSettings);

document.getElementById("promptModal").addEventListener("click", (e) => {
  if (e.target.id === "promptModal") closePromptModal();
});

document.getElementById("systemPromptInput").addEventListener("input", updatePromptCharCounts);
document.getElementById("userInstructionInput").addEventListener("input", updatePromptCharCounts);

document.querySelectorAll(".prompt-preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyPreset(btn));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("promptModal").classList.contains("hidden")) {
    closePromptModal();
  }
});

// ---------------------------------------------------------------------------
// Live-mode controls
// ---------------------------------------------------------------------------

document.getElementById("startButton").addEventListener("click", () => {
  if (state.isProcessing) {
    handleStop();
  } else {
    handleStart();
  }
});

document.getElementById("modelSelect").addEventListener("change", () => {
  saveSettings();
  handleModelChange();
});

document.getElementById("intervalSelect").addEventListener("change", () => {
  updateCustomIntervalVisibility();
  saveSettings();
});

document.getElementById("customIntervalInput").addEventListener("input", saveSettings);
document.getElementById("instructionText").addEventListener("input", saveSettings);

// ---------------------------------------------------------------------------
// Video source controls
// ---------------------------------------------------------------------------

document.getElementById("videoFileInput").addEventListener("change", handleVideoUpload);

document.getElementById("uploadVideoBtn").addEventListener("click", () => {
  document.getElementById("videoFileInput").click();
});

document.getElementById("screenShareBtn").addEventListener("click", handleScreenShareBtn);

document.getElementById("recordBtn").addEventListener("click", () => {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// ---------------------------------------------------------------------------
// Mode toggle
// ---------------------------------------------------------------------------

document.getElementById("liveModeBtn").addEventListener("click", () => toggleMode("live"));
document.getElementById("benchmarkModeBtn").addEventListener("click", () => toggleMode("benchmark"));

// ---------------------------------------------------------------------------
// Benchmark controls
// ---------------------------------------------------------------------------

document.getElementById("selectAllModelsBtn").addEventListener("click", toggleSelectAllModels);
document.getElementById("modelChecklist").addEventListener("change", validateBenchmarkReady);
document.getElementById("runBenchmarkBtn").addEventListener("click", runBenchmark);
document.getElementById("cancelBenchmarkBtn").addEventListener("click", cancelBenchmark);
document.getElementById("benchmarkInterval").addEventListener("change", updateBenchmarkCustomIntervalVisibility);

// ---------------------------------------------------------------------------
// Results / export controls
// ---------------------------------------------------------------------------

document.getElementById("exportJSONBtn").addEventListener("click", exportToJSON);
document.getElementById("exportCSVBtn").addEventListener("click", exportToCSV);
document.getElementById("clearResultsBtn").addEventListener("click", clearBenchmarkResults);
document.getElementById("cellModalClose").addEventListener("click", closeCellModal);

document.getElementById("cellModal").addEventListener("click", (e) => {
  if (e.target.id === "cellModal") {
    closeCellModal();
  }
});

document.getElementById("resultsTableBody").addEventListener("click", (e) => {
  const td = e.target.closest("td:first-child");
  if (td && td.dataset.frameTime !== undefined) {
    syncTableToVideo(parseFloat(td.dataset.frameTime));
  }
});

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", async () => {
  // WebGPU check
  if (!navigator.gpu) {
    const videoElement = document.getElementById("videoFeed");
    const warningElement = document.createElement("p");
    warningElement.textContent = "WebGPU is not available in this browser.";
    warningElement.style.color = "red";
    warningElement.style.textAlign = "center";
    videoElement.parentNode.insertBefore(warningElement, videoElement.nextSibling);
  }

  // Pane resizer
  initResizer();

  // Benchmark model checklist
  updateModelChecklist();

  // Restore persisted settings
  const saved = loadSettings();
  const modelSelect = document.getElementById("modelSelect");
  const instructionText = document.getElementById("instructionText");
  const intervalSelect = document.getElementById("intervalSelect");
  const customIntervalInput = document.getElementById("customIntervalInput");

  if (saved) {
    if (saved.model && MODEL_CONFIGS[saved.model]) {
      modelSelect.value = saved.model;
    }
    if (saved.instruction) {
      instructionText.value = saved.instruction;
    }
    if (saved.systemPrompt !== undefined) {
      state.systemPrompt = saved.systemPrompt;
    }
    if (saved.interval) {
      intervalSelect.value = saved.interval;
    }
    if (saved.customInterval) {
      customIntervalInput.value = saved.customInterval;
    }
    updateCustomIntervalVisibility();

    document.getElementById("promptPreviewText").textContent = instructionText.value;
    document.getElementById("benchmarkPromptPreview").textContent = instructionText.value;
  }

  state.selectedModelKey = modelSelect.value;
  updateMemoryWarning(state.selectedModelKey);
  state.appMode = "live";

  document.getElementById("videoSourceStatus").textContent = "Select a video source to begin";
});

window.addEventListener("beforeunload", () => {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }
});
