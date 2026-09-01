import { ScheduleEditor } from "@/components/schedule-editor";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function SchedulePage() {
  const supabase = await createServerSupabase();
  if (!supabase) return <main className="admin-content"><p className="admin-error">Supabase is not configured.</p></main>;
  const { data: venue, error } = await supabase.from("venues").select("id,timezone").eq("slug", "crispy-cones").single();
  if (!venue) return <main className="admin-content"><p className="admin-error">Could not load the restaurant: {error?.message}</p></main>;
  const [scheduleResult, exceptionResult] = await Promise.all([
    supabase.from("weekly_schedules").select("weekday,starts_at,ends_at,enabled").eq("venue_id", venue.id),
    supabase.from("schedule_exceptions").select("id,local_date,kind,starts_at,ends_at,label").eq("venue_id", venue.id).order("local_date"),
  ]);
  return <ScheduleEditor venue={venue} schedules={scheduleResult.data ?? []} exceptions={exceptionResult.data ?? []} loadError={scheduleResult.error?.message || exceptionResult.error?.message || ""} />;
}
