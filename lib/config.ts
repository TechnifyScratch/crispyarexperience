export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const arConfigured = Boolean(
  process.env.NEXT_PUBLIC_MINDAR_TARGETS,
);

export const venueTimezone = process.env.NEXT_PUBLIC_VENUE_TIMEZONE ?? "America/Los_Angeles";
