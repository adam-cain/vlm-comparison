/**
 * state.js
 *
 * Centralised mutable application state shared across all modules.
 * Every other module imports from here rather than owning its own
 * top-level variables, avoiding hidden coupling and making the data
 * flow explicit.
 */

const state = {
  processor: null,
  model: null,
  tokenizer: null,

  currentModelKey: null,
  selectedModelKey: "smolvlm-500m",

  isProcessing: false,
  stream: null,

  appMode: "live",
  videoSource: "none",
  uploadedVideoBlob: null,
  recordedVideoBlob: null,

  mediaRecorder: null,
  recordingChunks: [],
  isRecording: false,

  benchmarkSession: null,

  systemPrompt: "",
};

export default state;
