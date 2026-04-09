/**
 * live-mode.js
 *
 * Controls the real-time "Live" processing loop: capturing frames from
 * a screen-share stream, running inference, and displaying results.
 */

import state from "./state.js";
import { getIntervalMs, sleep } from "./utils.js";
import { captureImage, runLocalVisionInference } from "./inference.js";

/**
 * Capture a single frame, run inference, and write the reply to the
 * response textarea.
 */
async function sendData() {
  if (!state.isProcessing) return;

  const instructionText = document.getElementById("instructionText");
  const responseText = document.getElementById("responseText");
  const instruction = instructionText.value;
  const rawImg = captureImage();

  if (!rawImg) {
    responseText.value = "Capture failed";
    return;
  }

  try {
    const reply = await runLocalVisionInference(rawImg, instruction);
    responseText.value = reply;
  } catch (e) {
    console.error(e);
    responseText.value = `Error: ${e.message}`;
  }
}

/**
 * Continuously capture + infer at the configured interval until
 * `state.isProcessing` is set to false.
 */
async function processingLoop() {
  const intervalMs = getIntervalMs();
  while (state.isProcessing) {
    await sendData();
    if (!state.isProcessing) break;
    await sleep(intervalMs);
  }
}

/**
 * Begin live processing: validate pre-conditions, flip UI state,
 * and kick off the processing loop.
 */
export function handleStart() {
  const responseText = document.getElementById("responseText");

  if (!state.stream) {
    responseText.value = "Screen share not available. Cannot start.";
    alert("Screen share not active. Please start screen sharing first.");
    return;
  }

  if (!state.currentModelKey) {
    responseText.value = "Model not loaded. Please wait for model to load.";
    alert("Model not loaded yet. Please wait or select a model.");
    return;
  }

  state.isProcessing = true;

  const startButton = document.getElementById("startButton");
  startButton.textContent = "Stop";
  startButton.classList.replace("start", "stop");

  document.getElementById("instructionText").disabled = true;
  document.getElementById("intervalSelect").disabled = true;
  document.getElementById("modelSelect").disabled = true;

  responseText.value = "Processing started...";
  processingLoop();
}

/**
 * Stop the live processing loop and re-enable controls.
 */
export function handleStop() {
  state.isProcessing = false;

  const startButton = document.getElementById("startButton");
  startButton.textContent = "Start";
  startButton.classList.replace("stop", "start");

  document.getElementById("instructionText").disabled = false;
  document.getElementById("intervalSelect").disabled = false;
  document.getElementById("modelSelect").disabled = false;

  const responseText = document.getElementById("responseText");
  if (responseText.value.startsWith("Processing started...")) {
    responseText.value = "Processing stopped.";
  }
}
