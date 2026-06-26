-- Undo the most recent point change for a game.
-- Reverses the last logged delta on its team (clamping at 0 when negatives are
-- disallowed) and removes the log entry, so repeated calls walk history back.
-- Returns the removed log row (or an empty row when there's nothing to undo).

create or replace function public.undo_last_point_change(p_game_id uuid)
returns public.point_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allow_neg  boolean;
  v_current    integer;
  v_new_score  integer;
  v_log        public.point_logs;
begin
  if not public.has_game_access(p_game_id) then
    raise exception 'not authorized';
  end if;

  -- Grab (and lock) the most recent change for this game.
  select * into v_log
  from public.point_logs
  where game_id = p_game_id
  order by created_at desc, id desc
  limit 1
  for update;

  if v_log.id is null then
    -- nothing to undo
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

grant execute on function public.undo_last_point_change(uuid) to authenticated;

notify pgrst, 'reload schema';
