"use client";

import { useState } from "react";
import { Check, Save } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function SettingsEditor() {
  const [enabled, setEnabled] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const [prize, setPrize] = useState("Show this capture when you order for a surprise!");
  const [prompt, setPrompt] = useState("Look around slowly. Point toward walls, signs, and the counter.");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const supabase = createBrowserSupabase();
    if (!supabase) { setStatus("saved"); return; }
    setStatus("saving");
    const { error: saveError } = await supabase.from("venues").update({
      hunt_enabled: enabled,
      capture_watermark: watermark,
      prize_message: prize,
      localization_prompt: prompt,
    }).eq("slug", "crispy-cones");
    if (saveError) { setError(saveError.message); setStatus("idle"); }
    else setStatus("saved");
  }

  return <main className="admin-content">
    <div className="admin-heading"><div><p className="eyebrow">Experience controls</p><h1>Settings</h1><p>Store-wide defaults for the Crispy Craig hunt.</p></div></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <section className="admin-panel settings-form">
      <label><span><strong>Hunt enabled</strong><small>Schedule still determines the active hours.</small></span><input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setStatus("idle"); }} /></label>
      <label><span><strong>Capture watermark</strong><small>Add the event name to customer captures.</small></span><input type="checkbox" checked={watermark} onChange={(event) => { setWatermark(event.target.checked); setStatus("idle"); }} /></label>
      <label><span><strong>Prize message</strong><small>Shown after a customer takes a capture.</small></span><textarea value={prize} onChange={(event) => { setPrize(event.target.value); setStatus("idle"); }} /></label>
      <label><span><strong>Localization prompt</strong><small>What guests see while the store map is loading.</small></span><textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); setStatus("idle"); }} /></label>
      <button className="admin-primary" disabled={status === "saving"} onClick={save}>{status === "saved" ? <><Check size={18} /> Saved</> : <><Save size={18} /> {status === "saving" ? "Saving…" : "Save settings"}</>}</button>
    </section>
  </main>;
}
