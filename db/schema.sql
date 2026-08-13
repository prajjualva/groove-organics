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

-- Auto-create a profile row whenever someone signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'customer');
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
-- products
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  short_description text,
  description text,
  category text not null default 'oils',
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  unit_price_paise integer not null,
  quantity integer not null,
  line_total_paise integer not null
);

-- ---------------------------------------------------------------------
-- banners (homepage / promo images managed from the admin dashboard)
-- ---------------------------------------------------------------------
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  link_url text,
  placement text not null default 'homepage_top',
  is_active boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

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
-- Seed data: current real catalog (oils) from the site plan
-- =====================================================================
insert into public.products (slug, name, short_description, description, category, price_paise, is_bestseller, is_new, stock, rating, review_count, sort_order)
values
  ('cold-pressed-coconut-oil', 'Cold-Pressed Coconut Oil', 'Wood-pressed, unrefined', 'Traditionally wood-pressed (chekku/ghani method) from fresh coconut, unrefined and unfiltered to keep its natural aroma and nutrients.', 'oils', 42500, true, false, 100, 4.9, 412, 1),
  ('virgin-coconut-oil', 'Virgin Coconut Oil', 'Fresh-milk extracted', 'Cold-extracted from fresh coconut milk, no heat or chemicals — a lighter, cleaner-tasting oil for cooking and skin/hair care.', 'oils', 65000, false, true, 60, 4.9, 286, 2)
on conflict (slug) do nothing;

insert into public.products (slug, name, short_description, description, category, price_paise, is_coming_soon, is_active, stock, sort_order)
values
  ('more-oils-coming-soon', 'More Oils, Coming Soon', 'Groundnut, sesame & more on the way', 'We are expanding our cold-pressed range. Leave your email to be notified the moment new oils launch.', 'oils', 0, true, true, 0, 3)
on conflict (slug) do nothing;
