import { ArHunt } from "@/components/ar-hunt";
import { AnonymousEntry } from "@/components/anonymous-entry";
import Image from "next/image";
import Link from "next/link";
import { supabaseConfigured } from "@/lib/config";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ImagePlacement } from "@/lib/ar/mindar-provider";

export default async function PlayPage() {
  if (!supabaseConfigured) return <ArHunt />;

  const supabase = await createServerSupabase();
  const { data: auth } = await supabase!.auth.getUser();
  if (!auth.user) return <AnonymousEntry />;

  const { data: hunt, error } = await supabase!.rpc("current_hunt", { p_venue_slug: "crispy-cones" });
  if (error || !hunt?.active) {
    return <main className="closed-page"><section className="closed-experience"><Image className="closed-logo" src="/images/crispy-cones-experiences-logo.webp" alt="Crispy Cones Experiences" width={720} height={377} priority /><div className="closed-copy"><p className="eyebrow">The hunt is resting</p><h1>Craig will hide again soon.</h1><p>Check back during the next scheduled hunt.</p><Link href="/">Back home</Link></div><Image className="closed-craig" src="/images/crispy-craig.webp" alt="Crispy Craig peeking into view" width={900} height={900} priority /></section></main>;
  }

  const placement = hunt.placement as ImagePlacement & { id: string };
  const imageTargetSrc = (hunt.map?.targetBundlePath ?? process.env.NEXT_PUBLIC_MINDAR_TARGETS) as string | undefined;
  const provider = hunt.map?.provider as string | undefined;

  return <ArHunt
    tracking={imageTargetSrc ? { imageTargetSrc, targetIndex: placement.targetIndex ?? 0, placement, provider } : undefined}
    venueId={hunt.venueId as string}
    placementId={placement.id}
    prizeMessage={hunt.prizeMessage as string | undefined}
    watermark={hunt.captureWatermark as boolean | undefined}
  />;
}
