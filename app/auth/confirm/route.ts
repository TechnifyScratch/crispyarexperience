import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/staff-set-password";
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createServerSupabase();

  if (!supabase || !tokenHash || type !== "invite") {
    return NextResponse.redirect(new URL("/staff-login?error=invite", request.url));
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error) {
    return NextResponse.redirect(new URL("/staff-login?error=invite", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
