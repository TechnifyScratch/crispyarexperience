"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message || "We could not save that password.");
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <label htmlFor="staff-new-password">New password</label>
      <input
        id="staff-new-password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <label htmlFor="staff-confirm-password">Confirm password</label>
      <input
        id="staff-confirm-password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="spin" /> : "Save password"}
      </button>
    </form>
  );
}
