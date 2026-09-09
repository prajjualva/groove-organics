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

-- Admin Phase 3: account deactivate/reactivate. is_active is checked on
-- every request (see backend/middleware/auth.js's resolveUser) so a
-- deactivation takes effect immediately even for an already-issued session
-- token, not just on the next sign-in. For a live Supabase account,
-- deactivating also bans the underlying auth.users row (see
-- dataStore.setCustomerActive) as a second layer that blocks future
-- sign-ins/token refreshes too.
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists deactivated_at timestamptz;
alter table public.profiles add column if not exists deactivated_reason text;

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

-- Admin Phase 5: category description/image/active/SEO fields — previously
-- only name/slug/parent/sort_order existed (sort_order itself only became a
-- real, UI-exposed feature in the Admin Phase 1 pass).
alter table public.categories add column if not exists description text;
alter table public.categories add column if not exists image_url text;
alter table public.categories add column if not exists is_active boolean not null default true;
alter table public.categories add column if not exists seo_title text;
alter table public.categories add column if not exists seo_meta_description text;

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

-- Added after products already existed in production (Phase 1b PDP rebuild)
-- — ALTERs with IF NOT EXISTS so re-running this file backfills them onto an
-- existing database. All admin-editable, all optional: the storefront only
-- renders a PDP section when the admin has actually filled it in, so a
-- product with none of these set just shows the original, shorter page —
-- nothing is ever fabricated client-side to fill an empty section.
alter table public.products add column if not exists gallery_images jsonb not null default '[]'::jsonb; -- extra photos beyond image_url, shown as PDP gallery thumbnails
alter table public.products add column if not exists key_benefits jsonb not null default '[]'::jsonb; -- array of short strings, e.g. "Wood-pressed, never heated"
alter table public.products add column if not exists ingredients_info text; -- free text, e.g. "100% Cold-Pressed Coconut Oil. No additives."
alter table public.products add column if not exists shipping_info text; -- optional admin note shown alongside the always-computed shipping facts (weight-based rate / free-shipping threshold)
alter table public.products add column if not exists faq jsonb not null default '[]'::jsonb; -- array of {question, answer}, product-specific FAQ shown as an accordion

-- =====================================================================
-- Admin Phase 2: product identifiers, inventory tracking, named shipping
-- classes. Added after products already existed in production — same
-- IF NOT EXISTS backfill pattern as above.
-- =====================================================================
alter table public.products add column if not exists sku text; -- base-product SKU (variants already had their own sku column)
alter table public.products add column if not exists barcode text; -- GTIN/UPC/EAN, optional, scanner-friendly
-- Per-product override for the low-stock alert (Admin -> Reports). Leave
-- null to use the store-wide default (site_content.store_settings.low_stock_threshold).
alter table public.products add column if not exists low_stock_threshold integer;
-- Units manually held back from the sellable count (e.g. set aside for an
-- offline sale or a B2B order) — "available to sell" = stock - reserved_stock.
-- NOTE: this is an admin-set number only in this phase, not wired into
-- checkout — placing an online order does not auto-reserve/decrement stock
-- yet (there's no stock decrement on order placement at all currently; see
-- stock_adjustments below for the manual/audited alternative). Auto
-- reserve-on-order and release-on-cancel belongs with the Admin Phase 4
-- order-lifecycle/refund work, where "never silently change a paid total"
-- already has to be handled carefully — bolting a partial version on here
-- risked phantom stock loss from abandoned/failed online payments with no
-- corresponding release path yet, so it's deliberately deferred rather than
-- half-built.
alter table public.products add column if not exists reserved_stock integer not null default 0;

-- Named shipping classes ("Fragile - Glass", "Bulky", "Fast/Small Parcel"),
-- so an admin can assign a shared shipping rule to a group of products
-- instead of retyping the same flat_rate_paise on each product's own
-- shipping_charge_paise override. A class with flat_rate_paise left null
-- doesn't override anything — the product just falls through to its own
-- shipping_charge_paise / weight-based calculation as before.
create table if not exists public.shipping_classes (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  flat_rate_paise integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.shipping_classes enable row level security;

drop policy if exists "shipping_classes_public_read" on public.shipping_classes;
create policy "shipping_classes_public_read" on public.shipping_classes
  for select using (true);

drop policy if exists "shipping_classes_admin_write" on public.shipping_classes;
create policy "shipping_classes_admin_write" on public.shipping_classes
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

alter table public.products add column if not exists shipping_class_id uuid references public.shipping_classes(id);

-- Stock-adjustment ledger: one row per intentional stock change, with a
-- required reason — restocking, damage/loss, manual correction, a customer
-- return, etc. — plus who made it and the before/after count, so inventory
-- history is always auditable instead of a bare number silently overwritten.
-- Also written automatically (reason 'manual_edit') whenever the plain
-- quick-edit stock field in Admin -> Products is changed directly, so every
-- stock change is logged no matter which UI path was used.
create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid,          -- not a hard FK (kept even if the variant is later deleted); null = adjustment was on the base product's own stock
  variant_label text,       -- snapshot, e.g. "500ml", set when variant_id is set
  delta integer not null,   -- positive = stock added, negative = stock removed
  reason text not null,     -- 'received' | 'damaged' | 'correction' | 'return' | 'manual_edit' | 'other'
  note text,
  previous_stock integer not null,
  new_stock integer not null,
  adjusted_by text,         -- admin/staff email, for accountability
  created_at timestamptz not null default now()
);

alter table public.stock_adjustments enable row level security;

-- Internal ops data — admin/staff only, no public read.
drop policy if exists "stock_adjustments_admin_all" on public.stock_adjustments;
create policy "stock_adjustments_admin_all" on public.stock_adjustments
  for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));

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

-- Added for the CGST/SGST/IGST tax-calculation engine (see
-- backend/lib/dataStore.js computeOrderPricing/priceOrderItems) — IF NOT
-- EXISTS ALTERs, same backfill pattern used throughout this file.
-- order_items: per-line HSN snapshot + the GST split actually applied.
alter table public.order_items add column if not exists hsn_code text;
alter table public.order_items add column if not exists cgst_paise integer not null default 0;
alter table public.order_items add column if not exists sgst_paise integer not null default 0;
alter table public.order_items add column if not exists igst_paise integer not null default 0;

-- orders: the order-level GST split + the seller/customer state pair and
-- intrastate/interstate classification it was computed from, plus a
-- genuine breakdown of discount_paise (previously one lump sum covering
-- coupon + Groove Points + referral discount together, with no way to
-- tell how much of it came from which).
alter table public.orders add column if not exists cgst_paise integer not null default 0;
alter table public.orders add column if not exists sgst_paise integer not null default 0;
alter table public.orders add column if not exists igst_paise integer not null default 0;
alter table public.orders add column if not exists tax_type text; -- 'intrastate' | 'interstate' | 'none'
alter table public.orders add column if not exists seller_state text;
alter table public.orders add column if not exists customer_state text;
alter table public.orders add column if not exists loyalty_discount_paise integer not null default 0;
alter table public.orders add column if not exists loyalty_points_redeemed integer not null default 0;
alter table public.orders add column if not exists referral_discount_paise integer not null default 0;

-- =====================================================================
-- Admin Phase 4: order timeline, refund/return/cancellation workflow.
--
-- Invariant: total_paise is NEVER mutated after an order is created (no
-- route exists anywhere that PATCHes it — see backend/routes/orders.js).
-- Refunds instead accumulate in their own running total, refunded_amount_paise,
-- so "how much has actually been refunded" and "what was originally
-- charged" are always two separate, individually-auditable numbers rather
-- than one value silently edited in place.
-- =====================================================================
alter table public.orders add column if not exists refunded_amount_paise integer not null default 0;

-- order_status_events: an append-only timeline of everything that happened
-- to an order — status changes, tracking added, payment marked paid,
-- refund requested/processed, etc. — so the admin Order Detail page can
-- show a real history instead of just the order's current snapshot state.
create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,   -- 'status_change' | 'tracking_added' | 'payment_marked_paid' | 'refund_requested' | 'refund_processed' | 'refund_rejected' | 'note'
  from_value text,
  to_value text,
  note text,
  actor text,                 -- admin/staff email, or 'system'/'customer' where relevant
  created_at timestamptz not null default now()
);
alter table public.order_status_events enable row level security;
drop policy if exists "order_status_events_admin_all" on public.order_status_events;
create policy "order_status_events_admin_all" on public.order_status_events
  for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));

-- order_refunds: the refund/return/cancellation workflow itself. A refund
-- starts 'requested' (or is recorded already-'processed' for a same-day
-- admin action) and moves to 'processed' or 'rejected' — processing a
-- refund increments orders.refunded_amount_paise by amount_paise; it never
-- touches total_paise.
create table if not exists public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  type text not null default 'refund' check (type in ('refund','cancellation','return')),
  status text not null default 'requested' check (status in ('requested','processed','rejected')),
  amount_paise integer not null,
  reason text not null,
  note text,
  requested_by text,
  processed_by text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.order_refunds enable row level security;
drop policy if exists "order_refunds_admin_all" on public.order_refunds;
create policy "order_refunds_admin_all" on public.order_refunds
  for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));

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

-- Scheduling: is_active is the admin's manual on/off; a banner can also be
-- given an optional publish window. Status (draft/scheduled/active/expired)
-- is computed at read time from these two, not stored — see
-- backend/lib/dataStore.js computeBannerStatus, so it can never drift out
-- of sync the way a persisted "status" column + cron would.
alter table public.banners add column if not exists scheduled_start timestamptz;
alter table public.banners add column if not exists scheduled_end timestamptz;

-- Crop/zoom focus point for the admin's drag-to-position-and-zoom tool.
-- Percent-from-top-left (0-100) + a zoom multiplier (1 = normal cover fit).
-- Applied via CSS background-position + transform:scale/transform-origin —
-- see frontend/js/home-content.js. *_mobile variants are optional and only
-- used once an admin has actually adjusted the mobile crop; until then the
-- mobile rendering falls back to the desktop focus/zoom values.
alter table public.banners add column if not exists image_focus_x numeric(5,2) not null default 50;
alter table public.banners add column if not exists image_focus_y numeric(5,2) not null default 50;
alter table public.banners add column if not exists image_zoom numeric(4,2) not null default 1;
alter table public.banners add column if not exists image_focus_x_mobile numeric(5,2);
alter table public.banners add column if not exists image_focus_y_mobile numeric(5,2);
alter table public.banners add column if not exists image_zoom_mobile numeric(4,2);

create index if not exists banners_placement_sort_idx on public.banners (placement, sort_order);

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

-- Admin Phase 2: scanner-friendly barcode per variant (the base product
-- already has sku/barcode as of the block above; variants already had sku).
alter table public.product_variants add column if not exists barcode text;

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

-- Shipping zones: optionally scope a rate slab to specific states, pincode
-- prefixes, and/or an order-value range, on top of (or instead of) the
-- weight range above — see backend/lib/dataStore.js computeShipping. Every
-- column here is nullable/optional; a slab that only sets max_weight_grams
-- (the original shape) still just works exactly as before.
alter table public.shipping_rate_slabs add column if not exists zone_name text;
alter table public.shipping_rate_slabs add column if not exists states jsonb; -- array of state names; null/empty = any state
alter table public.shipping_rate_slabs add column if not exists pincode_prefixes jsonb; -- array of pincode-prefix strings; null/empty = any pincode
alter table public.shipping_rate_slabs add column if not exists min_weight_grams integer;
alter table public.shipping_rate_slabs add column if not exists min_order_paise integer;
alter table public.shipping_rate_slabs add column if not exists max_order_paise integer;
alter table public.shipping_rate_slabs add column if not exists is_active boolean not null default true;

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

-- Admin Phase 5: coupon restrictions — a start date (previously only an end
-- date existed), a per-signed-in-customer usage cap (previously only the
-- global times_used counter existed), and restricting a coupon to specific
-- products/categories (arrays of ids, jsonb rather than a real array column
-- so this matches the jsonb-array convention already used elsewhere in this
-- file, e.g. products.gallery_images) — null/empty means "no restriction",
-- the same as today's unrestricted behavior.
alter table public.coupons add column if not exists starts_at timestamptz;
alter table public.coupons add column if not exists per_customer_limit integer;
alter table public.coupons add column if not exists product_ids jsonb;
alter table public.coupons add column if not exists category_ids jsonb;

-- coupon_redemptions: one row per successful coupon use by a signed-in
-- customer — the only way to actually enforce per_customer_limit (the
-- existing times_used column is a bare global counter with no per-customer
-- breakdown). Guest checkouts have no user_id to attribute a redemption to,
-- so per_customer_limit only ever applies to signed-in customers — the same
-- scope every other per-customer feature in this app already has (Groove
-- Points, referrals, saved addresses).
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid references public.profiles(id),
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.coupon_redemptions enable row level security;
drop policy if exists "coupon_redemptions_admin_all" on public.coupon_redemptions;
create policy "coupon_redemptions_admin_all" on public.coupon_redemptions
  for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Coupon applied to an order (if any) — kept on the order itself so the
-- invoice and admin order view can show what discount was used.
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_paise integer not null default 0;

-- =====================================================================
-- Admin Phase 6: audit log — a single cross-domain "who did what, when"
-- trail for admin/staff write actions. Several domains already have their
-- own purpose-built history (stock_adjustments for inventory,
-- order_status_events for the order timeline, profiles.deactivated_at/
-- deactivated_reason for account status) — this table is NOT a duplicate of
-- those; it's the catch-all for every other admin write action Phases 2-5
-- added that had zero history anywhere until now (product/variant/category/
-- coupon/shipping-rate/shipping-class create/update/delete), plus a
-- lightweight cross-reference entry for the actions that DO already have
-- their own detailed trail, so "everything this admin did" is answerable
-- from one place without joining five different tables.
-- =====================================================================
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,              -- admin/staff email; null if the system did it (rare)
  actor_role text,         -- 'admin' | 'staff' at the time of the action
  action text not null,    -- e.g. 'product.update', 'coupon.delete', 'customer.status_change'
  entity_type text,        -- e.g. 'product', 'coupon', 'category', 'order'
  entity_id text,
  summary text not null,   -- human-readable one-line description
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
drop policy if exists "audit_log_admin_all" on public.audit_log;
create policy "audit_log_admin_all" on public.audit_log
  for all using (public.current_role() in ('admin', 'staff')) with check (public.current_role() in ('admin', 'staff'));

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

-- Free-text note for manual adjustments (e.g. "goodwill credit — damaged
-- item", "correcting duplicate order_earned entry") — optional, blank for
-- the order_earned/order_redeemed rows written automatically.
alter table public.loyalty_ledger add column if not exists note text;

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
    "title_line1": "Rooted in soil,", "title_line2": "made the slower way.",
    "body": "We believe good oil should not be rushed — pressed in small batches, filtered gently, and packaged to be reused rather than thrown away.",
    "milestones": []
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

-- Corrective fix, 2026-09-09: the original 'homepage_story' seed above
-- contained specific claims (a partner-farm/formula count, a named
-- certification, specific years and headcounts) that were placeholder
-- text, never actually verified — confirmed with the store owner and
-- removed. `on conflict do nothing` means the INSERT above won't touch a
-- row that already exists (e.g. from an earlier run of this file before
-- this fix), so this UPDATE corrects it directly. It only fires if the
-- stored value still contains the old placeholder certification text —
-- so if this content was ever hand-edited from Admin since, that edit is
-- left alone rather than silently overwritten.
update public.site_content
set value = '{
    "eyebrow": "Our Story",
    "title_line1": "Rooted in soil,", "title_line2": "made the slower way.",
    "body": "We believe good oil should not be rushed — pressed in small batches, filtered gently, and packaged to be reused rather than thrown away.",
    "milestones": []
  }'::jsonb,
  updated_at = now()
where key = 'homepage_story'
  and value::text like '%cruelty-free certification%';
