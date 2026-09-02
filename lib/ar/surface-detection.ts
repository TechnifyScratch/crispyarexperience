export type SurfaceRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  distanceM: number;
  label: string;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

/**
 * Finds stable, textured planar-looking regions in a camera frame. This is a
 * lightweight monocular fallback for mobile browsers that do not expose ARKit/
 * ARCore plane hit-testing to the web page.
 */
export function detectSurfaceRegions(video: HTMLVideoElement): SurfaceRegion[] {
  if (!video.videoWidth || !video.videoHeight) return [];
  const width = 72;
  const height = Math.max(48, Math.round(width * video.videoHeight / video.videoWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  context.drawImage(video, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const luminance = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
  };

  const columns = 3;
  const rows = 3;
  const regions: SurfaceRegion[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = Math.floor(column * width / columns);
      const x1 = Math.floor((column + 1) * width / columns);
      const y0 = Math.floor(row * height / rows);
      const y1 = Math.floor((row + 1) * height / rows);
      let total = 0;
      let totalSquared = 0;
      let edgeTotal = 0;
      let samples = 0;

      for (let y = y0 + 1; y < y1 - 1; y += 2) {
        for (let x = x0 + 1; x < x1 - 1; x += 2) {
          const value = luminance(x, y);
          total += value;
          totalSquared += value * value;
          edgeTotal += Math.abs(luminance(x + 1, y) - luminance(x - 1, y));
          edgeTotal += Math.abs(luminance(x, y + 1) - luminance(x, y - 1));
          samples += 1;
        }
      }

      if (!samples) continue;
      const mean = total / samples;
      const variance = Math.max(0, totalSquared / samples - mean * mean);
      const edge = edgeTotal / samples;
      const confidence = clamp((Math.sqrt(variance) / 42) * 0.55 + (edge / 44) * 0.45, 0, 1);
      if (confidence < 0.22 || mean < 18 || mean > 244) continue;
      const centerY = (row + 0.5) / rows;
      regions.push({
        id: `${column}-${row}`,
        x: column / columns + 0.025,
        y: row / rows + 0.035,
        width: 1 / columns - 0.05,
        height: 1 / rows - 0.07,
        confidence,
        distanceM: Number(clamp(0.55 + (1 - centerY) * 1.25, 0.45, 2.2).toFixed(2)),
        label: row === 2 ? "counter or floor" : "vertical surface",
      });
    }
  }

  return regions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}
