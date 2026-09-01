"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Crosshair, Eye, Move3d, RotateCw, Save, ScanLine } from "lucide-react";

export function AdminPlace() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState(false);
  const [saved, setSaved] = useState(false);
  const [height, setHeight] = useState(42);
  const [depth, setDepth] = useState(55);
  const [scale, setScale] = useState(30);

  useEffect(() => () => { const stream = videoRef.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); }, []);

  async function startPlacement() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamera(true);
    } catch { setCamera(false); }
  }

  return (
    <main className="admin-content place-content">
      <div className="admin-heading"><div><p className="eyebrow">Spatial placement</p><h1>Hide Craig</h1><p>Aim at a stable surface, then fine-tune his position.</p></div></div>
      <div className="placement-grid">
        <section className="placement-view">
          <video ref={videoRef} muted playsInline />
          {!camera && <div className="placement-empty"><ScanLine size={38} /><h2>Start the store camera</h2><p>Stand near the area where Craig should hide.</p><button onClick={startPlacement}>Open placement camera</button></div>}
          {camera && <><div className="placement-crosshair"><Crosshair size={42} /></div><div className="ghost-craig" style={{ bottom: `${height}%`, transform: `translate(-50%, 50%) scale(${scale / 30})` }}>CRAIG</div><div className="placement-state"><span /> Map located · Admin preview</div></>}
        </section>
        <aside className="placement-controls">
          <div className="control-heading"><div><strong>Placement 06</strong><span>Draft</span></div><button><Eye size={18} /> Player preview</button></div>
          <label><span><Move3d size={18} /> Height</span><output>{height} cm</output><input type="range" min="8" max="82" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
          <label><span><Crosshair size={18} /> Depth</span><output>{depth} cm</output><input type="range" min="20" max="180" value={depth} onChange={(e) => setDepth(Number(e.target.value))} /></label>
          <label><span><RotateCw size={18} /> Craig size</span><output>{scale} cm</output><input type="range" min="12" max="60" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
          <div className="occlusion-note"><Check size={18} /><div><strong>Occlusion enabled</strong><span>Stable counters and walls can cover Craig.</span></div></div>
          <button className="admin-primary save-placement" onClick={() => setSaved(true)}>{saved ? <><Check size={18} /> Draft saved</> : <><Save size={18} /> Save draft</>}</button>
        </aside>
      </div>
    </main>
  );
}
