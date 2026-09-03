"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Compass, Crosshair, RotateCw, Save, ScanLine } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { mountEighthWallAdmin, type EighthWallAdminMount } from "@/lib/ar/eighthwall-provider";
import { cardinalDirection, readingFromEvent, requestOrientationPermission, type CompassReading } from "@/lib/ar/orientation";

type VenueMap = { id: string; version: number; provider: string; is_active: boolean; target_bundle_path: string };
type Placement = { id: string; name: string; status: string; target_index: number; scale: number; updated_at: string; venue_map_id: string; position: { snapshotUrl?: string } };
type Mode = "idle" | "starting" | "landmark" | "localizing" | "placement";
type Sweep = "place" | "left" | "pause" | "right" | "done";

const SWEEP_ANGLE = Math.PI / 10;

function angleDifference(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function dataUrlToBlob(dataUrl: string) {
  const [header, body] = dataUrl.split(",");
  const type = header.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type });
}

export function AdminPlace({ venueId, userId, maps, placements, loadError }: { venueId: string; userId: string; maps: VenueMap[]; placements: Placement[]; loadError: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<EighthWallAdminMount | null>(null);
  const targetBlobRef = useRef<Blob | null>(null);
  const targetUrlRef = useRef<string | null>(null);
  const centerHeadingRef = useRef<CompassReading | null>(null);
  const readingRef = useRef<CompassReading | null>(null);
  const yawRef = useRef<number | null>(null);
  const sweepRef = useRef<Sweep>("place");
  const sweepOriginRef = useRef(0);
  const sweepXOriginRef = useRef(0);
  const cameraXRef = useRef(0);
  const [mode, setMode] = useState<Mode>("idle");
  const [sweep, setSweepState] = useState<Sweep>("place");
  const [reading, setReading] = useState<CompassReading | null>(null);
  const [orientationAllowed, setOrientationAllowed] = useState<boolean | null>(null);
  const [surfacePoints, setSurfacePoints] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(30);
  const [name, setName] = useState("");
  const [makeActive, setMakeActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(loadError);

  const setSweep = useCallback((next: Sweep) => {
    sweepRef.current = next;
    setSweepState(next);
  }, []);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const next = readingFromEvent(event);
      if (!next) return;
      readingRef.current = next;
      setReading(next);
    };
    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, []);

  useEffect(() => {
    trackerRef.current?.updateCraig(scale / 100, rotation * Math.PI / 180);
  }, [rotation, scale]);

  useEffect(() => () => {
    trackerRef.current?.cleanup();
    if (targetUrlRef.current) URL.revokeObjectURL(targetUrlRef.current);
  }, []);

  const handlePose = useCallback((yaw: number, position?: { x: number }) => {
    yawRef.current = yaw;
    if (position) cameraXRef.current = position.x;
    const delta = angleDifference(sweepOriginRef.current, yaw);
    const sideways = cameraXRef.current - sweepXOriginRef.current;
    if (sweepRef.current === "left" && (delta > SWEEP_ANGLE || sideways < -0.18)) {
      setSweep("pause");
      window.setTimeout(() => setSweep("right"), 900);
    } else if (sweepRef.current === "right" && (delta < -SWEEP_ANGLE || sideways > 0.18)) {
      setSweep("done");
    }
  }, [setSweep]);

  async function startPlacement() {
    if (!canvasRef.current) return;
    setMode("starting");
    setError("");
    try {
      const directionPermission = await requestOrientationPermission();
      setOrientationAllowed(directionPermission);
      trackerRef.current = await mountEighthWallAdmin({
        canvas: canvasRef.current,
        onReady: () => setMode("landmark"),
        onLocalized: () => setMode("placement"),
        onTrackingLost: () => undefined,
        onPose: handlePose,
        onSurfacePoints: setSurfacePoints,
      });
    } catch (reason) {
      setMode("idle");
      setError(reason instanceof Error ? reason.message : "Camera access was denied or unavailable.");
    }
  }

  async function captureLandmark() {
    const tracker = trackerRef.current;
    const video = tracker?.video;
    if (!tracker || !video?.videoWidth) return;
    try {
      const width = 480;
      const height = 640;
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const context = output.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("The landmark image could not be captured.");
      const sourceRatio = video.videoWidth / video.videoHeight;
      const targetRatio = width / height;
      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (sourceRatio > targetRatio) { sw = sh * targetRatio; sx = (video.videoWidth - sw) / 2; }
      else { sh = sw / targetRatio; sy = (video.videoHeight - sh) / 2; }
      context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      let luminanceSum = 0;
      let luminanceSquareSum = 0;
      let edgeSum = 0;
      let samples = 0;
      for (let index = 0; index < image.data.length; index += 4) {
        const gray = Math.round(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114);
        image.data[index] = gray;
        image.data[index + 1] = gray;
        image.data[index + 2] = gray;
        if (index % 32 === 0) {
          luminanceSum += gray;
          luminanceSquareSum += gray * gray;
          if (index >= width * 4) edgeSum += Math.abs(gray - image.data[index - width * 4]);
          samples += 1;
        }
      }
      const mean = luminanceSum / Math.max(samples, 1);
      const contrast = Math.sqrt(Math.max(0, luminanceSquareSum / Math.max(samples, 1) - mean * mean));
      const edgeDetail = edgeSum / Math.max(samples, 1);
      if (contrast < 18 || edgeDetail < 5) {
        setError("This view has low detail, so use a closer or more textured landmark next time. Continuing with this capture.");
      } else {
        setError("");
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("The landmark image could not be captured.");
      if (targetUrlRef.current) URL.revokeObjectURL(targetUrlRef.current);
      targetBlobRef.current = blob;
      targetUrlRef.current = URL.createObjectURL(blob);
      centerHeadingRef.current = readingRef.current;
      setMode("localizing");
      tracker.setTarget(targetUrlRef.current, width, height);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The landmark could not be captured.");
    }
  }

  function placeCraig(event: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "placement") return;
    const placed = trackerRef.current?.placeAt(event.clientX, event.clientY);
    if (!placed) {
      setError("No mapped surface was found there. Move slowly so green tracking points appear, then tap one.");
      return;
    }
    setError("");
    trackerRef.current?.updateCraig(scale / 100, rotation * Math.PI / 180);
    sweepOriginRef.current = yawRef.current ?? 0;
    sweepXOriginRef.current = cameraXRef.current;
    setSweep("left");
  }

  async function savePlacement() {
    const tracker = trackerRef.current;
    const target = targetBlobRef.current;
    const nextPlacement = tracker?.getPlacement();
    if (!name.trim()) { setError("Give this hiding place a name."); return; }
    if (!tracker || !target || !nextPlacement || sweep !== "done") { setError("Finish the surface placement and left/right tracking check first."); return; }
    const supabase = createBrowserSupabase();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setSaving(true); setSaved(false); setError("");
    try {
      const snapshot = dataUrlToBlob(tracker.capture());
      const mapId = crypto.randomUUID();
      const version = Math.max(0, ...maps.map((map) => map.version)) + 1;
      const folder = `${venueId}/${mapId}`;
      const targetPath = `${folder}/landmark.jpg`;
      const snapshotPath = `${folder}/placement.jpg`;
      const [targetUpload, snapshotUpload] = await Promise.all([
        supabase.storage.from("ar-maps").upload(targetPath, target, { contentType: "image/jpeg", upsert: false }),
        supabase.storage.from("ar-maps").upload(snapshotPath, snapshot, { contentType: "image/jpeg", upsert: false }),
      ]);
      if (targetUpload.error || snapshotUpload.error) throw targetUpload.error || snapshotUpload.error;
      const { data: publicTarget } = supabase.storage.from("ar-maps").getPublicUrl(targetPath);
      const { data: publicSnapshot } = supabase.storage.from("ar-maps").getPublicUrl(snapshotPath);
      if (makeActive) {
        const [{ error: mapArchiveError }, { error: placementArchiveError }] = await Promise.all([
          supabase.from("venue_maps").update({ is_active: false }).eq("venue_id", venueId).eq("is_active", true),
          supabase.from("placements").update({ status: "archived", archived_at: new Date().toISOString() }).eq("venue_id", venueId).eq("status", "active"),
        ]);
        if (mapArchiveError || placementArchiveError) throw mapArchiveError || placementArchiveError;
      }
      const { error: mapError } = await supabase.from("venue_maps").insert({ id: mapId, venue_id: venueId, version, provider: "8thwall", target_bundle_path: publicTarget.publicUrl, is_active: makeActive });
      if (mapError) throw mapError;
      const compass = centerHeadingRef.current;
      nextPlacement.position.snapshotUrl = publicSnapshot.publicUrl;
      nextPlacement.position.heading = compass?.isAbsolute ? Math.round(compass.heading) : null;
      nextPlacement.position.headingAccuracy = compass?.isAbsolute ? compass.accuracy : null;
      const { error: placementError } = await supabase.from("placements").insert({ venue_id: venueId, venue_map_id: mapId, name: name.trim(), status: makeActive ? "active" : "draft", target_index: 0, position: nextPlacement.position, rotation: nextPlacement.rotation, scale: nextPlacement.scale, created_by: userId, activated_at: makeActive ? new Date().toISOString() : null });
      if (placementError) throw placementError;
      setSaved(true);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The placement could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const instruction = mode === "landmark" ? "Fill the frame with a permanent, detailed flat area" :
    mode === "localizing" ? "Hold still while the landmark locks" :
    sweep === "place" ? "Tap a green mapped point where Craig’s feet should go" :
    sweep === "left" ? "Slowly move or turn the phone left — Craig stays put" :
    sweep === "pause" ? "Stop. Good." :
    sweep === "right" ? "Now slowly move or turn the phone right" : "Tracking check complete";

  return (
    <main className="admin-content place-content">
      <div className="admin-heading"><div><p className="eyebrow">Spatial placement</p><h1>Hide Craig</h1><p>Use an existing sign, menu, mural, or detailed wall as the invisible landmark. Players will never see a marker.</p></div></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="placement-grid">
        <section className="placement-view spatial-placement-view">
          <canvas ref={canvasRef} className="spatial-canvas" onPointerUp={placeCraig} />
          {mode === "idle" && <div className="placement-empty"><ScanLine size={38} /><h2>Map a real hiding place</h2><p>The camera builds a 3D map from the store itself.</p><button onClick={startPlacement}>Start spatial camera</button></div>}
          {mode === "starting" && <div className="camera-message"><strong>Starting spatial tracking…</strong></div>}
          {mode !== "idle" && mode !== "starting" && <div className={`tracking-status ${sweep === "done" ? "locked" : "searching"}`}>{instruction}</div>}
          {mode === "landmark" && <><div className="landmark-frame"><span>ONE FLAT, PERMANENT SURFACE</span></div><button className="landmark-capture" onClick={captureLandmark}>Capture invisible landmark</button></>}
          {mode === "placement" && <div className="surface-point-count"><Crosshair size={14} /> {surfacePoints} real map points</div>}
          {mode !== "idle" && <div className="placement-state"><Compass size={15} /> {reading?.isAbsolute ? `${Math.round(reading.heading)}° ${cardinalDirection(reading.heading)}` : orientationAllowed === false ? "Direction unavailable" : "Finding direction…"}</div>}
          {mode !== "idle" && <a className="eighthwall-credit" href="https://www.8thwall.org/" target="_blank" rel="noreferrer">Powered by 8th Wall</a>}
        </section>
        <aside className="placement-controls">
          <div className="control-heading"><div><strong>New hiding place</strong><span>{sweep === "done" ? "Ready to save" : "Spatial calibration"}</span></div></div>
          <label><span>Name</span><input type="text" placeholder="e.g. Front counter corner" value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} /></label>
          <label><span><RotateCw size={18} /> Craig rotation</span><output>{rotation}°</output><input type="range" min="-180" max="180" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label>
          <label><span><Crosshair size={18} /> Craig height</span><output>{scale} cm</output><input type="range" min="12" max="60" value={scale} onChange={(event) => setScale(Number(event.target.value))} /></label>
          <p className="placement-disclosure">Green dots are real SLAM map points. The outlined square sits in 3D perspective on the selected plane, and Craig’s feet remain locked to it.</p>
          <button className="admin-primary save-placement" disabled={saving || sweep !== "done"} onClick={savePlacement}>{saved ? <><Check size={18} /> Saved in Supabase</> : <><Save size={18} /> {saving ? "Saving…" : "Save hiding place"}</>}</button>
          <label className="placement-checkbox"><input type="checkbox" checked={makeActive} onChange={(event) => setMakeActive(event.target.checked)} /> Make this the active hiding place</label>
        </aside>
      </div>
      <section className="admin-panel"><div className="panel-heading"><div><h2>Saved placements</h2><p>Click a placement to see where Craig was hidden.</p></div></div>{placements.length === 0 && <p>No placements saved yet.</p>}{placements.map((item) => <details className="placement-record" key={item.id}><summary><span><strong>{item.name}</strong><small>{maps.find((map) => map.id === item.venue_map_id)?.provider ?? "AR"} map {maps.find((map) => map.id === item.venue_map_id)?.version ?? "?"} · scale {item.scale}</small></span><b>{item.status}</b></summary>{item.position?.snapshotUrl ? <img src={item.position.snapshotUrl} alt={`Saved view of ${item.name}`} /> : <p>This older placement does not have a saved screenshot.</p>}</details>)}</section>
    </main>
  );
}
