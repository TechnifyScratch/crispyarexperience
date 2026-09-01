import { AdminPlace } from "@/components/admin-place";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function PlacePage() {
  const supabase = await createServerSupabase();
  if (!supabase) return <main className="admin-content"><p className="admin-error">Supabase is not configured.</p></main>;
  const [{ data: userData }, venueResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("venues").select("id").eq("slug", "crispy-cones").single(),
  ]);
  if (!venueResult.data || !userData.user) return <main className="admin-content"><p className="admin-error">Could not load placement data.</p></main>;
  const [mapResult, placementResult] = await Promise.all([
    supabase.from("venue_maps").select("id,version,provider,is_active,target_bundle_path").eq("venue_id", venueResult.data.id).order("version", { ascending: false }),
    supabase.from("placements").select("id,name,status,target_index,scale,updated_at,venue_map_id").eq("venue_id", venueResult.data.id).order("updated_at", { ascending: false }),
  ]);
  return <AdminPlace venueId={venueResult.data.id} userId={userData.user.id} maps={mapResult.data ?? []} placements={placementResult.data ?? []} loadError={mapResult.error?.message || placementResult.error?.message || ""} />;
}
