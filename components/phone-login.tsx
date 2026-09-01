"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Step = "phone" | "code";

export function PhoneLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supabase = createBrowserSupabase();
  const next = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/play";

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^\+[1-9]\d{7,14}$/.test(phone.replace(/[\s()-]/g, ""))) {
      setError("Enter a full phone number with country code, like +1 555 123 4567.");
      return;
    }

    if (!supabase) {
      setStep("code");
      return;
    }

    setBusy(true);
    const normalized = phone.replace(/[\s()-]/g, "");
    const { error: authError } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (authError) setError(authError.message);
    else setStep("code");
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your text message.");
      return;
    }

    if (!supabase) {
      router.push(next);
      return;
    }

    setBusy(true);
    const { error: authError } = await supabase.auth.verifyOtp({
      phone: phone.replace(/[\s()-]/g, ""),
      token: code,
      type: "sms",
    });
    setBusy(false);
    if (authError) setError(authError.message);
    else router.push(next);
  }

  return (
    <div className="login-panel">
      {!supabase && <div className="preview-banner">Local preview</div>}

      {step === "phone" ? (
        <form onSubmit={sendCode} className="login-form">
          <div className="input-heading"><strong>Phone number</strong><small>Include your country code.</small></div>
          <label className="sr-only" htmlFor="phone">Phone number</label>
          <input
            autoComplete="tel"
            autoFocus
            id="phone"
            inputMode="tel"
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+1 555 123 4567"
            type="tel"
            value={phone}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button login-button" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="spin" size={20} /> : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="login-form">
          <div className="input-heading"><strong>Enter your code</strong><small>Sent to {phone}</small></div>
          <label className="sr-only" htmlFor="code">Six-digit verification code</label>
          <input
            autoComplete="one-time-code"
            autoFocus
            className="code-input"
            id="code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            value={code}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button login-button" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="spin" size={20} /> : "Start searching"}
          </button>
          <button className="text-button" onClick={() => { setStep("phone"); setError(""); }} type="button">Use a different number</button>
        </form>
      )}
    </div>
  );
}
