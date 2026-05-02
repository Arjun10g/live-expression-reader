// IoU-based multi-face tracker. Hungarian assignment is overkill for <=5 faces.
// Drop IDs unseen for 30 frames.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tracked {
  id: number;
  box: Box;
  framesSinceSeen: number;
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function createTracker(): {
  update(detections: Box[]): Tracked[];
} {
  // TODO Step 8: greedy IoU match, assign new IDs to unmatched, drop after 30 unseen.
  throw new Error("not implemented");
}
