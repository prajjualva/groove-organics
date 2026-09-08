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

// Used at checkout to look up each line item's authoritative GST rate /
// shipping charge server-side — the client's cart shouldn't be the source
// of truth for tax math, even in demo mode.
async function getProductById(id) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('products').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return mock.products.find((p) => p.id === id) || null;
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

// Every logged-in account (customers, plus staff/admin, role included so
// the admin UI can badge them) for the admin "Customers" tab. Order counts
// and spend aren't joined in here — the caller already has /api/orders
// loaded for the Reports tab and can match on email, same as that tab does.
async function listCustomers() {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Customer visibility needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data: userPage, error: userError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (userError) throw userError;
    const users = userPage?.users || [];
    const { data: profileRows, error: profileError } = await supabaseAdmin.from('profiles').select('id, role, full_name');
    if (profileError) throw profileError;
    const profileById = new Map((profileRows || []).map((p) => [p.id, p]));
    // One extra query, not one-per-customer: every ledger row for every
    // listed user, summed client-side into a balance per user_id. Used to
    // be silently omitted here (the admin Customers tab's "Groove Points"
    // column always rendered 0 as a result — fixed 2026-09-08).
    const balanceById = new Map();
    const userIds = users.map((u) => u.id);
    if (userIds.length) {
      const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
        .from('loyalty_ledger')
        .select('user_id, points_delta')
        .in('user_id', userIds);
      if (ledgerError) throw ledgerError;
      (ledgerRows || []).forEach((r) => balanceById.set(r.user_id, (balanceById.get(r.user_id) || 0) + r.points_delta));
    }
    return users
      .map((u) => {
        const profile = profileById.get(u.id);
        return {
          id: u.id,
          email: u.email,
          full_name: profile?.full_name || u.user_metadata?.full_name || null,
          role: profile?.role || 'customer',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at || null,
          loyalty_points: balanceById.get(u.id) || 0,
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return mock
    .listAllUsers()
    .map((u) => ({
      ...u,
      loyalty_points: mock.loyaltyLedger.filter((l) => l.user_id === u.id).reduce((sum, r) => sum + r.points_delta, 0),
    }))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
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

// Each product can override the store's default GST rate and can add its
// own per-unit shipping charge (see products.gst_rate_percent /
// shipping_charge_paise in db/schema.sql) — e.g. a product taxed at 12%
// instead of the default 5%, or a heavier item that costs more to ship.
// This looks up the authoritative rate/charge per line item server-side
// rather than trusting whatever the shopper's cart happened to send.
//
// PRICING MODEL — GST-INCLUSIVE: the price entered in Admin (product.price_paise,
// and unit_price_paise here) is exactly what the customer pays — it already
// has GST baked in, the same way a price tag in an Indian shop works. GST is
// therefore EXTRACTED from that price for the invoice breakup, never added on
// top: base = inclusive * 100 / (100 + rate), gst = inclusive - base.
async function priceOrderItems(items, defaultGstRatePercent) {
  return Promise.all(
    items.map(async (i) => {
      const product = i.product_id ? await getProductById(i.product_id).catch(() => null) : null;
      const gstRate = product && product.gst_rate_percent != null ? Number(product.gst_rate_percent) : Number(defaultGstRatePercent);
      const shippingPerUnit = product && product.shipping_charge_paise ? Number(product.shipping_charge_paise) : 0;
      const lineInclusive = i.unit_price_paise * i.quantity; // what the customer actually pays for this line, tax included
      const lineBase = Math.round((lineInclusive * 100) / (100 + gstRate)); // pre-tax value, extracted
      const lineGst = lineInclusive - lineBase; // the GST embedded in lineInclusive
      return {
        ...i,
        gst_rate_percent: gstRate,
        line_base_paise: lineBase,
        line_gst_paise: lineGst,
        line_shipping_paise: shippingPerUnit * i.quantity,
        line_total_paise: lineInclusive, // GST-inclusive — this is the line amount actually charged
      };
    })
  );
}

async function createOrder({ customer, items, gstRatePercent, shippingPaise = 0, userId = null, couponCode = null, redeemPoints = 0 }) {
  const pricedItems = await priceOrderItems(items, gstRatePercent);
  // subtotalPaise is the pre-tax (base) total; gstPaise is the tax extracted from the
  // inclusive prices above — subtotalPaise + gstPaise always equals the sum of what the
  // customer actually pays for the products (the GST-inclusive line totals).
  const subtotalPaise = pricedItems.reduce((sum, i) => sum + i.line_base_paise, 0);
  const gstPaise = pricedItems.reduce((sum, i) => sum + i.line_gst_paise, 0);
  const productShippingPaise = pricedItems.reduce((sum, i) => sum + i.line_shipping_paise, 0);
  let totalShippingPaise = shippingPaise + productShippingPaise;

  // Coupon: simple order-level discount subtracted from the final total (computed on the
  // full GST-inclusive price first, discount applied after) — never prorated per line.
  let discountPaise = 0;
  let appliedCoupon = null;
  const preDiscountGoodsPaise = subtotalPaise + gstPaise; // sum of inclusive line totals
  const settings = await getStoreSettings();
  if (couponCode) {
    const validation = await validateCoupon(couponCode, preDiscountGoodsPaise);
    if (validation.valid) {
      appliedCoupon = validation.coupon;
      discountPaise = validation.discountPaise;
    }
  }

  // Groove Points redemption stacks with a coupon — applied on top of
  // whatever's left after the coupon, capped at loyalty_redeem_cap_percent
  // of the order's goods value and the customer's actual points balance.
  let loyaltyRedemption = { points: 0, discountPaise: 0 };
  if (redeemPoints > 0 && userId) {
    loyaltyRedemption = await previewLoyaltyRedemption(userId, redeemPoints, preDiscountGoodsPaise - discountPaise);
    discountPaise += loyaltyRedemption.discountPaise;
  }

  // Refer-a-friend signup discount: automatic, no coupon code needed —
  // applies once, on a referred customer's very first order only (checked
  // via hasExistingOrders, BEFORE this order is inserted below). Stacks on
  // top of whatever's left after the coupon + points redemption above, same
  // pattern as loyalty redemption.
  let referralDiscountPaise = 0;
  if (userId && settings.referral_program_enabled) {
    const profile = await getProfile(userId);
    if (profile && profile.referred_by && !(await hasExistingOrders(userId))) {
      const remainingGoodsPaise = Math.max(0, preDiscountGoodsPaise - discountPaise);
      referralDiscountPaise = Math.round((remainingGoodsPaise * Number(settings.referral_discount_percent || 0)) / 100);
      referralDiscountPaise = Math.max(0, Math.min(referralDiscountPaise, remainingGoodsPaise));
      discountPaise += referralDiscountPaise;
    }
  }

  // Free-shipping threshold applies AFTER the coupon discount.
  const freeShippingThreshold = settings.free_shipping_threshold_paise;
  if (freeShippingThreshold != null && preDiscountGoodsPaise - discountPaise >= freeShippingThreshold) {
    totalShippingPaise = 0;
  }

  const totalPaise = subtotalPaise + gstPaise + totalShippingPaise - discountPaise;
  const paymentGateway = customer.paymentMethod === 'cod' ? 'cod' : null;

  let order;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Creating orders needs SUPABASE_SERVICE_ROLE_KEY set.');
    const orderNumber = `GRV-${Date.now().toString().slice(-8)}`;
    const { data: insertedOrder, error } = await supabaseAdmin
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
        shipping_paise: totalShippingPaise,
        total_paise: totalPaise,
        coupon_code: appliedCoupon ? appliedCoupon.code : null,
        discount_paise: discountPaise,
        status: 'placed',
        payment_status: 'pending',
        payment_gateway: paymentGateway,
      })
      .select()
      .single();
    if (error) throw error;

    const orderItems = pricedItems.map((i) => ({
      order_id: insertedOrder.id,
      product_id: i.product_id,
      product_name: i.name,
      variant_id: i.variant_id || null,
      variant_label: i.variant_label || null,
      unit_price_paise: i.unit_price_paise,
      quantity: i.quantity,
      line_total_paise: i.line_total_paise,
      gst_rate_percent: i.gst_rate_percent,
      line_gst_paise: i.line_gst_paise,
      line_shipping_paise: i.line_shipping_paise,
    }));
    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;

    order = { ...insertedOrder, order_items: orderItems };
  } else {
    order = {
      id: `o_${Date.now()}`,
      order_number: mock.nextOrderNumber(),
      user_id: userId,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      shipping_address: customer.address,
      subtotal_paise: subtotalPaise,
      gst_paise: gstPaise,
      shipping_paise: totalShippingPaise,
      total_paise: totalPaise,
      coupon_code: appliedCoupon ? appliedCoupon.code : null,
      discount_paise: discountPaise,
      status: 'placed',
      payment_status: 'pending',
      payment_gateway: paymentGateway,
      payment_order_id: null,
      payment_id: null,
      tracking_number: null,
      tracking_url: null,
      courier_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      order_items: pricedItems.map((i) => ({
        product_id: i.product_id,
        product_name: i.name,
        variant_id: i.variant_id || null,
        variant_label: i.variant_label || null,
        unit_price_paise: i.unit_price_paise,
        quantity: i.quantity,
        line_total_paise: i.line_total_paise,
        gst_rate_percent: i.gst_rate_percent,
        line_gst_paise: i.line_gst_paise,
        line_shipping_paise: i.line_shipping_paise,
      })),
    };
    mock.orders.push(order);
  }

  if (appliedCoupon) {
    await redeemCoupon(appliedCoupon.id).catch(() => {});
  }
  if (loyaltyRedemption.points > 0) {
    await addLoyaltyEntry({
      user_id: userId,
      order_id: order.id,
      points_delta: -loyaltyRedemption.points,
      reason: 'order_redeemed',
    }).catch(() => {});
  }
  // Groove Points are earned only once the order is actually paid (see markOrderPaid),
  // not at creation time — a placed-but-unpaid order shouldn't accrue points.
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

// Adds tracking details when staff mark an order Shipped — a plain
// tracking-number + carrier-link pair (no live courier API in this phase).
async function updateOrderTracking(id, { trackingNumber, trackingUrl, courierName }) {
  const patch = {
    tracking_number: trackingNumber || null,
    tracking_url: trackingUrl || null,
    courier_name: courierName || null,
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

// Records the payment gateway's own order id against ours right after it's
// created (before payment completes), so a later async webhook event —
// which only knows the gateway's order id — can find our order again.
async function attachPaymentOrderId(id, paymentOrderId) {
  const patch = { payment_order_id: paymentOrderId, updated_at: new Date().toISOString() };
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Updating orders needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('orders').update(patch).eq('id', id);
    if (error) throw error;
    return true;
  }
  const order = mock.orders.find((o) => o.id === id);
  if (!order) return false;
  Object.assign(order, patch);
  return true;
}

async function getOrderByPaymentOrderId(paymentOrderId) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('orders').select('*').eq('payment_order_id', paymentOrderId).maybeSingle();
    if (error) throw error;
    return data;
  }
  return mock.orders.find((o) => o.payment_order_id === paymentOrderId) || null;
}

async function markOrderPaid(id, { paymentGateway, paymentOrderId, paymentId }) {
  const patch = {
    payment_status: 'paid',
    payment_gateway: paymentGateway,
    payment_order_id: paymentOrderId,
    payment_id: paymentId,
    updated_at: new Date().toISOString(),
  };
  let order;
  let alreadyPaid = false;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Updating orders needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data: existing } = await supabaseAdmin.from('orders').select('payment_status').eq('id', id).single();
    alreadyPaid = existing && existing.payment_status === 'paid';
    const { data, error } = await supabaseAdmin.from('orders').update(patch).eq('id', id).select().single();
    if (error) throw error;
    order = data;
  } else {
    order = mock.orders.find((o) => o.id === id);
    if (!order) return null;
    alreadyPaid = order.payment_status === 'paid';
    Object.assign(order, patch);
  }
  // Groove Points are earned once, on the product subtotal only (not GST or shipping),
  // the moment an order first becomes paid — never on repeat calls for the same order.
  if (!alreadyPaid && order.user_id) {
    await earnLoyaltyPoints(order.user_id, order.id, order.subtotal_paise).catch(() => {});
    await awardReferralBonus(order.user_id, order.id).catch(() => {});
  }
  return order;
}

// --- Store settings (a thin, admin-editable wrapper over the site_content
// "store_settings" key — see DEFAULT_CONTENT above for every field). ---
async function getStoreSettings() {
  const content = await listContent();
  return { ...DEFAULT_CONTENT.store_settings, ...(content.store_settings || {}) };
}

// --- Coupons ---
async function listCoupons() {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('coupons').select('*').order('code', { ascending: true });
    if (error) throw error;
    return data;
  }
  return mock.coupons;
}

async function createCoupon(input) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('coupons').insert(input).select().single();
    if (error) throw error;
    return data;
  }
  const coupon = {
    id: `coupon_${Date.now()}`,
    discount_type: 'percent',
    min_order_paise: 0,
    max_discount_paise: null,
    usage_limit: null,
    times_used: 0,
    is_active: true,
    expires_at: null,
    ...input,
    code: String(input.code || '').toUpperCase(),
  };
  mock.coupons.push(coupon);
  return coupon;
}

async function updateCoupon(id, patch) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('coupons').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const coupon = mock.coupons.find((c) => c.id === id);
  if (!coupon) return null;
  Object.assign(coupon, patch);
  return coupon;
}

async function deleteCoupon(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('coupons').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.coupons.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  mock.coupons.splice(idx, 1);
  return true;
}

// Validates a coupon code server-side against the GST-inclusive goods total
// (never trust a discount amount sent by the client). Returns
// { valid: true, coupon, discountPaise } or { valid: false, reason }.
async function validateCoupon(code, goodsPaise) {
  if (!code) return { valid: false, reason: 'No code provided.' };
  const all = await listCoupons();
  const coupon = all.find((c) => c.code.toUpperCase() === String(code).toUpperCase());
  if (!coupon) return { valid: false, reason: 'Coupon code not found.' };
  if (!coupon.is_active) return { valid: false, reason: 'This coupon is no longer active.' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return { valid: false, reason: 'This coupon has expired.' };
  if (coupon.usage_limit != null && coupon.times_used >= coupon.usage_limit) return { valid: false, reason: 'This coupon has reached its usage limit.' };
  if (coupon.min_order_paise && goodsPaise < coupon.min_order_paise) {
    return { valid: false, reason: `Minimum order of ₹${(coupon.min_order_paise / 100).toFixed(0)} required for this coupon.` };
  }
  let discountPaise =
    coupon.discount_type === 'percent' ? Math.round((goodsPaise * Number(coupon.discount_value)) / 100) : Number(coupon.discount_value);
  if (coupon.max_discount_paise != null) discountPaise = Math.min(discountPaise, coupon.max_discount_paise);
  discountPaise = Math.max(0, Math.min(discountPaise, goodsPaise));
  return { valid: true, coupon, discountPaise };
}

async function redeemCoupon(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data: current, error: fetchErr } = await supabaseAdmin.from('coupons').select('times_used').eq('id', id).single();
    if (fetchErr) throw fetchErr;
    const { error } = await supabaseAdmin.from('coupons').update({ times_used: (current.times_used || 0) + 1 }).eq('id', id);
    if (error) throw error;
    return true;
  }
  const coupon = mock.coupons.find((c) => c.id === id);
  if (!coupon) return false;
  coupon.times_used = (coupon.times_used || 0) + 1;
  return true;
}

// --- Weight-based shipping rate slabs ---
async function listShippingRateSlabs() {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('shipping_rate_slabs').select('*').order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  }
  return [...mock.shippingRateSlabs].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

async function createShippingRateSlab(input) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('shipping_rate_slabs').insert(input).select().single();
    if (error) throw error;
    return data;
  }
  const slab = { id: `ship_${Date.now()}`, sort_order: mock.shippingRateSlabs.length + 1, ...input };
  mock.shippingRateSlabs.push(slab);
  return slab;
}

async function updateShippingRateSlab(id, patch) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('shipping_rate_slabs').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const slab = mock.shippingRateSlabs.find((s) => s.id === id);
  if (!slab) return null;
  Object.assign(slab, patch);
  return slab;
}

async function deleteShippingRateSlab(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('shipping_rate_slabs').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.shippingRateSlabs.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  mock.shippingRateSlabs.splice(idx, 1);
  return true;
}

// Chargeable weight = max(actual weight, volumetric weight), matched against
// the slabs in ascending max_weight_grams order; the row with max_weight_grams
// null is the catch-all for anything heavier than every other slab.
async function computeShippingForWeight(totalGrams) {
  const slabs = await listShippingRateSlabs();
  const sorted = [...slabs].sort((a, b) => {
    if (a.max_weight_grams == null) return 1;
    if (b.max_weight_grams == null) return -1;
    return a.max_weight_grams - b.max_weight_grams;
  });
  const match = sorted.find((s) => s.max_weight_grams == null || totalGrams <= s.max_weight_grams);
  return match ? Number(match.price_paise) : 0;
}

// --- Groove Points loyalty (ledger-based — balance is the sum of points_delta) ---
async function listLoyaltyLedger(userId) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('loyalty_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return mock.loyaltyLedger.filter((l) => l.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getLoyaltyBalance(userId) {
  const rows = await listLoyaltyLedger(userId);
  return rows.reduce((sum, r) => sum + r.points_delta, 0);
}

async function addLoyaltyEntry(entry) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('loyalty_ledger').insert(entry).select().single();
    if (error) throw error;
    return data;
  }
  const row = { id: `loy_${Date.now()}_${Math.round(Math.random() * 1e6)}`, created_at: new Date().toISOString(), ...entry };
  mock.loyaltyLedger.push(row);
  return row;
}

async function earnLoyaltyPoints(userId, orderId, productSubtotalPaise) {
  const settings = await getStoreSettings();
  if (!settings.loyalty_points_enabled) return null;
  const rate = Number(settings.loyalty_earn_rate_paise_per_point) || 10000;
  const points = Math.floor(productSubtotalPaise / rate);
  if (points <= 0) return null;
  return addLoyaltyEntry({
    user_id: userId,
    order_id: orderId,
    points_delta: points,
    reason: 'order_earned',
  });
}

// Computes what a points redemption would actually be worth WITHOUT writing
// anything — capped at both the customer's balance and
// loyalty_redeem_cap_percent of capBasisPaise (the order's goods value, after
// any coupon). Called from createOrder so the discount and the ledger entry
// use the exact same, server-computed number.
async function previewLoyaltyRedemption(userId, pointsRequested, capBasisPaise) {
  const settings = await getStoreSettings();
  if (!settings.loyalty_points_enabled || !userId || !pointsRequested) return { points: 0, discountPaise: 0 };
  const balance = await getLoyaltyBalance(userId);
  const redeemValue = Number(settings.loyalty_redeem_value_paise_per_point) || 100;
  const capPercent = settings.loyalty_redeem_cap_percent != null ? settings.loyalty_redeem_cap_percent : 50;
  const maxDiscountByCap = Math.max(0, Math.floor((capBasisPaise * capPercent) / 100));
  let points = Math.max(0, Math.min(pointsRequested, balance));
  let discountPaise = points * redeemValue;
  if (discountPaise > maxDiscountByCap) {
    points = Math.floor(maxDiscountByCap / redeemValue);
    discountPaise = points * redeemValue;
  }
  return { points, discountPaise };
}

async function redeemLoyaltyPoints(userId, orderId, pointsToRedeem) {
  const settings = await getStoreSettings();
  if (!settings.loyalty_points_enabled) return { redeemed: 0, discountPaise: 0 };
  const balance = await getLoyaltyBalance(userId);
  const points = Math.max(0, Math.min(pointsToRedeem, balance));
  if (points <= 0) return { redeemed: 0, discountPaise: 0 };
  const redeemValue = Number(settings.loyalty_redeem_value_paise_per_point) || 100;
  const discountPaise = points * redeemValue;
  await addLoyaltyEntry({
    user_id: userId,
    order_id: orderId,
    points_delta: -points,
    reason: 'order_redeemed',
  });
  return { redeemed: points, discountPaise };
}

// --- Refer-a-friend ---
// profiles.referral_code / profiles.referred_by (see db/schema.sql). New
// signups get a code + get linked to their referrer automatically (Postgres
// trigger, live mode) or via mock.registerCustomer (demo mode) — this
// getOrCreateReferralCode is a fallback for any account that existed before
// this feature shipped and so never got a code assigned.
async function getProfile(userId) {
  if (!userId) return null;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Reading profiles needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, referral_code, referred_by')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  return mock.getProfile(userId);
}

function randomReferralCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function getOrCreateReferralCode(userId) {
  const profile = await getProfile(userId);
  if (profile && profile.referral_code) return profile.referral_code;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Updating profiles needs SUPABASE_SERVICE_ROLE_KEY set.');
    // A handful of retries in case of a (very unlikely) code collision with
    // the unique constraint on profiles.referral_code.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomReferralCode();
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({ referral_code: code })
        .eq('id', userId)
        .select('referral_code')
        .single();
      if (!error) return data.referral_code;
      if (error.code !== '23505') throw error; // anything but "unique violation" is unexpected
    }
    throw new Error('Could not generate a unique referral code — try again.');
  }
  return mock.setReferralCode(userId, randomReferralCode());
}

// Used by createOrder to gate the refer-a-friend signup discount to a
// customer's very first order — a lightweight existence check rather than
// pulling every past order (listOrdersForUser also joins order_items).
async function hasExistingOrders(userId) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Order visibility needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { count, error } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return (count || 0) > 0;
  }
  return mock.orders.some((o) => o.user_id === userId);
}

// Referrer's reward: awarded every time (not just the first time) the friend
// they referred pays for an order — called from markOrderPaid, guarded the
// same way earnLoyaltyPoints is (only on the paid transition, never on
// repeat webhook/confirm calls for the same order).
async function awardReferralBonus(buyerUserId, orderId) {
  const settings = await getStoreSettings();
  if (!settings.referral_program_enabled || !buyerUserId) return null;
  const profile = await getProfile(buyerUserId);
  if (!profile || !profile.referred_by) return null;
  const points = Math.floor(Number(settings.referral_points_per_order)) || 0;
  if (points <= 0) return null;
  return addLoyaltyEntry({
    user_id: profile.referred_by,
    order_id: orderId,
    points_delta: points,
    reason: 'referral_bonus',
  });
}

// Per-friend detail for the account "Refer & Earn" tab: who a customer has
// referred (name/email/joined date), what they've bought, and how many
// Groove Points that specific friend has earned the referrer so far. Reuses
// listCustomers() for name/email rather than a second admin.listUsers()
// call — profiles has no email column of its own (that lives on
// auth.users), and listCustomers() already resolves that join.
async function getReferredFriendsDetail(userId) {
  if (!userId) return [];

  let referredIds;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Reading referral details needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('profiles').select('id').eq('referred_by', userId);
    if (error) throw error;
    referredIds = (data || []).map((r) => r.id);
  } else {
    referredIds = [...mock.demoUsers, ...mock.customerUsers].filter((u) => u.referred_by === userId).map((u) => u.id);
  }
  if (!referredIds.length) return [];

  let friendOrders;
  if (isConfigured) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, payment_status, total_paise')
      .in('user_id', referredIds);
    if (error) throw error;
    friendOrders = data || [];
  } else {
    friendOrders = mock.orders.filter((o) => referredIds.includes(o.user_id));
  }

  const referralLedger = (await listLoyaltyLedger(userId)).filter((l) => l.reason === 'referral_bonus');
  const orderFriendById = new Map(friendOrders.map((o) => [o.id, o.user_id]));
  const pointsByFriend = new Map();
  referralLedger.forEach((entry) => {
    const friendId = orderFriendById.get(entry.order_id);
    if (!friendId) return;
    pointsByFriend.set(friendId, (pointsByFriend.get(friendId) || 0) + entry.points_delta);
  });

  const allCustomers = await listCustomers();
  const customerById = new Map(allCustomers.map((c) => [c.id, c]));

  return referredIds
    .map((friendId) => {
      const c = customerById.get(friendId) || {};
      const fOrders = friendOrders.filter((o) => o.user_id === friendId);
      const paidOrders = fOrders.filter((o) => o.payment_status === 'paid');
      return {
        id: friendId,
        full_name: c.full_name || null,
        email: c.email || null,
        joined_at: c.created_at || null,
        orderCount: fOrders.length,
        paidOrderCount: paidOrders.length,
        totalSpentPaise: paidOrders.reduce((sum, o) => sum + (o.total_paise || 0), 0),
        pointsEarnedFromThisFriend: pointsByFriend.get(friendId) || 0,
      };
    })
    .sort((a, b) => new Date(b.joined_at || 0) - new Date(a.joined_at || 0));
}

// Customer-facing summary for the account "Refer & Earn" tab: their own
// code/link, how many people they've referred, points earned from it
// specifically (a subset of their total Groove Points balance), and now
// (2026-09-08) the actual per-friend breakdown — who they are and what
// they've bought — rather than just a bare count.
async function getReferralStats(userId) {
  const code = await getOrCreateReferralCode(userId);
  const referrals = await getReferredFriendsDetail(userId);
  const referredCount = referrals.length;
  const pointsFromReferrals = referrals.reduce((sum, r) => sum + r.pointsEarnedFromThisFriend, 0);
  return { code, referredCount, pointsFromReferrals, referrals };
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

// Status (Draft / Scheduled / Active / Expired) is computed here from
// is_active + scheduled_start/scheduled_end rather than stored as its own
// column — that way it can never drift out of sync the way a persisted
// status flipped by a cron job could (e.g. if the cron missed a run). Every
// banner read (admin listing, public storefront fetch) goes through this.
function computeBannerStatus(banner) {
  if (!banner.is_active) return 'draft';
  const now = Date.now();
  if (banner.scheduled_start && new Date(banner.scheduled_start).getTime() > now) return 'scheduled';
  if (banner.scheduled_end && new Date(banner.scheduled_end).getTime() < now) return 'expired';
  return 'active';
}

function withBannerStatus(banner) {
  return { ...banner, status: computeBannerStatus(banner) };
}

// status/id/created_at are either computed (status) or server-owned
// (id/created_at) — strip them from anything a client sends before writing,
// since the admin UI round-trips full banner objects it read back from the
// API (which include the computed `status`) into create/update calls.
function sanitizeBannerInput(input) {
  const clean = { ...(input || {}) };
  delete clean.status;
  delete clean.id;
  delete clean.created_at;
  return clean;
}

async function listBanners({ includeInactive = false, placement = null, status = null, search = null } = {}) {
  let rows;
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    let query = client.from('banners').select('*').order('sort_order', { ascending: true });
    if (placement) query = query.eq('placement', placement);
    const { data, error } = await query;
    if (error) throw error;
    rows = data;
  } else {
    rows = mock.banners
      .filter((b) => !placement || b.placement === placement)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }
  rows = rows.map(withBannerStatus);
  if (!includeInactive) rows = rows.filter((b) => b.status === 'active');
  if (status) rows = rows.filter((b) => b.status === status);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((b) => (b.title || '').toLowerCase().includes(q) || (b.subtitle || '').toLowerCase().includes(q));
  }
  return rows;
}

async function getBannerById(id) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('banners').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? withBannerStatus(data) : null;
  }
  const banner = mock.banners.find((b) => b.id === id);
  return banner ? withBannerStatus(banner) : null;
}

async function createBanner(input) {
  const clean = sanitizeBannerInput(input);
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('banners').insert(clean).select().single();
    if (error) throw error;
    return withBannerStatus(data);
  }
  const banner = {
    id: `b_${Date.now()}`,
    is_active: true,
    sort_order: mock.banners.length + 1,
    image_focus_x: 50,
    image_focus_y: 50,
    image_zoom: 1,
    scheduled_start: null,
    scheduled_end: null,
    ...clean,
  };
  mock.banners.push(banner);
  return withBannerStatus(banner);
}

async function updateBanner(id, patch) {
  const clean = sanitizeBannerInput(patch);
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('banners').update(clean).eq('id', id).select().single();
    if (error) throw error;
    return data ? withBannerStatus(data) : null;
  }
  const banner = mock.banners.find((b) => b.id === id);
  if (!banner) return null;
  Object.assign(banner, clean);
  return withBannerStatus(banner);
}

async function deleteBanner(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('banners').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.banners.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  mock.banners.splice(idx, 1);
  return true;
}

// Duplicate a banner (Admin -> Banners -> Duplicate). The copy always lands
// as a Draft (is_active:false) at the end of its placement's order, so
// duplicating something live never silently doubles it up on the storefront.
async function duplicateBanner(id) {
  const source = await getBannerById(id);
  if (!source) return null;
  const siblings = await listBanners({ includeInactive: true, placement: source.placement });
  const maxSort = siblings.reduce((max, b) => Math.max(max, b.sort_order || 0), 0);
  const copy = sanitizeBannerInput(source);
  copy.title = source.title ? `${source.title} (Copy)` : 'Untitled (Copy)';
  copy.is_active = false;
  copy.sort_order = maxSort + 1;
  return createBanner(copy);
}

// Bulk drag-and-drop reorder — ids in their new display order, all within
// the same placement group. Writes are sequential (banner counts are tiny)
// so a partial failure still leaves a consistent, readable ordering.
async function reorderBanners(ids) {
  const updated = [];
  for (let i = 0; i < ids.length; i += 1) {
    const banner = await updateBanner(ids[i], { sort_order: i + 1 });
    if (banner) updated.push(banner);
  }
  return updated;
}

// Bulk select -> Activate / Deactivate / Delete from the admin table.
async function bulkUpdateBanners(ids, patch) {
  const clean = sanitizeBannerInput(patch);
  const updated = [];
  for (const id of ids) {
    const banner = await updateBanner(id, clean);
    if (banner) updated.push(banner);
  }
  return updated;
}

async function bulkDeleteBanners(ids) {
  let count = 0;
  for (const id of ids) {
    if (await deleteBanner(id)) count += 1;
  }
  return count;
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

// --- Editable site content (hero, story, feature strip, process steps) ---
// Defaults mirror db/schema.sql's seed data so demo mode shows the same
// copy that ships once Supabase is connected, until an admin edits it.
const DEFAULT_CONTENT = {
  homepage_hero: {
    tagline: 'Goodness of Earth',
    headline_line1: 'Pure by Nature.',
    headline_line2: 'Trusted by You.',
    body: 'Cold pressed coconut oil, made naturally for a healthier you and a better planet.',
    cta_primary_label: 'Shop Now',
    cta_primary_href: '/shop',
    cta_secondary_label: 'Our Farms',
    cta_secondary_href: '/about',
  },
  homepage_story: {
    eyebrow: 'Our Story',
    title_line1: 'Rooted in soil,',
    title_line2: 'pressed by hand.',
    body: 'We partner with named farms and press each batch the slow way — wood-ghani, stone-turned, no heat added. It takes longer. It tastes like it should.',
    milestones: [
      { year: '2018', text: 'Started blending botanical oils in a farmhouse kitchen.' },
      { year: '2020', text: 'Opened a countryside pressing studio with three artisans.' },
      { year: '2022', text: 'Earned organic & cruelty-free certification for our core range.' },
      { year: '2024', text: 'Launched a returnable-glass refill program with 40 retail partners.' },
    ],
  },
  homepage_feature_strip: {
    items: [
      { title: '100% Natural & Organic', body: 'Certified botanicals, no fillers' },
      { title: 'Cold Pressed Goodness', body: 'Traditional chekku method, no heat' },
      { title: 'No Chemicals No Additives', body: 'Nothing added, nothing hidden' },
      { title: 'Good for You Good for Earth', body: 'Reusable glass, eco packaging' },
    ],
  },
  homepage_process: {
    eyebrow: 'From Farm to Bottle',
    title: 'Four steps. No shortcuts.',
    steps: [
      { title: 'Harvest', body: 'Coconuts hand-picked at peak ripeness from partner farms, milled within 24 hours of harvest so nothing sits and turns. Each farm is visited by our own team, not a broker.' },
      { title: 'Wood-Press', body: 'The chekku/ghani wheel turns slowly for hours, staying below body temperature so the oil is never heat-stressed — the same stone-and-wood method used for generations, just slower than any machine.' },
      { title: 'Settle & Filter', body: "Gravity-settled overnight and cloth-filtered only — no centrifuge, no bleaching, no deodorizing. What's left is exactly what the coconut gave us." },
      { title: 'Bottle', body: "Hand-poured into reusable glass, labelled and sealed in small batches so every bottle is checked by a person, not a line. Return the bottle and we'll refill it." },
    ],
  },
  // Business/legal details used on invoices, the contact page, and to
  // switch on checkout behavior (COD, free shipping). Everything here
  // starts blank/off on purpose — fill it in from Admin → Store Settings.
  // Nothing here is a secret (no API keys) — those still only ever live in
  // backend/.env, never in this admin-editable content store.
  store_settings: {
    business_legal_name: '',
    gstin: '',
    business_address: '',
    support_email: '',
    support_phone: '',
    charge_gst: true,
    cod_enabled: false,
    cod_extra_charge_paise: 0,
    free_shipping_threshold_paise: 99900, // ₹999 — set to 0 to disable
    loyalty_points_enabled: false,
    loyalty_earn_rate_paise_per_point: 10000, // ₹100 spent = 1 point, at the default rate
    loyalty_redeem_value_paise_per_point: 100, // 1 point = ₹1 off when redeemed
    loyalty_redeem_cap_percent: 50, // points can cover at most this % of an order's value
    low_stock_threshold: 10, // Admin → Reports flags products at/below this stock level
    blocked_pincodes: [], // array of 6-digit strings we don't currently deliver to
    // Refer-a-friend: every signed-in customer has a referral_code (profiles
    // table). Sharing it as ?ref=CODE on the sign-up page links the new
    // account to them (profiles.referred_by). From then on, the REFERRER
    // earns referral_points_per_order Groove Points every time the referred
    // friend's order is paid (not just their first — see awardReferralBonus
    // in markOrderPaid), and the NEW customer gets referral_discount_percent
    // off their own first order automatically (see createOrder) — no coupon
    // code needed on either side. Independent of the loyalty_points_* fields
    // above, but shares the same loyalty_ledger table (reason:
    // 'referral_bonus') so both show up together in a customer's points
    // history.
    referral_program_enabled: false,
    referral_points_per_order: 100,
    referral_discount_percent: 10,
  },
  page_terms: {
    title: 'Terms & Conditions',
    body: 'Welcome to Groove Organics. By using this website and placing an order, you agree to the terms below.\n\nAll products are sold subject to availability. Prices are listed in Indian Rupees (INR) and include applicable taxes unless stated otherwise. We reserve the right to refuse or cancel any order at our discretion, including in cases of pricing errors or suspected fraud.\n\nThis is placeholder text — please review and replace it with terms appropriate for your business before going live, ideally with input from a legal professional.',
  },
  page_privacy: {
    title: 'Privacy Policy',
    body: 'Groove Organics collects only the information needed to process your order and improve your shopping experience: your name, contact details, shipping address, and order history.\n\nWe do not sell your personal information to third parties. Payment details are handled directly by our payment gateway (Razorpay) and are never stored on our servers.\n\nThis is placeholder text — please review and replace it with a privacy policy appropriate for your business before going live, ideally with input from a legal professional.',
  },
  page_refund_policy: {
    title: 'Refund & Return Policy',
    body: 'If you receive a damaged, defective, or incorrect item, please contact us within 48 hours of delivery with photos of the product, and we will arrange a replacement or refund.\n\nDue to the nature of our products (consumable food items), we generally cannot accept returns of opened products for hygiene reasons, except in cases of damage or defect.\n\nApproved refunds are processed to the original payment method within 5-7 business days.\n\nThis is placeholder text — please review and replace it with a policy appropriate for your business before going live.',
  },
  page_shipping_policy: {
    title: 'Shipping Policy',
    body: 'We currently ship across India. Orders are typically dispatched within 1-2 business days of confirmation.\n\nShipping charges are calculated at checkout based on the weight of your order, and shown before you pay. Orders above the free-shipping threshold (shown at checkout) ship free.\n\nDelivery timelines vary by location, typically 3-7 business days after dispatch.\n\nThis is placeholder text — please review and replace it with details appropriate for your business before going live.',
  },
};

async function listContent() {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('site_content').select('*');
    if (error) throw error;
    const map = { ...DEFAULT_CONTENT };
    (data || []).forEach((row) => (map[row.key] = row.value));
    return map;
  }
  const map = { ...DEFAULT_CONTENT };
  mock.siteContent.forEach((value, key) => (map[key] = value));
  return map;
}

async function setContent(key, value) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .upsert({ key, value, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data.value;
  }
  mock.siteContent.set(key, value);
  return value;
}

// --- Product variants (size and/or color) ---
async function listVariants(productId) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  }
  return mock.productVariants
    .filter((v) => v.product_id === productId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

async function createVariant(productId, input) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('product_variants')
      .insert({ product_id: productId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const variant = {
    id: `var_${Date.now()}`,
    product_id: productId,
    size: null,
    color: null,
    stock: 0,
    image_url: null,
    sort_order: mock.productVariants.length + 1,
    ...input,
  };
  mock.productVariants.push(variant);
  return variant;
}

async function updateVariant(id, patch) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('product_variants').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const variant = mock.productVariants.find((v) => v.id === id);
  if (!variant) return null;
  Object.assign(variant, patch);
  return variant;
}

async function deleteVariant(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('product_variants').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.productVariants.findIndex((v) => v.id === id);
  if (idx === -1) return false;
  mock.productVariants.splice(idx, 1);
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
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  listOrders,
  listOrdersForUser,
  getOrder,
  createOrder,
  updateOrderStatus,
  updateOrderTracking,
  attachPaymentOrderId,
  getOrderByPaymentOrderId,
  markOrderPaid,
  addNewsletterSubscriber,
  addContactMessage,
  listBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  duplicateBanner,
  reorderBanners,
  bulkUpdateBanners,
  bulkDeleteBanners,
  computeBannerStatus,
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
  listContent,
  setContent,
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  getStoreSettings,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  redeemCoupon,
  listShippingRateSlabs,
  createShippingRateSlab,
  updateShippingRateSlab,
  deleteShippingRateSlab,
  computeShippingForWeight,
  listLoyaltyLedger,
  getLoyaltyBalance,
  addLoyaltyEntry,
  earnLoyaltyPoints,
  previewLoyaltyRedemption,
  redeemLoyaltyPoints,
  listCustomers,
  getProfile,
  getOrCreateReferralCode,
  hasExistingOrders,
  awardReferralBonus,
  getReferralStats,
  getReferredFriendsDetail,
};
