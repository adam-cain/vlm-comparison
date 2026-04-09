/**
 * benchmark.js
 *
 * Benchmark session lifecycle: initialisation, sequential model
 * execution, per-frame inference, and cancellation.
 */

import state from "./state.js";
import { MODEL_CONFIGS } from "./config.js";
import { generateUUID, getBenchmarkIntervalMs } from "./utils.js";
import { disposeCurrentModel, initModel } from "./model-loader.js";
import { captureImageFromVideo, runLocalVisionInference } from "./inference.js";
import { renderResultsTable } from "./results.js";

// ---------------------------------------------------------------------------
// Model checklist helpers
// ---------------------------------------------------------------------------

/**
 * Populate the benchmark model checklist from MODEL_CONFIGS.
 */
export function updateModelChecklist() {
  const checklist = document.getElementById("modelChecklist");
  checklist.innerHTML = "";

  for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
    const item = document.createElement("div");
    item.className = "model-checkbox-item";
    item.innerHTML = `
      <input type="checkbox" id="model-${key}" value="${key}" />
      <label for="model-${key}">${config.displayName}</label>
      <span class="vram-hint">${config.vramEstimate}</span>
    `;
    checklist.appendChild(item);
  }
}

/**
 * Toggle the checked state of every model checkbox.
 */
export function toggleSelectAllModels() {
  const checkboxes = document.querySelectorAll("#modelChecklist input[type='checkbox']");
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

  checkboxes.forEach((cb) => {
    cb.checked = !allChecked;
  });

  document.getElementById("selectAllModelsBtn").textContent = allChecked
    ? "Select All"
    : "Deselect All";
  validateBenchmarkReady();
}

/**
 * Return an array of model keys whose checkboxes are ticked.
 * @returns {string[]}
 */
export function getSelectedModels() {
  const checkboxes = document.querySelectorAll(
    "#modelChecklist input[type='checkbox']:checked",
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}

/**
 * Enable / disable the "Run Benchmark" button based on whether a
 * video source and at least one model are selected.
 */
export function validateBenchmarkReady() {
  const runBtn = document.getElementById("runBenchmarkBtn");
  const hasVideo = state.videoSource === "upload" || state.videoSource === "recording";
  const hasModels = getSelectedModels().length > 0;
  runBtn.disabled = !(hasVideo && hasModels);
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/**
 * Build a fresh benchmark session descriptor.
 * @returns {object} The initialised session object (also stored on state).
 */
function initBenchmarkSession() {
  const selectedModels = getSelectedModels();
  const instruction =
    document.getElementById("instructionText").value || "What do you see?";
  const intervalMs = getBenchmarkIntervalMs();
  const video = document.getElementById("videoFeed");
  const videoDuration = video.duration || 0;
  const totalFrames = Math.ceil(videoDuration / (intervalMs / 1000));

  state.benchmarkSession = {
    id: generateUUID(),
    createdAt: Date.now(),
    videoSource: state.videoSource,
    videoDuration,
    frameInterval: intervalMs,
    totalFrames,
    instruction,
    systemPrompt: state.systemPrompt,
    models: selectedModels,
    status: "idle",
    currentModelIndex: 0,
    currentFrameIndex: 0,
    results: selectedModels.map((modelKey) => ({
      modelKey,
      modelDisplayName: MODEL_CONFIGS[modelKey].displayName,
      status: "pending",
      startTime: null,
      endTime: null,
      totalLatencyMs: 0,
      entries: [],
    })),
  };

  return state.benchmarkSession;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Iterate through each frame of the video for a single model,
 * capturing + running inference at each frame time.
 *
 * @param {string} modelKey
 * @param {number} modelIndex
 */
async function processVideoForModel(modelKey, modelIndex) {
  const progressText = document.getElementById("benchmarkProgressText");
  const config = MODEL_CONFIGS[modelKey];
  const session = state.benchmarkSession;
  const intervalMs = session.frameInterval;
  const modelResult = session.results[modelIndex];
  const video = document.getElementById("videoFeed");

  const frameTimes = [];
  for (let t = 0; t < session.videoDuration; t += intervalMs / 1000) {
    frameTimes.push(t);
  }

  for (let frameIdx = 0; frameIdx < frameTimes.length; frameIdx++) {
    if (session.status === "cancelled") break;

    session.currentFrameIndex = frameIdx;
    const frameTime = frameTimes[frameIdx];
    progressText.innerHTML = `Processing <span class="model-name">${config.displayName}</span> - Frame ${frameIdx + 1} of ${frameTimes.length}`;

    // Seek video
    video.currentTime = frameTime;
    await new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      setTimeout(resolve, 500);
    });

    const captureTimestamp = Date.now();
    const rawImg = captureImageFromVideo(video);

    if (!rawImg) {
      modelResult.entries.push({
        frameIndex: frameIdx,
        frameTimeSeconds: frameTime,
        captureTimestamp,
        text: "",
        error: "Frame capture failed",
        latencyMs: 0,
      });
      continue;
    }

    const inferenceStart = Date.now();
    let text = "";
    let error = null;

    try {
      text = await runLocalVisionInference(rawImg, session.instruction);
    } catch (e) {
      console.error(`Inference error at frame ${frameIdx}:`, e);
      error = e.message;
    }

    const inferenceEnd = Date.now();
    const latencyMs = inferenceEnd - inferenceStart;

    modelResult.entries.push({
      frameIndex: frameIdx,
      frameTimeSeconds: frameTime,
      captureTimestamp,
      inferenceStartTimestamp: inferenceStart,
      inferenceEndTimestamp: inferenceEnd,
      latencyMs,
      text,
      error,
    });

    modelResult.totalLatencyMs += latencyMs;
  }
}

/**
 * Walk through every selected model sequentially, loading each one
 * and processing all frames before moving to the next.
 */
async function processBenchmarkSequentially() {
  const progressFill = document.getElementById("benchmarkProgressFill");
  const progressText = document.getElementById("benchmarkProgressText");
  const session = state.benchmarkSession;

  for (let i = 0; i < session.models.length; i++) {
    if (session.status === "cancelled") break;

    session.currentModelIndex = i;
    const modelKey = session.models[i];
    const modelResult = session.results[i];
    const config = MODEL_CONFIGS[modelKey];

    progressText.innerHTML = `Loading <span class="model-name">${config.displayName}</span>...`;

    disposeCurrentModel();

    try {
      await initModel(modelKey);
      modelResult.status = "running";
      modelResult.startTime = Date.now();

      await processVideoForModel(modelKey, i);

      modelResult.endTime = Date.now();
      modelResult.status = "completed";
    } catch (error) {
      console.error(`Error with model ${modelKey}:`, error);
      modelResult.status = "failed";
      modelResult.entries.push({ frameIndex: -1, error: error.message });
    }

    const overallProgress = ((i + 1) / session.models.length) * 100;
    progressFill.style.width = `${overallProgress}%`;
  }

  if (session.status !== "cancelled") {
    session.status = "completed";
  }

  const progressTextEl = document.getElementById("benchmarkProgressText");
  progressTextEl.textContent =
    session.status === "cancelled"
      ? "Benchmark cancelled"
      : "Benchmark completed!";
}

/**
 * Top-level entry point: validate inputs, initialise a session, run
 * it, and display results.
 */
export async function runBenchmark() {
  const hasVideo =
    state.videoSource === "upload" || state.videoSource === "recording";
  if (!hasVideo) {
    alert("Please upload a video or record screen share first.");
    return;
  }

  const selectedModels = getSelectedModels();
  if (selectedModels.length === 0) {
    alert("Please select at least one model to benchmark.");
    return;
  }

  const video = document.getElementById("videoFeed");

  if (!video.duration || isNaN(video.duration)) {
    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
      setTimeout(resolve, 1000);
    });
  }

  initBenchmarkSession();
  state.benchmarkSession.status = "running";

  document.getElementById("runBenchmarkBtn").classList.add("hidden");
  document.getElementById("cancelBenchmarkBtn").classList.remove("hidden");
  document.getElementById("benchmarkProgressContainer").classList.remove("hidden");
  document.getElementById("modelChecklist").style.pointerEvents = "none";
  document.getElementById("benchmarkPromptBtn").disabled = true;
  document.getElementById("benchmarkInterval").disabled = true;

  video.pause();
  video.currentTime = 0;

  try {
    await processBenchmarkSequentially();
  } catch (error) {
    console.error("Benchmark error:", error);
    state.benchmarkSession.status = "failed";
  }

  document.getElementById("runBenchmarkBtn").classList.remove("hidden");
  document.getElementById("cancelBenchmarkBtn").classList.add("hidden");
  document.getElementById("modelChecklist").style.pointerEvents = "auto";
  document.getElementById("benchmarkPromptBtn").disabled = false;
  document.getElementById("benchmarkInterval").disabled = false;

  if (
    state.benchmarkSession.status === "completed" ||
    state.benchmarkSession.status === "cancelled"
  ) {
    renderResultsTable();
    document.getElementById("resultsContainer").classList.remove("hidden");
  }
}

/**
 * Signal the current benchmark run to stop after the current frame.
 */
export function cancelBenchmark() {
  if (state.benchmarkSession) {
    state.benchmarkSession.status = "cancelled";
  }
}
