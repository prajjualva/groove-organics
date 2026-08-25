// Cart persisted in localStorage so it survives refreshes/tab closes —
// standard for a real storefront (this is a live website, not a preview
// sandbox, so localStorage is the right tool here).

const CART_KEY = 'groove_cart_v1';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

// `variant` is optional — { id, label, price_paise } — for products that
// vary by size/color. Two lines for the same product but different
// variants are kept separate (e.g. "500ml / Green" vs "1L / Green").
function addToCart(product, quantity = 1, variant = null) {
  const items = getCart();
  const variantId = variant ? variant.id : null;
  const existing = items.find((i) => i.product_id === product.id && (i.variant_id || null) === variantId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      variant_id: variantId,
      variant_label: variant ? variant.label : null,
      unit_price_paise: variant ? variant.price_paise : product.price_paise,
      // Carried along purely so the cart/checkout pages can show an accurate
      // GST + shipping estimate before placing the order — the backend
      // re-looks-up the authoritative rate/charge from the product record
      // itself when the order is actually created, so this can't be spoofed
      // into a real discount.
      gst_rate_percent: product.gst_rate_percent != null ? product.gst_rate_percent : null,
      shipping_charge_paise: product.shipping_charge_paise || 0,
      // Weight (falls back to the parent product's weight if the variant
      // doesn't have its own) — used only for a pre-checkout shipping
      // estimate; the backend always recalculates the real amount.
      weight_grams: (variant && variant.weight_grams != null ? variant.weight_grams : null) ?? product.weight_grams ?? 0,
      quantity,
    });
  }
  saveCart(items);
}

function removeFromCart(productId, variantId = null) {
  saveCart(getCart().filter((i) => !(i.product_id === productId && (i.variant_id || null) === (variantId || null))));
}

function setCartQuantity(productId, quantity, variantId = null) {
  const items = getCart();
  const item = items.find((i) => i.product_id === productId && (i.variant_id || null) === (variantId || null));
  if (!item) return;
  if (quantity <= 0) {
    saveCart(items.filter((i) => i !== item));
  } else {
    item.quantity = quantity;
    saveCart(items);
  }
}

function clearCart() {
  saveCart([]);
}

function cartSubtotalPaise() {
  return getCart().reduce((sum, i) => sum + i.unit_price_paise * i.quantity, 0);
}

// Pre-checkout estimate — mirrors the backend's GST-inclusive pricing +
// weight-based shipping + coupon math (see dataStore.js's priceOrderItems /
// createOrder) so what the shopper sees on the cart/checkout page is close
// to what they're actually charged. The backend always recalculates the
// authoritative numbers itself when the order is created — this is only
// ever a preview. `defaultGstRatePercent` comes from GET /api/status for
// any item that doesn't carry its own rate. `couponCode` and
// `paymentMethod` ('cod' | 'online') are optional.
async function cartEstimate(defaultGstRatePercent = 5, { couponCode = null, paymentMethod = 'online' } = {}) {
  const items = getCart();
  let inclusiveGoods = 0; // sum of what the customer pays for products, GST included
  let base = 0; // GST-inclusive price with tax extracted out
  let gst = 0;
  let manualShipping = 0;
  let pooledGrams = 0;
  items.forEach((i) => {
    const lineInclusive = i.unit_price_paise * i.quantity;
    const rate = i.gst_rate_percent != null ? i.gst_rate_percent : defaultGstRatePercent;
    const lineBase = Math.round((lineInclusive * 100) / (100 + rate));
    inclusiveGoods += lineInclusive;
    base += lineBase;
    gst += lineInclusive - lineBase;
    if (i.shipping_charge_paise) {
      manualShipping += i.shipping_charge_paise * i.quantity;
    } else if (i.weight_grams) {
      pooledGrams += i.weight_grams * i.quantity;
    }
  });

  let settings = {};
  let weightShipping = 0;
  let discount = 0;
  let couponError = null;
  try {
    const [settingsRes, shippingRes, couponRes] = await Promise.all([
      api('/api/content', { auth: false }).then((r) => r.content.store_settings || {}),
      pooledGrams > 0
        ? api('/api/shipping/estimate', { method: 'POST', auth: false, body: { totalGrams: pooledGrams } }).then((r) => r.pricePaise || 0)
        : Promise.resolve(0),
      couponCode
        ? api('/api/coupons/validate', { method: 'POST', auth: false, body: { code: couponCode, goodsPaise: inclusiveGoods } })
        : Promise.resolve(null),
    ]);
    settings = settingsRes;
    weightShipping = shippingRes;
    if (couponRes) {
      if (couponRes.valid) discount = couponRes.discountPaise;
      else couponError = couponRes.reason;
    }
  } catch {
    // Estimate-only — if any of these calls fail, fall back to zero for that part.
  }

  let shipping = manualShipping + weightShipping;
  if (paymentMethod === 'cod') shipping += Number(settings.cod_extra_charge_paise) || 0;
  const threshold = settings.free_shipping_threshold_paise;
  if (threshold != null && threshold > 0 && inclusiveGoods - discount >= threshold) shipping = 0;

  const total = base + gst + shipping - discount;
  return { subtotal: base, gst, shipping, discount, couponError, total };
}
