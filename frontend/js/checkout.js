let CHECKOUT_DEFAULT_GST = 5;

function currentPaymentMethod() {
  const checked = document.querySelector('input[name="payment-method"]:checked');
  return checked ? checked.value : 'online';
}

async function renderCheckoutSummary() {
  const items = getCart();
  const wrap = document.getElementById('checkout-summary');
  const couponCode = document.getElementById('coupon-code')?.value.trim().toUpperCase() || null;
  const paymentMethod = currentPaymentMethod();
  const { subtotal, gst, shipping, discount, couponError, total } = await cartEstimate(CHECKOUT_DEFAULT_GST, { couponCode, paymentMethod });

  const couponNote = document.getElementById('coupon-note');
  if (couponCode) {
    couponNote.style.display = 'block';
    couponNote.textContent = couponError ? couponError : `Coupon applied: −${formatRupees(discount)}`;
    couponNote.style.color = couponError ? '' : 'var(--moss-700)';
  } else {
    couponNote.style.display = 'none';
  }

  wrap.innerHTML = `
    <h3 class="mt-0">Order Summary</h3>
    ${items
      .map(
        (i) => `<div class="flex-between" style="font-size:0.9rem;"><span>${i.name}${i.variant_label ? ` (${i.variant_label})` : ''} × ${i.quantity}</span><span class="mono">${formatRupees(i.unit_price_paise * i.quantity)}</span></div>`
      )
      .join('')}
    <hr style="border:none;border-top:1px solid var(--sand-300);margin:16px 0;" />
    <div class="flex-between"><span>Subtotal <span style="font-size:0.75rem;color:var(--moss-700);">(before GST)</span></span><span class="mono">${formatRupees(subtotal)}</span></div>
    <div class="flex-between"><span>GST (incl. in price, est.)</span><span class="mono">${formatRupees(gst)}</span></div>
    <div class="flex-between"><span>Shipping (est.)</span><span class="mono">${shipping > 0 ? formatRupees(shipping) : 'Free'}</span></div>
    ${discount ? `<div class="flex-between"><span>Coupon discount</span><span class="mono">−${formatRupees(discount)}</span></div>` : ''}
    <div class="flex-between" style="font-weight:700;"><span>Total</span><span class="mono">${formatRupees(total)}</span></div>
  `;
}

async function loadPaymentModeNote() {
  try {
    const status = await api('/api/status', { auth: false });
    CHECKOUT_DEFAULT_GST = status.defaultGstRatePercent ?? 5;
    const note = document.getElementById('payment-mode-note');
    if (!status.razorpayConfigured) {
      note.style.display = 'block';
      note.textContent =
        'Payments are in demo mode — no real gateway is connected yet, so placing an order here simulates a successful payment. Add Razorpay keys in backend/.env to accept real payments.';
    }
  } catch {
    // status endpoint unreachable — leave note hidden, form will surface errors on submit
  }
  let loyaltyEnabled = false;
  try {
    const { content } = await api('/api/content', { auth: false });
    const codEnabled = content.store_settings?.cod_enabled;
    const codLabel = document.getElementById('cod-choice-label');
    if (!codEnabled && codLabel) codLabel.style.display = 'none';
    loyaltyEnabled = Boolean(content.store_settings?.loyalty_points_enabled);
  } catch {
    // leave COD option visible if this fails — the backend still enforces cod_enabled server-side
  }

  if (loyaltyEnabled && getAuthToken()) {
    try {
      const { balance } = await api('/api/loyalty/balance');
      if (balance > 0) {
        document.getElementById('loyalty-points-section').style.display = 'block';
        document.getElementById('loyalty-balance-note').textContent = `You have ${balance} Groove Points available.`;
      }
    } catch {
      // not logged in as a customer, or the call failed — leave the section hidden
    }
  }
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const items = getCart();
  const errorEl = document.getElementById('checkout-error');
  const payBtn = document.getElementById('pay-btn');
  errorEl.style.display = 'none';

  if (!items.length) {
    errorEl.textContent = 'Your cart is empty.';
    errorEl.style.display = 'block';
    return;
  }

  const paymentMethod = currentPaymentMethod();
  const couponCode = document.getElementById('coupon-code').value.trim().toUpperCase() || null;
  const redeemPoints = parseInt(document.getElementById('loyalty-redeem')?.value, 10) || 0;

  const customer = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    paymentMethod,
    address: {
      line1: document.getElementById('line1').value,
      line2: document.getElementById('line2').value,
      city: document.getElementById('city').value,
      state: document.getElementById('state').value,
      pincode: document.getElementById('pincode').value,
    },
  };

  payBtn.disabled = true;
  payBtn.textContent = 'Placing order…';

  try {
    // auth left at its default (true): if the shopper is logged in, their
    // token is attached automatically so the order links to their account;
    // guest checkout still works fine with no token present.
    const { order } = await api('/api/orders', {
      method: 'POST',
      body: {
        customer,
        couponCode,
        redeemPoints,
        items: items.map((i) => ({
          product_id: i.product_id,
          name: i.name,
          variant_id: i.variant_id || null,
          variant_label: i.variant_label || null,
          unit_price_paise: i.unit_price_paise,
          quantity: i.quantity,
        })),
      },
    });

    if (paymentMethod === 'cod') {
      // COD orders never touch Razorpay — they're "placed" and awaiting
      // delivery-time payment, which staff mark from the Orders tab.
      clearCart();
      window.location.href = `/order-confirmation?orderId=${order.id}`;
      return;
    }

    const paymentInit = await api('/api/payments/create-order', {
      method: 'POST',
      auth: false,
      body: { orderId: order.id },
    });

    if (paymentInit.mode === 'demo') {
      // No real gateway configured yet — confirm immediately so the flow can be tested end to end.
      await api('/api/payments/confirm', {
        method: 'POST',
        auth: false,
        body: { orderId: order.id, razorpay_order_id: paymentInit.razorpayOrderId },
      });
      clearCart();
      window.location.href = `/order-confirmation?orderId=${order.id}`;
      return;
    }

    // Live mode: hand off to Razorpay's checkout widget (razorpay-checkout.js
    // is loaded from checkout.js only when a real key is present — see below).
    openRazorpayCheckout(paymentInit, order, customer);
  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong placing your order.';
    errorEl.style.display = 'block';
    payBtn.disabled = false;
    payBtn.textContent = 'Place Order & Pay';
  }
}

function openRazorpayCheckout(paymentInit, order, customer) {
  if (typeof Razorpay === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => launchRazorpay(paymentInit, order, customer);
    document.body.appendChild(script);
  } else {
    launchRazorpay(paymentInit, order, customer);
  }
}

function launchRazorpay(paymentInit, order, customer) {
  const rzp = new Razorpay({
    key: paymentInit.keyId,
    amount: paymentInit.amountPaise,
    currency: paymentInit.currency,
    name: 'Groove Organics',
    description: `Order ${order.order_number}`,
    order_id: paymentInit.razorpayOrderId,
    prefill: { name: customer.name, email: customer.email, contact: customer.phone },
    theme: { color: '#33422B' },
    handler: async (response) => {
      await api('/api/payments/confirm', {
        method: 'POST',
        auth: false,
        body: { orderId: order.id, ...response },
      });
      clearCart();
      window.location.href = `/order-confirmation?orderId=${order.id}`;
    },
  });
  rzp.open();
}

document.addEventListener('DOMContentLoaded', async () => {
  renderNav('');
  renderFooter();
  await loadPaymentModeNote();
  renderCheckoutSummary();
  document.getElementById('checkout-form').addEventListener('submit', handleCheckoutSubmit);
  document.getElementById('apply-coupon-btn').addEventListener('click', renderCheckoutSummary);
  document.querySelectorAll('input[name="payment-method"]').forEach((el) => el.addEventListener('change', renderCheckoutSummary));
});
