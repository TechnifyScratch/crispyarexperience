"use client";

import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function AnonymousEntry() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");

  const enter = useCallback(async () => {
    setError("");
    const supabase = createBrowserSupabase();
    if (!supabase) { router.refresh(); return; }
    const { data: existing } = await supabase.auth.getSession();
    if (!existing.session) {
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) { setError(authError.message); return; }
    }
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enter();
  }, [enter]);

  return (
    <main className="guest-entry">
      <Image src="/images/crispy-cones-experiences-logo.webp" alt="Crispy Cones Experiences" width={720} height={377} priority />
      {error ? <><p>We couldn’t start the hunt.</p><button onClick={enter}>Try again</button></> : <><LoaderCircle className="spin" /><p>Opening the camera…</p></>}
    </main>
  );
}
