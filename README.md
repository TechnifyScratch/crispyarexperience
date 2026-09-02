# Crispy Craig AR Hunt

A mobile-only, in-store augmented-reality hunt for Crispy Cones. Guests tap once to enter with an invisible anonymous session, search through their rear camera, and take a private capture to show an employee.

## Included

- Reference-matched mobile intro, zero-form guest entry, timed camera, and capture flow
- Free, self-hosted MindAR image tracking with no visible QR codes or floor markers
- Optimized Craig GLB plus an exact 2D Craig intro asset
- Supabase roles, row-level security, weekly schedules, date exceptions, placements, sessions, and audit records
- Separate admin overview, placement, schedule, and settings routes
- Vercel-ready Next.js application

Without Supabase values, the app runs in a local preview flow. Without a compiled store target, the camera uses the Craig model preview. Production admin access is never bypassed when Supabase is configured.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and add the Supabase values.
3. Apply the SQL files in `supabase/migrations` to the Supabase project in filename order.
4. Enable Anonymous Sign-Ins in Supabase under Authentication settings.
5. Run `npm run dev`.

Staff use email/password at `/staff-login`; guests never see this screen. For invited staff, set the Supabase **Invite user** email template button URL to:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/staff-set-password
```

Set Supabase Authentication's Site URL to the production website, send the invitation from Authentication → Users, then grant the invited user the admin role:

```sql
update public.profiles p
set role = 'admin', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) in (lower('first@example.com'), lower('second@example.com'));
```

## Markerless store setup

MindAR needs recognizable visual features, but it does not need an obvious marker. In **Admin → Place Craig**, tap one of the outlined surface regions, adjust Craig's estimated camera distance, lock his 3D position, and follow the paced left/stop/right/stop scan. The browser captures three temporary tracking views, compiles their visual features on the admin phone, uploads the resulting `.mind` landmark bundle plus a placement reference image to Supabase Storage, and creates the map and placement records automatically. The three source tracking frames are not uploaded.

If saving reports a bucket or file-type error, run both `202609020001_ar_scan_storage.sql` and `202609020002_placement_snapshots.sql` in the SQL Editor of the same Supabase project used by Vercel. These create the public `ar-maps` bucket, enable JPEG placement references, and install admin-only write policies; deploying to Vercel does not apply Supabase migrations.

Avoid blank walls, glossy reflections, digital screens, or movable decor. Test every hiding place on several iPhones and Android phones in the actual restaurant lighting before publishing the public QR code.

The vendored MindAR and Three.js browser runtimes retain their MIT licenses in `public/vendor`. The original STL remains in `assets/source`; the browser receives a 40,000-face, 0.72 MB GLB from `public/models`.

## Vercel

Import the GitHub repository into Vercel and add the values from `.env.example` in Project Settings → Environment Variables. Vercel provides the HTTPS required for camera access.
