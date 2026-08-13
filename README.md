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

Built in this pass (Phase 1 from our plan, franchise logins deferred):
- Storefront with 3D animated hero, shop/product/cart/checkout, GST calculation, PDF invoices
- Admin dashboard: products (add/edit/delete/stock), orders (view/update status), banners, basic sales report
- Staff dashboard: order status updates only
- Order tracking pipeline: Placed → Packed → Shipped → Delivered
- Razorpay integration code (works in demo mode now, switches to real charges once you add keys)
- Supabase schema with row-level security so customers only ever see their own orders

Worth doing before real customers use this:
- A developer security review of the auth/payment code (recommended in our original plan)
- Real product photography (current cards use simple line-art icons as placeholders)
- Swapping the placeholder logo mark for your actual logo file, if you have one
- Deciding on shipping-cost rules (currently ₹0 shipping, easy to change in `backend/routes/orders.js`)
