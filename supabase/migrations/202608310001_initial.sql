-- Crispy Craig AR Hunt — initial production schema
create extension if not exists pgcrypto;

create type public.app_role as enum ('player', 'staff', 'admin');
create type public.placement_status as enum ('draft', 'scheduled', 'active', 'archived');
create type public.exception_kind as enum ('closed', 'custom_hours');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'player',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  timezone text not null default 'America/Los_Angeles',
  hunt_enabled boolean not null default true,
  capture_watermark boolean not null default true,
  prize_message text not null default 'Show this capture when you order for a surprise!',
  localization_prompt text not null default 'Look around slowly. Point toward walls, signs, and the counter.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venue_maps (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  version integer not null,
  provider text not null default 'mindar',
  target_bundle_path text not null,
  occlusion_asset_path text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (venue_id, version)
);
create unique index one_active_map_per_venue on public.venue_maps(venue_id) where is_active;

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  venue_map_id uuid not null references public.venue_maps(id) on delete restrict,
  name text not null,
  status public.placement_status not null default 'draft',
  target_index integer not null default 0 check (target_index >= 0),
  position jsonb not null check (position ?& array['x','y','z']),
  rotation jsonb not null check (rotation ?& array['x','y','z','w']),
  scale numeric(8,4) not null default 1 check (scale > 0 and scale <= 10),
  created_by uuid not null references public.profiles(id),
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_placement_per_venue on public.placements(venue_id) where status = 'active';

create table public.weekly_schedules (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  enabled boolean not null default true,
  placement_id uuid references public.placements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, weekday),
  check (starts_at <> ends_at)
);

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  local_date date not null,
  kind public.exception_kind not null,
  starts_at time,
  ends_at time,
  placement_id uuid references public.placements(id) on delete set null,
  label text,
  created_at timestamptz not null default now(),
  unique (venue_id, local_date),
  check (
    (kind = 'closed' and starts_at is null and ends_at is null)
    or (kind = 'custom_hours' and starts_at is not null and ends_at is not null and starts_at <> ends_at)
  )
);

create table public.hunt_sessions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  placement_id uuid references public.placements(id) on delete set null,
  started_at timestamptz not null default now(),
  localized_at timestamptz,
  captured_at timestamptz,
  client_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index hunt_sessions_user_started_idx on public.hunt_sessions(user_id, started_at desc);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  venue_id uuid references public.venues(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger venues_updated_at before update on public.venues for each row execute procedure public.set_updated_at();
create trigger placements_updated_at before update on public.placements for each row execute procedure public.set_updated_at();
create trigger schedules_updated_at before update on public.weekly_schedules for each row execute procedure public.set_updated_at();

-- Returns only the configuration needed by a signed-in player, and only while the event is active.
create or replace function public.current_hunt(p_venue_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_venue public.venues;
  v_local timestamp;
  v_exception public.schedule_exceptions;
  v_schedule public.weekly_schedules;
  v_placement public.placements;
  v_map public.venue_maps;
  v_active boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into v_venue from public.venues where slug = p_venue_slug;
  if not found or not v_venue.hunt_enabled then return jsonb_build_object('active', false); end if;
  v_local := timezone(v_venue.timezone, now());

  select * into v_exception from public.schedule_exceptions
  where venue_id = v_venue.id and local_date = v_local::date;

  if found then
    if v_exception.kind = 'closed' then return jsonb_build_object('active', false); end if;
    v_active := case when v_exception.ends_at > v_exception.starts_at
      then v_local::time >= v_exception.starts_at and v_local::time < v_exception.ends_at
      else v_local::time >= v_exception.starts_at or v_local::time < v_exception.ends_at end;
    if v_exception.placement_id is not null then select * into v_placement from public.placements where id = v_exception.placement_id; end if;
  else
    select * into v_schedule from public.weekly_schedules
    where venue_id = v_venue.id and weekday = extract(dow from v_local)::smallint and enabled;
    if not found then return jsonb_build_object('active', false); end if;
    v_active := case when v_schedule.ends_at > v_schedule.starts_at
      then v_local::time >= v_schedule.starts_at and v_local::time < v_schedule.ends_at
      else v_local::time >= v_schedule.starts_at or v_local::time < v_schedule.ends_at end;
    if v_schedule.placement_id is not null then select * into v_placement from public.placements where id = v_schedule.placement_id; end if;
  end if;

  if not v_active then return jsonb_build_object('active', false); end if;
  if v_placement.id is null then select * into v_placement from public.placements where venue_id = v_venue.id and status = 'active' limit 1; end if;
  if v_placement.id is null then return jsonb_build_object('active', false); end if;
  select * into v_map from public.venue_maps where id = v_placement.venue_map_id and is_active;
  if v_map.id is null then return jsonb_build_object('active', false); end if;

  return jsonb_build_object(
    'active', true,
    'venueId', v_venue.id,
    'timezone', v_venue.timezone,
    'prizeMessage', v_venue.prize_message,
    'captureWatermark', v_venue.capture_watermark,
    'localizationPrompt', v_venue.localization_prompt,
    'map', jsonb_build_object('provider', v_map.provider, 'targetBundlePath', v_map.target_bundle_path, 'occlusionAssetPath', v_map.occlusion_asset_path),
    'placement', jsonb_build_object('id', v_placement.id, 'targetIndex', v_placement.target_index, 'position', v_placement.position, 'rotation', v_placement.rotation, 'scale', v_placement.scale)
  );
end;
$$;

alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.venue_maps enable row level security;
alter table public.placements enable row level security;
alter table public.weekly_schedules enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.hunt_sessions enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "read own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage venues" on public.venues for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage maps" on public.venue_maps for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage placements" on public.placements for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage schedules" on public.weekly_schedules for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage exceptions" on public.schedule_exceptions for all using (public.is_admin()) with check (public.is_admin());
create policy "players create own sessions" on public.hunt_sessions for insert with check (user_id = auth.uid());
create policy "players read own sessions" on public.hunt_sessions for select using (user_id = auth.uid() or public.is_admin());
create policy "players update own sessions" on public.hunt_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins read audit log" on public.admin_audit_log for select using (public.is_admin());
create policy "admins write audit log" on public.admin_audit_log for insert with check (public.is_admin() and actor_id = auth.uid());

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant insert, select, update on public.hunt_sessions to authenticated;
grant all on public.venues, public.venue_maps, public.placements, public.weekly_schedules, public.schedule_exceptions, public.admin_audit_log to authenticated;
grant execute on function public.current_hunt(text) to authenticated;

insert into public.venues (slug, name) values ('crispy-cones', 'Crispy Cones') on conflict (slug) do nothing;
