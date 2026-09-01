import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { PhoneLogin } from "@/components/phone-login";

export default function LoginPage() {
  return (
    <main className="black-login">
      <section className="black-login-card">
        <Link className="black-back" href="/"><ArrowLeft size={20} /> Back</Link>
        <Image className="intro-logo login-lockup" src="/images/crispy-cones-experiences-logo.webp" alt="Crispy Cones Experiences" width={720} height={377} priority />
        <div className="black-login-copy">
          <h1>What’s your number?</h1>
          <p>We’ll send a one-time code. No password, no account setup.</p>
        </div>
        <Suspense><PhoneLogin /></Suspense>
        <p className="black-privacy"><ShieldCheck size={16} /> Your camera and captures stay on your phone.</p>
      </section>
    </main>
  );
}
