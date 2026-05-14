-- Default games.user_id to the authenticated user so the client never has to send it.
alter table public.games alter column user_id set default auth.uid();
