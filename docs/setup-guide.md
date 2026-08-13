# Setup guide: from demo mode to a live store

You don't need to know how to code for any of this — it's mostly clicking through account
signup pages and copying keys into one file. Ask me to walk through any step in more detail.

## 1. Supabase — database, logins, image storage

1. Go to supabase.com and create a free account, then "New project".
2. Once it's created, open **Project Settings → API**. You'll need three values:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key (click "reveal") → `SUPABASE_SERVICE_ROLE_KEY`
3. Open **SQL Editor → New query**, paste the entire contents of `db/schema.sql`, and click Run.
   This creates all the tables (products, orders, profiles, banners, etc.) and loads your
   current two oils as starter data.
4. Paste the three values into `backend/.env` (copy `backend/.env.example` to `backend/.env` first).
5. Create your real admin/staff accounts: in Supabase, go to **Authentication → Users → Add user**,
   enter an email + password for yourself. Then in **Table Editor → profiles**, find the row that
   was auto-created for that user and change its `role` column from `customer` to `admin` (or
   `staff` for a staff account).

Once these three values are in `.env` and you restart the server, the "demo mode" banners
disappear and everything reads/writes real data.

## 2. Razorpay — payments

1. Go to razorpay.com and sign up for a free account.
2. You can start in **Test Mode** (fake card numbers, no real money) before switching to Live.
3. Go to **Settings → API Keys → Generate Test Key** (or Live Key once you're ready).
4. Paste `Key Id` → `RAZORPAY_KEY_ID` and `Key Secret` → `RAZORPAY_KEY_SECRET` in `backend/.env`.
5. Optional but recommended before going live: **Settings → Webhooks**, add a webhook pointing
   at `https://<your-deployed-domain>/api/payments/webhook`, and paste the generated secret into
   `RAZORPAY_WEBHOOK_SECRET`.
6. Going fully live (real charges) requires Razorpay's KYC process for your business — that's
   between you and Razorpay, not something I can do on your behalf.

## 3. Railway or Render — hosting

Your laptop isn't meant to run the site 24/7, so it needs a host. Either works; Render's free
tier is a bit more beginner-friendly, Railway is a bit faster to deploy from.

**Render:**
1. Push this project to a GitHub repository (ask me to help set that up if you haven't used git before).
2. On render.com, "New → Web Service", connect your GitHub repo.
3. Build command: `cd backend && npm install`
4. Start command: `cd backend && npm start`
5. Add all the `backend/.env` values as environment variables in Render's dashboard (never commit
   the real `.env` file to GitHub — it's already excluded via `.gitignore`).

**Railway:** same idea — connect the repo, set the same build/start commands and environment
variables.

## 4. Point your GoDaddy domain at the new host

1. In Render or Railway, add your domain (e.g. `grooveorganics.com`) under the service's
   "Custom Domains" settings — it'll show you a CNAME or A record to add.
2. In GoDaddy, go to your domain's **DNS settings** and add that record.
3. DNS changes can take up to a few hours to take effect.

## After that

- Test a real order end-to-end in Razorpay Test Mode before flipping to Live keys.
- Consider having a developer do a quick security review of the login/payment code before
  accepting real customer payments — a few hours of someone's time, not a rebuild.
