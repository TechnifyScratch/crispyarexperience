"use client";

import { useEffect, useRef, useState, type RefObject, type PointerEvent } from "react";
import type { LocalizationDiagnostics } from "@/lib/ar/diagnostics";
import { ObjectTracker, coverPoint, distanceToBox, type Box, type Detection, type ObjectTrack } from "@/lib/ar/object-tracking";
import type { VisionRequest, VisionResponse } from "@/lib/ar/vision-protocol";

type Props = {
  getSource: () => HTMLVideoElement | HTMLCanvasElement | null;
  diagnostics: RefObject<LocalizationDiagnostics | null>;
  cameraState: string;
  provider?: string;
};
type VisionState = { status: string; objects: ObjectTrack[]; custom: Detection | null; customLost: boolean; inferenceMs: number; lagMs: number; resultAt: number };
const emptyVision: VisionState = { status: "Loading object detector…", objects: [], custom: null, customLost: false, inferenceMs: 0, lagMs: 0, resultAt: 0 };
const seconds = (ms: number | null | undefined) => ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;

export default function VisionDebug({ getSource, diagnostics, cameraState, provider }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [details, setDetails] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [vision, setVision] = useState<VisionState>(emptyVision);
  const [snapshot, setSnapshot] = useState<LocalizationDiagnostics | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [now, setNow] = useState(0);
  const [view, setView] = useState({ width: 1, height: 1 });
  const [selection, setSelection] = useState<{ image: string; pixels: ImageData } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [label, setLabel] = useState("");
  const [labelMessage, setLabelMessage] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const selectingRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef(view);
  const logKeyRef = useRef("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const resize = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      viewRef.current = next;
      setView(next);
      workerRef.current?.postMessage({ type: "clear" } satisfies VisionRequest);
    });
    resize.observe(host);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      setNow(performance.now());
      const current = diagnostics.current;
      setSnapshot(current);
      if (!current) return;
      const key = `${current.stage}:${current.poseResets}:${current.surfaceResets}`;
      if (key !== logKeyRef.current) {
        logKeyRef.current = key;
        setEvents((previous) => [`${seconds(current.elapsedMs)} · ${current.reason}`, ...previous].slice(0, 16));
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [diagnostics, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer = 0;
    let watchdog = 0;
    let sentAspect = 0;
    let worker: Worker;
    const tracker = new ObjectTracker();
    const frame = document.createElement("canvas");
    frameRef.current = frame;
    const context = frame.getContext("2d", { willReadFrequently: true });
    const fail = (message: string) => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(watchdog);
      worker?.terminate();
      workerRef.current = null;
      setVision({ ...emptyVision, status: message });
    };
    const schedule = (delay: number) => { timer = window.setTimeout(sendFrame, delay); };
    const sendFrame = () => {
      if (stopped) return;
      if (document.hidden || selectingRef.current) { schedule(400); return; }
      try {
        const source = getSource();
        if (!source || !context || !drawFrame(context, frame, source, viewRef.current)) { schedule(350); return; }
        const pixels = context.getImageData(0, 0, frame.width, frame.height);
        sentAspect = viewRef.current.width / viewRef.current.height;
        const message: VisionRequest = { type: "frame", pixels: pixels.data, width: frame.width, height: frame.height, timestamp: performance.now() };
        watchdog = window.setTimeout(() => fail("Object scan timed out. AR is still running."), 12000);
        worker.postMessage(message, [pixels.data.buffer]);
      } catch {
        fail("The camera frame could not be read for object detection.");
      }
    };
    try {
      worker = new Worker(new URL("../lib/ar/object-vision.worker.ts", import.meta.url));
      workerRef.current = worker;
      worker.onerror = () => fail("Object detector could not start on this browser.");
      worker.onmessage = (event: MessageEvent<VisionResponse>) => {
        if (stopped) return;
        const message = event.data;
        if (message.type === "error") { fail(`Object detector: ${message.message}`); return; }
        if (message.type === "labelled") {
          setLabelMessage(message.accepted ? "Custom item labelled. Tracking its appearance in this session." : "Not enough visual detail. Select a tighter, textured area.");
          return;
        }
        window.clearTimeout(watchdog);
        if (message.type === "ready") {
          setVision({ ...emptyVision, status: "Scanning objects locally" });
          sendFrame();
        } else if (message.type === "result") {
          if (Math.abs(sentAspect - viewRef.current.width / viewRef.current.height) > 0.01) { schedule(160); return; }
          const receivedAt = performance.now();
          setVision({ status: "Scanning objects locally", objects: tracker.update(message.detections, message.timestamp), custom: message.custom, customLost: message.customLost, inferenceMs: message.inferenceMs, lagMs: receivedAt - message.timestamp, resultAt: receivedAt });
          // One inference in flight; leave CPU time for AR between scans.
          schedule(Math.max(160, 500 - message.inferenceMs));
        }
      };
      watchdog = window.setTimeout(() => fail("Model download timed out. Check your connection and retry."), 60000);
      worker.postMessage({ type: "init", origin: window.location.origin } satisfies VisionRequest);
    } catch {
      fail("This browser cannot run the object detector worker.");
    }
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(watchdog);
      worker?.terminate();
      workerRef.current = null;
    };
  }, [attempt, enabled, getSource]);

  function beginLabel() {
    const source = getSource();
    const frame = frameRef.current;
    const context = frame?.getContext("2d", { willReadFrequently: true });
    if (!source || !frame || !context || !drawFrame(context, frame, source, viewRef.current)) return;
    selectingRef.current = true;
    setBox(null);
    setLabel("");
    setLabelMessage("");
    setSelection({ image: frame.toDataURL("image/jpeg", 0.9), pixels: context.getImageData(0, 0, frame.width, frame.height) });
  }

  function finishLabel(save: boolean) {
    if (save && box && selection) {
      workerRef.current?.postMessage({ type: "label", box, label, pixels: selection.pixels.data, width: selection.pixels.width, height: selection.pixels.height } satisfies VisionRequest);
    }
    selectingRef.current = false;
    dragRef.current = null;
    setSelection(null);
  }

  function pointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }

  function exportReport() {
    const report = { exportedAt: new Date().toISOString(), provider: provider ?? "camera", cameraState, localization: snapshot, detector: { status: vision.status, inferenceMs: vision.inferenceMs, lagMs: vision.lagMs, objects: vision.objects, custom: vision.custom, customLost: vision.customLost }, events, note: "Object labels and proximity are observations in the image, not physical distance or persistent anchors. No camera images included." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `craig-diagnostics-${Date.now()}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const stale = vision.resultAt === 0 || Math.max(0, now - vision.resultAt) + vision.lagMs > 1000;
  const craig = snapshot?.craig ? { ...coverPoint(snapshot.craig, snapshot.frame, view), confirmed: snapshot.craig.confirmed } : null;
  const objects = stale || selection ? [] : vision.objects;
  const visibleCustom = !stale && !selection ? vision.custom : null;

  return <div className="vision-debug" ref={hostRef}>
    <div className="vision-toolbar">
      <button className="vision-toggle" aria-pressed={enabled} onClick={() => { setEnabled(!enabled); setVision(emptyVision); finishLabel(false); }}>DEV VISION {enabled ? "ON" : "OFF"}</button>
      {enabled && <button onClick={() => setDetails(!details)} aria-expanded={details}>{details ? "Less" : "Details"}</button>}
    </div>
    {enabled && <>
      {!selection && <svg className="vision-features" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {snapshot?.points.map((point, i) => { const p = coverPoint(point, snapshot.frame, view); return <circle key={i} cx={p.x * 100} cy={p.y * 100} r="0.3" />; })}
      </svg>}
      {objects.map((object) => <ObjectBox key={object.id} detection={object} subtitle={`#${object.id} · ${Math.round(object.score * 100)}%`} near={craig?.confirmed && distanceToBox(craig, object.box) < 0.12} />)}
      {visibleCustom && <ObjectBox detection={visibleCustom} subtitle={`manual · ${Math.round(visibleCustom.score * 100)}% match`} near={craig?.confirmed && distanceToBox(craig, visibleCustom.box) < 0.12} custom />}
      {craig && !selection && <div className={`vision-craig ${craig.confirmed ? "confirmed" : ""}`} style={{ left: `${craig.x * 100}%`, top: `${craig.y * 100}%` }}><span>+</span><small>{craig.confirmed ? "Craig · locked" : "Craig · candidate"}</small></div>}
      {!selection && <div className="vision-hud">
        <strong>{snapshot ? snapshot.stage.toUpperCase() : cameraState.toUpperCase()}</strong>
        <p>{snapshot?.reason ?? (provider === "8thwall" ? "Waiting for spatial diagnostics…" : "Object view only; spatial diagnostics require an 8th Wall placement.")}</p>
        <div className="vision-metrics"><span>AR {snapshot ? Math.round(snapshot.fps) : "—"} fps</span><span>scan {vision.inferenceMs ? Math.round(vision.inferenceMs) : "—"} ms</span><span>{objects.length} objects</span></div>
        {vision.resultAt === 0 && <p>{vision.status}</p>}
        {stale && vision.resultAt > 0 && <p>Detection is behind the camera. Old boxes are hidden.</p>}
        {details && <div className="vision-details">
          <p>{vision.status}{stale && vision.resultAt > 0 ? " · stale boxes hidden" : ""}</p>
          <dl>
            <dt>World tracking</dt><dd>{snapshot?.tracking ?? cameraState} {snapshot?.trackingReason}</dd>
            <dt>First reference</dt><dd>{seconds(snapshot?.firstReferenceMs)}</dd>
            <dt>First Craig lock</dt><dd>{seconds(snapshot?.localizedMs)}</dd>
            <dt>Pose / surface resets</dt><dd>{snapshot?.poseResets ?? 0} / {snapshot?.surfaceResets ?? 0}</dd>
            <dt>Mapped points</dt><dd>{snapshot?.worldPoints ?? 0}</dd>
            <dt>Reference disagreement</dt><dd>{snapshot?.pairErrorM == null ? "—" : `${(snapshot.pairErrorM * 100).toFixed(1)} cm`}</dd>
            <dt>Surface confidence</dt><dd>{snapshot?.surface.confidence == null ? "—" : `${Math.round(snapshot.surface.confidence * 100)}%`}</dd>
            <dt>Surface height error</dt><dd>{snapshot?.surface.errorM == null ? "—" : `${(snapshot.surface.errorM * 100).toFixed(1)} cm`}</dd>
            <dt>Surface stable frames</dt><dd>{snapshot?.surface.frames ?? 0}/8 {snapshot?.surface.required ? "required" : "optional"}</dd>
            <dt>Surface time left</dt><dd>{seconds(snapshot?.surface.remainingMs)}</dd>
            <dt>Detection frame age</dt><dd>{vision.resultAt ? `${Math.round(Math.max(0, now - vision.resultAt) + vision.lagMs)} ms` : "—"}</dd>
          </dl>
          {snapshot?.lastReset && <p>Last reset: {snapshot.lastReset}</p>}
          <div className="vision-references">{snapshot?.references.map((reference, i) => <div key={reference.name}><b>Reference {i + 1}</b><span>{reference.visible ? "seen" : "not in view"} · {reference.frames} stable frames · quality {reference.quality == null ? "unknown" : `${Math.round(reference.quality * 100)}%`}</span></div>)}</div>
          <div className="vision-actions"><button onClick={beginLabel} disabled={!vision.resultAt}>Label an item</button><button onClick={() => { workerRef.current?.postMessage({ type: "clear" } satisfies VisionRequest); setLabelMessage(""); }}>Clear item</button><button onClick={exportReport}>Save report</button><button onClick={() => { setVision(emptyVision); setAttempt((value) => value + 1); }}>Retry detector</button></div>
          {labelMessage && <p>{labelMessage}</p>}
          {vision.customLost && <p className="vision-warning">Custom item lost. Bring it back into view; relabel it if tracking does not resume.</p>}
          <p className="vision-note">Boxes identify common object categories. Label other items manually. IDs last only while tracked; similar objects can be confused. “Near Craig” means close in this image, not measured distance. Moving objects never move Craig.</p>
          <p className="vision-note">Camera frames stay on this device. The detector downloads model weights on first use. Green dots are mapped features; amber + is an unconfirmed Craig position.</p>
          {events.length > 0 && <ol className="vision-log">{events.map((event, i) => <li key={i}>{event}</li>)}</ol>}
        </div>}
      </div>}
      {selection && <>
        <div className="vision-selection" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = pointer(event); setBox(null); }} onPointerMove={(event) => { const start = dragRef.current; if (!start) return; const end = pointer(event); setBox({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }); }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selection.image} alt="Frozen camera frame for selecting an item" draggable={false} />
          {box && <div className="vision-selection-box" style={boxStyle(box)} />}
        </div>
        <form className="vision-label-form" onSubmit={(event) => { event.preventDefault(); finishLabel(true); }}>
          <strong>Draw a box around the item</strong><span>Pick a detailed patch. The camera view is frozen.</span>
          <input aria-label="Item label" maxLength={40} placeholder="e.g. Amazon package" value={label} onChange={(event) => setLabel(event.target.value)} required />
          <div><button type="submit" disabled={!box || box.width < 0.05 || box.height < 0.05 || !label.trim()}>Track item</button><button type="button" onClick={() => finishLabel(false)}>Cancel</button></div>
        </form>
      </>}
    </>}
  </div>;
}

function boxStyle(box: Box) { return { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }; }
function ObjectBox({ detection, subtitle, near, custom }: { detection: Detection; subtitle: string; near?: boolean; custom?: boolean }) {
  return <div className={`vision-object ${custom ? "custom" : ""}`} style={boxStyle(detection.box)}><span>{detection.label}<small>{subtitle}{near ? " · near Craig in view" : ""}</small></span></div>;
}

function drawFrame(context: CanvasRenderingContext2D, frame: HTMLCanvasElement, source: HTMLVideoElement | HTMLCanvasElement, view: { width: number; height: number }) {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!width || !height || !view.width || !view.height) return false;
  const scale = Math.min(384 / view.width, 512 / view.height);
  frame.width = Math.max(1, Math.round(view.width * scale));
  frame.height = Math.max(1, Math.round(view.height * scale));
  const cropScale = Math.max(frame.width / width, frame.height / height);
  const sw = frame.width / cropScale, sh = frame.height / cropScale;
  context.drawImage(source, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, frame.width, frame.height);
  return true;
}
