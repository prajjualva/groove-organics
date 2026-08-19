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

// Pre-checkout estimate — mirrors the backend's per-product GST rate /
// shipping charge math (see dataStore.js's priceOrderItems) so what the
// shopper sees on the cart/checkout page matches what they're actually
// charged. `defaultGstRatePercent` comes from GET /api/status for any item
// that doesn't carry its own rate (e.g. products added to the cart before
// this feature shipped).
function cartEstimate(defaultGstRatePercent = 5) {
  const items = getCart();
  let subtotal = 0;
  let gst = 0;
  let shipping = 0;
  items.forEach((i) => {
    const lineSubtotal = i.unit_price_paise * i.quantity;
    const rate = i.gst_rate_percent != null ? i.gst_rate_percent : defaultGstRatePercent;
    subtotal += lineSubtotal;
    gst += Math.round((lineSubtotal * rate) / 100);
    shipping += (i.shipping_charge_paise || 0) * i.quantity;
  });
  return { subtotal, gst, shipping, total: subtotal + gst + shipping };
}
