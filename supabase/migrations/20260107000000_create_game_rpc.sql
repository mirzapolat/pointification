-- Route game creation through a SECURITY DEFINER RPC so it works regardless of
-- how the project's JWT setup interacts with RLS WITH CHECK on direct INSERTs.
-- The function still authenticates the caller via auth.uid() and attributes
-- the new row to them.

create or replace function public.create_game(p_name text)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_game public.games;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name required';
  end if;

  insert into public.games (name, user_id)
  values (trim(p_name), v_uid)
  returning * into v_game;

  return v_game;
end $$;

grant execute on function public.create_game(text) to authenticated;

notify pgrst, 'reload schema';
