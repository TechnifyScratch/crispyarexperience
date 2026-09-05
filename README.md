# Crispy Craig AR Hunt

A mobile-only, in-store augmented-reality hunt for Crispy Cones. Guests tap once to enter with an invisible anonymous session, search through their rear camera, and take a private capture to show an employee.

## Included

- Reference-matched mobile intro, zero-form guest entry, timed camera, and capture flow
- Self-hosted 8th Wall world tracking (SLAM) with no visible QR codes or floor markers
- Optimized Craig GLB plus an exact 2D Craig intro asset
- Supabase roles, row-level security, weekly schedules, date exceptions, placement folders, player sessions, staff notes, and audit records
- Separate admin overview, real player analytics, placement, schedule, notes, and settings routes
- Vercel-ready Next.js application

Without Supabase values, the app runs in a local preview flow. Production admin access is never bypassed when Supabase is configured.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and add the Supabase values.
3. Apply the SQL files in `supabase/migrations` to the Supabase project in filename order.
4. Enable Anonymous Sign-Ins in Supabase under Authentication settings.
5. Run `npm run dev`.

The `202609030001_admin_analytics_notes_folders.sql` migration adds the Tests/General placement folders, persistent admin notes, and the protected analytics function. Apply it before using those screens. Player counts come from distinct anonymous Supabase accounts recorded in `hunt_sessions`; no sample analytics are generated.

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

In **Admin → Place Craig**, first fill the camera with an existing, permanent, detailed flat area such as a menu, mural, or decorated wall. The browser captures that view as an invisible relocalization landmark. It then displays real SLAM map points; tap one to place Craig on the corresponding 3D plane, adjust his rotation and height, then use the on-model X/Y/Z arrows or the fine-position disclosure for exact world-space offsets. Complete the guided left/stop/right scan to finish. During that sweep the app automatically records additional high-quality natural reference views and stores Craig's transform relative to each one. The player can relocalize from any saved reference, then SLAM keeps Craig at the selected world position while the camera moves. New placements default to the **Tests** folder; choose **General** before saving when the placement is ready for normal use.

Placements created before multi-reference localization was added continue to use their original landmark. Create and activate a new placement to gain the more reliable multi-reference behavior.

Players scan the same ordinary store area. Craig is rendered only after 8th Wall reports normal SLAM tracking, the landmark pose remains stable across a sustained series of frames, and the live point cloud confirms the saved horizontal support surface. When two saved reference views are visible, their independently calculated Craig positions must agree before he can appear. The support plane validates the saved transform but never moves it. If the references, plane, or world tracking are uncertain, Craig remains hidden and localization restarts instead of guessing. The player is never shown the landmark image, an artificial marker, or a placement puck.

The browser accumulates recent high-confidence SLAM points and fits a robust local plane instead of averaging every nearby point. New admin placements cannot advance through the left/right scan until all three natural reference views pass the detail check, and all three must resolve spatially before the placement can be saved. Existing placements do not contain the new surface signature; create a fresh placement to enable strict surface validation on the player side.

If saving reports a bucket or file-type error, run both `202609020001_ar_scan_storage.sql` and `202609020002_placement_snapshots.sql` in the SQL Editor of the same Supabase project used by Vercel. These create the public `ar-maps` bucket, enable JPEG placement references, and install admin-only write policies; deploying to Vercel does not apply Supabase migrations.

Avoid blank walls, glossy reflections, digital screens, or movable decor. Test every hiding place on several iPhones and Android phones in the actual restaurant lighting before publishing the public QR code.

The 8th Wall framework is open source, while its distributed SLAM engine is provided under 8th Wall's separate binary-only limited-use license and requires attribution. `npm install` copies that engine into `public/vendor/8thwall` for local development and Vercel builds. The legacy MindAR provider remains available for older saved placements. The original STL remains in `assets/source`; the browser receives a 40,000-face, 0.72 MB GLB from `public/models`.

## Vercel

Import the GitHub repository into Vercel and add the values from `.env.example` in Project Settings → Environment Variables. Vercel provides the HTTPS required for camera access.

## Admin dev vision

Sign in as staff with an **admin** role, then open `/play` during an active hunt (or use **Test with dev vision** in the admin sidebar). The server verifies the signed-in user's profile before starting play. Only verified admins receive **DEV VISION**; URL parameters, browser storage, anonymous guests, and an unconfigured local preview cannot enable it. The existing event schedule and active-placement rules still apply.

Dev vision starts enabled for admins. The camera overlay provides:

- Green boxes with object category, confidence, and short-lived tracking ID. A small COCO-SSD model recognizes 80 common categories, including cups, bottles, vases, and potted plants. It does not recognize every item or identify a particular mug across separate visits.
- **Details → Label an item** freezes the view so staff can draw a rectangle and name an arbitrary textured item, such as a package. Blue boxes follow that patch's appearance during this session. Relabel after tracking is lost or the viewpoint/appearance changes substantially; this is not persistent object recognition.
- Green SLAM feature dots, an amber candidate Craig marker, and a green marker after his position passes localization. “Near Craig in view” means image-space proximity to his confirmed projection; it is not a physical distance estimate.
- World-tracking status and frame rate, first-reference/first-lock timings, reference quality and stability counts, pose resets, reference disagreement, support-plane confidence and height error, and surface-check timeouts. **Save report** downloads these measurements and the recent stage log as JSON, without camera images.

Object labels provide diagnostic context; they do not establish Craig's world position or weaken the existing landmark/surface validation. A relocated cup therefore cannot relocate Craig. This release makes recognition delays observable; faster and more robust in-store localization must be measured on actual phones before tuning those checks.

Inference runs in a dedicated, single-threaded WASM worker, using a reduced camera frame and at most one scan in flight. It pauses when the page is hidden or an item is being labelled. Frames stay on the device; only model weights are downloaded from TensorFlow's model host. `npm install` copies the WASM runtime to `public/vendor/vision`. Guests load neither the diagnostic component nor the detector/model. Turning **DEV VISION OFF** terminates its worker; turning it back on reloads it. Old detection boxes are hidden once the source frame is more than one second old. Diagnostic graphics are excluded from customer captures.

Run `npm run test:vision` for role-gating, tracking, coordinate alignment, manual-patch, and spatial-diagnostic regression checks. Also run `npm run lint` and `npm run build`. Validate recognition quality, latency, battery use, and moving objects on iPhone/Android hardware at the restaurant; desktop worker timings do not predict phone performance.
