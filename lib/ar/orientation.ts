export type CompassReading = { heading: number; accuracy: number | null; relativeYaw: number; isAbsolute: boolean };

type IOSOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

type PermissionedOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<"granted" | "denied">;
};

export function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

export function signedAngleDifference(value: number, origin: number) {
  return ((value - origin + 540) % 360) - 180;
}

export function cardinalDirection(heading: number) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(normalizeAngle(heading) / 45) % 8];
}

export function readingFromEvent(event: DeviceOrientationEvent): CompassReading | null {
  const iosEvent = event as IOSOrientationEvent;
  const relativeYaw = event.alpha == null ? NaN : normalizeAngle(event.alpha);
  if (typeof iosEvent.webkitCompassHeading === "number") {
    return { heading: normalizeAngle(iosEvent.webkitCompassHeading), accuracy: iosEvent.webkitCompassAccuracy ?? null, relativeYaw, isAbsolute: true };
  }
  if (event.absolute && event.alpha != null) {
    return { heading: normalizeAngle(360 - event.alpha), accuracy: null, relativeYaw, isAbsolute: true };
  }
  if (!Number.isNaN(relativeYaw)) return { heading: relativeYaw, accuracy: null, relativeYaw, isAbsolute: false };
  return null;
}

export async function requestOrientationPermission() {
  const OrientationEvent = window.DeviceOrientationEvent as PermissionedOrientationEvent | undefined;
  if (!OrientationEvent?.requestPermission) return true;
  try {
    return await OrientationEvent.requestPermission(true) === "granted";
  } catch {
    try { return await OrientationEvent.requestPermission() === "granted"; } catch { return false; }
  }
}
