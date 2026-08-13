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

function addToCart(product, quantity = 1) {
  const items = getCart();
  const existing = items.find((i) => i.product_id === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      unit_price_paise: product.price_paise,
      quantity,
    });
  }
  saveCart(items);
}

function removeFromCart(productId) {
  saveCart(getCart().filter((i) => i.product_id !== productId));
}

function setCartQuantity(productId, quantity) {
  const items = getCart();
  const item = items.find((i) => i.product_id === productId);
  if (!item) return;
  if (quantity <= 0) {
    saveCart(items.filter((i) => i.product_id !== productId));
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
