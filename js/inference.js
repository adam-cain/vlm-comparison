/**
 * inference.js
 *
 * Image capture from video / canvas and local VLM inference using
 * the currently loaded processor + model held in shared state.
 */

import state from "./state.js";
import { RawImage, MODEL_CONFIGS } from "./config.js";

/**
 * Capture the current video frame from the screen-share stream and
 * return it as a RawImage.
 *
 * @returns {import("./config.js").RawImage|null}
 */
export function captureImage() {
  const video = document.getElementById("videoFeed");
  const canvas = document.getElementById("canvas");

  if (!state.stream || !video.videoWidth) {
    console.warn("Video stream not ready for capture.");
    return null;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  return new RawImage(frame.data, frame.width, frame.height, 4);
}

/**
 * Capture the current frame from an arbitrary <video> element and
 * return it as a RawImage. Used by the benchmark path.
 *
 * @param {HTMLVideoElement} videoEl
 * @returns {import("./config.js").RawImage|null}
 */
export function captureImageFromVideo(videoEl) {
  const canvas = document.getElementById("canvas");

  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    console.warn("Video not ready for capture.");
    return null;
  }

  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  return new RawImage(frame.data, frame.width, frame.height, 4);
}

/**
 * Resize a RawImage to square target dimensions if specified.
 *
 * @param {import("./config.js").RawImage} rawImage
 * @param {number|undefined} targetSize
 * @returns {Promise<import("./config.js").RawImage>}
 */
async function resizeImage(rawImage, targetSize) {
  if (!targetSize) return rawImage;
  return await rawImage.resize(targetSize, targetSize);
}

/**
 * Run local vision inference on a captured image using the currently
 * loaded model/processor stored in shared state.
 *
 * Each processor type has a unique prompt format; this function handles
 * the branching logic for all supported VLM families.
 *
 * @param {import("./config.js").RawImage} imgElement - Captured frame.
 * @param {string} instruction - User-provided instruction text.
 * @returns {Promise<string>} Model-generated text output.
 */
export async function runLocalVisionInference(imgElement, instruction) {
  const config = MODEL_CONFIGS[state.currentModelKey];
  const maxTokens = config ? config.maxTokens : 100;
  const processorType = config ? config.processorType : "smolvlm";
  const { processor, model, tokenizer } = state;

  let messages, text, inputs;
  let processedImage = imgElement;

  if (config && config.imageSize) {
    processedImage = await resizeImage(imgElement, config.imageSize);
  }

  const systemMessages = state.systemPrompt
    ? [{ role: "system", content: state.systemPrompt }]
    : [];

  if (processorType === "fastvlm") {
    messages = [
      ...systemMessages,
      { role: "user", content: "<image>" + instruction },
    ];
    text = processor.apply_chat_template(messages, { add_generation_prompt: true });
    inputs = await processor(processedImage, text, { add_special_tokens: false });

  } else if (processorType === "qwen2vl") {
    messages = [
      ...systemMessages,
      { role: "user", content: [{ type: "image" }, { type: "text", text: instruction }] },
    ];
    text = processor.apply_chat_template(messages, { add_generation_prompt: true });
    inputs = await processor(text, processedImage, { add_special_tokens: false });

  } else if (processorType === "florence") {
    let taskPrompt = config.defaultPrompt || "<MORE_DETAILED_CAPTION>";
    if (instruction.startsWith("<")) {
      taskPrompt = instruction;
    }
    inputs = await processor(processedImage, taskPrompt);

  } else if (processorType === "paligemma") {
    const fullInstruction = state.systemPrompt
      ? `${state.systemPrompt}\n${instruction}`
      : instruction;
    const prompt = " " + fullInstruction;
    inputs = await processor(processedImage, prompt);

  } else if (processorType === "moondream") {
    const context = state.systemPrompt ? `Context: ${state.systemPrompt}\n\n` : "";
    const prompt = `<<image>>\n\n${context}Question: ${instruction}\n\nAnswer:`;
    const text_inputs = tokenizer(prompt);
    const vision_inputs = await processor(processedImage);
    inputs = { ...text_inputs, ...vision_inputs };

  } else if (processorType === "janus") {
    const fullInstruction = state.systemPrompt
      ? `${state.systemPrompt}\n${instruction}`
      : instruction;
    const conversation = [
      {
        role: "<|User|>",
        content: `<<image_placeholder>>\n${fullInstruction}`,
        images: [processedImage],
      },
    ];
    inputs = await processor(conversation);

  } else if (processorType === "gemma4") {
    messages = [
      ...systemMessages,
      { role: "user", content: [{ type: "image" }, { type: "text", text: instruction }] },
    ];
    text = processor.apply_chat_template(messages, {
      enable_thinking: false,
      add_generation_prompt: true,
    });
    inputs = await processor(text, processedImage, null, { add_special_tokens: false });

  } else if (processorType === "phi3v") {
    messages = [
      ...systemMessages,
      { role: "user", content: [{ type: "image" }, { type: "text", text: instruction }] },
    ];
    text = processor.apply_chat_template(messages, { add_generation_prompt: true });
    inputs = await processor(text, processedImage);

  } else {
    // SmolVLM (default)
    messages = [
      ...systemMessages,
      { role: "user", content: [{ type: "image" }, { type: "text", text: instruction }] },
    ];
    text = processor.apply_chat_template(messages, { add_generation_prompt: true });
    inputs = await processor(text, [processedImage], { do_image_splitting: false });
  }

  const generatedIds = await model.generate({
    ...inputs,
    max_new_tokens: maxTokens,
  });

  const output = processor.batch_decode(
    generatedIds.slice(null, [inputs.input_ids.dims.at(-1), null]),
    { skip_special_tokens: true },
  );

  return output[0].trim();
}
