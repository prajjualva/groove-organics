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

async function createOrder({ customer, items, gstRatePercent, shippingPaise = 0 }) {
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

module.exports = {
  toPublicProduct,
  listProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  listOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  markOrderPaid,
  addNewsletterSubscriber,
  addContactMessage,
  listBanners,
  createBanner,
};
