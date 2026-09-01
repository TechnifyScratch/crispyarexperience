"use client";

import { useState } from "react";
import { Check, Clock3, Plus, Save, Trash2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type StoredSchedule = { weekday: number; starts_at: string; ends_at: string; enabled: boolean };
type StoredException = { id: string; local_date: string; kind: "closed" | "custom_hours"; starts_at: string | null; ends_at: string | null; label: string | null };
type Day = { weekday: number; day: string; enabled: boolean; start: string; end: string };

const orderedDays = [
  { weekday: 1, day: "Monday" }, { weekday: 2, day: "Tuesday" }, { weekday: 3, day: "Wednesday" },
  { weekday: 4, day: "Thursday" }, { weekday: 5, day: "Friday" }, { weekday: 6, day: "Saturday" },
  { weekday: 0, day: "Sunday" },
];

export function ScheduleEditor({ venue, schedules, exceptions: storedExceptions, loadError }: {
  venue: { id: string; timezone: string };
  schedules: StoredSchedule[];
  exceptions: StoredException[];
  loadError: string;
}) {
  const [days, setDays] = useState<Day[]>(orderedDays.map(({ weekday, day }) => {
    const saved = schedules.find((item) => item.weekday === weekday);
    return { weekday, day, enabled: saved?.enabled ?? false, start: saved?.starts_at?.slice(0, 5) ?? "16:00", end: saved?.ends_at?.slice(0, 5) ?? "21:00" };
  }));
  const [exceptions, setExceptions] = useState(storedExceptions);
  const [draft, setDraft] = useState({ local_date: "", label: "", kind: "closed" as "closed" | "custom_hours", starts_at: "16:00", ends_at: "21:00" });
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(loadError);

  function patchDay(index: number, patch: Partial<Day>) { setSaved(false); setDays((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item)); }

  async function saveSchedule() {
    setError("");
    const supabase = createBrowserSupabase();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setSaving(true);
    const { error: saveError } = await supabase.from("weekly_schedules").upsert(
      days.map((item) => ({ venue_id: venue.id, weekday: item.weekday, starts_at: item.start, ends_at: item.end, enabled: item.enabled })),
      { onConflict: "venue_id,weekday" },
    );
    setSaving(false);
    if (saveError) setError(saveError.message); else setSaved(true);
  }

  async function addException() {
    if (!draft.local_date) { setError("Choose a date for the exception."); return; }
    const supabase = createBrowserSupabase();
    if (!supabase) { setError("Supabase is not configured."); return; }
    const payload = {
      venue_id: venue.id,
      local_date: draft.local_date,
      label: draft.label || null,
      kind: draft.kind,
      starts_at: draft.kind === "custom_hours" ? draft.starts_at : null,
      ends_at: draft.kind === "custom_hours" ? draft.ends_at : null,
    };
    const { data, error: saveError } = await supabase.from("schedule_exceptions").upsert(payload, { onConflict: "venue_id,local_date" }).select("id,local_date,kind,starts_at,ends_at,label").single();
    if (saveError || !data) { setError(saveError?.message ?? "Could not save exception."); return; }
    setExceptions((items) => [...items.filter((item) => item.local_date !== data.local_date), data].sort((a, b) => a.local_date.localeCompare(b.local_date)));
    setDraft({ local_date: "", label: "", kind: "closed", starts_at: "16:00", ends_at: "21:00" });
    setAdding(false);
    setError("");
  }

  async function deleteException(id: string) {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const { error: deleteError } = await supabase.from("schedule_exceptions").delete().eq("id", id);
    if (deleteError) setError(deleteError.message); else setExceptions((items) => items.filter((item) => item.id !== id));
  }

  return (
    <main className="admin-content">
      <div className="admin-heading"><div><p className="eyebrow">Event availability</p><h1>Weekly schedule</h1><p>Guests see the hunt only during these local hours.</p></div><button className="admin-primary" disabled={saving} onClick={saveSchedule}>{saved ? <><Check size={18} /> Saved</> : <><Save size={18} /> {saving ? "Saving…" : "Save schedule"}</>}</button></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <section className="admin-panel schedule-editor">
        <div className="timezone-row"><Clock3 size={20} /><div><strong>Restaurant timezone</strong><span>{venue.timezone} · daylight saving handled automatically</span></div></div>
        {days.map((item, index) => <div className={`day-row ${item.enabled ? "enabled" : ""}`} key={item.weekday}>
          <label className="day-toggle"><input type="checkbox" checked={item.enabled} onChange={(e) => patchDay(index, { enabled: e.target.checked })} /><span />{item.day}</label>
          <div className="time-inputs"><input aria-label={`${item.day} start time`} type="time" value={item.start} disabled={!item.enabled} onChange={(e) => patchDay(index, { start: e.target.value })} /><i>to</i><input aria-label={`${item.day} end time`} type="time" value={item.end} disabled={!item.enabled} onChange={(e) => patchDay(index, { end: e.target.value })} /></div>
        </div>)}
      </section>
      <section className="admin-panel exceptions-panel">
        <div className="panel-heading"><div><h2>Date exceptions</h2><p>Close or extend the hunt on a specific date.</p></div><button onClick={() => setAdding((value) => !value)}><Plus size={17} /> Add exception</button></div>
        {adding && <div className="exception-form">
          <input aria-label="Exception date" type="date" value={draft.local_date} onChange={(e) => setDraft({ ...draft, local_date: e.target.value })} />
          <input aria-label="Exception label" placeholder="Label (optional)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <select aria-label="Exception type" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as "closed" | "custom_hours" })}><option value="closed">Closed</option><option value="custom_hours">Custom hours</option></select>
          {draft.kind === "custom_hours" && <><input aria-label="Exception start time" type="time" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} /><input aria-label="Exception end time" type="time" value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} /></>}
          <button onClick={addException}>Save exception</button>
        </div>}
        {exceptions.length === 0 && <p>No date exceptions saved.</p>}
        {exceptions.map((exception) => <div className="exception-row" key={exception.id}><div><strong>{exception.label || exception.local_date}</strong><span>{exception.local_date} · {exception.kind === "closed" ? "Hunt closed" : `${exception.starts_at?.slice(0, 5)}–${exception.ends_at?.slice(0, 5)}`}</span></div><button aria-label={`Delete ${exception.label || exception.local_date}`} onClick={() => deleteException(exception.id)}><Trash2 size={18} /></button></div>)}
      </section>
    </main>
  );
}
