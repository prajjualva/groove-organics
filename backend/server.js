require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const invoiceRoutes = require('./routes/invoice');
const miscRoutes = require('./routes/misc');
const customerRoutes = require('./routes/customer');
const reviewRoutes = require('./routes/reviews');
const categoryRoutes = require('./routes/categories');
const contentRoutes = require('./routes/content');
const variantRoutes = require('./routes/variants');
const { isConfigured: supabaseConfigured } = require('./lib/supabase');
const { isConfigured: razorpayConfigured } = require('./lib/razorpay');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(attachUser);

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/orders', invoiceRoutes); // adds GET /api/orders/:id/invoice
app.use('/api/payments', paymentRoutes);
app.use('/api', miscRoutes); // /api/newsletter, /api/contact, /api/banners
app.use('/api/customer', customerRoutes); // addresses, order history, wishlist
app.use('/api', reviewRoutes); // /api/products/:slug/reviews, /api/reviews/:id
app.use('/api/categories', categoryRoutes);
app.use('/api/content', contentRoutes);
app.use('/api', variantRoutes); // /api/products/:productId/variants, /api/variants/:id

app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    supabaseConfigured,
    razorpayConfigured,
    mode: supabaseConfigured ? 'live-data' : 'demo-data',
  });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Something went wrong.' });
});

// --- Serve the static frontend (single deployable app) ---
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

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
  '/admin': 'admin/index.html',
  '/admin/dashboard': 'admin/dashboard.html',
  '/staff': 'staff/index.html',
  '/staff/dashboard': 'staff/dashboard.html',
  '/account': 'account/index.html',
  '/account/dashboard': 'account/dashboard.html',
  '/wishlist': 'account/dashboard.html',
};
Object.entries(pageRoutes).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(frontendDir, file)));
});

app.listen(PORT, () => {
  console.log(`Groove Organics server running on http://localhost:${PORT}`);
  console.log(`Data mode: ${supabaseConfigured ? 'Supabase (live)' : 'in-memory demo data'}`);
  console.log(`Payments: ${razorpayConfigured ? 'Razorpay (live)' : 'demo mode (no real charges)'}`);
});
