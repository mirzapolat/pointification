-- Per-user setting: can other users invite me to their games? Default on.
-- When off, invite_collaborator rejects invitations to this user.

alter table public.profiles
  add column allow_invites boolean not null default true;

-- Allow users to update their own profile row (specifically allow_invites).
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.invite_collaborator(p_game_id uuid, p_email text)
returns public.game_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_user    uuid;
  v_allow   boolean;
  v_row     public.game_members;
begin
  select user_id into v_owner from public.games where id = p_game_id;
  if v_owner is null then
    raise exception 'game not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'only owner can invite';
  end if;

  select id, allow_invites into v_user, v_allow
    from public.profiles where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'no account with that email';
  end if;

  if v_user = v_owner then
    raise exception 'owner is already a member';
  end if;

  if not v_allow then
    raise exception 'this user does not accept game invites';
  end if;

  insert into public.game_members (game_id, user_id, added_by)
  values (p_game_id, v_user, auth.uid())
  on conflict (game_id, user_id) do nothing
  returning * into v_row;

  if v_row is null then
    select * into v_row from public.game_members
      where game_id = p_game_id and user_id = v_user;
  end if;

  return v_row;
end $$;

notify pgrst, 'reload schema';
