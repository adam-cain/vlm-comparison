/**
 * model-loader.js
 *
 * Handles loading, disposing, and switching VLM models via the
 * HuggingFace Transformers.js library and WebGPU.
 */

import state from "./state.js";
import {
  AutoProcessor,
  AutoTokenizer,
  AutoModelForVision2Seq,
  AutoModelForImageTextToText,
  Qwen2VLForConditionalGeneration,
  Florence2ForConditionalGeneration,
  PaliGemmaForConditionalGeneration,
  Gemma4ForConditionalGeneration,
  Moondream1ForConditionalGeneration,
  MultiModalityCausalLM,
  MODEL_CONFIGS,
} from "./config.js";
import {
  makeProgressCallback,
  resetLoadingProgress,
  updateCustomIntervalVisibility,
  saveSettings,
} from "./utils.js";

/**
 * Look up a model configuration by key.
 * @param {string} modelKey
 * @returns {object|undefined}
 */
export function getModelConfig(modelKey) {
  return MODEL_CONFIGS[modelKey];
}

/**
 * Show / hide the VRAM warning badge based on the model's config.
 * @param {string} modelKey
 */
export function updateMemoryWarning(modelKey) {
  const config = getModelConfig(modelKey);
  const memoryWarning = document.getElementById("memoryWarning");
  if (config && config.showWarning) {
    memoryWarning.innerHTML = `&#9888; High VRAM (${config.vramEstimate})`;
    memoryWarning.classList.remove("hidden");
  } else {
    memoryWarning.classList.add("hidden");
  }
}

/**
 * Automatically set the interval dropdown to the model's recommended value.
 * @param {string} modelKey
 */
export function updateRecommendedSettings(modelKey) {
  const config = getModelConfig(modelKey);
  const intervalSelect = document.getElementById("intervalSelect");
  if (config && intervalSelect.value !== "custom") {
    intervalSelect.value = config.suggestedInterval;
    updateCustomIntervalVisibility();
    saveSettings();
  }
}

/**
 * Release the current model / processor / tokenizer references and
 * hint the garbage collector.
 */
export function disposeCurrentModel() {
  state.processor = null;
  state.model = null;
  state.tokenizer = null;
  state.currentModelKey = null;
  if (typeof gc === "function") {
    gc();
  }
}

/**
 * Download and initialise a VLM identified by its config key.
 * Updates the loading overlay UI during the process.
 *
 * @param {string} modelKey - Key into MODEL_CONFIGS
 */
export async function initModel(modelKey) {
  const config = getModelConfig(modelKey);
  if (!config) {
    document.getElementById("responseText").value = `Error: Unknown model key "${modelKey}"`;
    return;
  }

  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingModelName = document.getElementById("loadingModelName");
  const loadingStatus = document.getElementById("loadingStatus");
  const loadingProgressFill = document.getElementById("loadingProgressFill");
  const loadingDetail = document.getElementById("loadingDetail");
  const responseText = document.getElementById("responseText");

  loadingOverlay.style.display = "flex";
  loadingModelName.textContent = config.displayName;
  loadingStatus.textContent = "Loading processor…";
  resetLoadingProgress();
  responseText.value = `Loading ${config.displayName}...`;

  try {
    // Processor
    const processorProgress = makeProgressCallback("Loading processor");
    state.processor = await AutoProcessor.from_pretrained(config.modelId, {
      progress_callback: processorProgress,
    });
    loadingStatus.textContent = "Processor loaded.";
    resetLoadingProgress();
    responseText.value = `${config.displayName}: Processor loaded. Loading model...`;

    // Tokenizer (only for models that require it, e.g. Moondream)
    if (config.requiresTokenizer) {
      loadingStatus.textContent = "Loading tokenizer…";
      const tokenizerProgress = makeProgressCallback("Loading tokenizer");
      state.tokenizer = await AutoTokenizer.from_pretrained(config.modelId, {
        progress_callback: tokenizerProgress,
      });
      loadingStatus.textContent = "Tokenizer loaded.";
      resetLoadingProgress();
    } else {
      state.tokenizer = null;
    }

    // Model weights
    loadingStatus.textContent = "Downloading model weights…";
    const modelProgress = makeProgressCallback("Downloading model");
    const modelOpts = {
      dtype: config.dtype,
      device: "webgpu",
      progress_callback: modelProgress,
    };

    const CLASS_MAP = {
      AutoModelForImageTextToText,
      Qwen2VLForConditionalGeneration,
      Florence2ForConditionalGeneration,
      PaliGemmaForConditionalGeneration,
      Gemma4ForConditionalGeneration,
      Moondream1ForConditionalGeneration,
      MultiModalityCausalLM,
    };

    const ModelClass = CLASS_MAP[config.modelClass] || AutoModelForVision2Seq;
    state.model = await ModelClass.from_pretrained(config.modelId, modelOpts);

    state.currentModelKey = modelKey;
    loadingStatus.textContent = "Model loaded!";
    loadingProgressFill.style.width = "100%";
    loadingDetail.textContent = "";
    responseText.value = `${config.displayName} loaded. Initializing screen share...`;
    loadingOverlay.style.display = "none";
  } catch (error) {
    console.error("Error loading model:", error);
    loadingOverlay.style.display = "none";
    resetLoadingProgress();
    state.currentModelKey = null;

    if (error.message && (error.message.includes("memory") || error.message.includes("OOM"))) {
      responseText.value = `Error: Out of GPU memory loading ${config.displayName}. Try a smaller model like SmolVLM 256M.`;
      alert("Out of GPU memory. Try selecting a smaller model like SmolVLM 256M (Fast).");
    } else {
      responseText.value = `Error loading ${config.displayName}: ${error.message}`;
    }
  }
}

/**
 * Handle a model-select dropdown change: validate, dispose old model,
 * load new one, and optionally re-init screen share.
 */
export async function handleModelChange() {
  const modelSelect = document.getElementById("modelSelect");
  const newModelKey = modelSelect.value;

  if (newModelKey === state.currentModelKey) return;

  if (state.isProcessing) {
    alert("Please stop processing before switching models.");
    modelSelect.value = state.currentModelKey || state.selectedModelKey;
    return;
  }

  updateMemoryWarning(newModelKey);
  updateRecommendedSettings(newModelKey);
  state.selectedModelKey = newModelKey;

  disposeCurrentModel();
  await initModel(newModelKey);

  if (!state.stream) {
    await initScreenShare();
  }
}

/**
 * Prompt the user for display-media access and wire the resulting
 * stream into the video element.
 */
export async function initScreenShare() {
  const video = document.getElementById("videoFeed");
  const responseText = document.getElementById("responseText");
  try {
    state.stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    video.srcObject = state.stream;
    responseText.value = "Screen sharing started. Ready to process.";
  } catch (err) {
    console.error("Error starting screen share:", err);
    responseText.value = `Error starting screen share: ${err.name} - ${err.message}. You may have cancelled the picker or are not on HTTPS/localhost.`;
    alert(`Error starting screen share: ${err.name}. You may have cancelled the picker or need to be on HTTPS/localhost.`);
  }
}
