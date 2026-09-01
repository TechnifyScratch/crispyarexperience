import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export async function mountCraigPreview(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  camera.position.set(0, 0.15, 4.4);
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x5d3826, 3.2));
  const key = new THREE.DirectionalLight(0xffffff, 4.2);
  key.position.set(2, 4, 5);
  scene.add(key);

  const group = new THREE.Group();
  group.position.set(0.35, -0.35, 0);
  scene.add(group);

  try {
    const gltf = await new GLTFLoader().loadAsync("/models/crispy-craig.glb");
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const scale = 1.55 / Math.max(size.x, size.y, size.z);
    const material = new THREE.MeshStandardMaterial({ color: 0xf2b85b, roughness: 0.72, metalness: 0.02 });
    model.position.sub(center);
    model.scale.setScalar(scale);
    model.rotation.x = -Math.PI / 2;
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) { object.material = material; object.castShadow = true; }
    });
    group.add(model);
  } catch {
    const fallback = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 0.7, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0xf2b85b, roughness: 0.7 }),
    );
    group.add(fallback);
  }

  let frame = 0;
  let stopped = false;
  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function animate(time: number) {
    if (stopped) return;
    frame = requestAnimationFrame(animate);
    resize();
    group.rotation.y = Math.sin(time * 0.00045) * 0.24 - 0.18;
    group.position.y = -0.3 + Math.sin(time * 0.002) * 0.06;
    renderer.render(scene, camera);
  }
  animate(0);

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    renderer.dispose();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      }
    });
  };
}
