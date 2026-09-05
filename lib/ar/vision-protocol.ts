import type { Box, Detection } from "./object-tracking";

export type VisionRequest =
  | { type: "init"; origin: string }
  | { type: "frame"; pixels: Uint8ClampedArray; width: number; height: number; timestamp: number }
  | { type: "label"; box: Box; label: string; pixels: Uint8ClampedArray; width: number; height: number }
  | { type: "clear" };
export type VisionResponse =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "labelled"; accepted: boolean }
  | { type: "result"; detections: Detection[]; custom: Detection | null; customLost: boolean; inferenceMs: number; timestamp: number };
