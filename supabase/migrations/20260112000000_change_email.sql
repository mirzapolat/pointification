-- Change the current user's email directly, no confirmation email required.
-- Updates auth.users and mirrors the change to public.profiles via the existing trigger.

create or replace function public.change_my_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(trim(p_email));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_email is null or position('@' in v_email) = 0 then
    raise exception 'invalid email';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email and id <> v_uid) then
    raise exception 'that email is already in use';
  end if;

  update auth.users
     set email = v_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_uid;

  update public.profiles set email = v_email where id = v_uid;
end $$;

grant execute on function public.change_my_email(text) to authenticated;

notify pgrst, 'reload schema';
