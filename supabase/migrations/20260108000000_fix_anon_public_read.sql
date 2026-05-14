-- Public links broke because the "select via access" policies on games/teams
-- call public.has_game_access(...), which is only granted to `authenticated`.
-- For anon visitors the function raises permission denied while evaluating RLS,
-- so the query returns no rows even though the anon "public select" policy
-- would otherwise allow reading shared games.
--
-- Restrict the access-check policies to authenticated; the anon policies added
-- in 20260104000000_public_share.sql already cover anonymous public reads.

drop policy if exists "games select via access" on public.games;
create policy "games select via access" on public.games
  for select to authenticated
  using (public.has_game_access(id));

drop policy if exists "teams select via access" on public.teams;
create policy "teams select via access" on public.teams
  for select to authenticated
  using (public.has_game_access(game_id));

notify pgrst, 'reload schema';
