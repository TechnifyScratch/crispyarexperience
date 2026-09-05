import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-cpu";
import { setWasmPaths, setThreadsCount } from "@tensorflow/tfjs-backend-wasm";
import { load, type ObjectDetection } from "@tensorflow-models/coco-ssd";
import { createPatch, followPatch, grayscale, type GrayFrame, type Patch } from "./object-tracking";
import type { VisionRequest, VisionResponse } from "./vision-protocol";

let model: ObjectDetection | null = null;
let lastFrame: GrayFrame | null = null;
let patch: Patch | null = null;
const send = (message: VisionResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<VisionRequest>) => {
  try {
    const message = event.data;
    if (message.type === "init") {
      setThreadsCount(1);
      setWasmPaths(`${message.origin}/vendor/vision/`);
      await tf.setBackend("wasm");
      await tf.ready();
      model = await load({ base: "lite_mobilenet_v2" });
      send({ type: "ready" });
    } else if (message.type === "clear") {
      patch = null;
    } else if (message.type === "label") {
      patch = createPatch(grayscale(message.pixels, message.width, message.height), message.box, message.label);
      send({ type: "labelled", accepted: Boolean(patch) });
    } else if (message.type === "frame" && model) {
      const started = performance.now();
      // Sending ImageData to a worker keeps all inference off the UI/AR thread.
      const image = new ImageData(new Uint8ClampedArray(message.pixels), message.width, message.height);
      const predictions = await model.detect(image, 12, 0.45);
      lastFrame = grayscale(image.data, image.width, image.height);
      const custom = patch ? followPatch(lastFrame, patch) : null;
      send({
        type: "result", timestamp: message.timestamp, inferenceMs: performance.now() - started,
        custom, customLost: Boolean(patch && !custom),
        detections: predictions.map((item) => ({ label: item.class, score: item.score, box: { x: item.bbox[0] / image.width, y: item.bbox[1] / image.height, width: item.bbox[2] / image.width, height: item.bbox[3] / image.height } })),
      });
    }
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "Object detection failed." });
  }
};
