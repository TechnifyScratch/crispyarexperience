import { SettingsEditor } from "@/components/settings-editor";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const result = supabase ? await supabase.from("venues").select("id,hunt_enabled,capture_watermark,prize_message,localization_prompt").eq("slug", "crispy-cones").single() : null;
  if (!result?.data) return <main className="admin-content"><p className="admin-error">Could not load settings{result?.error ? `: ${result.error.message}` : "."}</p></main>;
  return <SettingsEditor venue={result.data} />;
}
