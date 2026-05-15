-- Allow a collaborator to remove their own membership (leave a game).
-- Previously, only the game owner could delete game_members rows, which
-- meant non-owners could not leave shared games.

create policy "members delete self" on public.game_members
  for delete using (user_id = auth.uid());
