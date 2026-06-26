-- Rounds: optional per-game feature for tracking team performance over time.
-- Each point change is tagged with the game's active round, so the game screen
-- can show a per-round net (up / down / unchanged) alongside the running total.

create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  position    integer not null default 0,
  name        text not null default '',
  created_at  timestamptz not null default now()
);

create index rounds_game_id_idx on public.rounds(game_id);

alter table public.games
  add column rounds_enabled boolean not null default false,
  add column current_round_id uuid references public.rounds(id) on delete set null;

-- Which round a point change belongs to (null = recorded outside of rounds).
alter table public.point_logs
  add column round_id uuid references public.rounds(id) on delete set null;

create index point_logs_round_id_idx on public.point_logs(round_id);

-- RLS: any game member can read/manage rounds for their game (mirrors teams).
alter table public.rounds enable row level security;

create policy "rounds select via access" on public.rounds
  for select using (public.has_game_access(game_id));
create policy "rounds insert via access" on public.rounds
  for insert with check (public.has_game_access(game_id));
create policy "rounds update via access" on public.rounds
  for update using (public.has_game_access(game_id));
create policy "rounds delete via access" on public.rounds
  for delete using (public.has_game_access(game_id));

-- Stamp each new point change with the active round when rounds are enabled.
create or replace function public.apply_point_change(p_team_id uuid, p_delta integer)
returns public.point_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id        uuid;
  v_allow_neg      boolean;
  v_rounds_enabled boolean;
  v_round_id       uuid;
  v_current        integer;
  v_delta          integer := p_delta;
  v_new_score      integer;
  v_log            public.point_logs;
begin
  select t.game_id, t.score, g.allow_negative, g.rounds_enabled, g.current_round_id
    into v_game_id, v_current, v_allow_neg, v_rounds_enabled, v_round_id
  from public.teams t
  join public.games g on g.id = t.game_id
  where t.id = p_team_id;

  if v_game_id is null then
    raise exception 'team not found';
  end if;

  if not public.has_game_access(v_game_id) then
    raise exception 'not authorized';
  end if;

  if not v_allow_neg and v_current + v_delta < 0 then
    v_delta := -v_current; -- clamp: resulting score = 0
  end if;

  if v_delta = 0 then
    select * into v_log from public.point_logs where false;
    return v_log;
  end if;

  update public.teams
     set score = score + v_delta
   where id = p_team_id
   returning score into v_new_score;

  insert into public.point_logs (team_id, game_id, user_id, delta, new_score, round_id)
  values (
    p_team_id, v_game_id, auth.uid(), v_delta, v_new_score,
    case when v_rounds_enabled then v_round_id else null end
  )
  returning * into v_log;

  return v_log;
end $$;

-- Undo the most recent change; scoped to the active round when rounds are on.
create or replace function public.undo_last_point_change(p_game_id uuid)
returns public.point_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allow_neg      boolean;
  v_rounds_enabled boolean;
  v_round_id       uuid;
  v_current        integer;
  v_new_score      integer;
  v_log            public.point_logs;
begin
  if not public.has_game_access(p_game_id) then
    raise exception 'not authorized';
  end if;

  select rounds_enabled, current_round_id
    into v_rounds_enabled, v_round_id
  from public.games where id = p_game_id;

  select * into v_log
  from public.point_logs
  where game_id = p_game_id
    and (not v_rounds_enabled or round_id is not distinct from v_round_id)
  order by created_at desc, id desc
  limit 1
  for update;

  if v_log.id is null then
    select * into v_log from public.point_logs where false;
    return v_log;
  end if;

  select g.allow_negative, t.score
    into v_allow_neg, v_current
  from public.teams t
  join public.games g on g.id = t.game_id
  where t.id = v_log.team_id;

  if v_current is not null then
    v_new_score := v_current - v_log.delta;
    if not coalesce(v_allow_neg, false) and v_new_score < 0 then
      v_new_score := 0;
    end if;

    update public.teams
       set score = v_new_score
     where id = v_log.team_id;
  end if;

  delete from public.point_logs where id = v_log.id;

  return v_log;
end $$;

-- Realtime: publish rounds so the game screen stays in sync across devices.
-- REPLICA IDENTITY FULL so DELETE events still carry game_id for the filter.
alter table public.rounds replica identity full;
alter publication supabase_realtime add table public.rounds;

notify pgrst, 'reload schema';
