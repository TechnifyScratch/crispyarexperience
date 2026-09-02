"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Compass, Crosshair, Move3d, RotateCw, Save, ScanLine } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { compileEnvironment } from "@/lib/ar/target-compiler";
import { cardinalDirection, readingFromEvent, requestOrientationPermission, signedAngleDifference, type CompassReading } from "@/lib/ar/orientation";

type VenueMap = { id: string; version: number; provider: string; is_active: boolean; target_bundle_path: string };
type Placement = { id: string; name: string; status: string; target_index: number; scale: number; updated_at: string; venue_map_id: string };
type ScanStage = "idle" | "left" | "left-stop" | "right" | "right-stop" | "complete" | "compiling";

export function AdminPlace({ venueId, userId, maps, placements, loadError }: {
  venueId: string;
  userId: string;
  maps: VenueMap[];
  placements: Placement[];
  loadError: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readingRef = useRef<CompassReading | null>(null);
  const centerHeadingRef = useRef<CompassReading | null>(null);
  const startYawRef = useRef<number | null>(null);
  const firstDirectionRef = useRef(0);
  const scanStageRef = useRef<ScanStage>("idle");
  const captureLockRef = useRef(false);
  const [camera, setCamera] = useState(false);
  const [orientationAllowed, setOrientationAllowed] = useState<boolean | null>(null);
  const [reading, setReading] = useState<CompassReading | null>(null);
  const [scanStage, setScanStage] = useState<ScanStage>("idle");
  const [scanDelta, setScanDelta] = useState(0);
  const [scanDirection, setScanDirection] = useState(0);
  const [frames, setFrames] = useState<Blob[]>([]);
  const [compileProgress, setCompileProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(loadError);
  const [name, setName] = useState("");
  const [makeActive, setMakeActive] = useState(true);
  const [height, setHeight] = useState(42);
  const [depth, setDepth] = useState(55);
  const [scale, setScale] = useState(30);

  function changeScanStage(stage: ScanStage) {
    scanStageRef.current = stage;
    setScanStage(stage);
  }

  useEffect(() => () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startPlacement() {
    try {
      const [stream, directionPermission] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
        requestOrientationPermission(),
      ]);
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamera(true);
      setOrientationAllowed(directionPermission);
      setError("");
    } catch { setError("Camera access was denied or is unavailable on this device."); }
  }

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) throw new Error("The camera is not ready yet.");
    const width = Math.min(960, video.videoWidth);
    const height = Math.round(width * video.videoHeight / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) throw new Error("The scan frame could not be captured.");
    return blob;
  }, []);

  async function beginScan() {
    try {
      const frame = await captureFrame();
      setFrames([frame]);
      centerHeadingRef.current = readingRef.current;
      startYawRef.current = readingRef.current?.relativeYaw ?? null;
      firstDirectionRef.current = 0;
      setScanDelta(0);
      setScanDirection(0);
      changeScanStage("left");
      setSaved(false);
      setError("");
    } catch (scanError) { setError(scanError instanceof Error ? scanError.message : "Could not begin the scan."); }
  }

  const recordSide = useCallback(async (nextStage: "left-stop" | "right-stop") => {
    if (captureLockRef.current) return;
    captureLockRef.current = true;
    try {
      const frame = await captureFrame();
      setFrames((items) => [...items, frame]);
      changeScanStage(nextStage);
    } catch (scanError) { setError(scanError instanceof Error ? scanError.message : "Could not capture that side."); }
    finally { captureLockRef.current = false; }
  }, [captureFrame]);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const nextReading = readingFromEvent(event);
      if (!nextReading) return;
      readingRef.current = nextReading;
      setReading(nextReading);
      const origin = startYawRef.current;
      if (origin == null || captureLockRef.current) return;
      const delta = signedAngleDifference(nextReading.relativeYaw, origin);
      setScanDelta(delta);
      if (scanStageRef.current === "left" && firstDirectionRef.current === 0 && Math.abs(delta) >= 2) {
        firstDirectionRef.current = Math.sign(delta) || 1;
        setScanDirection(firstDirectionRef.current);
      }
      if (scanStageRef.current === "left" && Math.abs(delta) >= 20) {
        firstDirectionRef.current ||= Math.sign(delta) || 1;
        setScanDirection(firstDirectionRef.current);
        void recordSide("left-stop");
      } else if (scanStageRef.current === "right" && Math.sign(delta) === -firstDirectionRef.current && Math.abs(delta) >= 20) {
        void recordSide("right-stop");
      }
    };
    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, [recordSide]);

  async function savePlacement() {
    if (!name.trim()) { setError("Give this hiding place a name."); return; }
    if (frames.length !== 3) { setError("Complete the center, left, and right environment scan first."); return; }
    const supabase = createBrowserSupabase();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setSaving(true);
    setSaved(false);
    setError("");
    changeScanStage("compiling");

    try {
      const compiled = await compileEnvironment(frames, setCompileProgress);
      const mapId = crypto.randomUUID();
      const version = Math.max(0, ...maps.map((map) => map.version)) + 1;
      const folder = `${venueId}/${mapId}`;
      const bundlePath = `${folder}/targets.mind`;

      const { error: uploadError } = await supabase.storage.from("ar-maps").upload(bundlePath, new Blob([compiled], { type: "application/octet-stream" }), { upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicBundle } = supabase.storage.from("ar-maps").getPublicUrl(bundlePath);

      if (makeActive) {
        const [{ error: mapArchiveError }, { error: placementArchiveError }] = await Promise.all([
          supabase.from("venue_maps").update({ is_active: false }).eq("venue_id", venueId).eq("is_active", true),
          supabase.from("placements").update({ status: "archived", archived_at: new Date().toISOString() }).eq("venue_id", venueId).eq("status", "active"),
        ]);
        if (mapArchiveError || placementArchiveError) throw mapArchiveError || placementArchiveError;
      }

      const { error: mapError } = await supabase.from("venue_maps").insert({ id: mapId, venue_id: venueId, version, provider: "mindar", target_bundle_path: publicBundle.publicUrl, is_active: makeActive });
      if (mapError) throw mapError;
      const compass = centerHeadingRef.current;
      const { error: placementError } = await supabase.from("placements").insert({
        venue_id: venueId,
        venue_map_id: mapId,
        name: name.trim(),
        status: makeActive ? "active" : "draft",
        target_index: 0,
        position: {
          x: 0, y: height / 100, z: -(depth / 100), targetIndexes: [0, 1, 2],
          heading: compass?.isAbsolute ? Math.round(compass.heading) : null,
          headingAccuracy: compass?.isAbsolute ? compass.accuracy : null,
          scanSpan: 40,
        },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: scale / 30,
        created_by: userId,
        activated_at: makeActive ? new Date().toISOString() : null,
      });
      if (placementError) throw placementError;
      setSaved(true);
      setName("");
      changeScanStage("complete");
      router.refresh();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "The environment map could not be saved.";
      setError(message.toLowerCase().includes("bucket not found") ? "Supabase Storage is not set up yet. Run the 202609020001_ar_scan_storage.sql migration in this project's SQL Editor, then try again." : message);
      changeScanStage("complete");
    } finally { setSaving(false); }
  }

  const scanInstruction = scanStage === "left" ? "Move slowly left — keep Craig on his spot" : scanStage === "left-stop" ? "STOP — left side captured" : scanStage === "right" ? "Move slowly right, past the center" : scanStage === "right-stop" ? "STOP — right side captured" : scanStage === "complete" ? "Surroundings captured" : scanStage === "compiling" ? `Building landmark map · ${Math.round(compileProgress)}%` : "Place Craig, then keep the crosshair on his spot";
  const craigX = scanDirection === 0 ? 50 : Math.max(18, Math.min(82, 50 + (scanDelta / scanDirection) * 1.35));

  return (
    <main className="admin-content place-content">
      <div className="admin-heading"><div><p className="eyebrow">Placement scan</p><h1>Hide Craig</h1><p>No photo upload needed. This scan captures and builds the surrounding landmarks automatically.</p></div></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="placement-grid">
        <section className="placement-view">
          <video ref={videoRef} muted playsInline />
          {!camera && <div className="placement-empty"><ScanLine size={38} /><h2>Scan a hiding place</h2><p>Use a detailed, permanent area—not a blank wall or moving object.</p><button onClick={startPlacement}>Start camera and compass</button></div>}
          {camera && <>
            <div className="placement-crosshair"><Crosshair size={42} /></div>
            <div className="ghost-craig" style={{ left: `${craigX}%`, bottom: `${height}%`, transform: `translate(-50%, 50%) scale(${scale / 30})` }}><Image src="/images/crispy-craig.webp" alt="Craig placement preview" width={160} height={160} /></div>
            <div className="placement-state"><Compass size={15} /> {reading?.isAbsolute ? `${Math.round(reading.heading)}° ${cardinalDirection(reading.heading)}` : orientationAllowed === false ? "Compass unavailable" : "Finding direction…"}</div>
            <div className={`scan-calibration ${scanStage.includes("stop") ? "stop" : ""}`}><strong>{scanInstruction}</strong><span>{frames.length}/3 views captured · Craig remains pinned to the original bearing</span>{scanStage === "idle" && <button onClick={beginScan}>Lock Craig and begin</button>}{scanStage === "left" && <button onClick={() => recordSide("left-stop")}>I reached the left side</button>}{scanStage === "left-stop" && <button onClick={() => changeScanStage("right")}>Now move right</button>}{scanStage === "right" && <button onClick={() => recordSide("right-stop")}>I reached the right side</button>}{scanStage === "right-stop" && <button onClick={() => changeScanStage("complete")}>Finish scan</button>}</div>
          </>}
        </section>
        <aside className="placement-controls">
          <div className="control-heading"><div><strong>New hiding place</strong><span>{makeActive ? "Will become active" : "Draft"}</span></div></div>
          <label><span>Name</span><input type="text" placeholder="e.g. Left side of menu" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></label>
          <label><span><Move3d size={18} /> Vertical offset</span><output>{height} cm</output><input type="range" min="8" max="82" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
          <label><span><Crosshair size={18} /> Depth offset</span><output>{depth} cm</output><input type="range" min="20" max="180" value={depth} onChange={(e) => setDepth(Number(e.target.value))} /></label>
          <label><span><RotateCw size={18} /> Craig size</span><output>{scale} cm</output><input type="range" min="12" max="60" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
          <label className="placement-checkbox"><input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} /> Make this the active hiding place</label>
          <button className="admin-primary save-placement" disabled={saving || frames.length !== 3} onClick={savePlacement}>{saved ? <><Check size={18} /> Saved in Supabase</> : <><Save size={18} /> {saving ? "Building and saving…" : "Save hiding place"}</>}</button>
          <small className="placement-disclosure">The scan photos are processed on this phone. Only compiled landmark data is uploaded; customer camera frames are not.</small>
        </aside>
      </div>
      <section className="admin-panel"><div className="panel-heading"><div><h2>Saved placements</h2><p>Live Supabase records.</p></div></div>{placements.length === 0 && <p>No placements saved yet.</p>}{placements.map((placement) => <div className="schedule-row" key={placement.id}><div><strong>{placement.name}</strong><span>Map {maps.find((map) => map.id === placement.venue_map_id)?.version ?? "?"} · scale {placement.scale}</span></div><b>{placement.status}</b></div>)}</section>
    </main>
  );
}
