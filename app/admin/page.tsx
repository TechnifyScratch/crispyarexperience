import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function localDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(new Date());
}

function displayTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2020, 0, 1, hour, minute)));
}

export default async function AdminDashboard() {
  const supabase = await createServerSupabase();
  if (!supabase) return <main className="admin-content"><p className="admin-error">Supabase is not configured. No admin data is available.</p></main>;

  const { data: venue, error: venueError } = await supabase.from("venues").select("*").eq("slug", "crispy-cones").single();
  if (venueError || !venue) return <main className="admin-content"><p className="admin-error">Could not load the restaurant: {venueError?.message ?? "venue not found"}</p></main>;

  const [placementResult, mapResult, scheduleResult, exceptionResult, huntResult] = await Promise.all([
    supabase.from("placements").select("id,name,status,updated_at,venue_map_id,target_index").eq("venue_id", venue.id).eq("status", "active").maybeSingle(),
    supabase.from("venue_maps").select("id,version,provider,created_at").eq("venue_id", venue.id).eq("is_active", true).maybeSingle(),
    supabase.from("weekly_schedules").select("weekday,starts_at,ends_at,enabled,placement_id").eq("venue_id", venue.id).eq("enabled", true).order("weekday"),
    supabase.from("schedule_exceptions").select("id,local_date,kind,starts_at,ends_at,label").eq("venue_id", venue.id).gte("local_date", localDate(venue.timezone)).order("local_date").limit(5),
    supabase.rpc("current_hunt", { p_venue_slug: "crispy-cones" }),
  ]);

  const activePlacement = placementResult.data;
  const activeMap = mapResult.data;
  const schedules = scheduleResult.data ?? [];
  const exceptions = exceptionResult.data ?? [];
  const hunt = huntResult.data as { active?: boolean } | null;
  const loadError = placementResult.error || mapResult.error || scheduleResult.error || exceptionResult.error || huntResult.error;
  const isLive = Boolean(hunt?.active);

  return (
    <main className="admin-content">
      <div className="admin-heading"><div><p className="eyebrow">Crispy Craig admin</p><h1>Current hunt</h1></div><Link className="admin-primary" href="/admin/place">Hide Craig</Link></div>
      {loadError && <p className="admin-error">Some data could not be loaded: {loadError.message}</p>}
      <section className="status-hero">
        <div className="status-live">Status: {isLive ? "live now" : "not currently live"}</div>
        <h2>{activePlacement?.name ?? "No active placement"}</h2>
        <p>{!venue.hunt_enabled ? "The hunt is disabled in Settings." : isLive ? "The venue, schedule, map, and placement are active." : "The hunt is outside its scheduled hours or is missing an active map or placement."}</p>
        <div className="status-actions"><Link href="/admin/place">Manage placements</Link><Link href="/admin/schedule">Manage availability</Link></div>
      </section>
      <section className="admin-stats">
        <article><small>Active placement</small><strong>{activePlacement?.name ?? "None"}</strong><p>{activePlacement ? `Target ${activePlacement.target_index}` : "Create or activate one"}</p></article>
        <article><small>Weekly windows</small><strong>{schedules.length}</strong><p>{schedules.length === 1 ? "Enabled day" : "Enabled days"}</p></article>
        <article><small>Active store map</small><strong>{activeMap ? `Version ${activeMap.version}` : "None"}</strong><p>{activeMap ? activeMap.provider : "Upload and activate a map"}</p></article>
      </section>
      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Weekly schedule</h2><p>Local time · {venue.timezone}</p></div><Link href="/admin/schedule">Edit schedule</Link></div>
        {schedules.length === 0 && <p>No weekly hunt hours are enabled.</p>}
        {schedules.map((schedule) => <div className="schedule-row" key={schedule.weekday}><div><strong>{weekdayNames[schedule.weekday]}</strong><span>{displayTime(schedule.starts_at)}–{displayTime(schedule.ends_at)}</span></div><b>{schedule.placement_id ? "Assigned placement" : "Active placement"}</b></div>)}
      </section>
      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Upcoming exceptions</h2><p>Specific-date overrides saved in Supabase.</p></div><Link href="/admin/schedule">Edit exceptions</Link></div>
        {exceptions.length === 0 && <p>No upcoming date exceptions.</p>}
        {exceptions.map((exception) => <div className="schedule-row" key={exception.id}><div><strong>{exception.label || exception.local_date}</strong><span>{exception.local_date}</span></div><b>{exception.kind === "closed" ? "Closed" : `${displayTime(exception.starts_at!)}–${displayTime(exception.ends_at!)}`}</b></div>)}
      </section>
    </main>
  );
}
