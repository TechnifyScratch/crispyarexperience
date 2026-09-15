import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const requireModule = createRequire(import.meta.url);

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => name in mocks ? mocks[name] : requireModule(name), loaded, loaded.exports);
  return loaded.exports;
}
const { ObjectTracker, coverPoint, createPatch, followPatch, distanceToBox } = load('lib/ar/object-tracking.ts');
const surfaceReasoning = load('lib/ar/surface-reasoning.ts');
const { StableWorldPointStore, selectHorizontalSupportPlane } = surfaceReasoning;
const detection = (x, label = 'cup') => ({ label, score: 0.9, box: { x, y: 0.25, width: 0.15, height: 0.2 } });

test('two identical categories keep separate IDs and follow small movements', () => {
  const tracker = new ObjectTracker();
  const first = tracker.update([detection(0.1), detection(0.6)], 0);
  const moved = tracker.update([detection(0.62), detection(0.12)], 400);
  assert.equal(moved[0].id, first[1].id);
  assert.equal(moved[1].id, first[0].id);
  assert.equal(new Set(moved.map((item) => item.id)).size, 2);
});
test('missing or stale detections cannot leave a box pinned in the view', () => {
  const tracker = new ObjectTracker();
  const [first] = tracker.update([detection(0.1)], 0);
  assert.deepEqual(tracker.update([], 400), []);
  const [next] = tracker.update([detection(0.1)], 2000);
  assert.notEqual(next.id, first.id);
});
test('labels and distant objects are not falsely associated', () => {
  const tracker = new ObjectTracker();
  const [first] = tracker.update([detection(0.1)], 0);
  const [next] = tracker.update([detection(0.1, 'bottle')], 400);
  assert.notEqual(next.id, first.id);
  assert.deepEqual(tracker.update([{ ...detection(0.1), score: 0.1 }], 800), []);
});
test('landscape camera coordinates align with the portrait cover crop', () => {
  const source = { width: 1920, height: 1080 }, view = { width: 300, height: 600 };
  assert.deepEqual(coverPoint({ x: 0.5, y: 0.5 }, source, view), { x: 0.5, y: 0.5 });
  assert.ok(coverPoint({ x: 0, y: 0.5 }, source, view).x < 0);
  assert.equal(distanceToBox({ x: 0.2, y: 0.3 }, detection(0.1).box), 0);
});
test('a custom labelled package follows translation and disappears when its texture is gone', () => {
  const width = 200, height = 200;
  function frame(shift) {
    const data = new Uint8Array(width * height).fill(100);
    for (let y = 60; y < 120; y++) for (let x = 50; x < 110; x++) data[y * width + x + shift] = ((x * 83 + y * 37 + x * y * 13) % 200) + 20;
    return { data, width, height };
  }
  const patch = createPatch(frame(0), { x: 0.25, y: 0.3, width: 0.3, height: 0.3 }, 'Package');
  assert.ok(patch);
  const result = followPatch(frame(3), patch);
  assert.ok(result);
  assert.equal(result.label, 'Package');
  assert.ok(Math.abs(result.box.x - 0.265) < 0.01);
  assert.equal(followPatch({ data: new Uint8Array(width * height).fill(100), width, height }, patch), null);
  assert.equal(createPatch({ data: new Uint8Array(width * height).fill(100), width, height }, patch.box, 'Blank wall'), null);
});

test('surface reasoning accepts a stable floor footprint under Craig', () => {
  const points = [];
  let id = 0;
  for (let x = -0.2; x <= 0.2; x += 0.05) {
    for (let z = -0.2; z <= 0.2; z += 0.05) points.push({ id: id++, confidence: 1, position: { x, y: (id % 3 - 1) * 0.002, z } });
  }
  const plane = selectHorizontalSupportPlane(points, { x: 0, y: 0.12, z: 0 }, 0.5, 0.3);
  assert.ok(plane);
  assert.ok(Math.abs(plane.y) < 0.005);
  assert.ok(plane.footprintArea > 0.1);
});

test('surface reasoning rejects a same-height slice through a vertical cabinet', () => {
  const points = [];
  let id = 0;
  for (let y = -0.25; y <= 0.25; y += 0.025) {
    for (let z = -0.3; z <= 0.3; z += 0.04) points.push({ id: id++, confidence: 1, position: { x: 0.04 + (id % 2) * 0.002, y, z } });
  }
  assert.equal(selectHorizontalSupportPlane(points, { x: 0.04, y: 0.12, z: 0 }, 0.5, 0.3), null);
});

test('surface reasoning chooses the real floor instead of a closer cabinet slice', () => {
  const points = [];
  let id = 0;
  for (let x = -0.24; x <= 0.24; x += 0.04) {
    for (let z = -0.24; z <= 0.24; z += 0.04) points.push({ id: id++, confidence: 1, position: { x, y: 0, z } });
  }
  for (let y = 0.04; y <= 0.28; y += 0.02) {
    for (let z = -0.28; z <= 0.28; z += 0.035) points.push({ id: id++, confidence: 1, position: { x: 0.035, y, z } });
  }
  const plane = selectHorizontalSupportPlane(points, { x: 0, y: 0.14, z: 0 }, 0.5, 0.3);
  assert.ok(plane);
  assert.ok(Math.abs(plane.y) < 0.005);
});

test('surface reasoning rejects a flat surface that does not extend beneath Craig', () => {
  const points = [];
  let id = 0;
  for (let x = 0.22; x <= 0.55; x += 0.04) {
    for (let z = -0.2; z <= 0.2; z += 0.04) points.push({ id: id++, confidence: 1, position: { x, y: 0, z } });
  }
  assert.equal(selectHorizontalSupportPlane(points, { x: 0, y: 0.12, z: 0 }, 0.6, 0.3), null);
});

test('surface reasoning rejects room-edge points whose convex hull merely surrounds Craig', () => {
  const points = [];
  let id = 0;
  for (let amount = -0.35; amount <= 0.35; amount += 0.035) {
    points.push({ id: id++, confidence: 1, position: { x: -0.3, y: 0.14, z: amount } });
    points.push({ id: id++, confidence: 1, position: { x: 0.3, y: 0.14, z: amount } });
    points.push({ id: id++, confidence: 1, position: { x: amount, y: 0.14, z: -0.3 } });
    points.push({ id: id++, confidence: 1, position: { x: amount, y: 0.14, z: 0.3 } });
  }
  assert.equal(selectHorizontalSupportPlane(points, { x: 0, y: 0.14, z: 0 }, 0.6, 0.2), null);
});

test('moving feature points never become eligible support geometry', () => {
  const store = new StableWorldPointStore();
  const frame = (shift) => Array.from({ length: 16 }, (_, id) => ({ id, confidence: 1, position: { x: (id % 4) * 0.05 + shift, y: 0, z: Math.floor(id / 4) * 0.05 } }));
  assert.equal(store.update(frame(0), 0).length, 0);
  for (let index = 1; index <= 8; index += 1) assert.equal(store.update(frame(index * 0.008), index * 50).length, 0);
  for (let index = 9; index <= 15; index += 1) store.update(frame(0.064), index * 50);
  assert.equal(store.update(frame(0.064), 800).length, 16);
});

async function play({ configured = true, user = { id: 'user' }, role = null } = {}) {
  let roleChecked = false;
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table) => { assert.equal(table, 'profiles'); return { select: () => ({ eq: (_key, id) => { assert.equal(id, user.id); return { single: async () => { roleChecked = true; return { data: role ? { role } : null }; } }; } }) }; },
    rpc: async () => ({ data: { active: true, placement: { id: 'placement', position: {}, rotation: {} }, map: {}, venueId: 'venue' } }),
  };
  const { default: Page } = load('app/play/page.tsx', {
    '@/components/ar-hunt': { ArHunt: 'AR-HUNT' }, '@/components/anonymous-entry': { AnonymousEntry: 'ENTRY' },
    'next/image': { default: 'img' }, 'next/link': { default: 'a' },
    '@/lib/config': { supabaseConfigured: configured }, '@/lib/supabase/server': { createServerSupabase: async () => client },
  });
  return { element: await Page(), roleChecked };
}
test('only a server-verified admin receives diagnostic access before play', async () => {
  for (const role of ['player', 'staff', null, 'ADMIN']) {
    const result = await play({ role });
    assert.equal(result.element.props.adminDiagnostics, false);
    assert.equal(result.roleChecked, true);
  }
  const admin = await play({ role: 'admin' });
  assert.equal(admin.element.props.adminDiagnostics, true);
  assert.equal(admin.roleChecked, true);
  const guest = await play({ user: null });
  assert.equal(guest.element.type, 'ENTRY');
  assert.equal(guest.roleChecked, false);
  const preview = await play({ configured: false, role: 'admin' });
  assert.equal(preview.element.props.adminDiagnostics, undefined);
});

test('spatial diagnostics report reference stability, pose resets and failed surface validation without revealing Craig', async () => {
  const THREE = requireModule('three');
  const previousWindow = globalThis.window;
  const previousPerformance = globalThis.performance;
  let now = 0;
  let pipeline;
  let snapshots = [];
  let reveals = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 0.75, 0.01, 100);
  const xr = {
    GlTextureRenderer: { pipelineModule: () => ({ name: 'texture' }) },
    Threejs: { pipelineModule: () => ({ name: 'three' }), xrScene: () => ({ scene, camera, renderer: { shadowMap: {} } }) },
    XrController: { pipelineModule: () => ({ name: 'world' }), configure() {}, updateCameraProjectionMatrix() {} },
    XrConfig: { device: () => ({ MOBILE: 'mobile' }) },
    addCameraPipelineModules(modules) { pipeline = modules.find((item) => item.name === 'crispy-spatial-hunt'); },
    removeCameraPipelineModules() {}, stop() {},
    run() { pipeline.onStart(); pipeline.onAttach({ video: { videoWidth: 640 } }); },
  };
  globalThis.window = { XR8: xr, devicePixelRatio: 1 };
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
  let mounted;
  try {
    const { mountEighthWallHunt } = load('lib/ar/eighthwall-provider.ts', {
      '@/lib/ar/surface-reasoning': surfaceReasoning,
      'three/examples/jsm/loaders/GLTFLoader.js': { GLTFLoader: class { async loadAsync() { return { scene: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()) }; } } },
      'three/examples/jsm/controls/TransformControls.js': { TransformControls: class {} },
    });
    mounted = await mountEighthWallHunt({
      canvas: { width: 384, height: 512, getBoundingClientRect: () => ({ width: 384, height: 512 }) },
      imageTargetSrc: '/test.jpg',
      placement: { position: { x: 0, y: 0, z: 0, surface: { kind: 'horizontal', required: true, offsetM: 0, toleranceM: 0.1 } }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: 0.3 },
      onLocalized: () => { reveals++; }, onDiagnostics: (snapshot) => snapshots.push(snapshot),
    });
    const tick = (ms = 250) => { now += ms; pipeline.onUpdate({ processCpuResult: { reality: { trackingStatus: 'NORMAL', worldPoints: [] } } }); };
    const reference = (x = 0) => pipeline.listeners.find((item) => item.event === 'reality.imageupdated').process({ detail: { name: 'crispy-landmark-0', position: { x, y: 0, z: -2 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: 1 } });
    tick(); assert.equal(snapshots.at(-1).stage, 'searching');
    reference(); tick(); assert.equal(snapshots.at(-1).stage, 'stabilizing');
    reference(0.3); tick(); assert.equal(snapshots.at(-1).poseResets, 1);
    assert.match(snapshots.at(-1).lastReset, /30.0 cm/);
    for (let i = 0; i < 12; i++) { reference(0.3); tick(100); }
    tick(); assert.equal(snapshots.at(-1).stage, 'surface');
    assert.equal(snapshots.at(-1).surface.confidence, null);
    assert.equal(reveals, 0);
    tick(5000); assert.equal(snapshots.at(-1).surfaceResets, 1);
    assert.equal(snapshots.at(-1).stage, 'searching');
    assert.equal(snapshots.at(-1).craig, null);
    assert.equal(reveals, 0);
    assert.ok(snapshots.at(-1).firstReferenceMs > 0);
  } finally {
    mounted?.cleanup();
    globalThis.window = previousWindow;
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: previousPerformance });
    snapshots = [];
  }
});
