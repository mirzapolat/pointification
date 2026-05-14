-- Account self-service: delete own auth user (cascades to games, teams, logs, members, profile)

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = v_uid;
end $$;

grant execute on function public.delete_my_account() to authenticated;
