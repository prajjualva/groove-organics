// Unified data access layer.
// Every route calls functions from here instead of talking to Supabase or
// the mock store directly — so the rest of the app doesn't care which one
// is actually backing it. When SUPABASE_URL/keys are set in .env, real
// Supabase is used everywhere; until then, everything runs off mockStore.js
// so the site is fully functional in "demo mode".

const { supabase, supabaseAdmin, isConfigured } = require('./supabase');
const mock = require('./mockStore');
const email = require('./email');

function toPublicProduct(row) {
  if (!row) return row;
  return row;
}

// --- Categories (parent -> subcategory tree) ---
// includeInactive: the storefront's own nav/filter list should only ever
// show is_active categories (Admin Phase 5's new toggle); the admin
// Categories tab passes includeInactive: true so a deactivated category is
// still visible there to be re-activated. Mirrors listProducts's own
// includeInactive option/pattern exactly.
async function listCategories({ includeInactive = false } = {}) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    let query = client.from('categories').select('*').order('sort_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return [...mock.categories]
    .filter((c) => includeInactive || c.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

async function createCategory(input) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('categories').insert(input).select().single();
    if (error) throw error;
    return data;
  }
  const category = {
    id: mock.uid('cat'),
    parent_id: null,
    sort_order: mock.categories.length + 1,
    description: null,
    image_url: null,
    is_active: true,
    seo_title: null,
    seo_meta_description: null,
    ...input,
  };
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
    id: mock.uid('p'),
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
    gallery_images: [],
    key_benefits: [],
    ingredients_info: null,
    shipping_info: null,
    faq: [],
    sku: null,
    barcode: null,
    low_stock_threshold: null,
    reserved_stock: 0,
    shipping_class_id: null,
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
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, full_name, is_active, deactivated_at, deactivated_reason, referred_by');
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
          is_active: profile?.is_active !== false,
          deactivated_at: profile?.deactivated_at || null,
          deactivated_reason: profile?.deactivated_reason || null,
          referred_by: profile?.referred_by || null,
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

// Admin Phase 3: deactivate/reactivate a customer (or staff) account. See
// db/schema.sql's profiles.is_active comment and middleware/auth.js's
// resolveUser — this is checked on every request, so it takes effect
// immediately, not just on the account's next sign-in.
async function setCustomerActive(id, { isActive, reason = null } = {}) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        is_active: isActive,
        deactivated_at: isActive ? null : new Date().toISOString(),
        deactivated_reason: isActive ? null : reason || null,
      })
      .eq('id', id);
    if (profileError) throw profileError;
    // Belt-and-suspenders beyond the per-request is_active check above:
    // also ban/unban the underlying Supabase Auth user, so a deactivated
    // account can't sign in again or refresh its session either. Best-effort
    // — a profile-only deactivation (the check every request already makes)
    // still fully blocks access even if this call fails for some reason.
    await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: isActive ? 'none' : '876000h' }).catch(() => {});
    return true;
  }
  return mock.setUserActive(id, isActive, reason);
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
// chargeGst=false means this store isn't GST-registered (Admin → Store
// Settings → "Charge GST", previously a dead toggle — its save handler
// hardcoded true regardless of what the admin picked, and nothing here
// ever read it, so it silently had no effect either way). When off, every
// line is priced at 0% GST — the customer still pays the same
// GST-inclusive price entered in Admin, but nothing is extracted/shown as
// tax on the invoice, matching what turning this off is supposed to mean.
async function priceOrderItems(items, defaultGstRatePercent, chargeGst = true, isIntrastate = true) {
  return Promise.all(
    items.map(async (i) => {
      const product = i.product_id ? await getProductById(i.product_id).catch(() => null) : null;
      const gstRate = !chargeGst ? 0 : product && product.gst_rate_percent != null ? Number(product.gst_rate_percent) : Number(defaultGstRatePercent);
      const shippingOverride = await resolveProductShippingOverridePaise(product);
      const shippingPerUnit = shippingOverride != null ? shippingOverride : 0;
      const lineInclusive = i.unit_price_paise * i.quantity; // what the customer actually pays for this line, tax included
      const lineBase = Math.round((lineInclusive * 100) / (100 + gstRate)); // pre-tax value, extracted
      const lineGst = lineInclusive - lineBase; // the GST embedded in lineInclusive
      // CGST/SGST vs IGST (Indian GST law): an intrastate sale (seller and
      // customer/shipping address in the same state) splits the tax evenly
      // into CGST + SGST; an interstate sale charges the full rate as IGST
      // instead. cgst = floor(lineGst/2), sgst = the remainder, so
      // cgst+sgst always exactly equals lineGst — no rounding drift.
      const lineCgst = isIntrastate ? Math.floor(lineGst / 2) : 0;
      const lineSgst = isIntrastate ? lineGst - lineCgst : 0;
      const lineIgst = isIntrastate ? 0 : lineGst;
      return {
        ...i,
        hsn_code: (product && product.hsn_code) || null,
        category_id: (product && product.category_id) || null,
        gst_rate_percent: gstRate,
        line_base_paise: lineBase,
        line_gst_paise: lineGst,
        line_cgst_paise: lineCgst,
        line_sgst_paise: lineSgst,
        line_igst_paise: lineIgst,
        line_shipping_paise: shippingPerUnit * i.quantity,
        line_total_paise: lineInclusive, // GST-inclusive — this is the line amount actually charged
      };
    })
  );
}

// Chargeable weight for one line = max(actual weight, volumetric weight),
// volumetric = L x W x H (cm) / 5000, giving grams. Falls back to 0 (ships
// free) if a product has no weight/dimensions set at all. Shared by the
// order-pricing engine below and the /api/orders/estimate preview route so
// both always compute shipping weight identically.
function chargeableWeightGrams(product, variant) {
  const weight = (variant && variant.weight_grams != null ? variant.weight_grams : null) ?? product.weight_grams ?? 0;
  const l = product.length_cm || 0;
  const w = product.width_cm || 0;
  const h = product.height_cm || 0;
  const volumetric = (l * w * h) / 5000;
  return Math.max(Number(weight) || 0, volumetric);
}

// A product's manual per-unit shipping override, in paise, or null if none
// applies (in which case it falls through to weight-based computeShipping
// instead, via pooledChargeableGrams below). The product's own
// shipping_charge_paise always wins if set and non-zero; otherwise its
// shipping_class's flat_rate_paise (if any, and the class is active) is
// used — lets an admin manage one shared rate for a group of products
// ("Fragile - Glass", "Bulky", ...) instead of retyping the same number on
// every product individually.
async function resolveProductShippingOverridePaise(product) {
  if (!product) return null;
  if (product.shipping_charge_paise) return Number(product.shipping_charge_paise);
  if (product.shipping_class_id) {
    const shippingClass = await getShippingClassById(product.shipping_class_id).catch(() => null);
    if (shippingClass && shippingClass.is_active !== false && shippingClass.flat_rate_paise != null) {
      return Number(shippingClass.flat_rate_paise);
    }
  }
  return null;
}

// Pools the chargeable weight of every line item that does NOT have a
// manual per-product shipping override (those are priced individually
// inside priceOrderItems instead) — the pooled figure is what gets matched
// against the shipping rate-slab table for one whole-shipment cost.
async function pooledChargeableGrams(items) {
  let pooledGrams = 0;
  for (const item of items) {
    if (!item.product_id) continue;
    const product = await getProductById(item.product_id).catch(() => null);
    if (!product) continue;
    const shippingOverride = await resolveProductShippingOverridePaise(product);
    if (shippingOverride != null) continue;
    let variant = null;
    if (item.variant_id) {
      const variants = await listVariants(item.product_id).catch(() => []);
      variant = variants.find((v) => v.id === item.variant_id) || null;
    }
    pooledGrams += chargeableWeightGrams(product, variant) * (Number(item.quantity) || 1);
  }
  return pooledGrams;
}

// =========================================================================
// THE order-pricing engine. Computes the full, authoritative subtotal /
// CGST / SGST / IGST / shipping / coupon / Groove Points / referral / total
// breakdown for a cart, entirely server-side. This is the ONE place this
// math happens — createOrder (actually placing an order) and the public
// POST /api/orders/estimate route (the live cart/checkout preview) both
// call this exact function, so the number a shopper sees before paying is
// guaranteed to be the number they're actually charged. Never duplicate
// this arithmetic in the frontend, or anywhere else server-side.
//
// Nothing in here writes to the database or has a side effect — coupon
// validation and Groove Points redemption are both read-only previews
// (validateCoupon / previewLoyaltyRedemption). Actually redeeming a coupon
// or writing a loyalty-ledger row only happens in createOrder, and only
// after the real order has been successfully inserted.
// =========================================================================
async function computeOrderPricing({
  items,
  shippingAddress = null,
  paymentMethod = 'online',
  userId = null,
  couponCode = null,
  redeemPoints = 0,
  gstRatePercent = null,
}) {
  const settings = await getStoreSettings();
  const defaultGstRatePercent = gstRatePercent != null ? gstRatePercent : Number(process.env.GST_RATE_PERCENT || 5);
  const chargeGst = settings.charge_gst !== false;

  // CGST/SGST vs IGST: compares the store's own registered state (Admin ->
  // Store Settings -> "Seller / business state") against the customer's
  // shipping-address state. If either is blank/unknown this defaults to
  // intrastate (CGST+SGST split) — that's how a single-state business
  // actually operates, and keeps the breakup sane before an admin has
  // filled in the seller state.
  const sellerState = (settings.seller_state || '').trim();
  const customerState = ((shippingAddress && shippingAddress.state) || '').trim();
  const isIntrastate = !sellerState || !customerState || sellerState.toLowerCase() === customerState.toLowerCase();

  const pricedItems = await priceOrderItems(items, defaultGstRatePercent, chargeGst, isIntrastate);

  // subtotalPaise is the pre-tax (base) total; gstPaise is the tax extracted from the
  // inclusive prices above — subtotalPaise + gstPaise always equals the sum of what the
  // customer actually pays for the products (the GST-inclusive line totals).
  const subtotalPaise = pricedItems.reduce((sum, i) => sum + i.line_base_paise, 0);
  const cgstPaise = pricedItems.reduce((sum, i) => sum + i.line_cgst_paise, 0);
  const sgstPaise = pricedItems.reduce((sum, i) => sum + i.line_sgst_paise, 0);
  const igstPaise = pricedItems.reduce((sum, i) => sum + i.line_igst_paise, 0);
  const gstPaise = cgstPaise + sgstPaise + igstPaise;
  const productShippingPaise = pricedItems.reduce((sum, i) => sum + i.line_shipping_paise, 0);
  const preDiscountGoodsPaise = subtotalPaise + gstPaise; // sum of inclusive line totals

  // Weight/zone/state/pincode-based shipping for every line that doesn't
  // carry its own manual shipping_charge_paise override (those are already
  // priced per-unit above, inside priceOrderItems).
  const pooledGrams = await pooledChargeableGrams(items);
  const weightShippingPaise =
    pooledGrams > 0
      ? await computeShipping({
          totalGrams: pooledGrams,
          orderValuePaise: preDiscountGoodsPaise,
          state: customerState,
          pincode: (shippingAddress && shippingAddress.pincode) || '',
        })
      : 0;
  let totalShippingPaise = weightShippingPaise + productShippingPaise;
  if (paymentMethod === 'cod') totalShippingPaise += Number(settings.cod_extra_charge_paise) || 0;

  // Coupon: simple order-level discount subtracted from the final total (computed on the
  // full GST-inclusive price first, discount applied after) — never prorated per line.
  let discountPaise = 0;
  let couponDiscountPaise = 0;
  let couponApplied = null;
  let couponError = null;
  if (couponCode) {
    const validation = await validateCoupon(couponCode, preDiscountGoodsPaise, { pricedItems, userId });
    if (validation.valid) {
      couponApplied = validation.coupon;
      couponDiscountPaise = validation.discountPaise;
      discountPaise += couponDiscountPaise;
    } else {
      couponError = validation.reason;
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
  // via hasExistingOrders — read-only here, BEFORE any real order exists).
  // Stacks on top of whatever's left after the coupon + points redemption
  // above, same pattern as loyalty redemption.
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

  // Free-shipping threshold applies AFTER every discount above.
  const freeShippingThreshold = settings.free_shipping_threshold_paise;
  if (freeShippingThreshold != null && freeShippingThreshold > 0 && preDiscountGoodsPaise - discountPaise >= freeShippingThreshold) {
    totalShippingPaise = 0;
  }

  const totalPaise = subtotalPaise + gstPaise + totalShippingPaise - discountPaise;

  return {
    pricedItems,
    chargeGst,
    isIntrastate,
    sellerState,
    customerState,
    subtotalPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    gstPaise,
    shippingPaise: totalShippingPaise,
    discountPaise,
    couponDiscountPaise,
    couponApplied,
    couponError,
    loyaltyDiscountPaise: loyaltyRedemption.discountPaise,
    loyaltyPointsApplied: loyaltyRedemption.points,
    referralDiscountPaise,
    totalPaise,
  };
}

async function createOrder({ customer, items, userId = null, couponCode = null, redeemPoints = 0, gstRatePercent = null }) {
  const pricing = await computeOrderPricing({
    items,
    shippingAddress: customer.address,
    paymentMethod: customer.paymentMethod,
    userId,
    couponCode,
    redeemPoints,
    gstRatePercent,
  });
  const {
    pricedItems,
    subtotalPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    gstPaise,
    shippingPaise: totalShippingPaise,
    discountPaise,
    couponApplied,
    loyaltyDiscountPaise,
    loyaltyPointsApplied,
    referralDiscountPaise,
    totalPaise,
    isIntrastate,
    sellerState,
    customerState,
  } = pricing;
  const taxType = gstPaise === 0 ? 'none' : isIntrastate ? 'intrastate' : 'interstate';
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
        cgst_paise: cgstPaise,
        sgst_paise: sgstPaise,
        igst_paise: igstPaise,
        tax_type: taxType,
        seller_state: sellerState || null,
        customer_state: customerState || null,
        shipping_paise: totalShippingPaise,
        total_paise: totalPaise,
        coupon_code: couponApplied ? couponApplied.code : null,
        discount_paise: discountPaise,
        loyalty_discount_paise: loyaltyDiscountPaise,
        loyalty_points_redeemed: loyaltyPointsApplied,
        referral_discount_paise: referralDiscountPaise,
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
      hsn_code: i.hsn_code || null,
      gst_rate_percent: i.gst_rate_percent,
      line_gst_paise: i.line_gst_paise,
      cgst_paise: i.line_cgst_paise,
      sgst_paise: i.line_sgst_paise,
      igst_paise: i.line_igst_paise,
      line_shipping_paise: i.line_shipping_paise,
    }));
    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;

    order = { ...insertedOrder, order_items: orderItems };
  } else {
    order = {
      id: mock.uid('o'),
      order_number: mock.nextOrderNumber(),
      user_id: userId,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      shipping_address: customer.address,
      subtotal_paise: subtotalPaise,
      gst_paise: gstPaise,
      cgst_paise: cgstPaise,
      sgst_paise: sgstPaise,
      igst_paise: igstPaise,
      tax_type: taxType,
      seller_state: sellerState || null,
      customer_state: customerState || null,
      shipping_paise: totalShippingPaise,
      total_paise: totalPaise,
      coupon_code: couponApplied ? couponApplied.code : null,
      discount_paise: discountPaise,
      loyalty_discount_paise: loyaltyDiscountPaise,
      loyalty_points_redeemed: loyaltyPointsApplied,
      referral_discount_paise: referralDiscountPaise,
      status: 'placed',
      payment_status: 'pending',
      payment_gateway: paymentGateway,
      payment_order_id: null,
      payment_id: null,
      tracking_number: null,
      tracking_url: null,
      courier_name: null,
      refunded_amount_paise: 0,
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
        hsn_code: i.hsn_code || null,
        gst_rate_percent: i.gst_rate_percent,
        line_gst_paise: i.line_gst_paise,
        cgst_paise: i.line_cgst_paise,
        sgst_paise: i.line_sgst_paise,
        igst_paise: i.line_igst_paise,
        line_shipping_paise: i.line_shipping_paise,
      })),
    };
    mock.orders.push(order);
  }

  if (couponApplied) {
    await redeemCoupon(couponApplied.id, { userId, orderId: order.id }).catch(() => {});
  }
  if (loyaltyPointsApplied > 0) {
    await addLoyaltyEntry({
      user_id: userId,
      order_id: order.id,
      points_delta: -loyaltyPointsApplied,
      reason: 'order_redeemed',
    }).catch(() => {});
  }
  // Groove Points are earned only once the order is actually paid (see markOrderPaid),
  // not at creation time — a placed-but-unpaid order shouldn't accrue points.
  await logOrderEvent({ orderId: order.id, eventType: 'status_change', fromValue: null, toValue: 'placed', actor: userId ? 'customer' : 'guest' }).catch(() => {});
  return order;
}

// --- Admin Phase 4: order timeline (order_status_events) ---
// An append-only log of everything that happens to an order, independent of
// its current-state columns (status, tracking_number, ...) — so the admin
// Order Detail page can show real history, not just a snapshot. Written
// automatically by updateOrderStatus/updateOrderTracking/markOrderPaid
// below, plus directly by the refund workflow further down.
async function logOrderEvent({ orderId, eventType, fromValue = null, toValue = null, note = null, actor = null }) {
  const row = {
    order_id: orderId,
    event_type: eventType,
    from_value: fromValue != null ? String(fromValue) : null,
    to_value: toValue != null ? String(toValue) : null,
    note: note || null,
    actor: actor || null,
  };
  if (isConfigured) {
    if (!supabaseAdmin) return null; // best-effort — never block the actual state change on this
    const { data, error } = await supabaseAdmin.from('order_status_events').insert(row).select().single();
    if (error) { console.error('logOrderEvent failed:', error.message); return null; }
    return data;
  }
  const event = { id: mock.uid('evt'), created_at: new Date().toISOString(), ...row };
  mock.orderStatusEvents.push(event);
  return event;
}

async function listOrderEvents(orderId) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Order visibility needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('order_status_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return [...mock.orderStatusEvents]
    .filter((e) => e.order_id === orderId)
    .reverse()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function updateOrderStatus(id, status, actor = null) {
  let order;
  let previousStatus = null;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Updating orders needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data: existing } = await supabaseAdmin.from('orders').select('status').eq('id', id).maybeSingle();
    previousStatus = existing ? existing.status : null;
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    order = data;
  } else {
    order = mock.orders.find((o) => o.id === id);
    if (!order) return null;
    previousStatus = order.status;
    order.status = status;
    order.updated_at = new Date().toISOString();
  }
  if (previousStatus !== status) {
    await logOrderEvent({ orderId: id, eventType: 'status_change', fromValue: previousStatus, toValue: status, actor }).catch(() => {});
  }
  return order;
}

// Adds tracking details when staff mark an order Shipped — a plain
// tracking-number + carrier-link pair (no live courier API in this phase).
async function updateOrderTracking(id, { trackingNumber, trackingUrl, courierName }, actor = null) {
  const patch = {
    tracking_number: trackingNumber || null,
    tracking_url: trackingUrl || null,
    courier_name: courierName || null,
    updated_at: new Date().toISOString(),
  };
  let order;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Updating orders needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('orders').update(patch).eq('id', id).select().single();
    if (error) throw error;
    order = data;
  } else {
    order = mock.orders.find((o) => o.id === id);
    if (!order) return null;
    Object.assign(order, patch);
  }
  if (trackingNumber) {
    await logOrderEvent({ orderId: id, eventType: 'tracking_added', toValue: trackingNumber, note: courierName || null, actor }).catch(() => {});
  }
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
  if (!alreadyPaid) {
    await logOrderEvent({ orderId: id, eventType: 'payment_marked_paid', toValue: paymentGateway || null, note: paymentId || null }).catch(() => {});
  }
  return order;
}

// --- Admin Phase 4: refund / return / cancellation workflow ---
// Invariant: orders.total_paise is NEVER mutated by any function below (or
// anywhere else — no route exists that can PATCH it). A refund instead
// accumulates in its own running total, orders.refunded_amount_paise, so
// "what was charged" and "how much has been refunded back" always stay two
// separately-auditable numbers rather than one value silently edited.

async function listOrderRefunds(orderId) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Order visibility needs SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('order_refunds')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return [...mock.orderRefunds]
    .filter((r) => r.order_id === orderId)
    .reverse()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Creates a refund/return/cancellation request. Defaults to status
// 'requested' — use updateOrderRefundStatus to process or reject it. Admin
// UIs that want a same-click "request and process" flow just call both in
// sequence; that's still two separately-logged, individually-auditable steps.
async function requestOrderRefund({ orderId, type = 'refund', amountPaise, reason, note = null, requestedBy = null }) {
  const order = await getOrder(orderId);
  if (!order) throw new Error('Order not found.');
  const amount = Math.round(Number(amountPaise));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amountPaise must be a positive number.');
  if (!reason) throw new Error('reason is required.');
  const alreadyRefunded = Number(order.refunded_amount_paise) || 0;
  const totalPaise = Number(order.total_paise) || 0;
  if (alreadyRefunded + amount > totalPaise) {
    throw new Error(`That would refund more than the order total (already refunded ₹${(alreadyRefunded / 100).toFixed(2)} of ₹${(totalPaise / 100).toFixed(2)}).`);
  }
  const row = {
    order_id: orderId,
    type: ['refund', 'cancellation', 'return'].includes(type) ? type : 'refund',
    status: 'requested',
    amount_paise: amount,
    reason,
    note: note || null,
    requested_by: requestedBy || null,
    processed_by: null,
    processed_at: null,
  };
  let refund;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('order_refunds').insert(row).select().single();
    if (error) throw error;
    refund = data;
  } else {
    refund = { id: mock.uid('refund'), created_at: new Date().toISOString(), ...row };
    mock.orderRefunds.push(refund);
  }
  await logOrderEvent({ orderId, eventType: 'refund_requested', toValue: `₹${(amount / 100).toFixed(2)}`, note: reason, actor: requestedBy }).catch(() => {});
  return refund;
}

// Moves a refund from 'requested' to 'processed' or 'rejected'. Only
// 'processed' touches the order: it increments refunded_amount_paise by the
// refund's own amount_paise (total_paise itself is never written to).
// Re-processing an already-processed/rejected refund is rejected outright —
// each refund resolves exactly once.
async function updateOrderRefundStatus(refundId, { status, processedBy = null, note = null }) {
  if (!['processed', 'rejected'].includes(status)) throw new Error("status must be 'processed' or 'rejected'.");
  let refund;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('order_refunds').select('*').eq('id', refundId).maybeSingle();
    if (error) throw error;
    refund = data;
  } else {
    refund = mock.orderRefunds.find((r) => r.id === refundId);
  }
  if (!refund) throw new Error('Refund not found.');
  if (refund.status !== 'requested') throw new Error(`This refund was already ${refund.status}.`);

  const patch = {
    status,
    processed_by: processedBy || null,
    processed_at: new Date().toISOString(),
    ...(note ? { note: `${refund.note ? refund.note + ' — ' : ''}${note}` } : {}),
  };
  if (isConfigured) {
    const { data, error } = await supabaseAdmin.from('order_refunds').update(patch).eq('id', refundId).select().single();
    if (error) throw error;
    refund = data;
  } else {
    Object.assign(refund, patch);
  }

  if (status === 'processed') {
    const order = await getOrder(refund.order_id);
    if (order) {
      const newRefundedTotal = (Number(order.refunded_amount_paise) || 0) + Number(refund.amount_paise);
      if (isConfigured) {
        if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
        const { error } = await supabaseAdmin.from('orders').update({ refunded_amount_paise: newRefundedTotal, updated_at: new Date().toISOString() }).eq('id', refund.order_id);
        if (error) throw error;
      } else {
        const mockOrder = mock.orders.find((o) => o.id === refund.order_id);
        if (mockOrder) {
          mockOrder.refunded_amount_paise = newRefundedTotal;
          mockOrder.updated_at = new Date().toISOString();
        }
      }
    }
  }

  await logOrderEvent({
    orderId: refund.order_id,
    eventType: status === 'processed' ? 'refund_processed' : 'refund_rejected',
    toValue: `₹${(Number(refund.amount_paise) / 100).toFixed(2)}`,
    note: note || null,
    actor: processedBy,
  }).catch(() => {});

  return refund;
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
    id: mock.uid('coupon'),
    discount_type: 'percent',
    min_order_paise: 0,
    max_discount_paise: null,
    usage_limit: null,
    times_used: 0,
    is_active: true,
    expires_at: null,
    starts_at: null,
    per_customer_limit: null,
    product_ids: null,
    category_ids: null,
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

// How many times a signed-in customer has already redeemed a given coupon —
// the only way to actually enforce coupons.per_customer_limit (Admin Phase
// 5), since the pre-existing times_used column is a bare global counter
// with no per-customer breakdown. Guest checkouts (no userId) never have a
// per-customer count — see the coupon_redemptions table comment.
async function countCouponRedemptionsForUser(couponId, userId) {
  if (!userId) return 0;
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { count, error } = await client
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', couponId)
      .eq('user_id', userId);
    if (error) throw error;
    return count || 0;
  }
  return mock.couponRedemptions.filter((r) => r.coupon_id === couponId && r.user_id === userId).length;
}

// Sums the GST-inclusive line value of only the cart lines a
// products/categories-restricted coupon actually applies to. pricedItems is
// computeOrderPricing's own already-priced line items (each has
// product_id/category_id/line_total_paise), so this never re-fetches or
// re-derives anything already computed.
function eligibleCouponGoodsPaise(pricedItems, coupon) {
  const productIds = Array.isArray(coupon.product_ids) ? coupon.product_ids : [];
  const categoryIds = Array.isArray(coupon.category_ids) ? coupon.category_ids : [];
  if (!productIds.length && !categoryIds.length) {
    return pricedItems.reduce((sum, i) => sum + i.line_total_paise, 0);
  }
  return pricedItems.reduce((sum, i) => {
    const matches = (i.product_id && productIds.includes(i.product_id)) || (i.category_id && categoryIds.includes(i.category_id));
    return matches ? sum + i.line_total_paise : sum;
  }, 0);
}

// Validates a coupon code server-side against the GST-inclusive goods total
// (never trust a discount amount sent by the client). `pricedItems` (from
// computeOrderPricing) and `userId` are optional — omitting them just skips
// the product/category-restriction and per-customer-limit checks, so
// existing callers that only care about the plain code+amount checks (e.g.
// a bare POST /api/coupons/validate with no cart) keep working. Returns
// { valid: true, coupon, discountPaise } or { valid: false, reason }.
async function validateCoupon(code, goodsPaise, { pricedItems = null, userId = null } = {}) {
  if (!code) return { valid: false, reason: 'No code provided.' };
  const all = await listCoupons();
  const coupon = all.find((c) => c.code.toUpperCase() === String(code).toUpperCase());
  if (!coupon) return { valid: false, reason: 'Coupon code not found.' };
  if (!coupon.is_active) return { valid: false, reason: 'This coupon is no longer active.' };
  if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) return { valid: false, reason: 'This coupon is not active yet.' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return { valid: false, reason: 'This coupon has expired.' };
  if (coupon.usage_limit != null && coupon.times_used >= coupon.usage_limit) return { valid: false, reason: 'This coupon has reached its usage limit.' };
  if (coupon.per_customer_limit != null) {
    if (!userId) return { valid: false, reason: 'Sign in to use this coupon.' };
    const usedByCustomer = await countCouponRedemptionsForUser(coupon.id, userId);
    if (usedByCustomer >= coupon.per_customer_limit) {
      return { valid: false, reason: "You've already used this coupon the maximum number of times." };
    }
  }

  let eligibleGoodsPaise = goodsPaise;
  const hasRestriction = (Array.isArray(coupon.product_ids) && coupon.product_ids.length) || (Array.isArray(coupon.category_ids) && coupon.category_ids.length);
  if (hasRestriction) {
    if (!pricedItems || !pricedItems.length) return { valid: false, reason: 'This coupon only applies to specific products.' };
    eligibleGoodsPaise = eligibleCouponGoodsPaise(pricedItems, coupon);
    if (eligibleGoodsPaise <= 0) return { valid: false, reason: "This coupon doesn't apply to any items in your cart." };
  }

  if (coupon.min_order_paise && goodsPaise < coupon.min_order_paise) {
    return { valid: false, reason: `Minimum order of ₹${(coupon.min_order_paise / 100).toFixed(0)} required for this coupon.` };
  }
  let discountPaise =
    coupon.discount_type === 'percent' ? Math.round((eligibleGoodsPaise * Number(coupon.discount_value)) / 100) : Number(coupon.discount_value);
  if (coupon.max_discount_paise != null) discountPaise = Math.min(discountPaise, coupon.max_discount_paise);
  discountPaise = Math.max(0, Math.min(discountPaise, eligibleGoodsPaise));
  return { valid: true, coupon, discountPaise };
}

// Records a successful coupon use. userId/orderId are optional (a bare
// redemption still increments the global times_used counter), but a
// per-customer-limit coupon can only ever be enforced for redemptions that
// DO carry a userId — see coupon_redemptions' table comment in db/schema.sql.
async function redeemCoupon(id, { userId = null, orderId = null } = {}) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data: current, error: fetchErr } = await supabaseAdmin.from('coupons').select('times_used').eq('id', id).single();
    if (fetchErr) throw fetchErr;
    const { error } = await supabaseAdmin.from('coupons').update({ times_used: (current.times_used || 0) + 1 }).eq('id', id);
    if (error) throw error;
    if (userId) {
      const { error: redemptionError } = await supabaseAdmin.from('coupon_redemptions').insert({ coupon_id: id, user_id: userId, order_id: orderId });
      if (redemptionError) console.error('coupon_redemptions insert failed:', redemptionError.message);
    }
    return true;
  }
  const coupon = mock.coupons.find((c) => c.id === id);
  if (!coupon) return false;
  coupon.times_used = (coupon.times_used || 0) + 1;
  if (userId) {
    mock.couponRedemptions.push({ id: mock.uid('cpnredeem'), coupon_id: id, user_id: userId, order_id: orderId, created_at: new Date().toISOString() });
  }
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
  const slab = { id: mock.uid('ship'), sort_order: mock.shippingRateSlabs.length + 1, ...input };
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

// --- Named shipping classes (Admin Phase 2) — see resolveProductShippingOverridePaise above ---
async function listShippingClasses() {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('shipping_classes').select('*').order('name', { ascending: true });
    if (error) throw error;
    return data;
  }
  return [...mock.shippingClasses];
}

async function getShippingClassById(id) {
  if (!id) return null;
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('shipping_classes').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return mock.shippingClasses.find((c) => c.id === id) || null;
}

async function createShippingClass(input) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('shipping_classes').insert(input).select().single();
    if (error) throw error;
    return data;
  }
  const shippingClass = { id: mock.uid('shipclass'), flat_rate_paise: null, is_active: true, ...input };
  mock.shippingClasses.push(shippingClass);
  return shippingClass;
}

async function updateShippingClass(id, patch) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('shipping_classes').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const shippingClass = mock.shippingClasses.find((c) => c.id === id);
  if (!shippingClass) return null;
  Object.assign(shippingClass, patch);
  return shippingClass;
}

async function deleteShippingClass(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('shipping_classes').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.shippingClasses.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  mock.shippingClasses.splice(idx, 1);
  return true;
}

// Shipping rate slabs can optionally be scoped into a "zone": a list of
// Indian states, a list of pincode prefixes, a min/max order value, and/or
// a min/max chargeable weight (is_active can also switch a slab off without
// deleting it). A slab left blank on all of those still just works as a
// plain weight-based catch-all — the original slab shape from before zones
// existed — so nothing already configured needs to change.
//
// Matching: every condition set on a slab must be satisfied (states/
// pincode_prefixes/min-max order/min-max weight are all AND'd together;
// an empty/unset condition always matches). Among every slab that matches,
// the most specific one wins (pincode-scoped > state-scoped > generic), and
// the cheapest wins among equally specific matches.
async function computeShipping({ totalGrams = 0, orderValuePaise = 0, state = '', pincode = '' } = {}) {
  const slabs = await listShippingRateSlabs();
  const st = (state || '').trim().toLowerCase();
  const pin = (pincode || '').trim();
  const matches = slabs.filter((s) => {
    if (s.is_active === false) return false;
    if (s.min_weight_grams != null && totalGrams < s.min_weight_grams) return false;
    if (s.max_weight_grams != null && totalGrams > s.max_weight_grams) return false;
    if (s.min_order_paise != null && orderValuePaise < s.min_order_paise) return false;
    if (s.max_order_paise != null && orderValuePaise > s.max_order_paise) return false;
    if (Array.isArray(s.states) && s.states.length > 0) {
      if (!st || !s.states.some((x) => String(x).trim().toLowerCase() === st)) return false;
    }
    if (Array.isArray(s.pincode_prefixes) && s.pincode_prefixes.length > 0) {
      if (!pin || !s.pincode_prefixes.some((p) => pin.startsWith(String(p).trim()))) return false;
    }
    return true;
  });
  if (matches.length === 0) return 0;
  const specificity = (s) =>
    (Array.isArray(s.pincode_prefixes) && s.pincode_prefixes.length ? 2 : 0) + (Array.isArray(s.states) && s.states.length ? 1 : 0);
  matches.sort((a, b) => specificity(b) - specificity(a) || Number(a.price_paise) - Number(b.price_paise));
  return Number(matches[0].price_paise) || 0;
}

// Backward-compatible: weight is the only known dimension (e.g. a caller
// that doesn't have a shipping address yet).
async function computeShippingForWeight(totalGrams) {
  return computeShipping({ totalGrams });
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

// Every loyalty_ledger row across every customer, optionally date-ranged —
// unlike listLoyaltyLedger (one customer's history), this is for admin-side
// aggregate reporting (Admin Phase 6), e.g. total referral bonus points
// paid out in a given month. from/to are inclusive 'YYYY-MM-DD' strings.
async function listAllLoyaltyLedger({ from = null, to = null } = {}) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    let query = client.from('loyalty_ledger').select('*').order('created_at', { ascending: false });
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return mock.loyaltyLedger
    .filter((l) => {
      const d = (l.created_at || '').slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function addLoyaltyEntry(entry) {
  let row;
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('loyalty_ledger').insert(entry).select().single();
    if (error) throw error;
    row = data;
  } else {
    row = { id: `loy_${Date.now()}_${Math.round(Math.random() * 1e6)}`, created_at: new Date().toISOString(), ...entry };
    mock.loyaltyLedger.push(row);
  }
  // Email the customer for every CREDIT (order_earned, referral_bonus, or a
  // positive manual_adjustment) — never for a debit (order_redeemed, or a
  // negative manual_adjustment). Fire-and-forget: a notification failure
  // must never roll back or block the points actually being recorded.
  if (row.points_delta > 0) {
    notifyPointsCredited(row).catch((err) => console.error('notifyPointsCredited failed:', err.message));
  }
  return row;
}

// The one lookup this needs (customer email/name by id) reuses listCustomers()
// rather than a second admin.listUsers() call — same pattern already used by
// getReferredFriendsDetail below, since profiles has no email column of its
// own (that lives on auth.users) and this store is small-scale enough that
// re-listing customers per credit is not a real cost.
async function notifyPointsCredited(entry) {
  if (!entry.user_id) return;
  const customers = await listCustomers();
  const customer = customers.find((c) => c.id === entry.user_id);
  if (!customer || !customer.email) return;
  const newBalance = await getLoyaltyBalance(entry.user_id);
  await email.sendPointsCreditedEmail({
    toEmail: customer.email,
    customerName: customer.full_name,
    points: entry.points_delta,
    reason: entry.reason,
    note: entry.note || null,
    newBalance,
  });
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
  // Powers the /about ("Our Story") page's editorial text + timeline —
  // see frontend/about.html. NOT shown on the homepage (the homepage's
  // "Our Philosophy" section is fixed editorial copy on purpose — see the
  // comment in index.html above that section for why it deliberately
  // doesn't read this key). This key used to hold specific, unverified
  // claims (a partner-farm count, a certification claim, named years and
  // headcounts) that were never actually reviewed/approved — removed on
  // 2026-09-09 per the user's explicit call that they were placeholder,
  // not real. `milestones` now starts empty on purpose: add real ones
  // here (Admin -> Homepage Content -> "Our Story section") only once
  // there's something true to say — an empty list is hidden on the page
  // entirely rather than shown with placeholder entries.
  homepage_story: {
    eyebrow: 'Our Story',
    title_line1: 'Rooted in soil,',
    title_line2: 'made the slower way.',
    body: 'We believe good oil shouldn\'t be rushed — pressed in small batches, filtered gently, and packaged to be reused rather than thrown away.',
    milestones: [],
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
    // The state the business is registered/GST-registered in — compared
    // against each order's shipping-address state to decide CGST+SGST
    // (same state = intrastate) vs IGST (different state = interstate).
    // Left blank on purpose (never fabricated) — until an admin fills this
    // in, every order is treated as intrastate (see computeOrderPricing),
    // which matches how a single-state business actually operates.
    seller_state: '',
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
  // FAQ page (/faq) — a real linkable page with an accordion, distinct from
  // the flat legal pages above. Every answer here is derived from behavior
  // that's actually implemented (GST-inclusive pricing, weight-based
  // shipping + free-shipping threshold, Razorpay/COD, Groove Points,
  // returns) — nothing about farm names, certifications, or specific
  // delivery-time promises is invented. Admin-editable like every other
  // page_* key; add/edit/remove items freely from Admin → Content.
  page_faq: {
    title: 'Frequently Asked Questions',
    items: [
      { question: 'How is Groove Organics oil made?', answer: 'Cold-pressed / wood-pressed using the traditional chekku (ghani) method — no heat, no chemical extraction, no refining.' },
      { question: 'What payment methods do you accept?', answer: 'UPI, credit/debit cards, and net banking via Razorpay, plus Cash on Delivery where it’s enabled at checkout.' },
      { question: 'Do your prices include GST?', answer: 'Yes. The price shown is exactly what you pay — GST is included, and the breakup is shown at checkout and on your invoice.' },
      { question: 'How is shipping calculated?', answer: 'Shipping is calculated from your order’s weight and shown before you pay. Orders above the free-shipping threshold (shown at checkout) ship free.' },
      { question: 'What is your return/refund policy?', answer: 'See our Refund & Return Policy page for the full details on damaged, defective, or incorrect items.' },
      { question: 'What are Groove Points?', answer: 'Our loyalty program, where enabled — earn points on paid orders and redeem them for a discount at checkout. Check your balance any time from your account dashboard.' },
      { question: 'Can I track my order?', answer: 'Yes — once your order ships, tracking details (when available) appear on your order confirmation page and in your account’s order history.' },
    ],
  },
  // Admin Phase 7 (Navigation editor). The header's Home link and the
  // icon-cluster items (search/wishlist/account/cart/Deals pill) stay fixed
  // in frontend/js/partials.js — they're functional controls, not plain
  // links, so only the "plain link" set is admin-editable here. These
  // defaults are exactly what's hardcoded today, so nothing visibly changes
  // on the live site until an admin actually edits one from Admin ->
  // Navigation. See partials.js's applyNavContentOverrides() for how this
  // is layered on top of the always-synchronous default render (never
  // blocks or delays the nav's first paint).
  nav_header: {
    links: [
      { label: 'Shop', href: '/shop' },
      { label: 'Our Story', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  // Two footer columns are admin-editable (Shop, Company); the brand blurb
  // and the newsletter signup column stay fixed in partials.js since they
  // carry real functionality (the newsletter form), not just links.
  nav_footer: {
    shop: [
      { label: 'All Oils', href: '/shop' },
      { label: 'Deals', href: '/deals' },
      { label: 'Coming Soon', href: '/shop' },
    ],
    company: [
      { label: 'Our Story', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Refunds', href: '/refund-policy' },
      { label: 'Shipping', href: '/shipping-policy' },
    ],
  },
  // Admin Phase 7 (Homepage Section Builder). Controls the ORDER and
  // VISIBILITY of the homepage sections below the hero (the hero itself
  // always stays first/visible — every real site builder treats the hero as
  // fixed, and hiding it entirely has no sane use case). Each `key` matches
  // a `data-section-key` attribute on that section's <section> element in
  // frontend/index.html — see home-content.js's applyHomepageLayout(). This
  // default order/visibility is exactly what's on the page today, so
  // nothing visibly changes until an admin reorders or hides something from
  // Admin -> Homepage Builder.
  homepage_layout: {
    sections: [
      { key: 'feature_strip', label: 'Feature strip (4 icons)', visible: true },
      { key: 'promo', label: 'Offers & Highlights (promo banners)', visible: true },
      { key: 'philosophy', label: 'Our Philosophy', visible: true },
      { key: 'process_video', label: 'The Journey of the Oil (process video)', visible: true },
      { key: 'products', label: 'Our Oils (product grid)', visible: true },
      { key: 'newsletter', label: 'Newsletter signup', visible: true },
    ],
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

// --- Admin Phase 7: Media Library (backed by Supabase Storage's "media"
// bucket in live mode — see db/schema.sql; kept as a data: URL in-memory
// list in demo mode, since there's no real file storage to upload to). ---

async function listMedia() {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('media').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return [...mock.media].reverse();
}

// dataUrl: a full "data:<mime>;base64,<payload>" string, exactly what the
// admin UI's readFileAsDataUrl() produces from a <input type="file">. Kept
// as the one upload shape across this whole app (products/categories/
// banners already all upload this way) rather than introducing multipart
// form-data just for this one new feature.
function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!match) throw new Error('That file could not be read — please choose an image file and try again.');
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function uploadMedia({ filename, dataUrl, altText = null, uploadedBy = null }) {
  if (!filename || !dataUrl) throw new Error('filename and a file are required.');
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);

  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const { error: uploadError } = await supabaseAdmin.storage.from('media').upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message || 'Upload to storage failed.');
    const { data: publicUrlData } = supabaseAdmin.storage.from('media').getPublicUrl(storagePath);
    const { data, error } = await supabaseAdmin
      .from('media')
      .insert({
        filename: safeName,
        url: publicUrlData.publicUrl,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: buffer.length,
        alt_text: altText,
        uploaded_by: uploadedBy,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const row = {
    id: mock.uid('media'),
    filename: safeName,
    url: dataUrl, // demo mode: the data: URL itself IS the "stored file"
    storage_path: null,
    mime_type: mimeType,
    size_bytes: buffer.length,
    alt_text: altText,
    uploaded_by: uploadedBy,
    created_at: new Date().toISOString(),
  };
  mock.media.push(row);
  return row;
}

async function updateMediaAltText(id, altText) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('media').update({ alt_text: altText }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const item = mock.media.find((m) => m.id === id);
  if (!item) return null;
  item.alt_text = altText;
  return item;
}

async function deleteMedia(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data: existing } = await supabaseAdmin.from('media').select('storage_path').eq('id', id).single();
    if (existing && existing.storage_path) {
      // Best-effort: if the storage object is somehow already gone, still
      // proceed to delete the metadata row rather than leaving an orphaned
      // library entry the admin can't remove.
      await supabaseAdmin.storage.from('media').remove([existing.storage_path]).catch(() => {});
    }
    const { error } = await supabaseAdmin.from('media').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.media.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  mock.media.splice(idx, 1);
  return true;
}

// --- Admin Phase 7: Pages (generic CMS pages, distinct from the 4 fixed
// legal pages which stay in site_content as page_terms/page_privacy/etc). ---

async function listPages({ includeUnpublished = false } = {}) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    let query = client.from('pages').select('*').order('created_at', { ascending: false });
    if (!includeUnpublished) query = query.eq('status', 'published');
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return mock.pages
    .filter((p) => includeUnpublished || p.status === 'published')
    .slice()
    .reverse();
}

async function getPageBySlug(slug, { includeUnpublished = false } = {}) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    let query = client.from('pages').select('*').eq('slug', slug);
    if (!includeUnpublished) query = query.eq('status', 'published');
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  }
  const page = mock.pages.find((p) => p.slug === slug);
  if (!page) return null;
  if (!includeUnpublished && page.status !== 'published') return null;
  return page;
}

async function createPage({ slug, title, body = '', status = 'draft', seoTitle = null, seoMetaDescription = null }) {
  if (!slug || !slug.trim()) throw new Error('A URL slug is required.');
  if (!title || !title.trim()) throw new Error('A title is required.');
  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cleanSlug) throw new Error('That slug is not valid — use letters, numbers, and dashes.');

  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('pages')
      .insert({ slug: cleanSlug, title: title.trim(), body, status, seo_title: seoTitle, seo_meta_description: seoMetaDescription })
      .select()
      .single();
    if (error) {
      if (String(error.message || '').includes('duplicate')) throw new Error('A page with that slug already exists.');
      throw error;
    }
    return data;
  }
  if (mock.pages.some((p) => p.slug === cleanSlug)) throw new Error('A page with that slug already exists.');
  const row = {
    id: mock.uid('page'),
    slug: cleanSlug,
    title: title.trim(),
    body,
    status,
    seo_title: seoTitle,
    seo_meta_description: seoMetaDescription,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  mock.pages.push(row);
  return row;
}

async function updatePage(id, patch) {
  const allowed = {};
  if (patch.slug != null) allowed.slug = String(patch.slug).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (patch.title != null) allowed.title = String(patch.title).trim();
  if (patch.body != null) allowed.body = patch.body;
  if (patch.status != null) allowed.status = patch.status;
  if (patch.seoTitle !== undefined) allowed.seo_title = patch.seoTitle;
  if (patch.seoMetaDescription !== undefined) allowed.seo_meta_description = patch.seoMetaDescription;

  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin
      .from('pages')
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (String(error.message || '').includes('duplicate')) throw new Error('A page with that slug already exists.');
      throw error;
    }
    return data;
  }
  const page = mock.pages.find((p) => p.id === id);
  if (!page) return null;
  if (allowed.slug && mock.pages.some((p) => p.id !== id && p.slug === allowed.slug)) {
    throw new Error('A page with that slug already exists.');
  }
  Object.assign(page, allowed, { updated_at: new Date().toISOString() });
  return page;
}

async function deletePage(id) {
  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { error } = await supabaseAdmin.from('pages').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const idx = mock.pages.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  mock.pages.splice(idx, 1);
  return true;
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
    id: mock.uid('var'),
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

async function getVariantById(id) {
  if (!id) return null;
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('product_variants').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }
  return mock.productVariants.find((v) => v.id === id) || null;
}

// =========================================================================
// Stock-adjustment ledger (Admin Phase 2) — see db/schema.sql's
// stock_adjustments table comment. Two entry points share this one
// function: the dedicated "Adjust stock" admin form (an intentional
// adjustment with a required reason/note) and the plain quick-edit stock
// field in the Products table (auto-logged as reason 'manual_edit' by the
// PATCH /api/products/:id and /api/variants/:id route handlers) — so every
// stock change ends up in the same auditable history no matter which UI
// path made it. Throws rather than allowing stock to go negative.
// =========================================================================
async function recordStockAdjustment({ productId, variantId = null, variantLabel = null, delta, reason, note = null, adjustedBy = null }) {
  if (!productId) throw new Error('productId is required.');
  if (!Number.isFinite(delta) || delta === 0) throw new Error('delta must be a non-zero number.');
  if (!reason) throw new Error('reason is required.');

  let previousStock;
  if (variantId) {
    const variant = await getVariantById(variantId);
    if (!variant) throw new Error('Variant not found.');
    previousStock = Number(variant.stock) || 0;
  } else {
    const product = await getProductById(productId);
    if (!product) throw new Error('Product not found.');
    previousStock = Number(product.stock) || 0;
  }

  const newStock = previousStock + delta;
  if (newStock < 0) {
    throw new Error(`That adjustment would take stock below zero (currently ${previousStock}).`);
  }

  if (variantId) {
    await updateVariant(variantId, { stock: newStock });
  } else {
    await updateProduct(productId, { stock: newStock });
  }

  const row = {
    product_id: productId,
    variant_id: variantId || null,
    variant_label: variantLabel || null,
    delta,
    reason,
    note: note || null,
    previous_stock: previousStock,
    new_stock: newStock,
    adjusted_by: adjustedBy || null,
  };

  if (isConfigured) {
    if (!supabaseAdmin) throw new Error('Admin writes need SUPABASE_SERVICE_ROLE_KEY set.');
    const { data, error } = await supabaseAdmin.from('stock_adjustments').insert(row).select().single();
    if (error) throw error;
    return data;
  }
  const adjustment = { id: mock.uid('stockadj'), created_at: new Date().toISOString(), ...row };
  mock.stockAdjustments.push(adjustment);
  return adjustment;
}

async function listStockAdjustments(productId, { limit = 100 } = {}) {
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('stock_adjustments')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }
  // Demo-mode timestamps are millisecond resolution, so two adjustments made
  // in the same request/test can tie exactly. Reverse to most-recently-
  // pushed-first before the (stable) sort so ties still land newest-first
  // instead of silently falling back to insertion order.
  return [...mock.stockAdjustments]
    .filter((a) => a.product_id === productId)
    .reverse()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}

// =========================================================================
// Admin Phase 6: cross-domain audit log. See db/schema.sql's audit_log
// table comment — this is the catch-all for admin write actions that had
// zero history anywhere before Phase 6 (product/variant/category/coupon/
// shipping-rate/shipping-class writes), plus a lightweight entry for
// actions that already have their own detailed trail elsewhere (stock
// adjustments, order events, customer status), so "everything this admin
// did" is answerable from one place. Best-effort and fire-and-forget in
// spirit (wrapped in .catch(() => {}) by every caller) — a logging failure
// must never block the actual write it's describing.
// =========================================================================
async function logAudit({ actor = null, actorRole = null, action, entityType = null, entityId = null, summary }) {
  const row = {
    actor: actor || null,
    actor_role: actorRole || null,
    action,
    entity_type: entityType,
    entity_id: entityId != null ? String(entityId) : null,
    summary,
  };
  if (isConfigured) {
    if (!supabaseAdmin) return null;
    const { data, error } = await supabaseAdmin.from('audit_log').insert(row).select().single();
    if (error) { console.error('logAudit failed:', error.message); return null; }
    return data;
  }
  const entry = { id: mock.uid('audit'), created_at: new Date().toISOString(), ...row };
  mock.auditLog.push(entry);
  return entry;
}

// from/to are inclusive 'YYYY-MM-DD' strings; entityType/actor optionally
// narrow further. Newest first, capped at `limit`.
async function listAuditLog({ from = null, to = null, entityType = null, actor = null, limit = 200 } = {}) {
  let rows;
  if (isConfigured) {
    const client = supabaseAdmin || supabase;
    let query = client.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);
    if (entityType) query = query.eq('entity_type', entityType);
    if (actor) query = query.eq('actor', actor);
    const { data, error } = await query;
    if (error) throw error;
    rows = data;
  } else {
    rows = [...mock.auditLog]
      .filter((a) => {
        const d = (a.created_at || '').slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (entityType && a.entity_type !== entityType) return false;
        if (actor && a.actor !== actor) return false;
        return true;
      })
      .reverse()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }
  return rows;
}

// =========================================================================
// Admin Phase 6: server-side, date-ranged reports. Previously the whole
// Reports tab pulled every order/product/coupon over the wire on every load
// and computed everything client-side with no way to look at anything but
// "all time" — this is the one place date-filtered aggregate reporting
// happens now, so the admin UI (and any future report consumer) always gets
// numbers computed the same way. from/to are inclusive 'YYYY-MM-DD' strings,
// or null for unbounded on that side (== the old "all time" behavior).
// =========================================================================
async function getReportsSummary({ from = null, to = null } = {}) {
  const inRange = (createdAt) => {
    if (!createdAt) return false;
    const d = String(createdAt).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const allOrders = await listOrders();
  const rangedOrders = from || to ? allOrders.filter((o) => inRange(o.created_at)) : allOrders;
  const paidOrders = rangedOrders.filter((o) => o.payment_status === 'paid');

  const revenuePaise = paidOrders.reduce((sum, o) => sum + (o.total_paise || 0), 0);
  const refundedPaise = rangedOrders.reduce((sum, o) => sum + (o.refunded_amount_paise || 0), 0);
  const orderCount = rangedOrders.length;
  const paidOrderCount = paidOrders.length;
  const aovPaise = paidOrderCount ? Math.round(revenuePaise / paidOrderCount) : 0;

  const ordersByStatus = {};
  rangedOrders.forEach((o) => {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
  });

  const salesByProduct = {};
  paidOrders.forEach((o) => {
    (o.order_items || []).forEach((i) => {
      salesByProduct[i.product_name] = (salesByProduct[i.product_name] || 0) + i.quantity;
    });
  });
  const bestSellers = Object.entries(salesByProduct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, quantity]) => ({ name, quantity }));

  // Coupon usage IN RANGE — computed from the orders themselves
  // (orders.coupon_code + created_at) rather than coupons.times_used (a
  // bare all-time global counter with no date breakdown), so this reflects
  // usage in the selected window for both guest and signed-in orders alike.
  const couponUsageByCode = {};
  rangedOrders.forEach((o) => {
    if (!o.coupon_code) return;
    if (!couponUsageByCode[o.coupon_code]) couponUsageByCode[o.coupon_code] = { code: o.coupon_code, orders: 0, discountPaise: 0 };
    couponUsageByCode[o.coupon_code].orders += 1;
    couponUsageByCode[o.coupon_code].discountPaise += o.discount_paise || 0;
  });
  const couponUsage = Object.values(couponUsageByCode).sort((a, b) => b.orders - a.orders);

  // Inventory — NOT date-ranged (current stock is current stock regardless
  // of the report window), same threshold logic the old client-side Reports
  // tab used (per-product override, else the store-wide default).
  const [products, settings, customers] = await Promise.all([listProducts({ includeInactive: true }), getStoreSettings(), listCustomers()]);
  const defaultLowStockThreshold = settings.low_stock_threshold != null ? settings.low_stock_threshold : 10;
  const lowStock = products
    .filter((p) => !p.is_coming_soon && p.stock <= (p.low_stock_threshold != null ? p.low_stock_threshold : defaultLowStockThreshold))
    .sort((a, b) => a.stock - b.stock)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, threshold: p.low_stock_threshold != null ? p.low_stock_threshold : defaultLowStockThreshold }));

  // Customers IN RANGE — new signups, and top spenders (by paid orders) in
  // the window. Matched by email since guest orders have no user_id.
  const newCustomerCount = customers.filter((c) => c.role === 'customer' && inRange(c.created_at)).length;
  const spendByEmail = {};
  paidOrders.forEach((o) => {
    const key = (o.customer_email || '').toLowerCase();
    if (!key) return;
    spendByEmail[key] = (spendByEmail[key] || 0) + (o.total_paise || 0);
  });
  const topCustomers = Object.entries(spendByEmail)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([email, spendPaise]) => {
      const match = customers.find((c) => (c.email || '').toLowerCase() === email);
      return { email, full_name: match ? match.full_name : null, spendPaise };
    });

  // Referrals IN RANGE — new referred signups, the automatic first-order
  // discount they received (orders.referral_discount_paise), and the Groove
  // Points bonus paid to the REFERRER (loyalty_ledger reason 'referral_bonus').
  const referralSignupCount = customers.filter((c) => c.role === 'customer' && c.referred_by && inRange(c.created_at)).length;
  const referralDiscountPaidPaise = rangedOrders.reduce((sum, o) => sum + (o.referral_discount_paise || 0), 0);
  const ledgerInRange = await listAllLoyaltyLedger({ from, to });
  const referralBonusPointsPaidOut = ledgerInRange.filter((l) => l.reason === 'referral_bonus').reduce((sum, l) => sum + (l.points_delta || 0), 0);
  const pointsEarned = ledgerInRange.filter((l) => l.reason === 'order_earned').reduce((sum, l) => sum + (l.points_delta || 0), 0);
  const pointsRedeemed = ledgerInRange.filter((l) => l.points_delta < 0).reduce((sum, l) => sum - l.points_delta, 0);

  return {
    rangeFrom: from,
    rangeTo: to,
    revenuePaise,
    refundedPaise,
    orderCount,
    paidOrderCount,
    aovPaise,
    ordersByStatus,
    bestSellers,
    couponUsage,
    lowStock,
    newCustomerCount,
    topCustomers,
    referralSignupCount,
    referralDiscountPaidPaise,
    referralBonusPointsPaidOut,
    pointsEarned,
    pointsRedeemed,
  };
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
  computeOrderPricing,
  chargeableWeightGrams,
  pooledChargeableGrams,
  updateOrderStatus,
  updateOrderTracking,
  attachPaymentOrderId,
  getOrderByPaymentOrderId,
  markOrderPaid,
  logOrderEvent,
  listOrderEvents,
  listOrderRefunds,
  requestOrderRefund,
  updateOrderRefundStatus,
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
  listMedia,
  uploadMedia,
  updateMediaAltText,
  deleteMedia,
  listPages,
  getPageBySlug,
  createPage,
  updatePage,
  deletePage,
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  getVariantById,
  recordStockAdjustment,
  listStockAdjustments,
  logAudit,
  listAuditLog,
  listAllLoyaltyLedger,
  getReportsSummary,
  getStoreSettings,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  redeemCoupon,
  countCouponRedemptionsForUser,
  listShippingRateSlabs,
  createShippingRateSlab,
  updateShippingRateSlab,
  deleteShippingRateSlab,
  listShippingClasses,
  getShippingClassById,
  createShippingClass,
  updateShippingClass,
  deleteShippingClass,
  resolveProductShippingOverridePaise,
  computeShipping,
  computeShippingForWeight,
  listLoyaltyLedger,
  getLoyaltyBalance,
  addLoyaltyEntry,
  earnLoyaltyPoints,
  previewLoyaltyRedemption,
  redeemLoyaltyPoints,
  listCustomers,
  setCustomerActive,
  getProfile,
  getOrCreateReferralCode,
  hasExistingOrders,
  awardReferralBonus,
  getReferralStats,
  getReferredFriendsDetail,
};
