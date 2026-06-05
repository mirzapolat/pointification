-- Per-game team display order: 'manual' (use teams.position),
-- 'asc' (ascending score), 'desc' (descending score). Default keeps
-- existing games on manual ordering so the editor's drag handles still drive it.

alter table public.games
  add column team_sort text not null default 'manual'
    check (team_sort in ('manual', 'asc', 'desc'));

notify pgrst, 'reload schema';
