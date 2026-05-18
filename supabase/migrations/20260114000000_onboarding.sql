-- Multi-step signup: store display name on profiles and collect user details + onboarding state.

-- 1. Add a display_name to profiles, populated from auth.users.raw_user_meta_data.
alter table public.profiles
  add column if not exists display_name text;

-- Update the handle_new_user trigger to mirror display_name from user metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
end $$;

-- 2. user_details: optional org affiliation, role and intended use, plus an
--    onboarding flag we flip once the guided first-game flow is done.
create table public.user_details (
  id                   uuid primary key references auth.users(id) on delete cascade,
  organization         text,
  role                 text,
  intended_use         text,
  details_completed_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger user_details_updated_at
  before update on public.user_details
  for each row execute function public.set_updated_at();

alter table public.user_details enable row level security;

create policy "user_details self select"
  on public.user_details for select
  to authenticated using (id = auth.uid());

create policy "user_details self insert"
  on public.user_details for insert
  to authenticated with check (id = auth.uid());

create policy "user_details self update"
  on public.user_details for update
  to authenticated using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a (mostly empty) user_details row on signup so the client can
-- always upsert without worrying about the initial insert.
create or replace function public.handle_new_user_details()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_details (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_details on auth.users;
create trigger on_auth_user_created_details
  after insert on auth.users
  for each row execute function public.handle_new_user_details();

-- Backfill rows for any existing users so the gating logic works for them too.
insert into public.user_details (id, details_completed_at, onboarding_completed_at)
select id, now(), now() from auth.users
on conflict (id) do nothing;

notify pgrst, 'reload schema';
