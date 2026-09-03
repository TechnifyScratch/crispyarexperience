"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, StickyNote } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type AdminNote = { id: string; title: string; body: string; created_at: string; updated_at: string };

export function NotesBoard({ venueId, userId, timezone, notes, loadError }: { venueId: string; userId: string; timezone: string; notes: AdminNote[]; loadError: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(loadError);

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) { setError("Add both a title and a note."); return; }
    const supabase = createBrowserSupabase();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setSaving(true); setSaved(false); setError("");
    const result = await supabase.from("admin_notes").insert({ venue_id: venueId, created_by: userId, title: title.trim(), body: body.trim() });
    if (result.error) setError(result.error.message);
    else {
      setTitle(""); setBody(""); setSaved(true); router.refresh();
    }
    setSaving(false);
  }

  const formatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });

  return <main className="admin-content notes-page">
    <div className="admin-heading"><div><p className="eyebrow">Staff reference</p><h1>Notes</h1><p>Keep useful reminders for the admin team.</p></div></div>
    {error && <p className="admin-error" role="alert">{error}{loadError ? " Apply the latest Supabase migration first." : ""}</p>}
    <form className="admin-panel note-form" onSubmit={addNote}>
      <label><span>Title</span><input maxLength={120} required value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} placeholder="What is this about?" /></label>
      <label><span>Note</span><textarea maxLength={4000} required value={body} onChange={(event) => { setBody(event.target.value); setSaved(false); }} placeholder="Write something the team can refer to later…" /></label>
      <button className="admin-primary" disabled={saving}>{saved ? <><Check size={16} /> Saved</> : <><StickyNote size={16} /> {saving ? "Saving…" : "Add note"}</>}</button>
    </form>
    <section className="notes-list" aria-label="Saved notes">
      {notes.length === 0 && !loadError && <div className="admin-panel notes-empty"><StickyNote size={22} /><p>No notes yet.</p></div>}
      {notes.map((note) => <article className="admin-panel note-card" key={note.id}><time dateTime={note.created_at}>{formatter.format(new Date(note.created_at))}</time><h2>{note.title}</h2><p>{note.body}</p></article>)}
    </section>
  </main>;
}
