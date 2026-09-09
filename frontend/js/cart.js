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

// Pre-checkout estimate. Does NOT compute GST/shipping/coupon/points math
// itself — that math lives in exactly one place, server-side
// (backend/lib/dataStore.js's computeOrderPricing), and this just calls it
// via POST /api/orders/estimate so what the shopper sees on the cart/
// checkout page is guaranteed to match what placing the order actually
// charges (same function store.createOrder uses). `defaultGstRatePercent`
// is accepted for backward compatibility with existing callers but is no
// longer used here — the server already knows its own default rate.
// `shippingAddress` ({ state, pincode, ... }) is optional — pass it once
// known (checkout has it, the cart page usually doesn't yet) so shipping-
// zone rules and the CGST/SGST-vs-IGST split are already accurate before
// the order is placed; without it the server assumes intrastate, matching
// what a single-state store would charge anyway.
async function cartEstimate(
  defaultGstRatePercent = 5,
  { couponCode = null, paymentMethod = 'online', redeemPoints = 0, shippingAddress = null } = {}
) {
  const items = getCart();
  if (!items.length) {
    return { subtotal: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, shipping: 0, discount: 0, couponError: null, loyaltyDiscountPaise: 0, loyaltyPointsApplied: 0, total: 0, isIntrastate: true };
  }

  try {
    const pricing = await api('/api/orders/estimate', {
      method: 'POST',
      body: {
        items: items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id || null,
          unit_price_paise: i.unit_price_paise,
          quantity: i.quantity,
        })),
        customer: { address: shippingAddress || undefined, paymentMethod },
        couponCode,
        redeemPoints,
      },
    });
    return {
      subtotal: pricing.subtotalPaise,
      gst: pricing.gstPaise,
      cgst: pricing.cgstPaise,
      sgst: pricing.sgstPaise,
      igst: pricing.igstPaise,
      shipping: pricing.shippingPaise,
      // `discount` is the coupon-only portion (kept separate from
      // loyaltyDiscountPaise/referralDiscountPaise below, which existing
      // callers already render as their own line items) — the TOTAL
      // discount actually subtracted from `total` below is always
      // discount + loyaltyDiscountPaise + referralDiscountPaise, computed
      // once, server-side, inside pricing.totalPaise.
      discount: pricing.couponDiscountPaise,
      couponError: pricing.couponError,
      loyaltyDiscountPaise: pricing.loyaltyDiscountPaise,
      loyaltyPointsApplied: pricing.loyaltyPointsApplied,
      referralDiscountPaise: pricing.referralDiscountPaise,
      isIntrastate: pricing.isIntrastate,
      total: pricing.totalPaise,
    };
  } catch {
    // Estimate-only endpoint unreachable — fall back to a rough client-side
    // number (GST-inclusive prices, tax simply not broken out, no shipping/
    // coupon/points) so the page still shows *something* rather than
    // breaking entirely. The real order creation still always recalculates
    // authoritatively server-side regardless of what happens here.
    const subtotal = items.reduce((sum, i) => sum + i.unit_price_paise * i.quantity, 0);
    return { subtotal, gst: 0, cgst: 0, sgst: 0, igst: 0, shipping: 0, discount: 0, couponError: null, loyaltyDiscountPaise: 0, loyaltyPointsApplied: 0, total: subtotal, isIntrastate: true };
  }
}
