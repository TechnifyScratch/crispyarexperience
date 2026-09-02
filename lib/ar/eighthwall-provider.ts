import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ImagePlacement } from "@/lib/ar/mindar-provider";

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
type PipelineModule = {
  name: string;
  onStart?: (args: { canvas: HTMLCanvasElement }) => void;
  onAttach?: (args: { video?: HTMLVideoElement }) => void;
  onUpdate?: (args: { processCpuResult?: { reality?: { worldPoints?: WorldPoint[]; position?: Vec3; rotation?: Quat } } }) => void;
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
  placeAt: (clientX: number, clientY: number) => boolean;
  updateCraig: (sizeM: number, yaw: number) => void;
  getPlacement: () => ImagePlacement | null;
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

function targetData(imageUrl: string, width: number, height: number) {
  return [{
    imagePath: imageUrl,
    name: "crispy-landmark",
    type: "PLANAR",
    metadata: {},
    properties: { left: 0, top: 0, width, height, originalWidth: width, originalHeight: height, isRotated: false },
  }];
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

async function mount(options: {
  canvas: HTMLCanvasElement;
  target?: { imageUrl: string; width: number; height: number };
  placement?: ImagePlacement;
  admin: boolean;
  onReady?: () => void;
  onLocalized?: () => void;
  onTrackingLost?: () => void;
  onPose?: (yaw: number, position?: Vec3) => void;
  onSurfacePoints?: (count: number) => void;
}): Promise<EighthWallMount | EighthWallAdminMount> {
  const [XR8, craig] = await Promise.all([loadRuntime(), createCraig()]);
  const canvas = options.canvas;
  let video: HTMLVideoElement | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let points: WorldPoint[] = [];
  let targetMatrix: THREE.Matrix4 | null = null;
  let selectedWorld: THREE.Vector3 | null = null;
  let sizeM = options.placement?.scale ?? 0.3;
  let yaw = 0;
  let targetVisible = false;
  let localized = false;
  let outline: THREE.LineSegments | null = null;
  let pointCloud: THREE.Points | null = null;
  const relativeMatrix = new THREE.Matrix4();

  craig.visible = false;
  craig.matrixAutoUpdate = true;

  const applyTarget = (detail: ImageEvent) => {
    if (detail.name !== "crispy-landmark") return;
    targetMatrix = compose(detail);
    targetVisible = true;
    if (options.placement) {
      relativeMatrix.compose(
        new THREE.Vector3(options.placement.position.x, options.placement.position.y, options.placement.position.z),
        new THREE.Quaternion(options.placement.rotation.x, options.placement.rotation.y, options.placement.rotation.z, options.placement.rotation.w),
        new THREE.Vector3(options.placement.scale, options.placement.scale, options.placement.scale),
      );
      const world = targetMatrix.clone().multiply(relativeMatrix);
      world.decompose(craig.position, craig.quaternion, craig.scale);
      craig.visible = true;
    }
    if (!localized) {
      localized = true;
      options.onLocalized?.();
    }
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
      camera.position.set(0, 1.6, 0);
      XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
    },
    onAttach: ({ video: attachedVideo }) => {
      if (attachedVideo) video = attachedVideo;
      options.onReady?.();
    },
    onUpdate: ({ processCpuResult }) => {
      const reality = processCpuResult?.reality;
      if (!reality) return;
      points = reality.worldPoints ?? points;
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
      { event: "reality.imagelost", process: () => { targetVisible = false; options.onTrackingLost?.(); } },
    ],
  };

  XR8.XrController.configure({
    disableWorldTracking: false,
    enableWorldPoints: options.admin,
    enableLighting: true,
    scale: "absolute",
    imageTargetData: options.target ? targetData(options.target.imageUrl, options.target.width, options.target.height) : [],
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

  return {
    ...base,
    setTarget: (imageUrl, width, height) => {
      XR8.XrController.configure({ imageTargetData: targetData(imageUrl, width, height) });
    },
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
      craig.position.copy(selectedWorld);
      craig.rotation.set(0, yaw, 0);
      craig.scale.setScalar(sizeM);
      craig.visible = true;
      if (outline) scene.remove(outline);
      const geometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.62, 0.62));
      outline = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x70ffb0, transparent: true, opacity: 0.92 }));
      outline.rotation.x = -Math.PI / 2;
      outline.position.copy(selectedWorld);
      outline.position.y += 0.003;
      scene.add(outline);
      return true;
    },
    updateCraig: (nextSize, nextYaw) => {
      sizeM = nextSize;
      yaw = nextYaw;
      if (!selectedWorld) return;
      craig.scale.setScalar(sizeM);
      craig.rotation.set(0, yaw, 0);
    },
    getPlacement: () => {
      if (!targetMatrix || !selectedWorld) return null;
      craig.updateMatrixWorld(true);
      const local = targetMatrix.clone().invert().multiply(craig.matrixWorld);
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      local.decompose(position, rotation, scale);
      return {
        targetIndex: 0,
        position: { x: position.x, y: position.y, z: position.z, targetIndexes: [0] },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
        scale: scale.x,
      };
    },
  };
}

export function mountEighthWallHunt(options: {
  canvas: HTMLCanvasElement;
  imageTargetSrc: string;
  placement: ImagePlacement;
  onReady?: () => void;
  onLocalized: () => void;
  onTrackingLost?: () => void;
}) {
  return mount({ canvas: options.canvas, target: { imageUrl: options.imageTargetSrc, width: 480, height: 640 }, placement: options.placement, admin: false, onReady: options.onReady, onLocalized: options.onLocalized, onTrackingLost: options.onTrackingLost }) as Promise<EighthWallMount>;
}

export function mountEighthWallAdmin(options: {
  canvas: HTMLCanvasElement;
  onReady: () => void;
  onLocalized: () => void;
  onTrackingLost?: () => void;
  onPose: (yaw: number, position?: Vec3) => void;
  onSurfacePoints: (count: number) => void;
}) {
  return mount({ ...options, admin: true }) as Promise<EighthWallAdminMount>;
}
