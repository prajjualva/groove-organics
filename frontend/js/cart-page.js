function removeCartStickyCta() {
  document.getElementById('cart-sticky-cta')?.remove();
  document.body.classList.remove('has-sticky-cta');
}

function mountCartStickyCta(totalPaise) {
  let bar = document.getElementById('cart-sticky-cta');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'sticky-cta';
    bar.id = 'cart-sticky-cta';
    bar.innerHTML = `
      <span class="sticky-cta__price" id="cart-sticky-total"></span>
      <a href="/checkout" class="btn btn--primary">Checkout</a>
    `;
    document.body.appendChild(bar);
    document.body.classList.add('has-sticky-cta');
  }
  document.getElementById('cart-sticky-total').textContent = formatRupees(totalPaise);
}

async function renderCartPage() {
  const items = getCart();
  const itemsWrap = document.getElementById('cart-items');
  const summaryWrap = document.getElementById('cart-summary');

  if (!items.length) {
    itemsWrap.innerHTML = `<div class="empty-state">Your cart is empty. <a href="/shop" style="text-decoration:underline;">Browse the shop</a>.</div>`;
    summaryWrap.innerHTML = '';
    removeCartStickyCta();
    return;
  }

  itemsWrap.innerHTML = items
    .map(
      (item) => `
      <div class="flex-between" style="padding:16px 0;border-bottom:1px solid var(--sand-300);" data-row="${item.product_id}" data-variant-row="${item.variant_id || ''}">
        <div>
          <h3 style="margin-bottom:4px;">${item.name}${item.variant_label ? ` <span style="font-weight:400;font-size:0.85rem;color:var(--moss-700);">(${item.variant_label})</span>` : ''}</h3>
          <span class="mono" style="font-size:0.85rem;color:var(--moss-700);">${formatRupees(item.unit_price_paise)} each</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px;">
          <input type="number" min="1" value="${item.quantity}" data-qty="${item.product_id}" data-qty-variant="${item.variant_id || ''}" style="width:64px;min-height:44px;padding:8px;border-radius:8px;border:1px solid var(--sand-300);" />
          <span class="mono" style="min-width:90px;text-align:right;">${formatRupees(item.unit_price_paise * item.quantity)}</span>
          <button class="btn btn--outline btn--sm" data-remove="${item.product_id}" data-remove-variant="${item.variant_id || ''}">Remove</button>
        </div>
      </div>`
    )
    .join('');

  // Mirrors the backend's per-product GST/shipping math (see cart.js's
  // cartEstimate) so this estimate matches what checkout actually charges.
  let defaultGstRatePercent = 5;
  try {
    const status = await api('/api/status', { auth: false });
    defaultGstRatePercent = status.defaultGstRatePercent ?? 5;
  } catch {
    // fall back to the 5% default if the status endpoint is unreachable
  }
  const { subtotal, gst, shipping, total } = await cartEstimate(defaultGstRatePercent);

  summaryWrap.innerHTML = `
    <h3 class="mt-0">Order Summary</h3>
    <div class="flex-between"><span>Subtotal <span style="font-size:0.75rem;color:var(--moss-700);">(before GST)</span></span><span class="mono">${formatRupees(subtotal)}</span></div>
    <div class="flex-between"><span>GST (incl. in price, est.)</span><span class="mono">${formatRupees(gst)}</span></div>
    <div class="flex-between"><span>Shipping (est.)</span><span class="mono">${shipping > 0 ? formatRupees(shipping) : 'Free'}</span></div>
    <hr style="border:none;border-top:1px solid var(--sand-300);margin:16px 0;" />
    <div class="flex-between" style="font-weight:700;font-size:1.1rem;"><span>Estimated Total</span><span class="mono">${formatRupees(total)}</span></div>
    <a href="/checkout" class="btn btn--primary" style="width:100%;margin-top:20px;">Proceed to Checkout</a>
  `;
  mountCartStickyCta(total);

  itemsWrap.querySelectorAll('[data-qty]').forEach((input) => {
    input.addEventListener('change', () => {
      const qty = Math.max(1, parseInt(input.value, 10) || 1);
      setCartQuantity(input.getAttribute('data-qty'), qty, input.getAttribute('data-qty-variant') || null);
      renderCartPage();
    });
  });
  itemsWrap.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeFromCart(btn.getAttribute('data-remove'), btn.getAttribute('data-remove-variant') || null);
      renderCartPage();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderSiteChrome('');
  renderCartPage();
});
