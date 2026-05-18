-- Per-game logo upload. logo_path points at an object in the public
-- 'game-logos' bucket; logo_placement controls how the game screen renders it.

alter table public.games
  add column logo_path      text,
  add column logo_placement text check (logo_placement in ('center', 'top', 'menu'));

-- Storage bucket: public read so anon viewers of shared games can render it.
insert into storage.buckets (id, name, public)
values ('game-logos', 'game-logos', true)
on conflict (id) do update set public = excluded.public;

-- Path convention: '{game_id}/{filename}'. Ownership check pulls the prefix
-- and looks up the owning game so only the game owner can write/delete.

create policy "game-logos public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'game-logos');

create policy "game-logos owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'game-logos'
    and exists (
      select 1 from public.games g
      where g.id::text = split_part(name, '/', 1)
        and g.user_id = auth.uid()
    )
  );

create policy "game-logos owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'game-logos'
    and exists (
      select 1 from public.games g
      where g.id::text = split_part(name, '/', 1)
        and g.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'game-logos'
    and exists (
      select 1 from public.games g
      where g.id::text = split_part(name, '/', 1)
        and g.user_id = auth.uid()
    )
  );

create policy "game-logos owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'game-logos'
    and exists (
      select 1 from public.games g
      where g.id::text = split_part(name, '/', 1)
        and g.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
