-- Per-game logo tuning for the centered bubble: shape (circle / rounded
-- square) and scale (how much the image fills its badge — useful for
-- logos with built-in whitespace or borders the user wants to crop).

alter table public.games
  add column logo_shape text not null default 'circle'
    check (logo_shape in ('circle', 'square')),
  add column logo_scale real not null default 0.8
    check (logo_scale >= 0.4 and logo_scale <= 1.6);

notify pgrst, 'reload schema';
