-- Collaboration: profiles (email lookup) + game_members + updated RLS + RPCs

-- 1. profiles mirrors auth.users so we can look up users by email from the client.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any authenticated user can read profiles (needed to display collaborator emails).
create policy "profiles readable to authenticated"
  on public.profiles for select
  to authenticated using (true);

-- Backfill existing users
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- 2. game_members: collaborators added by the owner
create table public.game_members (
  game_id     uuid not null references public.games(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  added_by    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index game_members_user_idx on public.game_members(user_id);

alter table public.game_members enable row level security;

-- Helper: is the current user a member or owner of game?
create or replace function public.has_game_access(p_game_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and g.user_id = auth.uid()
  ) or exists (
    select 1 from public.game_members m
    where m.game_id = p_game_id and m.user_id = auth.uid()
  );
$$;

grant execute on function public.has_game_access(uuid) to authenticated;

-- 3. Replace games policies: owner-only writes for game itself, but
--    SELECT and rename updates allowed for members. Delete only owner.
drop policy if exists "games owner all" on public.games;

create policy "games select via access" on public.games
  for select using (public.has_game_access(id));

create policy "games insert owner" on public.games
  for insert with check (user_id = auth.uid());

create policy "games update via access" on public.games
  for update using (public.has_game_access(id))
  with check (public.has_game_access(id));

create policy "games delete owner only" on public.games
  for delete using (user_id = auth.uid());

-- 4. teams: full access for any game member or owner
drop policy if exists "teams via game owner" on public.teams;

create policy "teams select via access" on public.teams
  for select using (public.has_game_access(game_id));
create policy "teams insert via access" on public.teams
  for insert with check (public.has_game_access(game_id));
create policy "teams update via access" on public.teams
  for update using (public.has_game_access(game_id))
  with check (public.has_game_access(game_id));
create policy "teams delete via access" on public.teams
  for delete using (public.has_game_access(game_id));

-- 5. point_logs: any member can read/write logs for their game
drop policy if exists "logs via owner" on public.point_logs;

create policy "logs select via access" on public.point_logs
  for select using (public.has_game_access(game_id));
create policy "logs insert via access" on public.point_logs
  for insert with check (public.has_game_access(game_id) and user_id = auth.uid());

-- 6. game_members policies: members can read who else is in the game;
--    only the owner can add/remove members.
create policy "members select via access" on public.game_members
  for select using (public.has_game_access(game_id));

create policy "members insert owner only" on public.game_members
  for insert with check (
    exists (select 1 from public.games g where g.id = game_id and g.user_id = auth.uid())
    and added_by = auth.uid()
  );

create policy "members delete owner only" on public.game_members
  for delete using (
    exists (select 1 from public.games g where g.id = game_id and g.user_id = auth.uid())
  );

-- 7. Update apply_point_change to allow any member
create or replace function public.apply_point_change(p_team_id uuid, p_delta integer)
returns public.point_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id   uuid;
  v_new_score integer;
  v_log       public.point_logs;
begin
  select t.game_id into v_game_id
    from public.teams t where t.id = p_team_id;

  if v_game_id is null then
    raise exception 'team not found';
  end if;

  if not public.has_game_access(v_game_id) then
    raise exception 'not authorized';
  end if;

  update public.teams
     set score = score + p_delta
   where id = p_team_id
   returning score into v_new_score;

  insert into public.point_logs (team_id, game_id, user_id, delta, new_score)
  values (p_team_id, v_game_id, auth.uid(), p_delta, v_new_score)
  returning * into v_log;

  return v_log;
end $$;

-- 8. RPC to invite a collaborator by email
create or replace function public.invite_collaborator(p_game_id uuid, p_email text)
returns public.game_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_user  uuid;
  v_row   public.game_members;
begin
  select user_id into v_owner from public.games where id = p_game_id;
  if v_owner is null then
    raise exception 'game not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'only owner can invite';
  end if;

  select id into v_user from public.profiles where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'no account with that email';
  end if;

  if v_user = v_owner then
    raise exception 'owner is already a member';
  end if;

  insert into public.game_members (game_id, user_id, added_by)
  values (p_game_id, v_user, auth.uid())
  on conflict (game_id, user_id) do nothing
  returning * into v_row;

  if v_row is null then
    -- already existed; fetch it
    select * into v_row from public.game_members
      where game_id = p_game_id and user_id = v_user;
  end if;

  return v_row;
end $$;

grant execute on function public.invite_collaborator(uuid, text) to authenticated;

-- 9. Enable Realtime publication for the relevant tables
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_members;
