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
    compare_at_price_paise: null,
    image_url: null,
    is_active: true,
    is_bestseller: true,
    is_new: false,
    is_coming_soon: false,
    stock: 100,
    rating: 4.9,
    review_count: 412,
    sort_order: 1,
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
    image_url: null,
    is_active: true,
    is_bestseller: false,
    is_new: true,
    is_coming_soon: false,
    stock: 60,
    rating: 4.9,
    review_count: 286,
    sort_order: 2,
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
  },
];

const orders = [];
const banners = [
  {
    id: 'banner-seed-1',
    title: 'Cold Pressed Coconut Oil',
    subtitle: null,
    image_url: '/assets/hero-coconut-oil.png',
    link_url: '/shop',
    placement: 'homepage_hero',
    is_active: true,
    sort_order: 1,
  },
  {
    id: 'banner-seed-2',
    title: 'New Batch Just Pressed',
    subtitle: 'Fresh stock of Virgin Coconut Oil is in — while it lasts.',
    image_url: '/assets/hero-coconut-oil.png',
    link_url: '/shop',
    placement: 'homepage_promo',
    is_active: true,
    sort_order: 1,
  },
];
const newsletterSubscribers = [];
const contactMessages = [];
const addresses = [];
const wishlistItems = [];
const reviews = [];
const productVariants = [];
const siteContent = new Map(); // key -> value object; populated with defaults in dataStore

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

function registerCustomer({ email, password, full_name }) {
  if (findUserByEmail(email)) return null; // already exists
  const user = { id: `cust_${Date.now()}`, email, password, role: 'customer', full_name: full_name || null };
  customerUsers.push(user);
  return user;
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
  orders,
  banners,
  newsletterSubscribers,
  contactMessages,
  addresses,
  wishlistItems,
  reviews,
  productVariants,
  siteContent,
  demoUsers,
  customerUsers,
  findUserByEmail,
  registerCustomer,
  createSession,
  getSession,
  destroySession,
  nextOrderNumber,
};
