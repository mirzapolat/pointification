-- Pointification schema
create extension if not exists "pgcrypto";

create table public.games (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index games_user_id_idx on public.games(user_id);

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  name        text not null,
  color       text not null default '#FFD93D',
  score       integer not null default 0,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index teams_game_id_idx on public.teams(game_id);

create table public.point_logs (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  game_id     uuid not null references public.games(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  delta       integer not null,
  new_score   integer not null,
  created_at  timestamptz not null default now()
);

create index point_logs_team_id_idx on public.point_logs(team_id);
create index point_logs_game_id_idx on public.point_logs(game_id);

-- updated_at trigger for games
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger games_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- RLS
alter table public.games      enable row level security;
alter table public.teams      enable row level security;
alter table public.point_logs enable row level security;

create policy "games owner all" on public.games
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "teams via game owner" on public.teams
  for all
  using (exists (select 1 from public.games g where g.id = teams.game_id and g.user_id = auth.uid()))
  with check (exists (select 1 from public.games g where g.id = teams.game_id and g.user_id = auth.uid()));

create policy "logs via owner" on public.point_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Atomic score change RPC: updates score AND writes a log in one round-trip
create or replace function public.apply_point_change(p_team_id uuid, p_delta integer)
returns public.point_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id   uuid;
  v_user_id   uuid;
  v_new_score integer;
  v_log       public.point_logs;
begin
  select t.game_id, g.user_id
    into v_game_id, v_user_id
  from public.teams t
  join public.games g on g.id = t.game_id
  where t.id = p_team_id;

  if v_user_id is null then
    raise exception 'team not found';
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  update public.teams
     set score = score + p_delta
   where id = p_team_id
   returning score into v_new_score;

  insert into public.point_logs (team_id, game_id, user_id, delta, new_score)
  values (p_team_id, v_game_id, v_user_id, p_delta, v_new_score)
  returning * into v_log;

  return v_log;
end $$;

grant execute on function public.apply_point_change(uuid, integer) to authenticated;
