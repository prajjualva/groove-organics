require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');

const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const invoiceRoutes = require('./routes/invoice');
const miscRoutes = require('./routes/misc');
const bannerRoutes = require('./routes/banners');
const customerRoutes = require('./routes/customer');
const customersRoutes = require('./routes/customers'); // admin/staff "Customers" tab (plural — distinct from the self-service /api/customer above)
const reviewRoutes = require('./routes/reviews');
const categoryRoutes = require('./routes/categories');
const contentRoutes = require('./routes/content');
const variantRoutes = require('./routes/variants');
const couponRoutes = require('./routes/coupons');
const shippingRoutes = require('./routes/shipping');
const loyaltyRoutes = require('./routes/loyalty');
const reportsRoutes = require('./routes/reports');
const mediaRoutes = require('./routes/media'); // Admin Phase 7: Media Library
const pagesRoutes = require('./routes/pages'); // Admin Phase 7: generic CMS Pages
const { isConfigured: supabaseConfigured, supabaseUrl, supabaseAnonKey } = require('./lib/supabase');
const { isConfigured: razorpayConfigured } = require('./lib/razorpay');

const app = express();
const PORT = process.env.PORT || 4000;

// Render (like Heroku and most PaaS hosts) terminates HTTPS at its own load
// balancer and forwards plain HTTP to this process, adding an
// X-Forwarded-Proto header saying what the visitor actually used. Without
// this, Express has no way to know that and req.protocol always reports
// 'http' even for a real https:// visitor — which broke the password-reset
// link (it was being built as http://..., which never matched the https://
// entries in Supabase's Redirect URLs allowlist), and also affected
// sitemap.xml/robots.txt (wrong scheme in the URLs submitted to Google) and
// the refer-a-friend share link. `1` trusts exactly one hop (Render's own
// proxy) — not an open/arbitrary trust of any client-supplied header.
app.set('trust proxy', 1);

// Gzip/brotli-negotiated compression for every response (HTML/CSS/JS/JSON) —
// the site had none of this before, which on a slow/mobile connection adds
// up fast across pages that pull in several scripts and a big product list.
app.use(compression());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true, credentials: true }));
// Default body limit is 100kb — far too small once product/banner images are
// uploaded as base64 data URLs (demo mode, before Supabase Storage is wired
// up for real uploads). Raised again from 15mb to 20mb: the new banner crop
// tool's edit form can submit a desktop AND mobile image together in one
// request, which can add up even with compressed photos.
app.use(express.json({ limit: '20mb' }));
app.use(attachUser);

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/orders', invoiceRoutes); // adds GET /api/orders/:id/invoice
app.use('/api/payments', paymentRoutes);
app.use('/api', miscRoutes); // /api/newsletter, /api/contact
app.use('/api/banners', bannerRoutes); // homepage hero/promo/announcement banners
app.use('/api/customer', customerRoutes); // addresses, order history, wishlist
app.use('/api/customers', customersRoutes); // admin/staff-only customer directory
app.use('/api', reviewRoutes); // /api/products/:slug/reviews, /api/reviews/:id
app.use('/api/categories', categoryRoutes);
app.use('/api/content', contentRoutes);
app.use('/api', variantRoutes); // /api/products/:productId/variants, /api/variants/:id
app.use('/api/coupons', couponRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/pages', pagesRoutes);

// --- SEO: sitemap.xml + robots.txt, generated from the current catalog ---
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const store = require('./lib/dataStore');
    const products = await store.listProducts({ includeInactive: false });
    const pages = await store.listPages({ includeUnpublished: false });
    const origin = `${req.protocol}://${req.get('host')}`;
    const staticPaths = ['/', '/shop', '/deals', '/about', '/contact', '/faq', '/terms', '/privacy', '/refund-policy', '/shipping-policy'];
    const urls = [
      ...staticPaths.map((p) => `${origin}${p}`),
      ...products.map((p) => `${origin}/product?slug=${encodeURIComponent(p.slug)}`),
      ...pages.map((p) => `${origin}/p/${encodeURIComponent(p.slug)}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${u}</loc></url>`)
      .join('\n')}\n</urlset>`;
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

app.get('/robots.txt', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /staff\nDisallow: /account\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    supabaseConfigured,
    razorpayConfigured,
    mode: supabaseConfigured ? 'live-data' : 'demo-data',
    // Default GST rate used for any product that doesn't set its own
    // gst_rate_percent override — lets the frontend show an accurate
    // estimate before checkout without hardcoding "5%" everywhere.
    defaultGstRatePercent: Number(process.env.GST_RATE_PERCENT || 5),
    // Public by design (Supabase's URL + anon key are meant to ship in
    // client-side code; RLS is what actually protects data, not secrecy of
    // these two values). reset-password.html uses them to complete a
    // password reset with a couple of narrow, unauthenticated Supabase Auth
    // REST calls — no bundler or supabase-js SDK needed for that one page.
    // null when Supabase isn't configured; the service role key is never
    // exposed here or anywhere else in an API response.
    supabaseUrl: supabaseConfigured ? supabaseUrl : null,
    supabaseAnonKey: supabaseConfigured ? supabaseAnonKey : null,
  });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Something went wrong.' });
});

// --- Serve the static frontend (single deployable app) ---
const frontendDir = path.join(__dirname, '..', 'frontend');
// maxAge caches static files in the visitor's browser so a repeat page view
// doesn't re-download them — big win on the image-heavy homepage. This site
// has no build step (no fingerprinted/hashed filenames), so .css and .js
// keep the SAME url across deploys — a long max-age on those means a
// browser (or an edge cache) that already fetched the old file just keeps
// serving it for up to 7 days after a new version ships, with no way to
// know it's stale. That's exactly what happened once: a deploy shipped a
// newer home-content.js (setting a --bg-desktop CSS variable) while a
// 7-day-cached OLDER style.css — which didn't consume that variable yet —
// kept being served, so the hero background silently stopped rendering
// until the cache expired. HTML and .css/.js now get 'no-cache' (always
// revalidated — a fast 304 if unchanged, so this costs nothing when
// nothing changed, but guarantees a new deploy is picked up on the very
// next visit). Only genuinely static assets (images, fonts) keep the long
// cache, since a stale image is harmless and those rarely change under the
// same filename.
app.use(
  express.static(frontendDir, {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// Client-side friendly routes for pretty URLs without a build step.
const pageRoutes = {
  '/': 'index.html',
  '/shop': 'shop.html',
  '/product': 'product.html',
  '/cart': 'cart.html',
  '/checkout': 'checkout.html',
  '/order-confirmation': 'order-confirmation.html',
  '/about': 'about.html',
  '/contact': 'contact.html',
  '/deals': 'deals.html',
  '/faq': 'faq.html',
  '/terms': 'legal.html',
  '/privacy': 'legal.html',
  '/refund-policy': 'legal.html',
  '/shipping-policy': 'legal.html',
  '/admin': 'admin/index.html',
  '/admin/dashboard': 'admin/dashboard.html',
  '/staff': 'staff/index.html',
  '/staff/dashboard': 'staff/dashboard.html',
  '/account': 'account/index.html',
  '/account/dashboard': 'account/dashboard.html',
  '/wishlist': 'account/dashboard.html',
  '/reset-password': 'reset-password.html',
  '/impersonate-callback': 'impersonate-callback.html',
};
Object.entries(pageRoutes).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(frontendDir, file)));
});

// Admin Phase 7: generic CMS Pages live at /p/:slug — one template
// (page.html + page.js) that fetches GET /api/pages/:slug and renders
// whatever title/body an admin created from Admin -> Pages. Distinct from
// the fixed pageRoutes map above (those are each their own dedicated
// HTML/JS pair); this one route serves every admin-created page.
app.get('/p/:slug', (req, res) => res.sendFile(path.join(frontendDir, 'page.html')));

app.listen(PORT, () => {
  console.log(`Groove Organics server running on http://localhost:${PORT}`);
  console.log(`Data mode: ${supabaseConfigured ? 'Supabase (live)' : 'in-memory demo data'}`);
  console.log(`Payments: ${razorpayConfigured ? 'Razorpay (live)' : 'demo mode (no real charges)'}`);
});
