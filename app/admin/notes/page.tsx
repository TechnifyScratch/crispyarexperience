import { NotesBoard } from "@/components/notes-board";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AdminNotesPage() {
  const supabase = await createServerSupabase();
  if (!supabase) return <main className="admin-content"><p className="admin-error">Supabase is not configured. Notes cannot be loaded.</p></main>;

  const [{ data: auth }, venueResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("venues").select("id,timezone").eq("slug", "crispy-cones").single(),
  ]);
  if (!auth.user || !venueResult.data) return <main className="admin-content"><p className="admin-error">Could not load the notes workspace.</p></main>;

  const notesResult = await supabase.from("admin_notes").select("id,title,body,created_at,updated_at").eq("venue_id", venueResult.data.id).order("created_at", { ascending: false });
  return <NotesBoard venueId={venueResult.data.id} userId={auth.user.id} timezone={venueResult.data.timezone} notes={notesResult.data ?? []} loadError={notesResult.error?.message ?? ""} />;
}
