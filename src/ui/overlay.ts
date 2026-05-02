// Canvas drawing for bounding boxes + labels.
// Bounding-box opacity scales with max-class confidence (Step 6a).

import type { FaceFeatures } from "../face-pipeline";

export function drawOverlay(
  _ctx: CanvasRenderingContext2D,
  _faces: FaceFeatures[],
  _probs: Record<number, number[]>,
): void {
  // TODO Step 6a.
  throw new Error("not implemented");
}
