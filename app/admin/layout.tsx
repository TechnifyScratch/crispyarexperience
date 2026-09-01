import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminShell } from "@/components/admin-shell";
import { supabaseConfigured } from "@/lib/config";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();
  let previewMode = !supabaseConfigured;
  if (supabaseConfigured) {
    const supabase = await createServerSupabase();
    const { data } = await supabase!.auth.getUser();
    if (!data.user) redirect("/staff-login?next=/admin");
    const { data: profile } = await supabase!.from("profiles").select("role").eq("id", data.user.id).single();
    if (profile?.role !== "admin") redirect("/staff-login?next=/admin");
    previewMode = false;
  }
  return <AdminShell previewMode={previewMode}>{children}</AdminShell>;
}
