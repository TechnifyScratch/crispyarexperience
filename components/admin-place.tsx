"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Crosshair, Move3d, RotateCw, Save, ScanLine } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type VenueMap = { id: string; version: number; provider: string; is_active: boolean; target_bundle_path: string };
type Placement = { id: string; name: string; status: string; target_index: number; scale: number; updated_at: string; venue_map_id: string };

export function AdminPlace({ venueId, userId, maps, placements, loadError }: {
  venueId: string;
  userId: string;
  maps: VenueMap[];
  placements: Placement[];
  loadError: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(loadError);
  const [name, setName] = useState("");
  const [mapId, setMapId] = useState(maps.find((map) => map.is_active)?.id ?? maps[0]?.id ?? "");
  const [targetIndex, setTargetIndex] = useState(0);
  const [makeActive, setMakeActive] = useState(true);
  const [height, setHeight] = useState(42);
  const [depth, setDepth] = useState(55);
  const [scale, setScale] = useState(30);

  useEffect(() => () => { const stream = videoRef.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); }, []);

  async function startPlacement() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamera(true);
      setError("");
    } catch { setError("Camera access was denied or is unavailable on this device."); }
  }

  async function savePlacement() {
    if (!name.trim()) { setError("Give this hiding place a name."); return; }
    if (!mapId) { setError("No store map exists. Add a venue map in Supabase before saving a placement."); return; }
    const supabase = createBrowserSupabase();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setSaving(true);
    setSaved(false);
    setError("");

    if (makeActive) {
      const { error: archiveError } = await supabase.from("placements").update({ status: "archived", archived_at: new Date().toISOString() }).eq("venue_id", venueId).eq("status", "active");
      if (archiveError) { setSaving(false); setError(archiveError.message); return; }
    }

    const { error: insertError } = await supabase.from("placements").insert({
      venue_id: venueId,
      venue_map_id: mapId,
      name: name.trim(),
      status: makeActive ? "active" : "draft",
      target_index: targetIndex,
      position: { x: 0, y: height / 100, z: -(depth / 100) },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: scale / 30,
      created_by: userId,
      activated_at: makeActive ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (insertError) { setError(insertError.message); return; }
    setSaved(true);
    setName("");
    router.refresh();
  }

  return (
    <main className="admin-content place-content">
      <div className="admin-heading"><div><p className="eyebrow">Spatial placement</p><h1>Hide Craig</h1><p>The camera is a framing preview. The saved target index and offsets are what players receive.</p></div></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="placement-grid">
        <section className="placement-view">
          <video ref={videoRef} muted playsInline />
          {!camera && <div className="placement-empty"><ScanLine size={38} /><h2>Open the store camera</h2><p>Stand near the mapped feature where Craig should appear.</p><button onClick={startPlacement}>Open camera preview</button></div>}
          {camera && <><div className="placement-crosshair"><Crosshair size={42} /></div><div className="ghost-craig" style={{ bottom: `${height}%`, transform: `translate(-50%, 50%) scale(${scale / 30})` }}><Image src="/images/crispy-craig.webp" alt="Craig placement preview" width={160} height={160} /></div><div className="placement-state">Camera preview · not spatially tracked</div></>}
        </section>
        <aside className="placement-controls">
          <div className="control-heading"><div><strong>New placement</strong><span>{makeActive ? "Will become active" : "Draft"}</span></div></div>
          <label><span>Name</span><input type="text" placeholder="e.g. Menu board corner" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></label>
          <label><span>Store map</span><select value={mapId} onChange={(e) => setMapId(e.target.value)} disabled={maps.length === 0}><option value="">No map available</option>{maps.map((map) => <option value={map.id} key={map.id}>Version {map.version} · {map.provider}{map.is_active ? " · active" : ""}</option>)}</select></label>
          <label><span>Target index</span><input type="number" min="0" value={targetIndex} onChange={(e) => setTargetIndex(Number(e.target.value))} /></label>
          <label><span><Move3d size={18} /> Vertical offset</span><output>{height} cm</output><input type="range" min="8" max="82" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
          <label><span><Crosshair size={18} /> Depth offset</span><output>{depth} cm</output><input type="range" min="20" max="180" value={depth} onChange={(e) => setDepth(Number(e.target.value))} /></label>
          <label><span><RotateCw size={18} /> Craig size</span><output>{scale} cm</output><input type="range" min="12" max="60" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
          <label className="placement-checkbox"><input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} /> Make this the active placement</label>
          <button className="admin-primary save-placement" disabled={saving || !mapId} onClick={savePlacement}>{saved ? <><Check size={18} /> Saved in Supabase</> : <><Save size={18} /> {saving ? "Saving…" : "Save placement"}</>}</button>
        </aside>
      </div>
      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Saved placements</h2><p>These are the placement records currently in Supabase.</p></div></div>
        {placements.length === 0 && <p>No placements saved yet.</p>}
        {placements.map((placement) => <div className="schedule-row" key={placement.id}><div><strong>{placement.name}</strong><span>Target {placement.target_index} · scale {placement.scale}</span></div><b>{placement.status}</b></div>)}
      </section>
    </main>
  );
}
