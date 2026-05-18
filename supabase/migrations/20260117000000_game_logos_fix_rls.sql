-- The original game-logos policies tried to check ownership by reading
-- public.games inside the storage RLS predicate. That fails (or is flaky)
-- because storage policy evaluation can hit RLS recursion / role mismatches
-- depending on how Supabase resolves the EXISTS subquery from the storage
-- schema. Switch to the canonical Supabase storage pattern: scope objects
-- by auth.uid() in the path itself ('{user_id}/{game_id}/{filename}') and
-- compare against the first folder segment.

drop policy if exists "game-logos public read"   on storage.objects;
drop policy if exists "game-logos owner insert"  on storage.objects;
drop policy if exists "game-logos owner update"  on storage.objects;
drop policy if exists "game-logos owner delete"  on storage.objects;

create policy "game-logos public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'game-logos');

create policy "game-logos owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'game-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "game-logos owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'game-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'game-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "game-logos owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'game-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
