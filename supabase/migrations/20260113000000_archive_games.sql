-- Archive games without deleting them.

alter table public.games
  add column archived_at timestamptz;

create index games_archived_at_idx on public.games(archived_at);

notify pgrst, 'reload schema';
