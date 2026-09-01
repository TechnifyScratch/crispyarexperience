import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type ImagePlacement = {
  targetIndex?: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: number;
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
type MindARConstructor = new (options: { container: HTMLElement; imageTargetSrc: string; maxTrack: number; uiLoading: "no"; uiScanning: "no"; uiError: "no" }) => MindARInstance;

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
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  model.position.sub(center);
  model.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
  model.rotation.x = -Math.PI / 2;
  const material = new THREE.MeshStandardMaterial({ color: 0xe1a055, roughness: 0.72, metalness: 0.02 });
  model.traverse((object) => { if (object instanceof THREE.Mesh) object.material = material; });
  return model;
}

export async function mountMindArHunt(options: MountOptions): Promise<ArMount> {
  await loadMindARRuntime();
  const MindARThree = window.MINDAR?.IMAGE?.MindARThree;
  if (!MindARThree) throw new Error("MindAR is unavailable.");
  const mindar = new MindARThree({ container: options.host, imageTargetSrc: options.imageTargetSrc, maxTrack: 1, uiLoading: "no", uiScanning: "no", uiError: "no" });
  const { renderer, scene, camera } = mindar;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x573827, 2.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(2, 4, 3);
  scene.add(key);

  const anchor = mindar.addAnchor(options.targetIndex);
  const craig = await loadCraig();
  craig.position.set(options.placement.position.x, options.placement.position.y, options.placement.position.z);
  craig.quaternion.set(options.placement.rotation.x, options.placement.rotation.y, options.placement.rotation.z, options.placement.rotation.w);
  craig.scale.multiplyScalar(options.placement.scale);
  anchor.group.add(craig);
  anchor.onTargetFound = options.onLocated;
  anchor.onTargetLost = options.onLost;

  await mindar.start();
  mindar.video.classList.add("camera-feed", "provider-feed");
  renderer.domElement.classList.add("ar-overlay", "provider-overlay");
  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  return { canvas: renderer.domElement, video: mindar.video, cleanup: () => { renderer.setAnimationLoop(null); mindar.stop(); renderer.dispose(); } };
}
