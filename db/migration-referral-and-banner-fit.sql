-- =====================================================================
-- Groove Organics — migration: refer-a-friend + banner focus/fit
-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE throughout) — running it
-- twice by accident does nothing the second time.
-- These same statements are also folded into db/schema.sql for anyone
-- setting the project up fresh from scratch in the future.
-- =====================================================================

-- --- Refer-a-friend: profiles gets a share code + who referred them ---
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);

create or replace function public.generate_referral_code()
returns text as $$
declare
  code text;
begin
  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end;
$$ language plpgsql;

-- Replaces the existing sign-up trigger function so every new account also
-- gets a referral_code, and gets linked to whoever referred them if a
-- ?ref=CODE link was used to sign up.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  referrer_id uuid;
begin
  if new.raw_user_meta_data->>'referral_code' is not null then
    select id into referrer_id from public.profiles
      where referral_code = upper(new.raw_user_meta_data->>'referral_code')
      limit 1;
  end if;
  insert into public.profiles (id, full_name, role, referral_code, referred_by)
  values (new.id, new.raw_user_meta_data->>'full_name', 'customer', public.generate_referral_code(), referrer_id);
  return new;
end;
$$ language plpgsql security definer;

-- Re-attach the trigger to the (now-replaced) function — this is a no-op if
-- it's already attached, just here so this file works standalone too.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- Banner image focus point + fit (Admin -> Banners) ---
-- image_url_mobile is included here too even though it should already
-- exist — it was missing from the original schema.sql, so this makes sure
-- every environment actually has it.
alter table public.banners add column if not exists image_url_mobile text;
alter table public.banners add column if not exists image_position text not null default 'center center';
alter table public.banners add column if not exists image_fit text not null default 'cover';
