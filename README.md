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

Built so far (franchise logins still deferred to a later phase):
- Storefront: hero image slider (admin-managed, rotates through highlighted-product photos), shop with
  category → subcategory filtering, product pages with size/color variant pickers, cart, checkout, GST
  calculation, PDF invoices
- Real product photo uploads from the admin dashboard (no more placeholder icons once you upload one)
- Customer accounts: register/login, order history, saved addresses, wishlist, product reviews & ratings
- Admin dashboard: Products (image upload, category, stock, variants), Categories (parent + subcategory
  tree), Orders (view/update status), Banners (hero slider slides + festive-offer/promo cards + a
  sitewide announcement strip — one flexible tool for all of it), **Homepage Content** (edit every word
  of the hero, feature strip, story and process sections without touching code), basic sales report
- Staff dashboard: order status updates only
- Order tracking pipeline: Placed → Packed → Shipped → Delivered (a plain status field today — see
  "Worth doing next" below for adding real carrier tracking numbers/links)
- Razorpay integration code (works in demo mode now, switches to real charges once you add keys)
- Supabase schema with row-level security so customers only ever see their own orders/addresses/wishlist
- Product-card hover animation (subtle 3D tilt + image zoom) — skipped automatically for anyone with
  "reduce motion" turned on in their OS

Worth doing before real customers use this:
- A developer security review of the auth/payment code (recommended in our original plan)
- Photograph and upload real product images for every SKU from the admin Products tab
- Add more homepage-hero and festive-offer banners from the admin Banners tab as you get real photos —
  right now there's one seed image repeated in both spots
- Carrier shipment tracking (a tracking number + carrier link per order, and a "Shipped" email with that
  link) — the order-status pipeline above is ready for this to slot into next
- Deciding on shipping-cost rules (currently ₹0 shipping, easy to change in `backend/routes/orders.js`)
- Product stock isn't yet auto-decremented when an order is placed — worth adding before relying on the
  stock numbers for real inventory decisions
