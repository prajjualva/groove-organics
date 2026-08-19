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
