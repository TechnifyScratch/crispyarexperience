"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Compass, Download, LoaderCircle, Share2, X } from "lucide-react";
import type { ImagePlacement } from "@/lib/ar/mindar-provider";
import { cardinalDirection, readingFromEvent, requestOrientationPermission, signedAngleDifference } from "@/lib/ar/orientation";

type CameraState = "idle" | "starting" | "ready" | "denied" | "unavailable";
type ArHuntProps = {
  tracking?: { imageTargetSrc: string; targetIndex: number; placement: ImagePlacement; provider?: string };
  prizeMessage?: string;
  watermark?: boolean;
};

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function ArHunt({ tracking, prizeMessage = "Show this screen when you order.", watermark = true }: ArHuntProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererCleanupRef = useRef<(() => void) | null>(null);
  const combinedCanvasRef = useRef(false);
  const startedRef = useRef(false);
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [targetVisible, setTargetVisible] = useState(false);
  const [localizationProgress, setLocalizationProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [compassEnabled, setCompassEnabled] = useState(false);
  const expectedHeading = tracking?.placement.position.heading;

  const startCamera = useCallback(async () => {
    if (cameraState === "starting" || cameraState === "ready") return;
    setCameraState("starting");
    if (!navigator.mediaDevices?.getUserMedia) { setCameraState("unavailable"); return; }
    try {
      if (tracking && hostRef.current) {
        if (tracking.provider === "8thwall") {
          const canvas = overlayRef.current;
          if (!canvas) throw new Error("Spatial canvas is unavailable.");
          const { mountEighthWallHunt } = await import("@/lib/ar/eighthwall-provider");
          const mounted = await mountEighthWallHunt({
            canvas,
            ...tracking,
            onLocalized: () => { setLocalizationProgress(1); setTargetVisible(true); },
            onTrackingLost: () => { setLocalizationProgress(0); setTargetVisible(false); },
            onLocalizationProgress: setLocalizationProgress,
          });
          combinedCanvasRef.current = true;
          captureVideoRef.current = mounted.video;
          captureCanvasRef.current = mounted.canvas;
          rendererCleanupRef.current = mounted.cleanup;
          setCameraState("ready");
          return;
        }
        const { mountMindArHunt } = await import("@/lib/ar/mindar-provider");
        const mounted = await mountMindArHunt({ host: hostRef.current, ...tracking, onLocated: () => setTargetVisible(true), onLost: () => setTargetVisible(false) });
        captureVideoRef.current = mounted.video;
        captureCanvasRef.current = mounted.canvas;
        rendererCleanupRef.current = mounted.cleanup;
        setCameraState("ready");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      const video = videoRef.current;
      const canvas = overlayRef.current;
      if (!video || !canvas) throw new Error("Camera view is unavailable.");
      video.srcObject = stream;
      await video.play();
      captureVideoRef.current = video;
      captureCanvasRef.current = canvas;
      setCameraState("ready");
    } catch { setCameraState("denied"); }
  }, [cameraState, tracking]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startCamera();
  }, [startCamera]);

  useEffect(() => {
    if (cameraState !== "ready") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [cameraState]);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      rendererCleanupRef.current?.();
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!compassEnabled) return;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const next = readingFromEvent(event);
      if (next?.isAbsolute) setHeading(next.heading);
    };
    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, [compassEnabled]);

  async function enableCompass() {
    const allowed = await requestOrientationPermission();
    setCompassEnabled(allowed);
  }

  const takeCapture = useCallback(() => {
    const video = captureVideoRef.current;
    const overlay = captureCanvasRef.current;
    const frame = hostRef.current;
    if (!overlay || !frame) return;
    if (combinedCanvasRef.current) {
      if (!overlay.width || !overlay.height) return;
      const output = document.createElement("canvas");
      output.width = overlay.width;
      output.height = overlay.height;
      const context = output.getContext("2d");
      if (!context) return;
      context.drawImage(overlay, 0, 0);
      addWatermark(context, output.width, output.height, watermark);
      setCapturedUrl(output.toDataURL("image/jpeg", 0.9));
      return;
    }
    if (!video || video.videoWidth === 0) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) return;
    const sourceRatio = width / height;
    const viewRatio = frame.clientWidth / frame.clientHeight;
    let sx = 0, sy = 0, sw = width, sh = height;
    if (sourceRatio > viewRatio) { sw = height * viewRatio; sx = (width - sw) / 2; }
    else { sh = width / viewRatio; sy = (height - sh) / 2; }
    context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
    context.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, width, height);
    addWatermark(context, width, height, watermark);
    setCapturedUrl(output.toDataURL("image/jpeg", 0.9));
  }, [watermark]);

  async function shareCapture() {
    if (!capturedUrl) return;
    setSharing(true);
    try {
      const blob = await (await fetch(capturedUrl)).blob();
      const file = new File([blob], "crispy-craig-capture.jpg", { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "My Crispy Craig capture" });
      else { const link = document.createElement("a"); link.download = file.name; link.href = capturedUrl; link.click(); }
    } finally { setSharing(false); }
  }

  return (
    <main className="ar-page">
      <div className="search-timer" aria-label={`Search time ${formatElapsed(elapsed)}`}><small>SEARCH TIME</small>{formatElapsed(elapsed)}</div>
      <div className="ar-camera-frame" ref={hostRef}>
        <video ref={videoRef} className={`camera-feed ${tracking && tracking.provider !== "8thwall" ? "provider-placeholder" : ""}`} muted playsInline />
        <canvas ref={overlayRef} className={`ar-overlay ${tracking && tracking.provider !== "8thwall" ? "provider-placeholder" : ""}`} />
        {tracking && cameraState === "ready" && !targetVisible && <div className="scan-prompt">{localizationProgress > 0 ? `Confirming exact location… ${Math.round(localizationProgress * 100)}%` : expectedHeading != null && heading != null ? `${Math.abs(signedAngleDifference(expectedHeading, heading)) < 35 ? "You’re facing the hiding area — scan slowly" : `Turn toward ${cardinalDirection(expectedHeading)}`} · ${Math.round(heading)}° ${cardinalDirection(heading)}` : "Look around slowly…"}</div>}
        {tracking && cameraState === "ready" && expectedHeading != null && !compassEnabled && <button className="compass-button" onClick={enableCompass}><Compass size={17} /> Use direction</button>}
        {tracking?.provider === "8thwall" && <a className="eighthwall-credit" href="https://www.8thwall.org/" target="_blank" rel="noreferrer">Powered by 8th Wall</a>}
        {cameraState === "starting" && <div className="camera-message"><LoaderCircle className="spin" size={28} /><strong>Starting your camera…</strong></div>}
        {(cameraState === "denied" || cameraState === "unavailable") && <div className="camera-message error-card"><Camera size={30} /><strong>Camera access is needed</strong><span>Allow camera access in your browser settings, then try again.</span><button onClick={startCamera}>Try again</button></div>}
      </div>
      <button className="capture-button" disabled={cameraState !== "ready"} onClick={takeCapture}><Camera size={34} /> Capture</button>
      {capturedUrl && (
        <div className="capture-modal" role="dialog" aria-modal="true" aria-label="Your capture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={capturedUrl} alt="Your Crispy Craig hunt capture" />
          <button className="capture-close" onClick={() => setCapturedUrl(null)} aria-label="Close capture"><X size={24} /></button>
          <div className="capture-proof"><Check size={20} /><div><strong>Capture ready</strong><span>{prizeMessage}</span></div></div>
          <button className="share-button" onClick={shareCapture} disabled={sharing}>{sharing ? <LoaderCircle className="spin" /> : <Share2 size={20} />} Save or share</button>
          <a className="download-fallback" download="crispy-craig-capture.jpg" href={capturedUrl}><Download size={16} /> Download capture</a>
        </div>
      )}
    </main>
  );
}

function addWatermark(context: CanvasRenderingContext2D, width: number, height: number, enabled: boolean) {
  if (!enabled) return;
  const pad = Math.round(width * 0.04);
  const boxHeight = Math.max(46, Math.round(width * 0.067));
  const boxWidth = Math.max(210, Math.round(width * 0.28));
  context.fillStyle = "rgba(0,0,0,.68)";
  context.beginPath();
  context.roundRect(pad, height - pad - boxHeight, boxWidth, boxHeight, boxHeight / 3);
  context.fill();
  context.fillStyle = "white";
  context.font = `700 ${Math.max(17, Math.round(width * 0.025))}px Arial`;
  context.fillText("Crispy Craig Hunt", pad + boxHeight * 0.28, height - pad - boxHeight * 0.38);
}
