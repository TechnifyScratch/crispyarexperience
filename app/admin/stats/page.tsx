import { BarChart3 } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";

type DailyPlayers = { date: string; players: number };
type PlayStats = {
  generatedAt: string;
  day: number;
  sevenDays: number;
  twentyEightDays: number;
  year: number;
  daily: DailyPlayers[];
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function AdminStatsPage() {
  const supabase = await createServerSupabase();
  if (!supabase) return <main className="admin-content"><p className="admin-error">Supabase is not configured. No analytics are available.</p></main>;

  const { data: venue, error: venueError } = await supabase.from("venues").select("id,timezone").eq("slug", "crispy-cones").single();
  if (!venue) return <main className="admin-content"><p className="admin-error">Could not load analytics: {venueError?.message ?? "venue not found"}</p></main>;

  const { data, error } = await supabase.rpc("admin_play_stats", { p_venue_id: venue.id });
  if (error || !data) return <main className="admin-content"><div className="admin-heading"><div><p className="eyebrow">Real participation data</p><h1>Player stats</h1></div></div><p className="admin-error">Could not load analytics: {error?.message ?? "no data returned"}. Apply the latest Supabase migration first.</p></main>;

  const raw = data as Partial<PlayStats>;
  const stats: PlayStats = {
    generatedAt: String(raw.generatedAt ?? new Date().toISOString()),
    day: numberValue(raw.day),
    sevenDays: numberValue(raw.sevenDays),
    twentyEightDays: numberValue(raw.twentyEightDays),
    year: numberValue(raw.year),
    daily: Array.isArray(raw.daily) ? raw.daily.map((item) => ({ date: String(item.date), players: numberValue(item.players) })) : [],
  };
  const maximum = Math.max(1, ...stats.daily.map((item) => item.players));
  const cards = [
    { label: "Past 24 hours", value: stats.day },
    { label: "Past 7 days", value: stats.sevenDays },
    { label: "Past 28 days", value: stats.twentyEightDays },
    { label: "Past 365 days", value: stats.year },
  ];
  const generated = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: venue.timezone }).format(new Date(stats.generatedAt));

  return <main className="admin-content analytics-page">
    <div className="admin-heading"><div><p className="eyebrow">Real participation data</p><h1>Player stats</h1><p>Distinct people who opened an active hunt. Repeat visits by the same account count once per period.</p></div></div>
    <section className="analytics-summary" aria-label="Player totals">
      {cards.map((card) => <article key={card.label}><span>{card.label}</span><strong>{card.value.toLocaleString()}</strong><small>unique {card.value === 1 ? "player" : "players"}</small></article>)}
    </section>
    <section className="admin-panel analytics-chart-panel">
      <div className="panel-heading"><div><h2><BarChart3 size={18} /> Daily players</h2><p>Calendar days in {venue.timezone} · last 28 days</p></div></div>
      <div className="analytics-bars" aria-label="Daily unique player counts">
        {stats.daily.map((item, index) => <div className="analytics-day" key={item.date} title={`${item.date}: ${item.players} unique players`} aria-label={`${item.date}: ${item.players} unique players`}>
          <span className="analytics-value">{item.players || ""}</span>
          <i style={{ height: `${item.players === 0 ? 2 : Math.max(8, item.players / maximum * 100)}%` }} />
          <small>{index % 7 === 0 || index === stats.daily.length - 1 ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${item.date}T12:00:00Z`)) : ""}</small>
        </div>)}
      </div>
      {stats.daily.every((item) => item.players === 0) && <p className="analytics-empty">No recorded players in the past 28 days.</p>}
      <p className="analytics-updated">Calculated from hunt sessions · updated {generated}</p>
    </section>
  </main>;
}
