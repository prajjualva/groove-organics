let CHECKOUT_DEFAULT_GST = 5;
let CHECKOUT_ADDRESSES = [];

function currentPaymentMethod() {
  const checked = document.querySelector('input[name="payment-method"]:checked');
  return checked ? checked.value : 'online';
}

function fillAddressFields(addr) {
  document.getElementById('line1').value = addr.line1 || '';
  document.getElementById('line2').value = addr.line2 || '';
  document.getElementById('city').value = addr.city || '';
  document.getElementById('state').value = addr.state || '';
  document.getElementById('pincode').value = addr.pincode || '';
  if (addr.full_name) document.getElementById('name').value = addr.full_name;
  if (addr.phone) document.getElementById('phone').value = addr.phone;
}

// Backend already supports saved addresses (GET/POST /api/customer/addresses)
// and a profile lookup (GET /api/auth/me) — this was previously pure
// frontend work: fetch both for a logged-in shopper, offer a one-click
// picker for any saved address, and autofill name/email from the account
// even with zero saved addresses yet. Guests (not logged in) see the plain
// form exactly as before — nothing here requires an account.
async function loadAddressPickerAndAutofill() {
  if (!getAuthToken()) return;

  try {
    const { user } = await api('/api/auth/me');
    if (user.full_name) document.getElementById('name').value = user.full_name;
    if (user.email) document.getElementById('email').value = user.email;
  } catch {
    // not signed in / token stale — leave fields blank, guest checkout still works
    return;
  }

  const saveLabel = document.getElementById('save-address-label');
  if (saveLabel) saveLabel.style.display = 'flex';

  try {
    const { addresses } = await api('/api/customer/addresses');
    CHECKOUT_ADDRESSES = addresses || [];
  } catch {
    CHECKOUT_ADDRESSES = [];
  }

  const wrap = document.getElementById('address-picker-wrap');
  if (!wrap || !CHECKOUT_ADDRESSES.length) return;

  const defaultAddr = CHECKOUT_ADDRESSES.find((a) => a.is_default) || CHECKOUT_ADDRESSES[0];
  wrap.innerHTML = `
    <div class="address-picker">
      ${CHECKOUT_ADDRESSES.map(
        (a, i) => `
        <div class="address-card${a.id === defaultAddr.id ? ' selected' : ''}" data-address-id="${a.id}" role="button" tabindex="0">
          <span class="address-card__label">${a.label || 'Address'}${a.is_default ? ' · Default' : ''}</span>
          <strong>${a.full_name}</strong>
          ${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}, ${a.state} ${a.pincode}
        </div>`
      ).join('')}
      <div class="address-card" data-address-id="new" role="button" tabindex="0">
        <strong>+ Use a new address</strong>
      </div>
    </div>
  `;
  wrap.querySelectorAll('[data-address-id]').forEach((card) => {
    const select = () => {
      wrap.querySelectorAll('[data-address-id]').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const id = card.getAttribute('data-address-id');
      if (id === 'new') return;
      const addr = CHECKOUT_ADDRESSES.find((a) => a.id === id);
      if (addr) fillAddressFields(addr);
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
  });
  // Autofill from the default address immediately so the form isn't blank
  // even before the shopper interacts with the picker.
  fillAddressFields(defaultAddr);
}

function currentCheckoutAddress() {
  const state = document.getElementById('state')?.value.trim() || '';
  const pincode = document.getElementById('pincode')?.value.trim() || '';
  if (!state && !pincode) return null;
  return { state, pincode, city: document.getElementById('city')?.value.trim() || '' };
}

async function renderCheckoutSummary() {
  const items = getCart();
  const wrap = document.getElementById('checkout-summary');
  const couponCode = document.getElementById('coupon-code')?.value.trim().toUpperCase() || null;
  const paymentMethod = currentPaymentMethod();
  const redeemPoints = parseInt(document.getElementById('loyalty-redeem')?.value, 10) || 0;
  const { subtotal, gst, cgst, sgst, igst, shipping, discount, couponError, loyaltyDiscountPaise, loyaltyPointsApplied, referralDiscountPaise, total } =
    await cartEstimate(CHECKOUT_DEFAULT_GST, { couponCode, paymentMethod, redeemPoints, shippingAddress: currentCheckoutAddress() });

  const couponNote = document.getElementById('coupon-note');
  if (couponCode) {
    couponNote.style.display = 'block';
    couponNote.textContent = couponError ? couponError : `Coupon applied: −${formatRupees(discount)}`;
    couponNote.style.color = couponError ? '' : 'var(--moss-700)';
  } else {
    couponNote.style.display = 'none';
  }

  // Show the CGST+SGST vs IGST split once there's actual tax to split —
  // matches how a real Indian e-commerce checkout itemizes GST, and lets a
  // shopper (or the store owner testing checkout) see which one applied.
  const gstLine =
    gst > 0 && (cgst > 0 || sgst > 0)
      ? `<div class="flex-between"><span>CGST (incl. in price, est.)</span><span class="mono">${formatRupees(cgst)}</span></div>
         <div class="flex-between"><span>SGST (incl. in price, est.)</span><span class="mono">${formatRupees(sgst)}</span></div>`
      : gst > 0 && igst > 0
      ? `<div class="flex-between"><span>IGST (incl. in price, est.)</span><span class="mono">${formatRupees(igst)}</span></div>`
      : `<div class="flex-between"><span>GST (incl. in price, est.)</span><span class="mono">${formatRupees(gst)}</span></div>`;

  wrap.innerHTML = `
    <h3 class="mt-0">Order Summary</h3>
    ${items
      .map(
        (i) => `<div class="flex-between" style="font-size:0.9rem;"><span>${i.name}${i.variant_label ? ` (${i.variant_label})` : ''} × ${i.quantity}</span><span class="mono">${formatRupees(i.unit_price_paise * i.quantity)}</span></div>`
      )
      .join('')}
    <hr style="border:none;border-top:1px solid var(--sand-300);margin:16px 0;" />
    <div class="flex-between"><span>Subtotal <span style="font-size:0.75rem;color:var(--moss-700);">(before GST)</span></span><span class="mono">${formatRupees(subtotal)}</span></div>
    ${gstLine}
    <div class="flex-between"><span>Shipping (est.)</span><span class="mono">${shipping > 0 ? formatRupees(shipping) : 'Free'}</span></div>
    ${discount ? `<div class="flex-between"><span>Coupon discount</span><span class="mono">−${formatRupees(discount)}</span></div>` : ''}
    ${loyaltyDiscountPaise ? `<div class="flex-between"><span>Groove Points (${loyaltyPointsApplied} pts)</span><span class="mono">−${formatRupees(loyaltyDiscountPaise)}</span></div>` : ''}
    ${redeemPoints > 0 && !loyaltyDiscountPaise ? `<p style="font-size:0.78rem;color:var(--moss-700);margin:4px 0 0;">Points entered didn't apply — check your balance and the order minimum.</p>` : ''}
    ${referralDiscountPaise ? `<div class="flex-between"><span>Referral discount</span><span class="mono">−${formatRupees(referralDiscountPaise)}</span></div>` : ''}
    <div class="flex-between" style="font-weight:700;"><span>Total</span><span class="mono">${formatRupees(total)}</span></div>
  `;

  const stickyTotal = document.getElementById('checkout-sticky-total');
  if (stickyTotal) stickyTotal.textContent = formatRupees(total);
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

  // Fire-and-forget: if the shopper is logged in, ticked "Save this address",
  // and didn't already pick an existing saved address, persist it for next
  // time. Never blocks or fails the order itself — a save failure here just
  // means the address wasn't remembered, not that checkout should stop.
  const saveCheckbox = document.getElementById('save-address-checkbox');
  const selectedCard = document.querySelector('.address-card.selected');
  const usedNewAddress = !selectedCard || selectedCard.getAttribute('data-address-id') === 'new';
  if (getAuthToken() && saveCheckbox?.checked && usedNewAddress) {
    api('/api/customer/addresses', {
      method: 'POST',
      body: {
        label: 'Home',
        full_name: customer.name,
        phone: customer.phone,
        line1: customer.address.line1,
        line2: customer.address.line2,
        city: customer.address.city,
        state: customer.address.state,
        pincode: customer.address.pincode,
        is_default: CHECKOUT_ADDRESSES.length === 0,
      },
    }).catch(() => {});
  }

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

// Sticky mobile CTA bar: keeps the running total visible while scrolling a
// long checkout form on a phone, and its button just triggers the real
// form's native submit (so validation/required fields still apply) rather
// than duplicating the submit logic.
function mountCheckoutStickyCta() {
  const bar = document.createElement('div');
  bar.className = 'sticky-cta';
  bar.id = 'checkout-sticky-cta';
  bar.innerHTML = `
    <span class="sticky-cta__price" id="checkout-sticky-total">—</span>
    <button class="btn btn--primary" id="checkout-sticky-btn" type="button">Place Order &amp; Pay</button>
  `;
  document.body.appendChild(bar);
  document.body.classList.add('has-sticky-cta');
  bar.querySelector('#checkout-sticky-btn').addEventListener('click', () => {
    const form = document.getElementById('checkout-form');
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  renderSiteChrome('');
  mountCheckoutStickyCta();
  await Promise.all([loadPaymentModeNote(), loadAddressPickerAndAutofill()]);
  renderCheckoutSummary();
  document.getElementById('checkout-form').addEventListener('submit', handleCheckoutSubmit);
  document.getElementById('apply-coupon-btn').addEventListener('click', renderCheckoutSummary);
  document.querySelectorAll('input[name="payment-method"]').forEach((el) => el.addEventListener('change', renderCheckoutSummary));
  document.getElementById('loyalty-redeem')?.addEventListener('change', renderCheckoutSummary);
  // Re-price once the shopper's state/pincode is known — this is what
  // actually determines CGST+SGST vs IGST and which shipping zone rule
  // applies, so the summary shown before payment should reflect it.
  document.getElementById('state')?.addEventListener('change', renderCheckoutSummary);
  document.getElementById('pincode')?.addEventListener('change', renderCheckoutSummary);

  // The coupon field sits inside #checkout-form alongside the "Place Order &
  // Pay" submit button, which is the form's only type="submit" control.
  // Pressing Enter while focused in any text input submits the nearest form
  // by default — so typing a code and hitting Enter (a completely natural
  // action) was silently placing the order at full price instead of
  // triggering the "Apply" button (type="button", never wired to Enter).
  // Intercept Enter here and route it to the actual Apply handler instead.
  document.getElementById('coupon-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('apply-coupon-btn').click();
    }
  });
});
