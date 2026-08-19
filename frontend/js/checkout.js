function renderCheckoutSummary() {
  const items = getCart();
  const wrap = document.getElementById('checkout-summary');
  const subtotal = cartSubtotalPaise();
  const gstRate = 5;
  const gst = Math.round((subtotal * gstRate) / 100);
  wrap.innerHTML = `
    <h3 class="mt-0">Order Summary</h3>
    ${items
      .map(
        (i) => `<div class="flex-between" style="font-size:0.9rem;"><span>${i.name} × ${i.quantity}</span><span class="mono">${formatRupees(i.unit_price_paise * i.quantity)}</span></div>`
      )
      .join('')}
    <hr style="border:none;border-top:1px solid var(--sand-300);margin:16px 0;" />
    <div class="flex-between"><span>Subtotal</span><span class="mono">${formatRupees(subtotal)}</span></div>
    <div class="flex-between"><span>GST (est. ${gstRate}%)</span><span class="mono">${formatRupees(gst)}</span></div>
    <div class="flex-between" style="font-weight:700;"><span>Total</span><span class="mono">${formatRupees(subtotal + gst)}</span></div>
  `;
}

async function loadPaymentModeNote() {
  try {
    const status = await api('/api/status', { auth: false });
    const note = document.getElementById('payment-mode-note');
    if (!status.razorpayConfigured) {
      note.style.display = 'block';
      note.textContent =
        'Payments are in demo mode — no real gateway is connected yet, so placing an order here simulates a successful payment. Add Razorpay keys in backend/.env to accept real payments.';
    }
  } catch {
    // status endpoint unreachable — leave note hidden, form will surface errors on submit
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

  const customer = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
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
        items: items.map((i) => ({
          product_id: i.product_id,
          name: i.name,
          unit_price_paise: i.unit_price_paise,
          quantity: i.quantity,
        })),
      },
    });

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

document.addEventListener('DOMContentLoaded', () => {
  renderNav('');
  renderFooter();
  renderCheckoutSummary();
  loadPaymentModeNote();
  document.getElementById('checkout-form').addEventListener('submit', handleCheckoutSubmit);
});
