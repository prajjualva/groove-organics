-- =====================================================================
-- Groove Organics — Supabase schema
-- Run this in Supabase: Project -> SQL Editor -> New query -> paste -> Run
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- profiles: one row per auth.users row, adds a role for admin/staff/customer
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('admin','staff','customer')),
  created_at timestamptz not null default now()
);

-- Refer-a-friend: every customer gets a short share code; signing up
-- through someone's ?ref=CODE link sets referred_by to that person. Added
-- after profiles already existed in production, so these are ALTERs (with
-- IF NOT EXISTS) rather than columns on the CREATE TABLE above — re-running
-- this file is what backfills them onto an existing database.
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);

-- Generates a short, unique, human-shareable referral code — collisions are
-- astronomically unlikely at 8 base36 characters, but the loop + unique
-- constraint make it impossible to hand out a duplicate either way.
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

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
-- Every new profile gets its own referral_code, and — if raw_user_meta_data
-- carried a referral_code from a ?ref= sign-up link (see backend/routes/auth.js) —
-- referred_by is resolved and set here too. An unrecognized/missing code
-- just leaves referred_by null; it never blocks the signup.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is the current user an admin or staff member?
create or replace function public.current_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer;

-- ---------------------------------------------------------------------
-- categories (parent -> subcategory tree, e.g. Oils -> Coconut Oil)
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  parent_id uuid references public.categories(id) on delete set null,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  short_description text,
  description text,
  category text not null default 'oils',        -- legacy simple label, kept for display fallback
  category_id uuid references public.categories(id),
  price_paise integer not null,               -- price in paise (₹1 = 100 paise)
  compare_at_price_paise integer,              -- optional "was" price for sale badges
  image_url text,
  is_active boolean not null default true,     -- visible in storefront
  is_bestseller boolean not null default false,
  is_new boolean not null default false,
  is_coming_soon boolean not null default false,
  stock integer not null default 0,
  rating numeric(2,1) default 4.9,
  review_count integer default 0,
  sort_order integer default 0,
  -- Per-product GST rate override, since real HSN/GST rates vary by product
  -- category in India (e.g. 5% / 12% / 18%). Leave null to use the store's
  -- default rate (GST_RATE_PERCENT in backend/.env, 5% out of the box).
  gst_rate_percent numeric(4,1),
  -- Manual flat shipping override, added per unit ordered. Leave at 0 and
  -- fill in weight/dimensions below to have shipping calculated
  -- automatically from the rate table instead; set this to a non-zero
  -- value to bypass that calculation entirely for this one product.
  shipping_charge_paise integer not null default 0,
  -- Actual weight and package dimensions — used to calculate shipping
  -- automatically (chargeable weight = greater of actual weight and
  -- volumetric weight, matched against shipping_rate_slabs). All optional;
  -- a product with none of these set and no shipping_charge_paise override
  -- just ships free.
  weight_grams integer,
  length_cm numeric(6,1),
  width_cm numeric(6,1),
  height_cm numeric(6,1),
  -- Admin-set promotional tags shown as badges on the product card and used
  -- to group products onto the /deals page (e.g. "Sale Live", "New Deal",
  -- "Festive Offer"). A product can carry more than one at once, so this is
  -- a jsonb array of preset strings (see PROMO_TAG_OPTIONS in the backend) —
  -- '[]' = no tags. A product with multiple tags appears in every matching
  -- section of /deals.
  promo_tags jsonb not null default '[]'::jsonb,
  -- HSN (Harmonized System of Nomenclature) code, shown next to the GST%
  -- on invoices — required for GST-compliant invoicing in India.
  hsn_code text,
  -- SEO: optional per-product overrides for the browser tab title and
  -- search-result snippet. Falls back to the product name/short_description
  -- when left blank.
  seo_title text,
  seo_meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- orders + order_items
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  user_id uuid references public.profiles(id),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  shipping_address jsonb not null,
  subtotal_paise integer not null,
  gst_paise integer not null default 0,
  shipping_paise integer not null default 0,
  total_paise integer not null,
  status text not null default 'placed' check (status in ('placed','packed','shipped','delivered','cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  payment_gateway text,
  payment_order_id text,
  payment_id text,
  notify_me boolean default false,
  -- Manual carrier tracking, filled in by staff when marking an order
  -- Shipped — no live courier API integration in this phase.
  tracking_number text,
  tracking_url text,
  courier_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  variant_id uuid,                  -- not a hard FK: keep the order item even if the variant is later deleted
  variant_label text,               -- snapshot like "500ml / Green" at time of purchase
  unit_price_paise integer not null,
  quantity integer not null,
  line_total_paise integer not null,
  -- Snapshots of the rate/charge actually applied at checkout time (the
  -- product's own rate may change later — the invoice should still show
  -- what the customer was actually charged).
  gst_rate_percent numeric(4,1) not null default 0,
  line_gst_paise integer not null default 0,
  line_shipping_paise integer not null default 0
);

-- ---------------------------------------------------------------------
-- banners (homepage hero slides, festive-offer / promo cards, posters —
-- one flexible table, distinguished by "placement"). Placement is plain
-- text, not an enum, so new placements can be added from the admin UI
-- later without a database migration. Known placements used by the
-- storefront today:
--   homepage_hero        -> big rotating slider at the top of the homepage
--   homepage_promo       -> festive-offer / promo card grid further down
--   sitewide_announcement -> thin strip banner (e.g. "Free shipping over ₹999")
-- ---------------------------------------------------------------------
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  subtitle text,                    -- e.g. "Diwali Sale — 20% off, this week only"
  image_url text not null,
  link_url text,
  placement text not null default 'homepage_hero',
  is_active boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

-- Added after banners already existed in production — ALTERs (with IF NOT
-- EXISTS) so re-running this file backfills them onto an existing database,
-- same as the profiles ones above.
alter table public.banners add column if not exists image_url_mobile text;
alter table public.banners add column if not exists image_position text not null default 'center center';
alter table public.banners add column if not exists image_fit text not null default 'cover';

-- ---------------------------------------------------------------------
-- newsletter + contact form submissions
-- ---------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.banners enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.contact_messages enable row level security;

-- profiles: users see their own row; admins see all
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.current_role() = 'admin');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- categories: public read; only admin can write
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select using (true);

drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_write" on public.categories
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- products: anyone can read active products; only admin can write
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select using (is_active = true or public.current_role() in ('admin','staff'));

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- orders: customers see their own; admin/staff see all; admin/staff can update status
drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders
  for select using (user_id = auth.uid() or public.current_role() in ('admin','staff'));

drop policy if exists "orders_insert" on public.orders;
create policy "orders_insert" on public.orders
  for insert with check (true); -- created by backend using service role; open for guest checkout

drop policy if exists "orders_update_staff" on public.orders;
create policy "orders_update_staff" on public.orders
  for update using (public.current_role() in ('admin','staff'));

-- order_items: follow parent order visibility
drop policy if exists "order_items_select" on public.order_items;
create policy "order_items_select" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or public.current_role() in ('admin','staff'))
    )
  );

drop policy if exists "order_items_insert" on public.order_items;
create policy "order_items_insert" on public.order_items
  for insert with check (true); -- created by backend alongside the order

-- banners: public read active banners; admin manages
drop policy if exists "banners_public_read" on public.banners;
create policy "banners_public_read" on public.banners
  for select using (is_active = true or public.current_role() = 'admin');

drop policy if exists "banners_admin_write" on public.banners;
create policy "banners_admin_write" on public.banners
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- newsletter + contact: anyone can insert, only admin can read
drop policy if exists "newsletter_insert" on public.newsletter_subscribers;
create policy "newsletter_insert" on public.newsletter_subscribers
  for insert with check (true);

drop policy if exists "newsletter_admin_read" on public.newsletter_subscribers;
create policy "newsletter_admin_read" on public.newsletter_subscribers
  for select using (public.current_role() = 'admin');

drop policy if exists "contact_insert" on public.contact_messages;
create policy "contact_insert" on public.contact_messages
  for insert with check (true);

drop policy if exists "contact_admin_read" on public.contact_messages;
create policy "contact_admin_read" on public.contact_messages
  for select using (public.current_role() = 'admin');

-- =====================================================================
-- Editable site content (hero, story, feature strip, etc.) — lets the
-- admin dashboard's "Content" tab change homepage copy without code edits.
-- =====================================================================
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

drop policy if exists "site_content_public_read" on public.site_content;
create policy "site_content_public_read" on public.site_content
  for select using (true);

drop policy if exists "site_content_admin_write" on public.site_content;
create policy "site_content_admin_write" on public.site_content
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- =====================================================================
-- Phase 2: customer addresses, wishlist, reviews, product variants
-- =====================================================================

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text default 'Home',
  full_name text not null,
  phone text,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  pincode text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  reviewer_name text not null,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text,
  is_approved boolean not null default true,
  created_at timestamptz not null default now()
);

-- Variants (size and/or color combinations) — a product with no rows here is
-- treated as single-variant, using its own price_paise/stock directly (keeps
-- the simple case simple). A product can vary by size only, color only, or
-- both — the storefront shows whichever selectors have more than one value.
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text,                        -- e.g. "250ml", "500ml", "1L" — null if this product doesn't vary by size
  color text,                       -- e.g. "Green", "Amber" — null if this product doesn't vary by color
  price_paise integer not null,
  stock integer not null default 0,
  sku text,
  image_url text,                   -- optional: a different photo per color/variant
  -- Own weight for shipping (a 1L bottle ships heavier than a 200ml one).
  -- Falls back to the parent product's weight_grams if left blank.
  weight_grams integer,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

alter table public.customer_addresses enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.reviews enable row level security;
alter table public.product_variants enable row level security;

drop policy if exists "addresses_owner" on public.customer_addresses;
create policy "addresses_owner" on public.customer_addresses
  for all using (user_id = auth.uid() or public.current_role() = 'admin')
  with check (user_id = auth.uid() or public.current_role() = 'admin');

drop policy if exists "wishlist_owner" on public.wishlist_items;
create policy "wishlist_owner" on public.wishlist_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews
  for select using (is_approved = true or user_id = auth.uid() or public.current_role() = 'admin');

drop policy if exists "reviews_owner_write" on public.reviews;
create policy "reviews_owner_write" on public.reviews
  for insert with check (user_id = auth.uid());

drop policy if exists "reviews_owner_or_admin_modify" on public.reviews;
create policy "reviews_owner_or_admin_modify" on public.reviews
  for update using (user_id = auth.uid() or public.current_role() = 'admin');

drop policy if exists "reviews_owner_or_admin_delete" on public.reviews;
create policy "reviews_owner_or_admin_delete" on public.reviews
  for delete using (user_id = auth.uid() or public.current_role() = 'admin');

drop policy if exists "variants_public_read" on public.product_variants;
create policy "variants_public_read" on public.product_variants
  for select using (true);

drop policy if exists "variants_admin_write" on public.product_variants;
create policy "variants_admin_write" on public.product_variants
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- =====================================================================
-- Weight-based shipping rate slabs — admin-managed table of
-- "up to this chargeable weight -> this price" rows, used to auto-calculate
-- shipping for any product that has weight/dimensions set but no manual
-- shipping_charge_paise override. Rows are matched in ascending
-- max_weight_grams order; a row with max_weight_grams = null means
-- "anything heavier than every other slab" (the catch-all top slab).
-- =====================================================================
create table if not exists public.shipping_rate_slabs (
  id uuid primary key default gen_random_uuid(),
  max_weight_grams integer,       -- null = catch-all (no upper bound)
  price_paise integer not null,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

alter table public.shipping_rate_slabs enable row level security;

drop policy if exists "shipping_rate_slabs_public_read" on public.shipping_rate_slabs;
create policy "shipping_rate_slabs_public_read" on public.shipping_rate_slabs
  for select using (true);

drop policy if exists "shipping_rate_slabs_admin_write" on public.shipping_rate_slabs;
create policy "shipping_rate_slabs_admin_write" on public.shipping_rate_slabs
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- =====================================================================
-- Coupon / promo codes
-- =====================================================================
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- stored upper-cased, e.g. "SAVE20"
  discount_type text not null check (discount_type in ('percent', 'flat')),
  discount_value numeric not null,           -- percent (0-100) or a flat amount in paise, per discount_type
  min_order_paise integer default 0,
  max_discount_paise integer,                -- optional cap for percent discounts
  usage_limit integer,                       -- optional total redemption cap; null = unlimited
  times_used integer not null default 0,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;

-- Coupons aren't publicly listable (that would let anyone browse every code)
-- — validation happens through the backend's /api/coupons/validate route
-- using the service role, not a direct client-side select.
drop policy if exists "coupons_admin_all" on public.coupons;
create policy "coupons_admin_all" on public.coupons
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Coupon applied to an order (if any) — kept on the order itself so the
-- invoice and admin order view can show what discount was used.
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_paise integer not null default 0;

-- =====================================================================
-- Groove Points loyalty ledger — one row per earn/redeem event. A
-- customer's balance is the sum of points_delta across their rows, rather
-- than a running-balance column, so the full history is always auditable.
-- Rates (₹ per point earned/redeemed) and the redemption cap live in
-- site_content's "store_settings" key, not here, so they're admin-editable
-- without a migration.
-- =====================================================================
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  order_id uuid references public.orders(id),
  points_delta integer not null,             -- positive = earned, negative = redeemed
  reason text not null,                      -- 'order_earned' | 'order_redeemed' | 'manual_adjustment'
  created_at timestamptz not null default now()
);

alter table public.loyalty_ledger enable row level security;

drop policy if exists "loyalty_ledger_owner_or_admin_select" on public.loyalty_ledger;
create policy "loyalty_ledger_owner_or_admin_select" on public.loyalty_ledger
  for select using (user_id = auth.uid() or public.current_role() = 'admin');

-- Writes only ever happen server-side (service role, on paid orders / admin
-- adjustments) — no direct client insert/update policy on purpose.
drop policy if exists "loyalty_ledger_admin_write" on public.loyalty_ledger;
create policy "loyalty_ledger_admin_write" on public.loyalty_ledger
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- =====================================================================
-- Seed data: category tree + current real catalog (oils) from the site plan
-- =====================================================================

-- Top-level categories (subcategories added under "Oils" below). Empty
-- parents are fine — they'll just show "no products yet" until stocked.
insert into public.categories (name, slug, sort_order) values
  ('Oils', 'oils', 1),
  ('Spices', 'spices', 2),
  ('Honey & Pantry', 'honey-pantry', 3),
  ('Body Care', 'body-care', 4),
  ('Wellness', 'wellness', 5)
on conflict (slug) do nothing;

insert into public.categories (name, slug, parent_id, sort_order)
select sub.name, sub.slug, oils.id, sub.sort_order
from public.categories oils,
  (values
    ('Coconut Oil', 'coconut-oil', 1),
    ('Sesame Oil', 'sesame-oil', 2),
    ('Groundnut Oil', 'groundnut-oil', 3)
  ) as sub(name, slug, sort_order)
where oils.slug = 'oils'
on conflict (slug) do nothing;

insert into public.products (slug, name, short_description, description, category, category_id, price_paise, is_bestseller, is_new, stock, rating, review_count, sort_order)
select
  'cold-pressed-coconut-oil', 'Cold-Pressed Coconut Oil', 'Wood-pressed, unrefined',
  'Traditionally wood-pressed (chekku/ghani method) from fresh coconut, unrefined and unfiltered to keep its natural aroma and nutrients.',
  'oils', c.id, 42500, true, false, 100, 4.9, 412, 1
from public.categories c where c.slug = 'coconut-oil'
on conflict (slug) do nothing;

insert into public.products (slug, name, short_description, description, category, category_id, price_paise, is_bestseller, is_new, stock, rating, review_count, sort_order)
select
  'virgin-coconut-oil', 'Virgin Coconut Oil', 'Fresh-milk extracted',
  'Cold-extracted from fresh coconut milk, no heat or chemicals — a lighter, cleaner-tasting oil for cooking and skin/hair care.',
  'oils', c.id, 65000, false, true, 60, 4.9, 286, 2
from public.categories c where c.slug = 'coconut-oil'
on conflict (slug) do nothing;

insert into public.products (slug, name, short_description, description, category, category_id, price_paise, is_coming_soon, is_active, stock, sort_order)
select
  'more-oils-coming-soon', 'More Oils, Coming Soon', 'Groundnut, sesame & more on the way',
  'We are expanding our cold-pressed range. Leave your email to be notified the moment new oils launch.',
  'oils', c.id, 0, true, true, 0, 3
from public.categories c where c.slug = 'oils'
on conflict (slug) do nothing;

-- Seed the homepage hero slider with one banner so it's not empty on first load.
-- Add more from the admin dashboard's Banners tab (placement: homepage_hero) to build out the rotation.
insert into public.banners (title, image_url, link_url, placement, is_active, sort_order)
values ('Cold Pressed Coconut Oil', '/assets/hero-coconut-oil.png', '/shop', 'homepage_hero', true, 1)
on conflict do nothing;

-- Example festive-offer / promo card — edit or delete from the admin
-- dashboard's Banners tab (placement: homepage_promo). Add more of these
-- for seasonal sales, new launches, bundle offers, etc.
insert into public.banners (title, subtitle, image_url, link_url, placement, is_active, sort_order)
values ('New Batch Just Pressed', 'Fresh stock of Virgin Coconut Oil is in — while it lasts.', '/assets/hero-coconut-oil.png', '/shop', 'homepage_promo', true, 1)
on conflict do nothing;

-- Editable homepage content, seeded to match the original hardcoded copy —
-- editing these from the admin dashboard is what actually changes the site.
insert into public.site_content (key, value) values
  ('homepage_hero', '{
    "tagline": "Goodness of Earth",
    "headline_line1": "Pure by Nature.",
    "headline_line2": "Trusted by You.",
    "body": "Cold pressed coconut oil, made naturally for a healthier you and a better planet.",
    "cta_primary_label": "Shop Now", "cta_primary_href": "/shop",
    "cta_secondary_label": "Our Farms", "cta_secondary_href": "/about"
  }'::jsonb),
  ('homepage_story', '{
    "eyebrow": "Our Story",
    "title_line1": "Rooted in soil,", "title_line2": "pressed by hand.",
    "body": "We partner with named farms and press each batch the slow way — wood-ghani, stone-turned, no heat added. It takes longer. It tastes like it should.",
    "milestones": [
      {"year": "2018", "text": "Started blending botanical oils in a farmhouse kitchen."},
      {"year": "2020", "text": "Opened a countryside pressing studio with three artisans."},
      {"year": "2022", "text": "Earned organic & cruelty-free certification for our core range."},
      {"year": "2024", "text": "Launched a returnable-glass refill program with 40 retail partners."}
    ]
  }'::jsonb),
  ('homepage_feature_strip', '{
    "items": [
      {"title": "100% Natural & Organic", "body": "Certified botanicals, no fillers"},
      {"title": "Cold Pressed Goodness", "body": "Traditional chekku method, no heat"},
      {"title": "No Chemicals No Additives", "body": "Nothing added, nothing hidden"},
      {"title": "Good for You Good for Earth", "body": "Reusable glass, eco packaging"}
    ]
  }'::jsonb),
  ('homepage_process', '{
    "eyebrow": "From Farm to Bottle",
    "title": "Four steps. No shortcuts.",
    "steps": [
      {"title": "Harvest", "body": "Coconuts hand-picked at peak ripeness from partner farms, milled within 24 hours of harvest so nothing sits and turns. Each farm is visited by our own team, not a broker."},
      {"title": "Wood-Press", "body": "The chekku/ghani wheel turns slowly for hours, staying below body temperature so the oil is never heat-stressed — the same stone-and-wood method used for generations, just slower than any machine."},
      {"title": "Settle & Filter", "body": "Gravity-settled overnight and cloth-filtered only — no centrifuge, no bleaching, no deodorizing. What''s left is exactly what the coconut gave us."},
      {"title": "Bottle", "body": "Hand-poured into reusable glass, labelled and sealed in small batches so every bottle is checked by a person, not a line. Return the bottle and we''ll refill it."}
    ]
  }'::jsonb)
on conflict (key) do nothing;
