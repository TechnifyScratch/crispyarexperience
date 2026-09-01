"use client";

import { useState } from "react";
import { Check, Clock3, Plus, Save, Trash2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const initialDays = [
  { day: "Monday", enabled: true, start: "16:00", end: "21:00" },
  { day: "Tuesday", enabled: false, start: "16:00", end: "21:00" },
  { day: "Wednesday", enabled: true, start: "16:00", end: "21:00" },
  { day: "Thursday", enabled: false, start: "16:00", end: "21:00" },
  { day: "Friday", enabled: false, start: "16:00", end: "21:00" },
  { day: "Saturday", enabled: true, start: "12:00", end: "21:00" },
  { day: "Sunday", enabled: false, start: "12:00", end: "20:00" },
];

export function ScheduleEditor() {
  const [days, setDays] = useState(initialDays);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function patchDay(index: number, patch: Partial<(typeof days)[number]>) { setSaved(false); setDays((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item)); }

  async function saveSchedule() {
    setError("");
    const supabase = createBrowserSupabase();
    if (!supabase) { setSaved(true); return; }
    setSaving(true);
    const { data: venue, error: venueError } = await supabase.from("venues").select("id").eq("slug", "crispy-cones").single();
    if (venueError || !venue) { setError(venueError?.message ?? "Venue not found."); setSaving(false); return; }
    const { error: saveError } = await supabase.from("weekly_schedules").upsert(
      days.map((item, weekday) => ({ venue_id: venue.id, weekday, starts_at: item.start, ends_at: item.end, enabled: item.enabled })),
      { onConflict: "venue_id,weekday" },
    );
    setSaving(false);
    if (saveError) setError(saveError.message);
    else setSaved(true);
  }

  return (
    <main className="admin-content">
      <div className="admin-heading"><div><p className="eyebrow">Event availability</p><h1>Weekly schedule</h1><p>Guests see the hunt only during these local hours.</p></div><button className="admin-primary" disabled={saving} onClick={saveSchedule}>{saved ? <><Check size={18} /> Saved</> : <><Save size={18} /> {saving ? "Saving…" : "Save schedule"}</>}</button></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <section className="admin-panel schedule-editor">
        <div className="timezone-row"><Clock3 size={20} /><div><strong>Restaurant timezone</strong><span>America/Los_Angeles · daylight saving handled automatically</span></div></div>
        {days.map((item, index) => <div className={`day-row ${item.enabled ? "enabled" : ""}`} key={item.day}>
          <label className="day-toggle"><input type="checkbox" checked={item.enabled} onChange={(e) => patchDay(index, { enabled: e.target.checked })} /><span />{item.day}</label>
          <div className="time-inputs"><input aria-label={`${item.day} start time`} type="time" value={item.start} disabled={!item.enabled} onChange={(e) => patchDay(index, { start: e.target.value })} /><i>to</i><input aria-label={`${item.day} end time`} type="time" value={item.end} disabled={!item.enabled} onChange={(e) => patchDay(index, { end: e.target.value })} /></div>
        </div>)}
      </section>
      <section className="admin-panel exceptions-panel"><div className="panel-heading"><div><h2>Date exceptions</h2><p>Close or extend the hunt on a specific date.</p></div><button><Plus size={17} /> Add exception</button></div><div className="exception-row"><div><strong>Labor Day</strong><span>September 7, 2026 · Hunt closed</span></div><button aria-label="Delete Labor Day exception"><Trash2 size={18} /></button></div></section>
    </main>
  );
}
