import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { ImagePlacement, SpatialAnchor } from "@/lib/ar/mindar-provider";

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };
type ImageEvent = {
  name: string;
  position: Vec3;
  rotation: Quat;
  scale: number;
  scaledWidth?: number;
  scaledHeight?: number;
};
type WorldPoint = { id: number; confidence: number; position: Vec3 };
type LocalizationCandidate = {
  name: string;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: number;
  previousPosition: THREE.Vector3;
  previousRotation: THREE.Quaternion;
  previousScale: number;
  frames: number;
  startedAt: number;
};
type PipelineModule = {
  name: string;
  onStart?: (args: { canvas: HTMLCanvasElement }) => void;
  onAttach?: (args: { video?: HTMLVideoElement; stream?: MediaStream }) => void;
  onUpdate?: (args: { processCpuResult?: { reality?: { worldPoints?: WorldPoint[]; position?: Vec3; rotation?: Quat; trackingStatus?: string; trackingReason?: string } } }) => void;
  listeners?: { event: string; process: (args: { detail: ImageEvent }) => void }[];
};
type XR8Runtime = {
  GlTextureRenderer: { pipelineModule: () => PipelineModule };
  Threejs: { pipelineModule: () => PipelineModule; xrScene: () => { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer } };
  XrController: {
    pipelineModule: () => PipelineModule;
    configure: (options: Record<string, unknown>) => void;
    updateCameraProjectionMatrix: (options: { origin: THREE.Vector3; facing: THREE.Quaternion }) => void;
  };
  XrConfig: { device: () => { MOBILE: string } };
  addCameraPipelineModules: (modules: PipelineModule[]) => void;
  removeCameraPipelineModules: (modules: PipelineModule[]) => void;
  run: (options: Record<string, unknown>) => void;
  stop: () => void;
};

declare global {
  interface Window {
    XR8?: XR8Runtime;
    THREE?: typeof THREE;
    __crispy8thWallLoading?: Promise<XR8Runtime>;
  }
}

export type EighthWallMount = {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  cleanup: () => void;
  capture: () => string;
};

export type EighthWallAdminMount = EighthWallMount & {
  setTarget: (imageUrl: string, width: number, height: number) => void;
  addTarget: (name: string, imageUrl: string, width: number, height: number) => void;
  consumeTransformInteraction: () => boolean;
  placeAt: (clientX: number, clientY: number) => boolean;
  setPositionOffset: (offset: Vec3) => void;
  updateCraig: (sizeM: number, yaw: number) => void;
  getPlacement: () => ImagePlacement | null;
  getAnchorPlacements: () => Omit<SpatialAnchor, "imageUrl">[];
};

type TargetDefinition = {
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  placement?: ImagePlacement;
};

function loadRuntime() {
  if (window.XR8) return Promise.resolve(window.XR8);
  if (window.__crispy8thWallLoading) return window.__crispy8thWallLoading;
  window.__crispy8thWallLoading = new Promise<XR8Runtime>((resolve, reject) => {
    window.THREE = THREE;
    const existing = document.querySelector<HTMLScriptElement>("script[data-crispy-8thwall]");
    const script = existing ?? document.createElement("script");
    const finish = () => window.XR8 ? resolve(window.XR8) : reject(new Error("8th Wall did not initialize."));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("The spatial tracking engine could not load.")), { once: true });
    if (!existing) {
      script.src = "/vendor/8thwall/xr.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.preloadChunks = "slam";
      script.dataset.crispy8thwall = "true";
      document.head.appendChild(script);
    }
  });
  return window.__crispy8thWallLoading;
}

async function createCraig() {
  const gltf = await new GLTFLoader().loadAsync("/models/crispy-craig.glb");
  const model = gltf.scene;
  model.rotation.x = -Math.PI / 2;
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  model.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.set(-center.x, -box.min.y, -center.z);
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = new THREE.MeshStandardMaterial({ color: 0xe1a055, roughness: 0.74, metalness: 0.01 });
    object.castShadow = true;
  });
  const group = new THREE.Group();
  group.add(model);
  return group;
}

function targetData(targets: TargetDefinition[]) {
  return targets.map((target) => ({
    imagePath: target.imageUrl,
    name: target.name,
    type: "PLANAR",
    metadata: {},
    properties: { left: 0, top: 0, width: target.width, height: target.height, originalWidth: target.width, originalHeight: target.height, isRotated: false },
  }));
}

function compose(detail: ImageEvent) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(detail.position.x, detail.position.y, detail.position.z),
    new THREE.Quaternion(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w),
    new THREE.Vector3(detail.scale, detail.scale, detail.scale),
  );
}

function cameraYaw(rotation?: Quat) {
  if (!rotation) return null;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w));
  return Math.atan2(-forward.x, -forward.z);
}

function horizontalSupportHeight(worldPoints: WorldPoint[], expected: THREE.Vector3) {
  const nearby = worldPoints.filter((point) => {
    if (point.confidence <= 0) return false;
    const dx = point.position.x - expected.x;
    const dz = point.position.z - expected.z;
    return Math.hypot(dx, dz) < 0.48 && Math.abs(point.position.y - expected.y) < 0.32;
  });
  const bands = new Map<number, WorldPoint[]>();
  for (const point of nearby) {
    const band = Math.round(point.position.y / 0.035);
    bands.set(band, [...(bands.get(band) ?? []), point]);
  }
  let best: { y: number; score: number } | null = null;
  for (const band of bands.values()) {
    if (band.length < 7) continue;
    const meanY = band.reduce((sum, point) => sum + point.position.y, 0) / band.length;
    const deviation = Math.sqrt(band.reduce((sum, point) => sum + (point.position.y - meanY) ** 2, 0) / band.length);
    const xs = band.map((point) => point.position.x);
    const zs = band.map((point) => point.position.z);
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadZ = Math.max(...zs) - Math.min(...zs);
    if (deviation > 0.025 || spreadX < 0.1 || spreadZ < 0.07) continue;
    const score = Math.abs(meanY - expected.y) + deviation * 3 - Math.min(band.length, 30) * 0.001;
    if (!best || score < best.score) best = { y: meanY, score };
  }
  return best?.y ?? null;
}

async function mount(options: {
  canvas: HTMLCanvasElement;
  targets?: TargetDefinition[];
  placement?: ImagePlacement;
  admin: boolean;
  onReady?: () => void;
  onLocalized?: () => void;
  onTrackingLost?: () => void;
  onLocalizationProgress?: (progress: number) => void;
  onPose?: (yaw: number, position?: Vec3) => void;
  onSurfacePoints?: (count: number) => void;
  onPositionOffset?: (offset: Vec3) => void;
}): Promise<EighthWallMount | EighthWallAdminMount> {
  const [XR8, craig] = await Promise.all([loadRuntime(), createCraig()]);
  const canvas = options.canvas;
  let video: HTMLVideoElement | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let points: WorldPoint[] = [];
  let targetMatrix: THREE.Matrix4 | null = null;
  const targetMatrices = new Map<string, THREE.Matrix4>();
  const targetDefinitions = [...(options.targets ?? [])];
  const placementByTarget = new Map(targetDefinitions.filter((target) => target.placement).map((target) => [target.name, target.placement!]));
  const visibleTargets = new Set<string>();
  const candidates = new Map<string, LocalizationCandidate>();
  let selectedWorld: THREE.Vector3 | null = null;
  let baseWorld: THREE.Vector3 | null = null;
  let sizeM = options.placement?.scale ?? 0.3;
  let yaw = 0;
  let targetVisible = false;
  let localized = false;
  let trackingNormal = false;
  let anchoredPosition: THREE.Vector3 | null = null;
  let supportCandidateY: number | null = null;
  let supportCandidateFrames = 0;
  let outline: THREE.LineSegments | null = null;
  let pointCloud: THREE.Points | null = null;
  let transformControls: TransformControls | null = null;
  let transformHelper: THREE.Object3D | null = null;
  let lastTransformInteraction = 0;
  const relativeMatrix = new THREE.Matrix4();

  craig.visible = false;
  craig.matrixAutoUpdate = true;

  const placePlayerCraig = (matrix: THREE.Matrix4, placement?: ImagePlacement) => {
    const resolvedPlacement = placement ?? options.placement;
    if (!resolvedPlacement) return;
    targetMatrix = matrix;
    relativeMatrix.compose(
      new THREE.Vector3(resolvedPlacement.position.x, resolvedPlacement.position.y, resolvedPlacement.position.z),
      new THREE.Quaternion(resolvedPlacement.rotation.x, resolvedPlacement.rotation.y, resolvedPlacement.rotation.z, resolvedPlacement.rotation.w),
      new THREE.Vector3(resolvedPlacement.scale, resolvedPlacement.scale, resolvedPlacement.scale),
    );
    const world = targetMatrix.clone().multiply(relativeMatrix);
    const worldPosition = new THREE.Vector3();
    const worldRotation = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    world.decompose(worldPosition, worldRotation, worldScale);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(worldRotation);
    const uprightYaw = Math.atan2(forward.x, forward.z);
    craig.position.copy(worldPosition);
    craig.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), uprightYaw);
    craig.scale.setScalar((Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3);
    anchoredPosition = worldPosition.clone();
    supportCandidateY = null;
    supportCandidateFrames = 0;
    craig.visible = trackingNormal;
    localized = true;
    options.onLocalizationProgress?.(1);
    options.onLocalized?.();
  };

  const settleCraigOnSurface = () => {
    if (options.admin || !localized || !anchoredPosition) return;
    const supportY = horizontalSupportHeight(points, anchoredPosition);
    if (supportY == null) {
      supportCandidateY = null;
      supportCandidateFrames = 0;
      return;
    }
    if (supportCandidateY == null || Math.abs(supportCandidateY - supportY) > 0.035) {
      supportCandidateY = supportY;
      supportCandidateFrames = 1;
      return;
    }
    supportCandidateY = THREE.MathUtils.lerp(supportCandidateY, supportY, 0.25);
    supportCandidateFrames += 1;
    if (supportCandidateFrames >= 5) craig.position.y = THREE.MathUtils.lerp(craig.position.y, supportCandidateY, 0.22);
  };

  const resetCandidate = (name?: string) => {
    if (name) candidates.delete(name);
    else candidates.clear();
    options.onLocalizationProgress?.(0);
  };

  const confirmCandidate = () => {
    if (options.admin || localized || !targetVisible || !trackingNormal) return;
    let best: LocalizationCandidate | null = null;
    let bestProgress = 0;
    for (const candidate of candidates.values()) {
      if (!visibleTargets.has(candidate.name)) continue;
      const elapsed = performance.now() - candidate.startedAt;
      const progress = Math.min(1, candidate.frames / 3, elapsed / 250);
      bestProgress = Math.max(bestProgress, progress);
      if (candidate.frames >= 3 && elapsed >= 250 && (!best || candidate.frames > best.frames)) best = candidate;
    }
    options.onLocalizationProgress?.(bestProgress);
    if (best) {
      const placement = placementByTarget.get(best.name) ?? options.placement;
      placePlayerCraig(new THREE.Matrix4().compose(
        best.position,
        best.rotation,
        new THREE.Vector3(best.scale, best.scale, best.scale),
      ), placement);
    }
  };

  const applyTarget = (detail: ImageEvent) => {
    if (!targetDefinitions.some((target) => target.name === detail.name)) return;
    visibleTargets.add(detail.name);
    targetVisible = true;
    if (options.admin) {
      const matrix = compose(detail);
      targetMatrices.set(detail.name, matrix);
      if (detail.name === "crispy-landmark-0") targetMatrix = matrix;
      if (detail.name === "crispy-landmark-0" && !localized) {
        localized = true;
        options.onLocalized?.();
      }
      return;
    }
    if (localized || !trackingNormal) return;

    const position = new THREE.Vector3(detail.position.x, detail.position.y, detail.position.z);
    const rotation = new THREE.Quaternion(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w).normalize();
    const values = [...position.toArray(), ...rotation.toArray(), detail.scale];
    if (!values.every(Number.isFinite) || detail.scale <= 0) {
      resetCandidate(detail.name);
      return;
    }
    const candidate = candidates.get(detail.name);
    if (!candidate) {
      candidates.set(detail.name, {
        name: detail.name,
        position,
        rotation,
        scale: detail.scale,
        previousPosition: position.clone(),
        previousRotation: rotation.clone(),
        previousScale: detail.scale,
        frames: 1,
        startedAt: performance.now(),
      });
      return;
    }

    const positionDelta = candidate.previousPosition.distanceTo(position);
    const rotationDelta = candidate.previousRotation.angleTo(rotation);
    const scaleDelta = Math.abs(detail.scale - candidate.previousScale) / Math.max(candidate.previousScale, 0.0001);
    if (positionDelta > 0.12 || rotationDelta > THREE.MathUtils.degToRad(10) || scaleDelta > 0.2) {
      candidates.set(detail.name, {
        name: detail.name,
        position,
        rotation,
        scale: detail.scale,
        previousPosition: position.clone(),
        previousRotation: rotation.clone(),
        previousScale: detail.scale,
        frames: 1,
        startedAt: performance.now(),
      });
      return;
    }

    candidate.previousPosition.copy(position);
    candidate.previousRotation.copy(rotation);
    candidate.previousScale = detail.scale;
    candidate.position.lerp(position, 0.18);
    candidate.rotation.slerp(rotation, 0.18);
    candidate.scale = THREE.MathUtils.lerp(candidate.scale, detail.scale, 0.18);
    candidate.frames += 1;
    confirmCandidate();
  };

  const sceneModule: PipelineModule = {
    name: `crispy-spatial-${options.admin ? "admin" : "hunt"}`,
    onStart: () => {
      const xrScene = XR8.Threejs.xrScene();
      scene = xrScene.scene;
      camera = xrScene.camera;
      xrScene.renderer.shadowMap.enabled = true;
      xrScene.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      scene.add(new THREE.HemisphereLight(0xfff4dc, 0x4a3327, 2.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.8);
      key.position.set(-2, 4, 2);
      key.castShadow = true;
      scene.add(key, craig);
      if (options.admin) {
        transformControls = new TransformControls(camera, canvas);
        transformControls.setMode("translate");
        transformControls.setSpace("world");
        transformControls.setSize(0.72);
        transformControls.addEventListener("mouseDown", () => { lastTransformInteraction = performance.now(); });
        transformControls.addEventListener("mouseUp", () => { lastTransformInteraction = performance.now(); });
        transformControls.addEventListener("objectChange", () => {
          lastTransformInteraction = performance.now();
          if (!baseWorld) return;
          selectedWorld = craig.position.clone();
          options.onPositionOffset?.({
            x: selectedWorld.x - baseWorld.x,
            y: selectedWorld.y - baseWorld.y,
            z: selectedWorld.z - baseWorld.z,
          });
        });
        transformHelper = transformControls.getHelper();
        scene.add(transformHelper);
      }
      camera.position.set(0, 1.6, 0);
      XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
    },
    onAttach: ({ video: attachedVideo, stream }) => {
      if (attachedVideo) video = attachedVideo;
      const improveCamera = async () => {
        const track = stream?.getVideoTracks()[0];
        if (track) {
          try {
            await track.applyConstraints({
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, min: 24 },
            });
          } catch {
            // Some iOS cameras expose a fixed AR-compatible format.
          }
        }
        window.setTimeout(() => options.onReady?.(), 700);
      };
      void improveCamera();
    },
    onUpdate: ({ processCpuResult }) => {
      const reality = processCpuResult?.reality;
      if (!reality) return;
      const nextNormal = reality.trackingStatus === "NORMAL" && reality.trackingReason !== "INITIALIZING";
      if (!options.admin) {
        if (trackingNormal && !nextNormal) {
          craig.visible = false;
          localized = false;
          targetVisible = false;
          anchoredPosition = null;
          supportCandidateY = null;
          supportCandidateFrames = 0;
          visibleTargets.clear();
          resetCandidate();
          options.onTrackingLost?.();
        }
        trackingNormal = nextNormal;
        confirmCandidate();
      }
      points = reality.worldPoints ?? points;
      settleCraigOnSurface();
      const poseYaw = cameraYaw(reality.rotation);
      if (poseYaw != null) options.onPose?.(poseYaw, reality.position);
      options.onSurfacePoints?.(points.length);
      if (!options.admin || !scene) return;
      if (!pointCloud) {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.PointsMaterial({ color: 0x77ffc3, size: 0.012, transparent: true, opacity: 0.72, sizeAttenuation: true });
        pointCloud = new THREE.Points(geometry, material);
        scene.add(pointCloud);
      }
      const visible = points.filter((point) => point.confidence > 0).slice(0, 900);
      pointCloud.geometry.setFromPoints(visible.map((point) => new THREE.Vector3(point.position.x, point.position.y, point.position.z)));
    },
    listeners: [
      { event: "reality.imagefound", process: ({ detail }) => applyTarget(detail) },
      { event: "reality.imageupdated", process: ({ detail }) => { if (targetVisible || !localized) applyTarget(detail); } },
      { event: "reality.imagelost", process: ({ detail }) => {
        visibleTargets.delete(detail.name);
        targetVisible = visibleTargets.size > 0;
        if (!options.admin && !localized) {
          resetCandidate(detail.name);
        }
      } },
    ],
  };

  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.max(720, Math.round(bounds.width * pixelRatio));
  canvas.height = Math.max(960, Math.round(bounds.height * pixelRatio));

  XR8.XrController.configure({
    disableWorldTracking: false,
    enableWorldPoints: true,
    enableLighting: true,
    scale: "absolute",
    imageTargetData: targetData(targetDefinitions),
  });
  const modules = [XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), sceneModule];
  XR8.addCameraPipelineModules(modules);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().MOBILE, glContextConfig: { alpha: false, antialias: true, preserveDrawingBuffer: true } });

  await new Promise<void>((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (video?.videoWidth) return resolve();
      if (performance.now() - started > 15000) return reject(new Error("The spatial camera did not start."));
      requestAnimationFrame(check);
    };
    check();
  });

  const cleanup = () => {
    transformControls?.detach();
    transformControls?.dispose();
    if (transformHelper) scene?.remove(transformHelper);
    try { XR8.stop(); } catch { /* already stopped */ }
    try { XR8.removeCameraPipelineModules(modules); } catch { /* already removed */ }
    scene?.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments)) return;
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    });
  };
  const capture = () => canvas.toDataURL("image/jpeg", 0.9);
  const base = { canvas, get video() { return video!; }, cleanup, capture };
  if (!options.admin) return base;

  const placementFromTarget = (matrix: THREE.Matrix4): Omit<SpatialAnchor, "imageUrl" | "name"> | null => {
    if (!selectedWorld) return null;
    craig.updateMatrixWorld(true);
    const local = matrix.clone().invert().multiply(craig.matrixWorld);
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    local.decompose(position, rotation, scale);
    return {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      scale: scale.x,
    };
  };

  return {
    ...base,
    setTarget: (imageUrl, width, height) => {
      targetDefinitions.splice(0, targetDefinitions.length, { name: "crispy-landmark-0", imageUrl, width, height });
      targetMatrices.clear();
      visibleTargets.clear();
      XR8.XrController.configure({ imageTargetData: targetData(targetDefinitions) });
    },
    addTarget: (name, imageUrl, width, height) => {
      const existing = targetDefinitions.findIndex((target) => target.name === name);
      const definition = { name, imageUrl, width, height };
      if (existing >= 0) targetDefinitions[existing] = definition;
      else targetDefinitions.push(definition);
      XR8.XrController.configure({ imageTargetData: targetData(targetDefinitions) });
    },
    consumeTransformInteraction: () => transformControls?.dragging === true || performance.now() - lastTransformInteraction < 260,
    placeAt: (clientX, clientY) => {
      if (!camera || !scene || !targetMatrix || points.length === 0) return false;
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, camera);
      let best: { point: THREE.Vector3; miss: number } | null = null;
      for (const item of points) {
        const point = new THREE.Vector3(item.position.x, item.position.y, item.position.z);
        const along = point.clone().sub(ray.ray.origin).dot(ray.ray.direction);
        if (along < 0.15 || along > 8) continue;
        const closest = ray.ray.origin.clone().addScaledVector(ray.ray.direction, along);
        const miss = closest.distanceTo(point) / along;
        if (miss < 0.055 && (!best || miss < best.miss)) best = { point, miss };
      }
      if (!best) return false;
      const neighbors = points.map((item) => new THREE.Vector3(item.position.x, item.position.y, item.position.z)).filter((point) => point.distanceTo(best!.point) < 0.34);
      const surfaceY = neighbors.length >= 4 ? neighbors.reduce((sum, point) => sum + point.y, 0) / neighbors.length : best.point.y;
      selectedWorld = best.point.clone();
      selectedWorld.y = surfaceY;
      baseWorld = selectedWorld.clone();
      craig.position.copy(selectedWorld);
      craig.rotation.set(0, yaw, 0);
      craig.scale.setScalar(sizeM);
      craig.visible = true;
      transformControls?.attach(craig);
      options.onPositionOffset?.({ x: 0, y: 0, z: 0 });
      if (outline) scene.remove(outline);
      const geometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.62, 0.62));
      outline = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x70ffb0, transparent: true, opacity: 0.92 }));
      outline.rotation.x = -Math.PI / 2;
      outline.position.copy(selectedWorld);
      outline.position.y += 0.003;
      scene.add(outline);
      return true;
    },
    setPositionOffset: (offset) => {
      if (!baseWorld) return;
      craig.position.set(baseWorld.x + offset.x, baseWorld.y + offset.y, baseWorld.z + offset.z);
      selectedWorld = craig.position.clone();
      lastTransformInteraction = performance.now();
    },
    updateCraig: (nextSize, nextYaw) => {
      sizeM = nextSize;
      yaw = nextYaw;
      if (!selectedWorld) return;
      craig.scale.setScalar(sizeM);
      craig.rotation.set(0, yaw, 0);
    },
    getPlacement: () => {
      if (!targetMatrix) return null;
      const placement = placementFromTarget(targetMatrix);
      if (!placement) return null;
      return {
        targetIndex: 0,
        position: { ...placement.position, targetIndexes: [0] },
        rotation: placement.rotation,
        scale: placement.scale,
      };
    },
    getAnchorPlacements: () => targetDefinitions.flatMap((target) => {
      const matrix = targetMatrices.get(target.name);
      if (!matrix) return [];
      const placement = placementFromTarget(matrix);
      return placement ? [{ name: target.name, ...placement }] : [];
    }),
  };
}

export function mountEighthWallHunt(options: {
  canvas: HTMLCanvasElement;
  imageTargetSrc: string;
  placement: ImagePlacement;
  onReady?: () => void;
  onLocalized: () => void;
  onTrackingLost?: () => void;
  onLocalizationProgress?: (progress: number) => void;
}) {
  const savedAnchors = options.placement.position.anchors ?? [];
  const targets: TargetDefinition[] = savedAnchors.length > 0
    ? savedAnchors.map((anchor) => ({
      name: anchor.name,
      imageUrl: anchor.imageUrl,
      width: 480,
      height: 640,
      placement: { position: anchor.position, rotation: anchor.rotation, scale: anchor.scale },
    }))
    : [{ name: "crispy-landmark-0", imageUrl: options.imageTargetSrc, width: 480, height: 640, placement: options.placement }];
  return mount({ canvas: options.canvas, targets, placement: options.placement, admin: false, onReady: options.onReady, onLocalized: options.onLocalized, onTrackingLost: options.onTrackingLost, onLocalizationProgress: options.onLocalizationProgress }) as Promise<EighthWallMount>;
}

export function mountEighthWallAdmin(options: {
  canvas: HTMLCanvasElement;
  onReady: () => void;
  onLocalized: () => void;
  onTrackingLost?: () => void;
  onPose: (yaw: number, position?: Vec3) => void;
  onSurfacePoints: (count: number) => void;
  onPositionOffset?: (offset: Vec3) => void;
}) {
  return mount({ ...options, admin: true }) as Promise<EighthWallAdminMount>;
}
