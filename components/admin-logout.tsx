"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function AdminLogout() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    const supabase = createBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
    router.replace("/staff-login");
    router.refresh();
  }

  return <button className="admin-logout" type="button" onClick={logout} disabled={busy}>{busy ? "Logging out…" : "Log out"}</button>;
}
