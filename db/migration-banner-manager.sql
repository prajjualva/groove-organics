-- =====================================================================
-- Groove Organics — migration: full banner manager (scheduling, crop/zoom)
-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run
-- Safe to re-run (IF NOT EXISTS throughout) — running it twice by accident
-- does nothing the second time. Also safe to run whether or not you already
-- ran the earlier migration-referral-and-banner-fit.sql — the three columns
-- it added (image_url_mobile/image_position/image_fit) are repeated below
-- with IF NOT EXISTS so this file works as a standalone catch-up too.
-- These same statements are also folded into db/schema.sql for anyone
-- setting the project up fresh from scratch in the future.
-- =====================================================================

-- --- Optional separately-cropped mobile image + legacy CSS fit/position ---
-- (superseded by the focus/zoom columns below, kept only so any existing
-- rows that still reference them don't break)
alter table public.banners add column if not exists image_url_mobile text;
alter table public.banners add column if not exists image_position text not null default 'center center';
alter table public.banners add column if not exists image_fit text not null default 'cover';

-- --- Scheduling ---
-- is_active stays the admin's manual on/off switch. scheduled_start/end are
-- an optional publish window on top of it. The banner's displayed status
-- (Draft / Scheduled / Active / Expired) is computed at read time from
-- is_active + these two columns — see computeBannerStatus() in
-- backend/lib/dataStore.js — rather than stored, so it can never drift out
-- of sync the way a persisted "status" column driven by a cron job would.
alter table public.banners add column if not exists scheduled_start timestamptz;
alter table public.banners add column if not exists scheduled_end timestamptz;

-- --- Crop/zoom focus point (Admin -> Banners -> drag-to-position-and-zoom) ---
-- Percent-from-top-left (0-100) + a zoom multiplier (1 = normal cover fit,
-- up to ~3x). Applied on the storefront via CSS background-position plus
-- transform:scale/transform-origin — see frontend/js/home-content.js.
-- The *_mobile variants are optional and only populated once an admin has
-- actually adjusted the mobile crop in the tool; until then mobile
-- rendering falls back to the desktop focus/zoom values.
alter table public.banners add column if not exists image_focus_x numeric(5,2) not null default 50;
alter table public.banners add column if not exists image_focus_y numeric(5,2) not null default 50;
alter table public.banners add column if not exists image_zoom numeric(4,2) not null default 1;
alter table public.banners add column if not exists image_focus_x_mobile numeric(5,2);
alter table public.banners add column if not exists image_focus_y_mobile numeric(5,2);
alter table public.banners add column if not exists image_zoom_mobile numeric(4,2);

-- --- Reordering / filtering ---
-- sort_order already existed; this index just makes the admin table's
-- per-placement ordering and the storefront's placement lookups fast.
create index if not exists banners_placement_sort_idx on public.banners (placement, sort_order);
