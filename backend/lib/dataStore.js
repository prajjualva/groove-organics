// Unified data access layer.
// Every route calls functions from here instead of talking to Supabase or
// the mock store directly — so the rest of the app doesn't care which one
// is actually backing it. When SUPABASE_URL/keys are set in .env, real
// Supabase is used everywhere; until then, everything runs off mockStore.js
// so the site is fully functional in "demo mode".

const { supabase, supabaseAdmin, isConfigured } = require('./supabase');
const mock = require('./mockStore');

function toPublicProduct(row) {
  if (!row) return row;
  return row;
}

// --- Categories (parent -> subcategory tree) ---
async function listCategories() {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('categories').select('*').order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  }
  return [...mock.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

async function createCategory(input) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('categories').insert(input).select().single();
    if (error) throw error;
    return data;
  }
  const category = { id: `cat_${Date.now()}`, parent_id: null, sort_order: mock.categories.length + 1, ...input };
  mock.categories.push(category);
  return category;
}

async function updateCategory(id, patch) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('categories').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const category = mock.categories.find((c) => c.id === id);
  if (!category) return null;
  Object.assign(category, patch);
  return category;
}

async function deleteCategory(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('categories').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.categories.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  mock.categories.splice(idx, 1);
  return true;
}

async function listProducts({ includeInactive = false } = {}) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    let query = client.from('products').select('*').order('sort_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return mock.products
    .filter((p) => includeInactive || p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

async function getProductBySlug(slug) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('products').select('*').eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data;
  }
  return mock.products.find((p) => p.slug === slug) || null;
}

async function createProduct(input) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('products').insert(input).select().single();
    if (error) throw error;
    return data;
  }
  const product = {
    id: `p${mock.products.length + 1}_${Date.now()}`,
    is_active: true,
    is_bestseller: false,
    is_new: false,
    is_coming_soon: false,
    stock: 0,
    rating: null,
    review_count: 0,
    sort_order: mock.products.length + 1,
    compare_at_price_paise: null,
    image_url: null,
    ...input,
  };
  mock.products.push(product);
  return product;
}

async function updateProduct(id, patch) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('products').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const product = mock.products.find((p) => p.id === id);
  if (!product) return null;
  Object.assign(product, patch);
  return product;
}

async function deleteProduct(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.products.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  mock.products.splice(idx, 1);
  return true;
}

async function listOrders() {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Order visibility needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return [...mock.orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getOrder(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Order visibility needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('orders').select('*, order_items(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return mock.orders.find((o) => o.id === id) || null;
}

async function createOrder({ customer, items, gstRatePercent, shippingPaise = 0, userId = null }) {
  const subtotalPaise = items.reduce((sum, i) => sum + i.unit_price_paise * i.quantity, 0);
  const gstPaise = Math.round((subtotalPaise * gstRatePercent) / 100);
  const totalPaise = subtotalPaise + gstPaise + shippingPaise;

  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Creating orders needs SUPABASE_SERVICE_ROLE_KEY set.');
    const orderNumber = `GRV-${Date.now().toString().slice(-8)}`;
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: userId,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_address: customer.address,
        subtotal_paise: subtotalPaise,
        gst_paise: gstPaise,
        shipping_paise: shippingPaise,
        total_paise: totalPaise,
        status: 'placed',
        payment_status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;

    const orderItems = items.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      product_name: i.name,
      unit_price_paise: i.unit_price_paise,
      quantity: i.quantity,
      line_total_paise: i.unit_price_paise * i.quantity,
    }));
    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;

    return { ...order, order_items: orderItems };
  }

  const order = {
    id: `o_${Date.now()}`,
    order_number: mock.nextOrderNumber(),
    user_id: userId,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    shipping_address: customer.address,
    subtotal_paise: subtotalPaise,
    gst_paise: gstPaise,
    shipping_paise: shippingPaise,
    total_paise: totalPaise,
    status: 'placed',
    payment_status: 'pending',
    payment_gateway: null,
    payment_order_id: null,
    payment_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    order_items: items.map((i) => ({
      product_id: i.product_id,
      product_name: i.name,
      unit_price_paise: i.unit_price_paise,
      quantity: i.quantity,
      line_total_paise: i.unit_price_paise * i.quantity,
    })),
  };
  mock.orders.push(order);
  return order;
}

async function updateOrderStatus(id, status) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Updating orders needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const order = mock.orders.find((o) => o.id === id);
  if (!order) return null;
  order.status = status;
  order.updated_at = new Date().toISOString();
  return order;
}

async function markOrderPaid(id, { paymentGateway, paymentOrderId, paymentId }) {
  const patch = {
    payment_status: 'paid',
    payment_gateway: paymentGateway,
    payment_order_id: paymentOrderId,
    payment_id: paymentId,
    updated_at: new Date().toISOString(),
  };
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Updating orders needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('orders').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const order = mock.orders.find((o) => o.id === id);
  if (!order) return null;
  Object.assign(order, patch);
  return order;
}

async function addNewsletterSubscriber(email) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { error } = await client.from('newsletter_subscribers').insert({ email });
    if (error && error.code !== '23505') throw error; // ignore duplicate email
    return true;
  }
  if (!mock.newsletterSubscribers.find((s) => s.email === email)) {
    mock.newsletterSubscribers.push({ email, created_at: new Date().toISOString() });
  }
  return true;
}

async function addContactMessage(msg) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { error } = await client.from('contact_messages').insert(msg);
    if (error) throw error;
    return true;
  }
  mock.contactMessages.push({ ...msg, created_at: new Date().toISOString() });
  return true;
}

async function listBanners({ includeInactive = false } = {}) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    let query = client.from('banners').select('*').order('sort_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return mock.banners.filter((b) => includeInactive || b.is_active);
}

async function createBanner(input) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('banners').insert(input).select().single();
    if (error) throw error;
    return data;
  }
  const banner = { id: `b_${Date.now()}`, is_active: true, sort_order: mock.banners.length + 1, ...input };
  mock.banners.push(banner);
  return banner;
}

// --- Order history for a specific logged-in customer ---
async function listOrdersForUser(userId) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Order visibility needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return mock.orders.filter((o) => o.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// --- Addresses ---
async function listAddresses(userId) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('customer_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return mock.addresses.filter((a) => a.user_id === userId);
}

async function createAddress(userId, input) {
  const row = { user_id: userId, label: 'Home', is_default: false, ...input };
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('customer_addresses').insert(row).select().single();
    if (error) throw error;
    return data;
  }
  const address = { id: `addr_${Date.now()}`, created_at: new Date().toISOString(), ...row };
  mock.addresses.push(address);
  return address;
}

async function updateAddress(userId, id, patch) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('customer_addresses')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const address = mock.addresses.find((a) => a.id === id && a.user_id === userId);
  if (!address) return null;
  Object.assign(address, patch);
  return address;
}

async function deleteAddress(userId, id) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { error } = await client.from('customer_addresses').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return true;
  }
  const idx = mock.addresses.findIndex((a) => a.id === id && a.user_id === userId);
  if (idx === -1) return false;
  mock.addresses.splice(idx, 1);
  return true;
}

// --- Wishlist ---
async function listWishlist(userId) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('wishlist_items')
      .select('*, products(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((row) => ({ ...row.products, wishlist_item_id: row.id }));
  }
  return mock.wishlistItems
    .filter((w) => w.user_id === userId)
    .map((w) => {
      const product = mock.products.find((p) => p.id === w.product_id);
      return product ? { ...product, wishlist_item_id: w.id } : null;
    })
    .filter(Boolean);
}

async function addWishlistItem(userId, productId) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { error } = await client
      .from('wishlist_items')
      .insert({ user_id: userId, product_id: productId });
    if (error && error.code !== '23505') throw error; // ignore duplicate
    return true;
  }
  if (!mock.wishlistItems.find((w) => w.user_id === userId && w.product_id === productId)) {
    mock.wishlistItems.push({ id: `wish_${Date.now()}`, user_id: userId, product_id: productId, created_at: new Date().toISOString() });
  }
  return true;
}

async function removeWishlistItem(userId, productId) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { error } = await client.from('wishlist_items').delete().eq('user_id', userId).eq('product_id', productId);
    if (error) throw error;
    return true;
  }
  const idx = mock.wishlistItems.findIndex((w) => w.user_id === userId && w.product_id === productId);
  if (idx !== -1) mock.wishlistItems.splice(idx, 1);
  return true;
}

// --- Reviews ---
async function listReviewsForProduct(productId) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .eq('is_approved', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return mock.reviews
    .filter((r) => r.product_id === productId && r.is_approved)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function recomputeProductRating(productId) {
  const approved = isConfigured
    ? (await supabase.from('reviews').select('rating').eq('product_id', productId).eq('is_approved', true)).data || []
    : mock.reviews.filter((r) => r.product_id === productId && r.is_approved);
  if (!approved.length) return;
  const avg = approved.reduce((sum, r) => sum + r.rating, 0) / approved.length;
  await updateProduct(productId, { rating: Math.round(avg * 10) / 10, review_count: approved.length });
}

async function createReview(input) {
  let review;
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('reviews').insert(input).select().single();
    if (error) throw error;
    review = data;
  } else {
    review = {
      id: `rev_${Date.now()}`,
      is_approved: true,
      created_at: new Date().toISOString(),
      ...input,
    };
    mock.reviews.push(review);
  }
  await recomputeProductRating(input.product_id);
  return review;
}

async function deleteReview(id) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data } = await client.from('reviews').select('product_id').eq('id', id).maybeSingle();
    const { error } = await client.from('reviews').delete().eq('id', id);
    if (error) throw error;
    if (data) await recomputeProductRating(data.product_id);
    return true;
  }
  const idx = mock.reviews.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const productId = mock.reviews[idx].product_id;
  mock.reviews.splice(idx, 1);
  await recomputeProductRating(productId);
  return true;
}

module.exports = {
  toPublicProduct,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  listOrders,
  listOrdersForUser,
  getOrder,
  createOrder,
  updateOrderStatus,
  markOrderPaid,
  addNewsletterSubscriber,
  addContactMessage,
  listBanners,
  createBanner,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  listWishlist,
  addWishlistItem,
  removeWishlistItem,
  listReviewsForProduct,
  createReview,
  deleteReview,
};
