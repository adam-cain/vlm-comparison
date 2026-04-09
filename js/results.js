/**
 * results.js
 *
 * Renders the benchmark results table, synchronises the results-video
 * scrubber with table row highlighting, handles cell-expand modals,
 * and provides JSON / CSV export.
 */

import state from "./state.js";
import { formatTime } from "./utils.js";

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

/**
 * Build the results table header and body rows from the current
 * benchmark session, and wire up the video preview.
 */
export function renderResultsTable() {
  const session = state.benchmarkSession;
  if (!session || !session.results) return;

  const headerRow = document.getElementById("resultsTableHeader");
  const tableBody = document.getElementById("resultsTableBody");
  const resultsVideo = document.getElementById("resultsVideo");

  if (state.videoSource === "upload" && state.uploadedVideoBlob) {
    resultsVideo.src = URL.createObjectURL(state.uploadedVideoBlob);
  } else if (state.videoSource === "recording" && state.recordedVideoBlob) {
    resultsVideo.src = URL.createObjectURL(state.recordedVideoBlob);
  }

  document.getElementById("summaryModelCount").textContent = session.results.length;
  document.getElementById("summaryFrameCount").textContent = session.totalFrames;

  // Header
  headerRow.innerHTML = "<th>Time</th>";
  session.results.forEach((result) => {
    const th = document.createElement("th");
    th.textContent = result.modelDisplayName;
    headerRow.appendChild(th);
  });

  // Body
  tableBody.innerHTML = "";
  const maxFrames = Math.max(...session.results.map((r) => r.entries.length));

  for (let frameIdx = 0; frameIdx < maxFrames; frameIdx++) {
    const tr = document.createElement("tr");
    tr.dataset.frameIndex = frameIdx;

    let frameTime = 0;
    for (const result of session.results) {
      if (result.entries[frameIdx]) {
        frameTime = result.entries[frameIdx].frameTimeSeconds;
        break;
      }
    }

    const timeTd = document.createElement("td");
    timeTd.textContent = formatTime(frameTime);
    timeTd.dataset.frameTime = frameTime;
    tr.appendChild(timeTd);

    session.results.forEach((result, modelIdx) => {
      const td = document.createElement("td");
      const entry = result.entries[frameIdx];

      if (entry) {
        if (entry.error) {
          td.textContent = `Error: ${entry.error}`;
          td.style.color = "#f87171";
        } else {
          td.textContent = entry.text || "-";
          const latencyBadge = document.createElement("span");
          latencyBadge.className = "latency-badge";
          latencyBadge.textContent = `${entry.latencyMs}ms`;
          td.appendChild(latencyBadge);
        }

        td.dataset.modelIndex = modelIdx;
        td.dataset.frameIndex = frameIdx;
        td.addEventListener("click", () => expandCellContent(modelIdx, frameIdx));
      } else {
        td.textContent = "-";
      }

      tr.appendChild(td);
    });

    tableBody.appendChild(tr);
  }

  setupVideoSync();
}

// ---------------------------------------------------------------------------
// Video ↔ table synchronisation
// ---------------------------------------------------------------------------

function setupVideoSync() {
  const resultsVideo = document.getElementById("resultsVideo");
  const scrubber = document.getElementById("resultsVideoScrubber");
  const timeDisplay = document.getElementById("resultsVideoTime");
  const playPauseBtn = document.getElementById("resultsPlayPauseBtn");

  resultsVideo.onloadedmetadata = () => {
    scrubber.max = resultsVideo.duration;
    timeDisplay.textContent = `0:00 / ${formatTime(resultsVideo.duration)}`;
  };

  resultsVideo.ontimeupdate = () => {
    scrubber.value = resultsVideo.currentTime;
    timeDisplay.textContent = `${formatTime(resultsVideo.currentTime)} / ${formatTime(resultsVideo.duration)}`;
    syncVideoToTable();
  };

  scrubber.oninput = () => {
    resultsVideo.currentTime = scrubber.value;
  };

  playPauseBtn.onclick = () => {
    if (resultsVideo.paused) {
      resultsVideo.play();
      playPauseBtn.textContent = "Pause";
    } else {
      resultsVideo.pause();
      playPauseBtn.textContent = "Play";
    }
  };
}

function syncVideoToTable() {
  const resultsVideo = document.getElementById("resultsVideo");
  const currentTime = resultsVideo.currentTime;
  const rows = document.querySelectorAll("#resultsTableBody tr");

  rows.forEach((row) => row.classList.remove("highlighted"));

  let closestRow = null;
  let closestDiff = Infinity;

  rows.forEach((row) => {
    const frameTime = parseFloat(row.querySelector("td").dataset.frameTime);
    const diff = Math.abs(currentTime - frameTime);
    if (diff < closestDiff && currentTime >= frameTime) {
      closestDiff = diff;
      closestRow = row;
    }
  });

  if (closestRow) {
    closestRow.classList.add("highlighted");
    closestRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/**
 * Jump the results video to a specific time.
 * @param {number} frameTime
 */
export function syncTableToVideo(frameTime) {
  document.getElementById("resultsVideo").currentTime = frameTime;
}

// ---------------------------------------------------------------------------
// Cell expand modal
// ---------------------------------------------------------------------------

/**
 * Open the cell-detail modal for a specific model / frame intersection.
 * @param {number} modelIndex
 * @param {number} frameIndex
 */
export function expandCellContent(modelIndex, frameIndex) {
  const result = state.benchmarkSession.results[modelIndex];
  const entry = result.entries[frameIndex];
  if (!entry) return;

  document.getElementById("cellModalTitle").textContent = result.modelDisplayName;
  document.getElementById("cellModalMeta").textContent =
    `Frame ${frameIndex + 1} at ${formatTime(entry.frameTimeSeconds)} \u2022 ${entry.latencyMs}ms latency`;
  document.getElementById("cellModalContent").textContent = entry.error
    ? `Error: ${entry.error}`
    : entry.text;
  document.getElementById("cellModal").classList.remove("hidden");
}

/**
 * Hide the cell-detail modal.
 */
export function closeCellModal() {
  document.getElementById("cellModal").classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Download the full benchmark session as a formatted JSON file.
 */
export function exportToJSON() {
  if (!state.benchmarkSession) return;

  const json = JSON.stringify(state.benchmarkSession, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `benchmark-${state.benchmarkSession.id}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download the benchmark entries as a CSV file.
 */
export function exportToCSV() {
  if (!state.benchmarkSession) return;

  const rows = [
    ["frame_index", "frame_time_seconds", "model_key", "model_name", "text", "latency_ms", "error"],
  ];

  state.benchmarkSession.results.forEach((result) => {
    result.entries.forEach((entry) => {
      rows.push([
        entry.frameIndex,
        entry.frameTimeSeconds,
        result.modelKey,
        result.modelDisplayName,
        `"${(entry.text || "").replace(/"/g, '""')}"`,
        entry.latencyMs,
        entry.error || "",
      ]);
    });
  });

  const csv = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `benchmark-${state.benchmarkSession.id}-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Discard the current benchmark session and reset the results UI.
 */
export function clearBenchmarkResults() {
  state.benchmarkSession = null;
  document.getElementById("resultsContainer").classList.add("hidden");
  document.getElementById("resultsTableBody").innerHTML = "";
  document.getElementById("benchmarkProgressContainer").classList.add("hidden");
  document.getElementById("benchmarkProgressFill").style.width = "0%";
  document.getElementById("benchmarkProgressText").textContent = "Preparing benchmark...";
}
