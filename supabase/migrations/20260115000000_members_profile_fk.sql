-- Without an FK from game_members.user_id to public.profiles(id), PostgREST
-- can't resolve the `profiles:user_id (...)` embed used by the members UI,
-- so invited collaborators silently render blank. Add a second FK that points
-- at profiles (in addition to the existing auth.users FK) so the embed works.

alter table public.game_members
  add constraint game_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

notify pgrst, 'reload schema';
