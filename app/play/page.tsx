import { ArHunt } from "@/components/ar-hunt";
import { AnonymousEntry } from "@/components/anonymous-entry";
import Link from "next/link";
import { Clock3, IceCreamBowl } from "lucide-react";
import { arConfigured, supabaseConfigured } from "@/lib/config";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ImagePlacement } from "@/lib/ar/mindar-provider";

export default async function PlayPage() {
  if (!supabaseConfigured) return <ArHunt previewMode />;

  const supabase = await createServerSupabase();
  const { data: auth } = await supabase!.auth.getUser();
  if (!auth.user) return <AnonymousEntry />;

  const { data: hunt, error } = await supabase!.rpc("current_hunt", { p_venue_slug: "crispy-cones" });
  if (error || !hunt?.active) {
    return <main className="simple-page"><section className="simple-card closed-card"><div className="simple-brand"><span><IceCreamBowl size={24} /></span>Crispy Cones</div><Clock3 size={35} /><p className="eyebrow">The hunt is resting</p><h1>Craig will hide again soon.</h1><p>Check back during the next scheduled hunt day. Restaurant staff can see the current schedule.</p><Link className="primary-button" href="/">Back home</Link></section></main>;
  }

  const placement = hunt.placement as ImagePlacement;
  const imageTargetSrc = (hunt.map?.targetBundlePath ?? process.env.NEXT_PUBLIC_MINDAR_TARGETS) as string | undefined;

  return <ArHunt
    previewMode={!arConfigured || !imageTargetSrc}
    tracking={imageTargetSrc ? { imageTargetSrc, targetIndex: placement.targetIndex ?? 0, placement } : undefined}
    prizeMessage={hunt.prizeMessage as string | undefined}
    watermark={hunt.captureWatermark as boolean | undefined}
  />;
}
