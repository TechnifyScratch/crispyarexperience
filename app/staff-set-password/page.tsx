import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetPasswordForm } from "@/components/set-password-form";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function StaffSetPasswordPage() {
  await connection();
  const supabase = await createServerSupabase();
  const { data } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };

  if (!data.user || data.user.is_anonymous || !data.user.email) {
    redirect("/staff-login?error=invite");
  }

  return (
    <main className="staff-login-page">
      <section>
        <Image src="/images/crispy-cones-experiences-logo.webp" alt="Crispy Cones Experiences" width={720} height={377} priority />
        <p className="eyebrow">Staff invitation</p>
        <h1>Choose a password</h1>
        <p className="staff-login-note">Setting up access for {data.user.email}</p>
        <SetPasswordForm />
      </section>
    </main>
  );
}
