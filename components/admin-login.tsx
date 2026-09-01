"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = searchParams.get("next")?.startsWith("/admin") ? searchParams.get("next")! : "/admin";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createBrowserSupabase();
    if (!supabase) { router.push(next); return; }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) { setError("That email or password didn’t work."); return; }
    router.replace(next);
    router.refresh();
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <label htmlFor="staff-email">Email</label>
      <input id="staff-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="staff-password">Password</label>
      <input id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : "Sign in"}</button>
    </form>
  );
}
