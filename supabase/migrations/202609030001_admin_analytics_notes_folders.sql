-- Real admin analytics, placement organization, and persistent staff notes.

alter table public.placements
  add column if not exists folder text not null default 'general';

alter table public.placements
  drop constraint if exists placements_folder_check;
alter table public.placements
  add constraint placements_folder_check check (folder in ('tests', 'general'));

create index if not exists placements_venue_folder_idx
  on public.placements (venue_id, folder, updated_at desc);

create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_notes_venue_created_idx
  on public.admin_notes (venue_id, created_at desc);

drop trigger if exists admin_notes_updated_at on public.admin_notes;
create trigger admin_notes_updated_at
  before update on public.admin_notes
  for each row execute procedure public.set_updated_at();

alter table public.admin_notes enable row level security;

drop policy if exists "admins manage notes" on public.admin_notes;
create policy "admins manage notes"
  on public.admin_notes for all
  using (public.is_admin())
  with check (public.is_admin() and created_by = auth.uid());

grant all on public.admin_notes to authenticated;

create or replace function public.admin_play_stats(p_venue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_timezone text;
  v_daily jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  select venue.timezone into v_timezone
  from public.venues venue
  where venue.id = p_venue_id;

  if v_timezone is null then
    raise exception 'venue not found';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', series.day::date,
      'players', (
        select count(distinct session.user_id)
        from public.hunt_sessions session
        where session.venue_id = p_venue_id
          and timezone(v_timezone, session.started_at)::date = series.day::date
      )
    ) order by series.day
  ), '[]'::jsonb)
  into v_daily
  from generate_series(
    timezone(v_timezone, v_now)::date - 27,
    timezone(v_timezone, v_now)::date,
    interval '1 day'
  ) as series(day);

  return jsonb_build_object(
    'generatedAt', v_now,
    'day', (select count(distinct user_id) from public.hunt_sessions where venue_id = p_venue_id and started_at >= v_now - interval '1 day'),
    'sevenDays', (select count(distinct user_id) from public.hunt_sessions where venue_id = p_venue_id and started_at >= v_now - interval '7 days'),
    'twentyEightDays', (select count(distinct user_id) from public.hunt_sessions where venue_id = p_venue_id and started_at >= v_now - interval '28 days'),
    'year', (select count(distinct user_id) from public.hunt_sessions where venue_id = p_venue_id and started_at >= v_now - interval '365 days'),
    'daily', v_daily
  );
end;
$$;

grant execute on function public.admin_play_stats(uuid) to authenticated;
