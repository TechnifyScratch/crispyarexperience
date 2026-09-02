import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type PlacementRenderState = {
  screenX: number;
  screenY: number;
  distanceM: number;
  sizeM: number;
  liftM: number;
};

export type PlacementRenderer = {
  update: (state: PlacementRenderState) => void;
  cleanup: () => void;
};

export async function mountAdminPlacementRenderer(canvas: HTMLCanvasElement): Promise<PlacementRenderer> {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.01, 20);
  camera.position.set(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x44332b, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-2, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  scene.add(key);

  const placementGroup = new THREE.Group();
  scene.add(placementGroup);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 32),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.38 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  shadow.receiveShadow = true;
  placementGroup.add(shadow);

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
    object.material = new THREE.MeshStandardMaterial({ color: 0xe1a055, roughness: 0.72, metalness: 0.02 });
    object.castShadow = true;
    object.receiveShadow = true;
  });
  placementGroup.add(model);

  let current: PlacementRenderState = { screenX: 0.5, screenY: 0.68, distanceM: 0.9, sizeM: 0.3, liftM: 0 };
  let frame = 0;
  let stopped = false;

  function resize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render() {
    if (stopped) return;
    frame = requestAnimationFrame(render);
    resize();
    const distance = Math.max(0.25, current.distanceM);
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
    const visibleWidth = visibleHeight * camera.aspect;
    placementGroup.position.set(
      (current.screenX * 2 - 1) * visibleWidth / 2,
      (1 - current.screenY * 2) * visibleHeight / 2 + current.liftM,
      -distance,
    );
    placementGroup.scale.setScalar(current.sizeM);
    shadow.scale.set(1.05, 1.05, 1.05);
    renderer.render(scene, camera);
  }
  render();

  return {
    update: (state) => { current = state; },
    cleanup: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      renderer.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      });
    },
  };
}
