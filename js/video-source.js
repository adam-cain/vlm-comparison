/**
 * video-source.js
 *
 * Manages the three video-input paths: file upload, screen share,
 * and screen-share recording. Updates the video source button UI
 * to reflect the current selection.
 */

import state from "./state.js";
import { initModel } from "./model-loader.js";
import { validateBenchmarkReady } from "./benchmark.js";

/**
 * Handle a file-input change event — validate, store the blob, and
 * set the <video> element source.
 *
 * @param {Event} event
 */
export function handleVideoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("video/")) {
    alert("Please select a valid video file.");
    return;
  }

  state.uploadedVideoBlob = file;
  const objectURL = URL.createObjectURL(file);
  const video = document.getElementById("videoFeed");

  video.srcObject = null;
  video.src = objectURL;
  video.muted = true;
  video.loop = true;
  video.play();

  state.videoSource = "upload";
  updateVideoSourceUI();
  validateBenchmarkReady();

  document.getElementById("videoSourceStatus").textContent = `Loaded: ${file.name}`;
}

/**
 * Prompt the user for screen-share access, wire the stream, and
 * enable recording.
 */
export async function handleScreenShareBtn() {
  try {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }

    state.stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const video = document.getElementById("videoFeed");
    video.srcObject = state.stream;
    video.src = "";
    state.videoSource = "screenshare";
    updateVideoSourceUI();

    document.getElementById("recordBtn").disabled = false;
    document.getElementById("videoSourceStatus").textContent = "Screen sharing active";

    if (!state.currentModelKey && state.appMode === "live") {
      await initModel(state.selectedModelKey);
    }

    state.stream.getVideoTracks()[0].onended = () => {
      state.videoSource = "none";
      state.stream = null;
      updateVideoSourceUI();
      document.getElementById("recordBtn").disabled = true;
      document.getElementById("videoSourceStatus").textContent = "";
    };
  } catch (err) {
    console.error("Error starting screen share:", err);
    alert(`Error starting screen share: ${err.name}. You may have cancelled the picker.`);
  }
}

/**
 * Start recording from the current screen-share stream.
 */
export function startRecording() {
  if (!state.stream) {
    alert("Please start screen sharing first.");
    return;
  }

  state.recordingChunks = [];
  state.mediaRecorder = new MediaRecorder(state.stream, {
    mimeType: "video/webm;codecs=vp9",
  });

  state.mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      state.recordingChunks.push(event.data);
    }
  };

  state.mediaRecorder.onstop = () => {
    state.recordedVideoBlob = new Blob(state.recordingChunks, { type: "video/webm" });
    const objectURL = URL.createObjectURL(state.recordedVideoBlob);

    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }

    const video = document.getElementById("videoFeed");
    video.srcObject = null;
    video.src = objectURL;
    video.muted = true;
    video.loop = true;
    video.play();

    state.videoSource = "recording";
    state.isRecording = false;
    updateVideoSourceUI();
    validateBenchmarkReady();

    document.getElementById("recordBtn").disabled = true;
    document.getElementById("videoSourceStatus").textContent = "Recording saved";
  };

  state.mediaRecorder.start(1000);
  state.isRecording = true;
  updateVideoSourceUI();
  document.getElementById("videoSourceStatus").textContent = "Recording...";
}

/**
 * Stop the current recording (if active).
 */
export function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  }
  document.getElementById("recordingIndicator").classList.add("hidden");
}

/**
 * Synchronise video-source button active/recording states with the
 * current value of `state.videoSource` and `state.isRecording`.
 */
export function updateVideoSourceUI() {
  const uploadBtn = document.getElementById("uploadVideoBtn");
  const screenShareBtn = document.getElementById("screenShareBtn");
  const recordBtn = document.getElementById("recordBtn");
  const recordingIndicator = document.getElementById("recordingIndicator");

  uploadBtn.classList.remove("active");
  screenShareBtn.classList.remove("active", "recording");
  recordBtn.classList.remove("recording");

  if (state.videoSource === "upload") {
    uploadBtn.classList.add("active");
  } else if (state.videoSource === "screenshare") {
    screenShareBtn.classList.add("active");
    if (state.isRecording) {
      recordBtn.classList.add("recording");
      recordBtn.textContent = "Stop Recording";
      recordingIndicator.classList.remove("hidden");
    } else {
      recordBtn.textContent = "Record";
      recordingIndicator.classList.add("hidden");
    }
  } else if (state.videoSource === "recording") {
    recordBtn.classList.add("active");
    recordingIndicator.classList.add("hidden");
  } else {
    recordingIndicator.classList.add("hidden");
  }
}
