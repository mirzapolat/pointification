-- Public sharing: a per-game token + on/off toggle. Anonymous read-only access.

alter table public.games
  add column is_public     boolean not null default false,
  add column public_token  uuid;

create unique index games_public_token_idx on public.games(public_token) where public_token is not null;

-- Anonymous SELECT policies: anon can read game + teams only when is_public.
-- Filtering by token client-side is what makes a specific game findable;
-- without the token they can't enumerate via this app's queries.
create policy "games public select"
  on public.games for select
  to anon
  using (is_public = true);

create policy "teams public select"
  on public.teams for select
  to anon
  using (exists (
    select 1 from public.games g
    where g.id = teams.game_id and g.is_public = true
  ));

-- Owner-only RPCs for managing the share state
create or replace function public.set_game_sharing(p_game_id uuid, p_enabled boolean)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.user_id <> auth.uid() then raise exception 'only owner can change sharing'; end if;

  update public.games
     set is_public    = p_enabled,
         public_token = case
                          when p_enabled and public_token is null then gen_random_uuid()
                          else public_token
                        end
   where id = p_game_id
   returning * into v_game;

  return v_game;
end $$;

grant execute on function public.set_game_sharing(uuid, boolean) to authenticated;

create or replace function public.rotate_game_token(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.user_id <> auth.uid() then raise exception 'only owner can rotate token'; end if;

  update public.games
     set public_token = gen_random_uuid()
   where id = p_game_id
   returning * into v_game;

  return v_game;
end $$;

grant execute on function public.rotate_game_token(uuid) to authenticated;
