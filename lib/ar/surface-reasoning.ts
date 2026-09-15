export type SpatialPoint = { id: number; confidence: number; position: { x: number; y: number; z: number } };

export type SupportPlane = {
  y: number;
  sampleCount: number;
  deviation: number;
  spreadX: number;
  spreadZ: number;
  footprintArea: number;
  minorSpread: number;
  confidence: number;
};

type Point2 = { x: number; z: number };
type TrackedPoint = {
  point: SpatialPoint;
  anchor: SpatialPoint["position"];
  firstSeenAt: number;
  seenAt: number;
  observations: number;
};

const cross = (origin: Point2, a: Point2, b: Point2) =>
  (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);

function convexHull(points: Point2[]) {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (ordered.length <= 2) return ordered;
  const lower: Point2[] = [];
  for (const point of ordered) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point2[] = [];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const point = ordered[index];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function polygonArea(points: Point2[]) {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    twiceArea += points[index].x * next.z - next.x * points[index].z;
  }
  return Math.abs(twiceArea) / 2;
}

function pointInConvexHull(point: Point2, hull: Point2[]) {
  if (hull.length < 3) return false;
  let sign = 0;
  for (let index = 0; index < hull.length; index += 1) {
    const value = cross(hull[index], hull[(index + 1) % hull.length], point);
    if (Math.abs(value) < 1e-6) continue;
    const nextSign = Math.sign(value);
    if (sign !== 0 && sign !== nextSign) return false;
    sign = nextSign;
  }
  return true;
}

function distanceToSegment(point: Point2, start: Point2, end: Point2) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.z - start.z);
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return Math.hypot(point.x - (start.x + amount * dx), point.z - (start.z + amount * dz));
}

function footprintSupports(point: Point2, hull: Point2[], edgeTolerance = 0.045) {
  if (pointInConvexHull(point, hull)) return true;
  return hull.some((start, index) => distanceToSegment(point, start, hull[(index + 1) % hull.length]) <= edgeTolerance);
}

/** Keeps only SLAM points that remain at the same world position across frames. */
export class StableWorldPointStore {
  private records = new Map<number, TrackedPoint>();

  clear() { this.records.clear(); }

  update(points: SpatialPoint[], now: number) {
    for (const point of points) {
      if (point.confidence <= 0) continue;
      const previous = this.records.get(point.id);
      const drift = previous ? Math.hypot(
        point.position.x - previous.anchor.x,
        point.position.y - previous.anchor.y,
        point.position.z - previous.anchor.z,
      ) : 0;
      const observationGap = previous ? now - previous.seenAt : Infinity;
      // Compare with the first observation, not only the prior frame. This
      // prevents a slowly moving chair, tray, or person from accumulating into
      // apparently stable support geometry.
      if (!previous || drift > 0.02 || observationGap > 260) {
        this.records.set(point.id, { point, anchor: { ...point.position }, firstSeenAt: now, seenAt: now, observations: 1 });
      } else {
        this.records.set(point.id, { ...previous, point, seenAt: now, observations: previous.observations + 1 });
      }
    }
    for (const [id, record] of this.records) {
      if (now - record.seenAt > 1800) this.records.delete(id);
    }
    return [...this.records.values()]
      .filter((record) => record.observations >= 8 && now - record.firstSeenAt >= 320)
      .map((record) => record.point);
  }
}

/**
 * Finds a genuinely two-dimensional horizontal footprint under the expected
 * position. A same-height line across a wall or cabinet cannot qualify.
 */
export function selectHorizontalSupportPlane(
  worldPoints: SpatialPoint[],
  expected: { x: number; y: number; z: number },
  radius = 0.48,
  verticalTolerance = 0.32,
): SupportPlane | null {
  const nearby = worldPoints.filter((point) => {
    const dx = point.position.x - expected.x;
    const dz = point.position.z - expected.z;
    return point.confidence > 0 && Math.hypot(dx, dz) < radius && Math.abs(point.position.y - expected.y) < verticalTolerance;
  });
  const candidateBands = new Set(nearby.map((point) => Math.round(point.position.y / 0.03)));
  let best: (SupportPlane & { score: number }) | null = null;
  for (const band of candidateBands) {
    const pool = nearby.filter((point) => Math.abs(point.position.y - band * 0.03) <= 0.04);
    if (pool.length < 10) continue;
    const orderedY = pool.map((point) => point.position.y).sort((a, b) => a - b);
    const medianY = orderedY[Math.floor(orderedY.length / 2)];
    const inliers = pool.filter((point) => Math.abs(point.position.y - medianY) <= 0.018);
    if (inliers.length < 10) continue;
    const meanY = inliers.reduce((sum, point) => sum + point.position.y, 0) / inliers.length;
    const deviation = Math.sqrt(inliers.reduce((sum, point) => sum + (point.position.y - meanY) ** 2, 0) / inliers.length);
    if (deviation > 0.014) continue;

    const footprint = inliers.map((point) => ({ x: point.position.x, z: point.position.z }));
    const meanX = footprint.reduce((sum, point) => sum + point.x, 0) / footprint.length;
    const meanZ = footprint.reduce((sum, point) => sum + point.z, 0) / footprint.length;
    const covarianceXX = footprint.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0) / footprint.length;
    const covarianceZZ = footprint.reduce((sum, point) => sum + (point.z - meanZ) ** 2, 0) / footprint.length;
    const covarianceXZ = footprint.reduce((sum, point) => sum + (point.x - meanX) * (point.z - meanZ), 0) / footprint.length;
    const root = Math.sqrt((covarianceXX - covarianceZZ) ** 2 + 4 * covarianceXZ ** 2);
    const minorSpread = Math.sqrt(Math.max(0, (covarianceXX + covarianceZZ - root) / 2));
    const hull = convexHull(footprint);
    const footprintArea = polygonArea(hull);
    const expected2d = { x: expected.x, z: expected.z };
    const underfoot = footprint.filter((point) => Math.hypot(point.x - expected.x, point.z - expected.z) <= 0.18);
    const underfootHull = convexHull(underfoot);
    const underfootArea = polygonArea(underfootHull);
    if (minorSpread < 0.025 || footprintArea < 0.012 || underfoot.length < 5 || underfootArea < 0.0035 || !footprintSupports(expected2d, underfootHull, 0.025)) continue;

    const xs = footprint.map((point) => point.x);
    const zs = footprint.map((point) => point.z);
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadZ = Math.max(...zs) - Math.min(...zs);
    const flatness = Math.max(0, 1 - deviation / 0.014);
    const areaScore = Math.min(1, footprintArea / 0.075);
    const widthScore = Math.min(1, minorSpread / 0.065);
    const densityScore = Math.min(1, inliers.length / 28);
    const confidence = flatness * 0.3 + areaScore * 0.28 + widthScore * 0.27 + densityScore * 0.15;
    const score = Math.abs(meanY - expected.y) - confidence * 0.055;
    if (!best || score < best.score) best = { y: meanY, sampleCount: inliers.length, deviation, spreadX, spreadZ, footprintArea, minorSpread, confidence, score };
  }
  if (!best) return null;
  const { score: _score, ...plane } = best;
  void _score;
  return plane;
}
