-- Per-game customizable quick-point buttons. Stored as a signed-integer
-- array so the order the user chose in the editor is preserved exactly
-- when rendering the popup. Default mirrors the previous hardcoded set.

alter table public.games
  add column point_presets integer[] not null
    default '{5,10,15,-5,-10,-15}'::integer[]
    check (
      array_length(point_presets, 1) is null
      or (array_length(point_presets, 1) <= 24
          and not (0 = any(point_presets)))
    );

notify pgrst, 'reload schema';
