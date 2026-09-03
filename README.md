# Crispy Craig AR Hunt

A mobile-only, in-store augmented-reality hunt for Crispy Cones. Guests tap once to enter with an invisible anonymous session, search through their rear camera, and take a private capture to show an employee.

## Included

- Reference-matched mobile intro, zero-form guest entry, timed camera, and capture flow
- Self-hosted 8th Wall world tracking (SLAM) with no visible QR codes or floor markers
- Optimized Craig GLB plus an exact 2D Craig intro asset
- Supabase roles, row-level security, weekly schedules, date exceptions, placements, sessions, and audit records
- Separate admin overview, placement, schedule, and settings routes
- Vercel-ready Next.js application

Without Supabase values, the app runs in a local preview flow. Production admin access is never bypassed when Supabase is configured.

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

## Markerless spatial setup

In **Admin → Place Craig**, first fill the camera with an existing, permanent, detailed flat area such as a menu, mural, or decorated wall. The browser captures that view as an invisible relocalization landmark. It then displays real SLAM map points; tap one to place Craig on the corresponding 3D plane, adjust his rotation and height, then use the on-model X/Y/Z arrows or the fine-position disclosure for exact world-space offsets. Complete the guided left/stop/right scan to finish. During that sweep the app automatically records additional high-quality natural reference views and stores Craig's transform relative to each one. The player can relocalize from any saved reference, then SLAM keeps Craig at the selected world position while the camera moves.

Placements created before multi-reference localization was added continue to use their original landmark. Create and activate a new placement to gain the more reliable multi-reference behavior.

Players scan the same ordinary store area. Craig is rendered only after 8th Wall reports normal SLAM tracking and the landmark pose remains stable across a sustained series of frames. If either the landmark or world tracking is lost, Craig is hidden immediately instead of being shown at an uncertain position. The player is never shown the landmark image, an artificial marker, or a placement puck.

If saving reports a bucket or file-type error, run both `202609020001_ar_scan_storage.sql` and `202609020002_placement_snapshots.sql` in the SQL Editor of the same Supabase project used by Vercel. These create the public `ar-maps` bucket, enable JPEG placement references, and install admin-only write policies; deploying to Vercel does not apply Supabase migrations.

Avoid blank walls, glossy reflections, digital screens, or movable decor. Test every hiding place on several iPhones and Android phones in the actual restaurant lighting before publishing the public QR code.

The 8th Wall framework is open source, while its distributed SLAM engine is provided under 8th Wall's separate binary-only limited-use license and requires attribution. `npm install` copies that engine into `public/vendor/8thwall` for local development and Vercel builds. The legacy MindAR provider remains available for older saved placements. The original STL remains in `assets/source`; the browser receives a 40,000-face, 0.72 MB GLB from `public/models`.

## Vercel

Import the GitHub repository into Vercel and add the values from `.env.example` in Project Settings → Environment Variables. Vercel provides the HTTPS required for camera access.
