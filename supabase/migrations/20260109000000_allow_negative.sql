-- Per-game setting: can scores go below zero? Default off.
-- When off, apply_point_change clamps so the final score is never < 0.

alter table public.games
  add column allow_negative boolean not null default false;

create or replace function public.apply_point_change(p_team_id uuid, p_delta integer)
returns public.point_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id    uuid;
  v_allow_neg  boolean;
  v_current    integer;
  v_delta      integer := p_delta;
  v_new_score  integer;
  v_log        public.point_logs;
begin
  select t.game_id, t.score, g.allow_negative
    into v_game_id, v_current, v_allow_neg
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
    -- no-op: don't write a zero log entry
    select * into v_log from public.point_logs where false;
    return v_log;
  end if;

  update public.teams
     set score = score + v_delta
   where id = p_team_id
   returning score into v_new_score;

  insert into public.point_logs (team_id, game_id, user_id, delta, new_score)
  values (p_team_id, v_game_id, auth.uid(), v_delta, v_new_score)
  returning * into v_log;

  return v_log;
end $$;

notify pgrst, 'reload schema';
