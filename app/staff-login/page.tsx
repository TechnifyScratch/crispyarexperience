import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AdminLogin } from "@/components/admin-login";

export default function StaffLoginPage() {
  return (
    <main className="staff-login-page">
      <section>
        <Image src="/images/crispy-cones-experiences-logo.webp" alt="Crispy Cones Experiences" width={720} height={377} priority />
        <p className="eyebrow">Staff access</p>
        <h1>Admin sign in</h1>
        <Suspense><AdminLogin /></Suspense>
        <Link href="/">Return to the hunt</Link>
      </section>
    </main>
  );
}
