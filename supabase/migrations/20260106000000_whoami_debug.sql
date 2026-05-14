-- Debug helper: returns what the DB sees for the current request.
create or replace function public.whoami()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'auth_uid',  auth.uid(),
    'auth_role', auth.role(),
    'current_user', current_user,
    'jwt_sub',   (current_setting('request.jwt.claims', true)::jsonb)->>'sub',
    'jwt_role',  (current_setting('request.jwt.claims', true)::jsonb)->>'role',
    'jwt_aud',   (current_setting('request.jwt.claims', true)::jsonb)->>'aud'
  );
$$;

grant execute on function public.whoami() to anon, authenticated;

-- Force PostgREST to reload its schema cache so the new function is callable immediately.
notify pgrst, 'reload schema';
