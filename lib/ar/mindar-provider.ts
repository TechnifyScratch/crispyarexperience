import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type ImagePlacement = {
  targetIndex?: number;
  position: {
    x: number;
    y: number;
    z: number;
    targetIndexes?: number[];
    heading?: number | null;
    headingAccuracy?: number | null;
    scanSpan?: number;
    snapshotUrl?: string;
    anchors?: SpatialAnchor[];
    visualMap?: {
      version: number;
      method: "multi-view";
      anchorCount: number;
      minimumAgreement: number;
    };
    surface?: {
      kind: "horizontal";
      required: boolean;
      toleranceM: number;
      offsetM: number;
      sampleCount: number;
      deviationM: number;
    };
  };
  rotation: { x: number; y: number; z: number; w: number };
  scale: number;
};

export type SpatialAnchor = {
  name: string;
  imageUrl: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: number;
  quality?: number;
};

type MindARAnchor = { group: THREE.Group; onTargetFound?: () => void; onTargetLost?: () => void };
type MindARInstance = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  video: HTMLVideoElement;
  addAnchor: (targetIndex: number) => MindARAnchor;
  start: () => Promise<void>;
  stop: () => void;
};
type MindARConstructor = new (options: { container: HTMLElement; imageTargetSrc: string; maxTrack: number; uiLoading: "no"; uiScanning: "no"; uiError: "no"; filterMinCF?: number; filterBeta?: number; warmupTolerance?: number; missTolerance?: number }) => MindARInstance;

declare global {
  interface Window {
    MINDAR?: { IMAGE?: { MindARThree?: MindARConstructor } };
    __crispyMindArLoading?: Promise<void>;
  }
}

type MountOptions = {
  host: HTMLElement;
  imageTargetSrc: string;
  targetIndex: number;
  placement: ImagePlacement;
  onLocated: () => void;
  onLost: () => void;
};

export type ArMount = { canvas: HTMLCanvasElement; video: HTMLVideoElement; cleanup: () => void };

function loadMindARRuntime() {
  if (window.MINDAR?.IMAGE?.MindARThree) return Promise.resolve();
  if (window.__crispyMindArLoading) return window.__crispyMindArLoading;
  window.__crispyMindArLoading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-crispy-mindar]');
    const script = existing ?? document.createElement("script");
    const finish = () => window.MINDAR?.IMAGE?.MindARThree ? resolve() : reject(new Error("MindAR did not initialize."));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("MindAR failed to load.")), { once: true });
    if (!existing) {
      script.type = "module";
      script.src = "/vendor/mindar/mindar-image-three.prod.js";
      script.dataset.crispyMindar = "true";
      document.head.appendChild(script);
    }
  });
  return window.__crispyMindArLoading;
}

async function loadCraig() {
  const gltf = await new GLTFLoader().loadAsync("/models/crispy-craig.glb");
  const model = gltf.scene;
  let box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  model.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.set(-center.x, -center.y, -box.min.z);
  const material = new THREE.MeshStandardMaterial({ color: 0xe1a055, roughness: 0.72, metalness: 0.02 });
  model.traverse((object) => { if (object instanceof THREE.Mesh) object.material = material; });
  return model;
}

export async function mountMindArHunt(options: MountOptions): Promise<ArMount> {
  await loadMindARRuntime();
  const MindARThree = window.MINDAR?.IMAGE?.MindARThree;
  if (!MindARThree) throw new Error("MindAR is unavailable.");
  const mindar = new MindARThree({ container: options.host, imageTargetSrc: options.imageTargetSrc, maxTrack: 1, uiLoading: "no", uiScanning: "no", uiError: "no", filterMinCF: 0.02, filterBeta: 12, warmupTolerance: 3, missTolerance: 18 });
  const { renderer, scene, camera } = mindar;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x573827, 2.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(2, 4, 3);
  scene.add(key);

  const targetIndexes = [options.targetIndex];
  const craigSource = await loadCraig();
  let visibleTargets = 0;
  targetIndexes.forEach((targetIndex) => {
    const anchor = mindar.addAnchor(targetIndex);
    const craig = craigSource.clone(true);
    craig.position.set(options.placement.position.x, options.placement.position.y, options.placement.position.z);
    craig.quaternion.set(options.placement.rotation.x, options.placement.rotation.y, options.placement.rotation.z, options.placement.rotation.w);
    craig.scale.multiplyScalar(options.placement.scale);
    anchor.group.add(craig);
    anchor.onTargetFound = () => { visibleTargets += 1; options.onLocated(); };
    anchor.onTargetLost = () => { visibleTargets = Math.max(0, visibleTargets - 1); if (visibleTargets === 0) options.onLost(); };
  });

  await mindar.start();
  mindar.video.classList.add("camera-feed", "provider-feed");
  mindar.video.style.zIndex = "0";
  renderer.domElement.classList.add("ar-overlay", "provider-overlay");
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  return { canvas: renderer.domElement, video: mindar.video, cleanup: () => { renderer.setAnimationLoop(null); mindar.stop(); renderer.dispose(); } };
}

export type PlacementTestMount = ArMount & {
  update: (placement: ImagePlacement) => void;
  placeAt: (clientX: number, clientY: number) => { x: number; y: number } | null;
};

export async function mountMindArPlacement(options: {
  host: HTMLElement;
  imageTargetSrc: string;
  placement: ImagePlacement;
  targetAspect: number;
  onLocated: () => void;
  onLost: () => void;
}): Promise<PlacementTestMount> {
  await loadMindARRuntime();
  const MindARThree = window.MINDAR?.IMAGE?.MindARThree;
  if (!MindARThree) throw new Error("MindAR is unavailable.");
  const mindar = new MindARThree({ container: options.host, imageTargetSrc: options.imageTargetSrc, maxTrack: 1, uiLoading: "no", uiScanning: "no", uiError: "no", filterMinCF: 0.02, filterBeta: 12, warmupTolerance: 2, missTolerance: 20 });
  const { renderer, scene, camera } = mindar;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x573827, 2.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(2, 4, 3);
  scene.add(key);

  const anchor = mindar.addAnchor(0);
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(1, options.targetAspect),
    new THREE.MeshBasicMaterial({ color: 0x68ff9b, transparent: true, opacity: 0.07, side: THREE.DoubleSide }),
  );
  anchor.group.add(surface);
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(surface.geometry),
    new THREE.LineBasicMaterial({ color: 0x68ff9b, transparent: true, opacity: 0.95 }),
  );
  border.position.z = 0.002;
  anchor.group.add(border);

  const craig = await loadCraig();
  anchor.group.add(craig);
  const applyPlacement = (placement: ImagePlacement) => {
    craig.position.set(placement.position.x, placement.position.y, Math.max(0.008, placement.position.z));
    craig.quaternion.set(placement.rotation.x, placement.rotation.y, placement.rotation.z, placement.rotation.w);
    craig.scale.setScalar(placement.scale);
  };
  applyPlacement(options.placement);
  anchor.onTargetFound = options.onLocated;
  anchor.onTargetLost = options.onLost;

  await mindar.start();
  mindar.video.classList.add("camera-feed", "provider-feed");
  mindar.video.style.zIndex = "0";
  renderer.domElement.classList.add("ar-overlay", "provider-overlay");
  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  return {
    canvas: renderer.domElement,
    video: mindar.video,
    update: applyPlacement,
    placeAt: (clientX, clientY) => {
      const rect = options.host.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(surface, false)[0];
      if (!hit) return null;
      const local = anchor.group.worldToLocal(hit.point.clone());
      return { x: local.x, y: local.y };
    },
    cleanup: () => { renderer.setAnimationLoop(null); mindar.stop(); renderer.dispose(); },
  };
}
