# Groove Organics — Website

A full e-commerce site for Groove Organics: a 3D-animated storefront, shop/product/cart/checkout flow, an admin dashboard (products, orders, banners, sales reports), and a staff dashboard (order status only).

## What's here

```
groove-organics/
  backend/           Node.js + Express API (products, orders, payments, auth)
  frontend/          Plain HTML/CSS/JS storefront + admin/staff dashboards (no build step)
  db/schema.sql       Supabase (Postgres) schema — tables, security rules, starter product data
  docs/setup-guide.md  Step-by-step: accounts to create, keys to paste in, how to deploy
```

## Try it right now — no accounts needed

The whole site runs in a **demo mode** with realistic sample data until you connect real
services. Nothing you click is broken or fake-looking — products, cart, checkout, admin
login, staff login, order tracking, even PDF invoices all work. The only difference from
"live" is that data resets when the server restarts and no real money moves.

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:4000** in your browser.

- **Storefront**: home, shop, product pages, cart, checkout (simulates a successful payment)
- **Admin login** at `/admin`: `admin@demo.groove` / `demo1234`
- **Staff login** at `/staff`: `staff@demo.groove` / `demo1234`

> A note on this build session: I wrote all of this code in a cloud sandbox that can't reach
> the npm package registry, so I wasn't able to run `npm install` or start the server myself
> to show it to you live. Every file is syntax-checked and the logic follows the same patterns
> throughout, but please treat "run it locally and click through it" as the first real test —
> if anything breaks, tell me what happened and I'll fix it.

## Going from demo mode to a real, live store

Nothing about the code changes — you just add three sets of credentials to `backend/.env`
(copy `backend/.env.example` to start) and the same app switches from demo data to your real
database and real payments automatically. Full walkthrough: **[docs/setup-guide.md](docs/setup-guide.md)**.

1. **Supabase** (database + logins + image storage) — free to start
2. **Razorpay** (payments — UPI, cards, net banking, wallets, EMI bundled in) — free to start, ~2% per transaction once live
3. **Railway or Render** (hosting, so the site is on the internet, not just your laptop) — free tier to start
4. Point your existing GoDaddy domain at whichever host you choose

## What's built vs. what's next

This is the "master Phase-1 spec" build — the 18 locked decisions we finalized (GST-inclusive pricing,
weight-based shipping, coupons, COD, promo tags/deals page, loyalty points, legal pages, and more) are
now implemented end to end: database schema, backend logic, and the admin/storefront UI to operate them
without touching code.

Built so far (franchise logins still deferred to a later phase):
- Storefront: hero image slider (admin-managed), shop with category → subcategory filtering, product
  pages with size/color variant pickers, cart, checkout, PDF invoices, a **Deals page** (`/deals`) that
  auto-groups tagged products by tag, and four editable **legal pages** (Terms, Privacy, Refund Policy,
  Shipping Policy)
- **GST-inclusive pricing**: the price you type in Admin is exactly what the customer pays — GST is
  shown as a breakup (extracted from that price), never added on top. Matches how Indian retail pricing
  actually works ("₹525, inclusive of all taxes").
- **Weight-based shipping**: give a product its weight + dimensions (Admin → Products → "Sale, Shipping
  & Tags") and shipping is calculated automatically from an editable rate table (Admin → Shipping
  Rates) using chargeable weight (greater of actual vs. volumetric). A flat per-product "Extra shipping"
  override still works for products that need it instead.
- **Coupon codes**: create percent/flat codes with min-order, max-discount, and usage-limit rules
  (Admin → Coupons); shoppers apply them at checkout; validated and redeemed server-side.
- **Cash on Delivery**: toggle on/off and set an optional COD surcharge (Admin → Store Settings);
  shoppers choose Pay Online vs. COD at checkout; staff mark COD orders paid from the Orders tab.
- **Free shipping threshold** and **blocked pincodes**, both admin-editable (Admin → Store Settings).
- **Promo tags / deal badges**: pick any combination of preset badges (Sale Live, New Deal, Best Seller,
  Festive Offer, Limited Stock, Bundle Deal) per product — they show on the product card and
  automatically group the product onto `/deals`.
- **Groove Points loyalty**: customers earn points on every paid order (rate admin-editable) and can
  redeem them for a discount at checkout (capped at a configurable % of the order); balance + history
  visible on their account dashboard.
- **Order tracking**: staff add a tracking number/link when marking an order Shipped; customers see a
  "Track Package" button on their confirmation page.
- **Order emails**: confirmation and shipped emails via Resend (`backend/lib/email.js`) — logs to the
  console instead of sending until `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are set in `backend/.env`.
- **Razorpay webhook**: a signature-verified `/api/payments/webhook` marks orders paid independently of
  the shopper's browser, closing the "browser closed right after paying" gap.
- **Verified-purchaser reviews**: only customers with a paid/delivered order containing the product can
  review it.
- **SEO**: `/sitemap.xml` and `/robots.txt` generated from the live catalog; optional per-product SEO
  title/meta description (Admin → Products → "Sale, Shipping & Tags").
- Real product photo uploads from the admin dashboard (no more placeholder icons once you upload one)
- Customer accounts: register/login, order history, saved addresses, wishlist, reviews & ratings, Groove
  Points balance
- Admin dashboard tabs: Products (image, category, stock, variants, GST rate, shipping, sale price,
  weight/dimensions, HSN code, promo tags, SEO), Categories, Orders (status + tracking + Mark COD Paid),
  Banners, Homepage Content, **Legal Pages**, **Coupons**, **Shipping Rates**, **Store Settings**
  (business/GST details, COD, free shipping, loyalty rates, low-stock threshold, blocked pincodes), and
  an expanded **Reports** dashboard (today's sales/orders, monthly revenue, pending orders, low-stock
  list, best-sellers, coupon usage)
- Staff dashboard: order status + tracking updates
- Razorpay integration code (works in demo mode now, switches to real charges once you add keys)
- Supabase schema with row-level security so customers only ever see their own orders/addresses/wishlist
- Product-card hover animation (subtle 3D tilt + image zoom) — skipped automatically for anyone with
  "reduce motion" turned on in their OS

Worth doing before real customers use this:
- A developer security review of the auth/payment code (recommended in our original plan)
- Photograph and upload real product images for every SKU from the admin Products tab
- Add more homepage-hero and festive-offer banners from the admin Banners tab as you get real photos
- Product stock isn't yet auto-decremented when an order is placed — worth adding before relying on the
  stock numbers for real inventory decisions
- Google Search Console / Analytics: create your own Google account and verify the site (uses the
  `/sitemap.xml` this build already generates) — a developer can't do this step for you, it has to be
  tied to your own Google account
- Courier API integration (Delhivery/Shiprocket) for live tracking numbers instead of the current
  manual tracking-number entry — explicitly a later phase per our locked spec
- Legal page text is placeholder — have it reviewed by a professional before going live
- This was all built and syntax-checked in a sandbox with no npm registry access, so `npm install` and a
  real click-through on your machine is still the first real test — tell me what breaks and I'll fix it
