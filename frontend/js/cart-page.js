function renderCartPage() {
  const items = getCart();
  const itemsWrap = document.getElementById('cart-items');
  const summaryWrap = document.getElementById('cart-summary');

  if (!items.length) {
    itemsWrap.innerHTML = `<div class="empty-state">Your cart is empty. <a href="/shop" style="text-decoration:underline;">Browse the shop</a>.</div>`;
    summaryWrap.innerHTML = '';
    return;
  }

  itemsWrap.innerHTML = items
    .map(
      (item) => `
      <div class="flex-between" style="padding:16px 0;border-bottom:1px solid var(--sand-300);" data-row="${item.product_id}">
        <div>
          <h3 style="margin-bottom:4px;">${item.name}</h3>
          <span class="mono" style="font-size:0.85rem;color:var(--moss-700);">${formatRupees(item.unit_price_paise)} each</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px;">
          <input type="number" min="1" value="${item.quantity}" data-qty="${item.product_id}" style="width:64px;padding:8px;border-radius:8px;border:1px solid var(--sand-300);" />
          <span class="mono" style="min-width:90px;text-align:right;">${formatRupees(item.unit_price_paise * item.quantity)}</span>
          <button class="btn btn--outline btn--sm" data-remove="${item.product_id}">Remove</button>
        </div>
      </div>`
    )
    .join('');

  const subtotal = cartSubtotalPaise();
  const gstRate = 5; // display estimate; backend computes the authoritative figure at checkout
  const gst = Math.round((subtotal * gstRate) / 100);

  summaryWrap.innerHTML = `
    <h3 class="mt-0">Order Summary</h3>
    <div class="flex-between"><span>Subtotal</span><span class="mono">${formatRupees(subtotal)}</span></div>
    <div class="flex-between"><span>GST (est. ${gstRate}%)</span><span class="mono">${formatRupees(gst)}</span></div>
    <div class="flex-between"><span>Shipping</span><span class="mono">Calculated at checkout</span></div>
    <hr style="border:none;border-top:1px solid var(--sand-300);margin:16px 0;" />
    <div class="flex-between" style="font-weight:700;font-size:1.1rem;"><span>Estimated Total</span><span class="mono">${formatRupees(subtotal + gst)}</span></div>
    <a href="/checkout" class="btn btn--primary" style="width:100%;margin-top:20px;">Proceed to Checkout</a>
  `;

  itemsWrap.querySelectorAll('[data-qty]').forEach((input) => {
    input.addEventListener('change', () => {
      const qty = Math.max(1, parseInt(input.value, 10) || 1);
      setCartQuantity(input.getAttribute('data-qty'), qty);
      renderCartPage();
    });
  });
  itemsWrap.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeFromCart(btn.getAttribute('data-remove'));
      renderCartPage();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav('');
  renderFooter();
  renderCartPage();
});
