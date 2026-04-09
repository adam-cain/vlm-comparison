/**
 * utils.js
 *
 * Pure utility / helper functions used across the application:
 * byte formatting, timers, UUID generation, time display,
 * loading-progress callbacks, and localStorage settings persistence.
 */

import state from "./state.js";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Convert a byte count into a human-readable string (B / KB / MB / GB).
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return (bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0) + " " + units[i];
}

/**
 * Format seconds as MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Async helpers
// ---------------------------------------------------------------------------

/**
 * Promise-based sleep.
 * @param {number} ms - milliseconds to wait
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a v4-style UUID.
 * @returns {string}
 */
export function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Loading-progress callbacks (mutate DOM elements directly)
// ---------------------------------------------------------------------------

/**
 * Create a progress callback suitable for HuggingFace's `progress_callback`
 * option. Updates the loading overlay UI elements.
 *
 * @param {string} phase - Human-readable label for the current phase.
 * @returns {function} Progress callback function.
 */
export function makeProgressCallback(phase) {
  const loadingDetail = document.getElementById("loadingDetail");
  const loadingProgressFill = document.getElementById("loadingProgressFill");
  const loadingStatus = document.getElementById("loadingStatus");

  let filesDone = 0;
  let totalFiles = 0;

  return (progress) => {
    if (progress.status === "initiate") {
      totalFiles++;
      const fileName = progress.file ? progress.file.split("/").pop() : "";
      loadingDetail.textContent = fileName ? `Preparing ${fileName}…` : "";
    } else if (progress.status === "download") {
      const fileName = progress.file ? progress.file.split("/").pop() : "";
      loadingDetail.textContent = fileName ? `Downloading ${fileName}…` : "Downloading…";
    } else if (progress.status === "progress" && progress.total) {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      const fileName = progress.file ? progress.file.split("/").pop() : "";
      loadingProgressFill.style.width = pct + "%";
      loadingDetail.textContent = `${fileName}  ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}  (${pct}%)`;
      loadingStatus.textContent = `${phase}…`;
    } else if (progress.status === "done") {
      filesDone++;
      loadingProgressFill.style.width = "100%";
      if (totalFiles > 0) {
        loadingDetail.textContent = `${filesDone} / ${totalFiles} files loaded`;
      }
    }
  };
}

/**
 * Reset the loading progress bar and detail text to their initial state.
 */
export function resetLoadingProgress() {
  document.getElementById("loadingProgressFill").style.width = "0%";
  document.getElementById("loadingDetail").textContent = "";
}

// ---------------------------------------------------------------------------
// Interval helpers
// ---------------------------------------------------------------------------

/**
 * Read the effective interval value (ms) from the live-mode controls.
 * @returns {number}
 */
export function getIntervalMs() {
  const intervalSelect = document.getElementById("intervalSelect");
  if (intervalSelect.value === "custom") {
    return parseInt(document.getElementById("customIntervalInput").value, 10) || 0;
  }
  return parseInt(intervalSelect.value, 10);
}

/**
 * Read the effective interval value (ms) from the benchmark controls.
 * @returns {number}
 */
export function getBenchmarkIntervalMs() {
  const benchmarkInterval = document.getElementById("benchmarkInterval");
  if (benchmarkInterval.value === "custom") {
    return parseInt(document.getElementById("benchmarkCustomIntervalInput").value, 10) || 0;
  }
  return parseInt(benchmarkInterval.value, 10);
}

/**
 * Show / hide the custom interval input for live mode.
 */
export function updateCustomIntervalVisibility() {
  const intervalSelect = document.getElementById("intervalSelect");
  const customIntervalInput = document.getElementById("customIntervalInput");
  const customIntervalSuffix = document.getElementById("customIntervalSuffix");
  const isCustom = intervalSelect.value === "custom";
  customIntervalInput.style.display = isCustom ? "" : "none";
  customIntervalSuffix.style.display = isCustom ? "" : "none";
}

/**
 * Show / hide the custom interval input for benchmark mode.
 */
export function updateBenchmarkCustomIntervalVisibility() {
  const benchmarkInterval = document.getElementById("benchmarkInterval");
  const input = document.getElementById("benchmarkCustomIntervalInput");
  const suffix = document.getElementById("benchmarkCustomIntervalSuffix");
  const isCustom = benchmarkInterval.value === "custom";
  input.style.display = isCustom ? "" : "none";
  suffix.style.display = isCustom ? "" : "none";
}

// ---------------------------------------------------------------------------
// Settings persistence (localStorage)
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "vlm-comparison-settings";

/**
 * Persist current control values to localStorage.
 */
export function saveSettings() {
  const settings = {
    model: document.getElementById("modelSelect").value,
    instruction: document.getElementById("instructionText").value,
    systemPrompt: state.systemPrompt,
    interval: document.getElementById("intervalSelect").value,
    customInterval: document.getElementById("customIntervalInput").value,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (_e) {
    /* ignore quota errors */
  }
}

/**
 * Load persisted settings from localStorage.
 * @returns {object|null}
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}
