# Crispy Craig AR Hunt

A mobile-only, in-store augmented-reality hunt for Crispy Cones. Guests see the intro, sign in by phone, search through their rear camera, and take a private capture to show an employee.

## Included

- Reference-matched mobile intro, phone OTP, timed camera, and capture flow
- Free, self-hosted MindAR image tracking with no visible QR codes or floor markers
- Optimized Craig GLB plus an exact 2D Craig intro asset
- Supabase roles, row-level security, weekly schedules, date exceptions, placements, sessions, and audit records
- Separate admin overview, placement, schedule, and settings routes
- Vercel-ready Next.js application

Without Supabase values, the app runs in a local preview flow. Without a compiled store target, the camera uses the Craig model preview. Production admin access is never bypassed when Supabase is configured.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and add the Supabase values.
3. Apply `supabase/migrations/202608310001_initial.sql` to the Supabase project.
4. Enable Phone authentication in Supabase and configure an SMS provider.
5. Run `npm run dev`.

To create the first admin after that person signs in:

```sql
update public.profiles set role = 'admin' where id = '<auth-user-id>';
```

## Markerless-looking store setup

MindAR needs recognizable visual features, but it does not need an obvious marker. Photograph permanent, detailed store features such as a menu board, mural, branded sign, or decorated wall. Compile those images into `public/targets/store.mind`, then assign their target indexes to placements in Supabase. Craig can be offset from the recognized image so he appears beside, above, or in front of it rather than pasted directly onto it.

Avoid blank walls, glossy reflections, digital screens, or movable decor. Test every hiding place on several iPhones and Android phones in the actual restaurant lighting before publishing the public QR code.

The vendored MindAR and Three.js browser runtimes retain their MIT licenses in `public/vendor`. The original STL remains in `assets/source`; the browser receives a 40,000-face, 0.72 MB GLB from `public/models`.

## Vercel

Import the GitHub repository into Vercel and add the values from `.env.example` in Project Settings → Environment Variables. Vercel provides the HTTPS required for camera access.
