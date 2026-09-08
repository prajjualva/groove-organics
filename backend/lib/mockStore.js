// In-memory data used whenever Supabase isn't configured yet.
// Lets the whole site — including admin/staff login — be clicked through
// in "demo mode" before you've created any real accounts.
// Nothing here persists across a server restart.

const crypto = require('crypto');

// Category tree: top-level categories, with subcategories nested under "Oils"
// (mirrors db/schema.sql seed data). id order: oils, spices, honey-pantry,
// body-care, wellness, then the three oil subcategories.
const categories = [
  { id: 'cat-oils', name: 'Oils', slug: 'oils', parent_id: null, sort_order: 1 },
  { id: 'cat-spices', name: 'Spices', slug: 'spices', parent_id: null, sort_order: 2 },
  { id: 'cat-honey-pantry', name: 'Honey & Pantry', slug: 'honey-pantry', parent_id: null, sort_order: 3 },
  { id: 'cat-body-care', name: 'Body Care', slug: 'body-care', parent_id: null, sort_order: 4 },
  { id: 'cat-wellness', name: 'Wellness', slug: 'wellness', parent_id: null, sort_order: 5 },
  { id: 'cat-coconut-oil', name: 'Coconut Oil', slug: 'coconut-oil', parent_id: 'cat-oils', sort_order: 1 },
  { id: 'cat-sesame-oil', name: 'Sesame Oil', slug: 'sesame-oil', parent_id: 'cat-oils', sort_order: 2 },
  { id: 'cat-groundnut-oil', name: 'Groundnut Oil', slug: 'groundnut-oil', parent_id: 'cat-oils', sort_order: 3 },
];

const products = [
  {
    id: 'p1',
    slug: 'cold-pressed-coconut-oil',
    name: 'Cold-Pressed Coconut Oil',
    short_description: 'Wood-pressed, unrefined',
    description:
      'Traditionally wood-pressed (chekku/ghani method) from fresh coconut, unrefined and unfiltered to keep its natural aroma and nutrients.',
    category: 'oils',
    category_id: 'cat-coconut-oil',
    price_paise: 42500,
    compare_at_price_paise: 47500, // demo: shows a "Sale Live" struck-through price out of the box
    image_url: '/assets/hero-pure-by-nature-dark.jpg',
    is_active: true,
    is_bestseller: true,
    is_new: false,
    is_coming_soon: false,
    stock: 100,
    rating: 4.9,
    review_count: 412,
    sort_order: 1,
    gst_rate_percent: null, // null = use the store-wide default rate (GST_RATE_PERCENT env var)
    shipping_charge_paise: 0, // 0 = manual override off — weight/dimensions below drive shipping instead
    weight_grams: 350, // 250ml glass bottle + packaging, approx.
    length_cm: 7,
    width_cm: 7,
    height_cm: 18,
    promo_tags: ['Sale Live', 'Best Seller'],
    hsn_code: '15131900',
    seo_title: null,
    seo_meta_description: null,
  },
  {
    id: 'p2',
    slug: 'virgin-coconut-oil',
    name: 'Virgin Coconut Oil',
    short_description: 'Fresh-milk extracted',
    description:
      'Cold-extracted from fresh coconut milk, no heat or chemicals — a lighter, cleaner-tasting oil for cooking and skin/hair care.',
    category: 'oils',
    category_id: 'cat-coconut-oil',
    price_paise: 65000,
    compare_at_price_paise: null,
    image_url: '/assets/hero-pure-by-nature-light.jpg',
    is_active: true,
    is_bestseller: false,
    is_new: true,
    is_coming_soon: false,
    stock: 60,
    rating: 4.9,
    review_count: 286,
    sort_order: 2,
    gst_rate_percent: null,
    shipping_charge_paise: 0,
    weight_grams: 550, // 500ml glass bottle + packaging, approx.
    length_cm: 8,
    width_cm: 8,
    height_cm: 22,
    promo_tags: ['New Deal'],
    hsn_code: '15131900',
    seo_title: null,
    seo_meta_description: null,
  },
  {
    id: 'p3',
    slug: 'more-oils-coming-soon',
    name: 'More Oils, Coming Soon',
    short_description: 'Groundnut, sesame & more on the way',
    description:
      'We are expanding our cold-pressed range. Leave your email to be notified the moment new oils launch.',
    category: 'oils',
    category_id: 'cat-oils',
    price_paise: 0,
    compare_at_price_paise: null,
    image_url: null,
    is_active: true,
    is_bestseller: false,
    is_new: false,
    is_coming_soon: true,
    stock: 0,
    rating: null,
    review_count: 0,
    sort_order: 3,
    gst_rate_percent: null,
    shipping_charge_paise: 0,
    weight_grams: null,
    length_cm: null,
    width_cm: null,
    height_cm: null,
    promo_tags: [],
    hsn_code: null,
    seo_title: null,
    seo_meta_description: null,
  },
];

// Preset badge options an admin can attach to a product (multi-select) — used
// on product-card badges and to group products onto the /deals page.
const PROMO_TAG_OPTIONS = ['Sale Live', 'New Deal', 'Best Seller', 'Festive Offer', 'Limited Stock', 'Bundle Deal'];

const orders = [];
// image_focus_x/y (0-100, percent from top-left) + image_zoom (1 = normal
// cover fit) are the admin's saved drag-to-position-and-zoom crop — see
// computeBannerStatus() in dataStore.js for how scheduled_start/end +
// is_active combine into the Draft/Scheduled/Active/Expired status shown in
// Admin -> Banners, and frontend/js/home-content.js for how focus/zoom is
// applied on the actual storefront.
const banners = [
  {
    id: 'banner-seed-1',
    title: 'Wear the Season',
    subtitle: 'Nourished by nature, made for you.',
    image_url: '/assets/hero-wear-the-season.jpg',
    image_url_mobile: '/assets/hero-mobile-wear-the-season.jpg',
    link_url: '/shop',
    placement: 'homepage_hero',
    is_active: true,
    sort_order: 1,
    scheduled_start: null,
    scheduled_end: null,
    image_focus_x: 50,
    image_focus_y: 50,
    image_zoom: 1,
    image_focus_x_mobile: null,
    image_focus_y_mobile: null,
    image_zoom_mobile: null,
  },
  {
    id: 'banner-seed-2',
    title: 'Pure by Nature. Trusted by You.',
    subtitle: null,
    image_url: '/assets/hero-pure-by-nature-dark.jpg',
    image_url_mobile: '/assets/hero-mobile-pure-by-nature-dark.jpg',
    link_url: '/shop',
    placement: 'homepage_hero',
    is_active: true,
    sort_order: 2,
    scheduled_start: null,
    scheduled_end: null,
    image_focus_x: 50,
    image_focus_y: 50,
    image_zoom: 1,
    image_focus_x_mobile: null,
    image_focus_y_mobile: null,
    image_zoom_mobile: null,
  },
  {
    id: 'banner-seed-3',
    title: 'Cold Pressed Coconut Oil',
    subtitle: null,
    image_url: '/assets/hero-pure-by-nature-light.jpg',
    image_url_mobile: '/assets/hero-mobile-pure-by-nature-light.jpg',
    link_url: '/shop',
    placement: 'homepage_hero',
    is_active: true,
    sort_order: 3,
    scheduled_start: null,
    scheduled_end: null,
    image_focus_x: 50,
    image_focus_y: 50,
    image_zoom: 1,
    image_focus_x_mobile: null,
    image_focus_y_mobile: null,
    image_zoom_mobile: null,
  },
  {
    id: 'banner-seed-4',
    title: "Nature's Goodness, Now at a Special Price",
    subtitle: 'Get 20% off your first order — use code GROOVE20.',
    image_url: '/assets/marketing-panels.jpg',
    image_url_mobile: null,
    link_url: '/shop',
    placement: 'homepage_promo',
    is_active: true,
    sort_order: 1,
    scheduled_start: null,
    scheduled_end: null,
    image_focus_x: 50,
    image_focus_y: 50,
    image_zoom: 1,
    image_focus_x_mobile: null,
    image_focus_y_mobile: null,
    image_zoom_mobile: null,
  },
];
const newsletterSubscribers = [];
const contactMessages = [];
const addresses = [];
const wishlistItems = [];
const reviews = [];
// Demo size variants for the Cold-Pressed Coconut Oil (p1), matching the
// 200ml/500ml/1L lineup — each has its own price/stock/weight so shipping
// and totals are accurate per size.
const productVariants = [
  { id: 'var-1', product_id: 'p1', size: '200ml', color: null, price_paise: 21500, stock: 80, sku: 'GRV-CCO-200', image_url: null, weight_grams: 250, sort_order: 1 },
  { id: 'var-2', product_id: 'p1', size: '500ml', color: null, price_paise: 42500, stock: 100, sku: 'GRV-CCO-500', image_url: null, weight_grams: 550, sort_order: 2 },
  { id: 'var-3', product_id: 'p1', size: '1L', color: null, price_paise: 76500, stock: 40, sku: 'GRV-CCO-1L', image_url: null, weight_grams: 1050, sort_order: 3 },
];
const siteContent = new Map(); // key -> value object; populated with defaults in dataStore

// Weight-based shipping — matched in ascending max_weight_grams order; the
// last row (max_weight_grams: null) is the catch-all for anything heavier.
// Starter values only — edit real numbers from Admin → Shipping Rates once
// you know your actual courier costs.
const shippingRateSlabs = [
  { id: 'ship-1', max_weight_grams: 500, price_paise: 4000, sort_order: 1 },
  { id: 'ship-2', max_weight_grams: 1000, price_paise: 6000, sort_order: 2 },
  { id: 'ship-3', max_weight_grams: 2000, price_paise: 9000, sort_order: 3 },
  { id: 'ship-4', max_weight_grams: null, price_paise: 12000, sort_order: 4 },
];

// Demo coupon so the checkout flow has something to test with out of the box —
// code matches the "20% off your first order" promo card seeded above.
const coupons = [
  {
    id: 'coupon-seed-1',
    code: 'GROOVE20',
    discount_type: 'percent',
    discount_value: 20,
    min_order_paise: 0,
    max_discount_paise: 30000, // capped at ₹300 off
    usage_limit: null,
    times_used: 0,
    is_active: true,
    expires_at: null,
  },
];

// Loyalty points ledger — one row per earn/redeem event. Balance for a
// customer is the sum of points_delta across their rows (see
// getLoyaltyBalance in dataStore.js).
const loyaltyLedger = [];

// Demo-only login accounts — clearly not for production use.
// Once Supabase is connected, real accounts replace these entirely.
const demoUsers = [
  { id: 'admin-demo', email: 'admin@demo.groove', password: 'demo1234', role: 'admin', full_name: 'Demo Admin' },
  { id: 'staff-demo', email: 'staff@demo.groove', password: 'demo1234', role: 'staff', full_name: 'Demo Staff' },
];

// Self-registered demo customer accounts (in-memory only — see registerCustomer below).
const customerUsers = [];

function findUserByEmail(email) {
  return (
    demoUsers.find((u) => u.email === email) || customerUsers.find((u) => u.email === email) || null
  );
}

function findUserById(id) {
  return demoUsers.find((u) => u.id === id) || customerUsers.find((u) => u.id === id) || null;
}

function findUserByReferralCode(code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  return [...demoUsers, ...customerUsers].find((u) => u.referral_code === upper) || null;
}

// Demo-mode stand-in for the profiles table columns used by the refer-a-friend
// feature — id/referral_code/referred_by, shaped the same as the real
// Supabase profiles row dataStore.getProfile returns.
function getProfile(userId) {
  const user = findUserById(userId);
  if (!user) return null;
  return { id: user.id, referral_code: user.referral_code || null, referred_by: user.referred_by || null };
}

function setReferralCode(userId, code) {
  const user = findUserById(userId);
  if (!user) return null;
  user.referral_code = code;
  return code;
}

function countReferredUsers(userId) {
  return [...demoUsers, ...customerUsers].filter((u) => u.referred_by === userId).length;
}

function registerCustomer({ email, password, full_name, referralCode }) {
  if (findUserByEmail(email)) return null; // already exists
  const referrer = referralCode ? findUserByReferralCode(referralCode) : null;
  const user = {
    id: `cust_${Date.now()}`,
    email,
    password,
    role: 'customer',
    full_name: full_name || null,
    created_at: new Date().toISOString(),
    referral_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
    referred_by: referrer ? referrer.id : null,
  };
  customerUsers.push(user);
  return user;
}

// Everyone with a login — demo admin/staff plus self-registered demo
// customers — for the admin "Customers" tab in demo mode. Never includes
// the password field; that's the whole point of this separate list.
function listAllUsers() {
  return [...demoUsers, ...customerUsers].map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    created_at: u.created_at || null,
  }));
}

function setUserPassword(email, newPassword) {
  const user = findUserByEmail(email);
  if (!user) return false;
  user.password = newPassword;
  return true;
}

// Demo-mode stand-in for Supabase's real recovery-link flow: a short-lived
// random token mapped to the email it's for. Real Supabase mode never uses
// this — it emails a genuine Supabase recovery link instead (see
// dataStore.requestPasswordReset).
const passwordResetTokens = new Map(); // token -> { email, expiresAt }
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

function createPasswordResetToken(email) {
  const token = crypto.randomBytes(24).toString('hex');
  passwordResetTokens.set(token, { email, expiresAt: Date.now() + PASSWORD_RESET_TTL_MS });
  return token;
}

function consumePasswordResetToken(token) {
  const entry = passwordResetTokens.get(token);
  if (!entry) return null;
  passwordResetTokens.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry.email;
}

// token -> { userId, role, email, full_name }
const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    userId: user.id,
    role: user.role,
    email: user.email,
    full_name: user.full_name,
  });
  return token;
}

function getSession(token) {
  return sessions.get(token) || null;
}

function destroySession(token) {
  sessions.delete(token);
}

function nextOrderNumber() {
  const n = orders.length + 1;
  return `GRV-${String(n).padStart(5, '0')}`;
}

module.exports = {
  categories,
  products,
  PROMO_TAG_OPTIONS,
  orders,
  banners,
  newsletterSubscribers,
  contactMessages,
  addresses,
  wishlistItems,
  reviews,
  productVariants,
  siteContent,
  shippingRateSlabs,
  coupons,
  loyaltyLedger,
  demoUsers,
  customerUsers,
  findUserByEmail,
  registerCustomer,
  findUserById,
  findUserByReferralCode,
  getProfile,
  setReferralCode,
  countReferredUsers,
  listAllUsers,
  setUserPassword,
  createPasswordResetToken,
  consumePasswordResetToken,
  createSession,
  getSession,
  destroySession,
  nextOrderNumber,
};
