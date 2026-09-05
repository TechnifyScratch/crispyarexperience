// Coordinates are normalized to the displayed camera crop, not the sensor.
export type Box = { x: number; y: number; width: number; height: number };
export type Detection = { label: string; score: number; box: Box };
export type ObjectTrack = Detection & { id: number; seenAt: number; hits: number };

export function overlap(a: Box, b: Box) {
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / Math.max(0.000001, a.width * a.height + b.width * b.height - area);
}

export class ObjectTracker {
  private tracks: ObjectTrack[] = [];
  private nextId = 1;

  update(detections: Detection[], now: number) {
    const available = this.tracks.filter((track) => now - track.seenAt < 1200);
    const used = new Set<number>();
    this.tracks = detections.filter((item) => item.score >= 0.45).sort((a, b) => b.score - a.score).map((item) => {
      const match = available.filter((track) => !used.has(track.id) && track.label === item.label && overlap(track.box, item.box) >= 0.15)
        .sort((a, b) => overlap(b.box, item.box) - overlap(a.box, item.box))[0];
      if (match) used.add(match.id);
      return { ...item, id: match?.id ?? this.nextId++, hits: (match?.hits ?? 0) + 1, seenAt: now };
    });
    return this.tracks;
  }
}

export function coverPoint(point: { x: number; y: number }, source: { width: number; height: number }, view: { width: number; height: number }) {
  const scale = Math.max(view.width / source.width, view.height / source.height);
  return {
    x: (point.x * source.width * scale - (source.width * scale - view.width) / 2) / view.width,
    y: (point.y * source.height * scale - (source.height * scale - view.height) / 2) / view.height,
  };
}

export function distanceToBox(point: { x: number; y: number }, box: Box) {
  return Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.width), Math.max(box.y - point.y, 0, point.y - box.y - box.height));
}

// A manually named patch lets staff inspect items outside the detector's label
// set. This is short-lived appearance tracking, never a persistent AR anchor.
export type GrayFrame = { data: Uint8Array; width: number; height: number };
export type Patch = { label: string; box: Box; pixels: number[]; lost: number };
const PATCH_SIZE = 12;

export function grayscale(data: Uint8ClampedArray, width: number, height: number): GrayFrame {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
  return { data: gray, width, height };
}

function sample(frame: GrayFrame, box: Box) {
  const pixels: number[] = [];
  for (let y = 0; y < PATCH_SIZE; y++) for (let x = 0; x < PATCH_SIZE; x++) {
    const px = Math.min(frame.width - 1, Math.max(0, Math.floor((box.x + (x + 0.5) / PATCH_SIZE * box.width) * frame.width)));
    const py = Math.min(frame.height - 1, Math.max(0, Math.floor((box.y + (y + 0.5) / PATCH_SIZE * box.height) * frame.height)));
    pixels.push(frame.data[py * frame.width + px]);
  }
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  const centered = pixels.map((value) => value - mean);
  const norm = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0));
  return { pixels: centered.map((value) => value / Math.max(norm, 1)), contrast: norm / PATCH_SIZE };
}

export function createPatch(frame: GrayFrame, box: Box, label: string): Patch | null {
  if (box.width < 0.05 || box.height < 0.05 || box.x < 0 || box.y < 0 || box.x + box.width > 1.001 || box.y + box.height > 1.001) return null;
  const template = sample(frame, box);
  if (template.contrast < 10) return null;
  return { label: label.trim().slice(0, 40) || "Custom item", box, pixels: template.pixels, lost: 0 };
}

export function followPatch(frame: GrayFrame, patch: Patch): Detection | null {
  if (patch.lost > 5) return null;
  let bestScore = -1;
  let bestBox = patch.box;
  const radius = patch.lost ? 0.2 : 0.12;
  for (const scale of [0.94, 1, 1.06]) {
    const width = patch.box.width * scale;
    const height = patch.box.height * scale;
    for (let dy = -radius; dy <= radius + 0.0001; dy += 0.015) for (let dx = -radius; dx <= radius + 0.0001; dx += 0.015) {
      const box = { x: patch.box.x + dx, y: patch.box.y + dy, width, height };
      if (box.x < 0 || box.y < 0 || box.x + width > 1 || box.y + height > 1) continue;
      const candidate = sample(frame, box);
      if (candidate.contrast < 10) continue;
      const score = candidate.pixels.reduce((sum, value, i) => sum + value * patch.pixels[i], 0);
      if (score > bestScore) { bestScore = score; bestBox = box; }
    }
  }
  if (bestScore < 0.78) { patch.lost++; return null; }
  patch.box = bestBox;
  patch.lost = 0;
  return { label: patch.label, score: bestScore, box: bestBox };
}
