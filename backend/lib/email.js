// Order emails via Resend (https://resend.com) — called with plain fetch()
// rather than the `resend` npm package, since this sandbox can't reach the
// npm registry to install it. Functionally identical to using the SDK.
//
// Setup: add RESEND_API_KEY and RESEND_FROM_EMAIL to backend/.env (see
// .env.example). Until both are set, every function here is a no-op that
// logs to the console instead of sending — so the rest of the app (order
// creation, status updates) never breaks just because email isn't wired up
// yet.

const RESEND_API_URL = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

async function sendEmail({ to, subject, html }) {
  if (!isConfigured()) {
    console.log(`[email] (Resend not configured) Would send "${subject}" to ${to}`);
    return { skipped: true };
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[email] Resend send failed (${res.status}): ${body}`);
      return { error: true };
    }
    return await res.json();
  } catch (err) {
    console.error('[email] Resend send error:', err.message);
    return { error: true };
  }
}

function formatRupees(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

async function sendOrderConfirmedEmail(order) {
  const itemsHtml = (order.order_items || [])
    .map((i) => `<tr><td>${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''} × ${i.quantity}</td><td style="text-align:right;">${formatRupees(i.line_total_paise)}</td></tr>`)
    .join('');
  const html = `
    <h2>Thanks for your order, ${order.customer_name}!</h2>
    <p>Your order <strong>${order.order_number}</strong> has been placed and is being prepared.</p>
    <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
    <p><strong>Total: ${formatRupees(order.total_paise)}</strong>${order.payment_gateway === 'cod' ? ' (Cash on Delivery)' : ''}</p>
    <p>We'll email you again once it ships.</p>
    <p>— Groove Organics</p>
  `;
  return sendEmail({ to: order.customer_email, subject: `Order confirmed — ${order.order_number}`, html });
}

// Covers every order status change a staff/admin can make from the Orders
// tab (see backend/routes/orders.js's PATCH /:id/status allowed list) except
// 'placed' — that one's covered by sendOrderConfirmedEmail at order creation
// time, so re-sending it here would be a duplicate.
const ORDER_STATUS_COPY = {
  packed: {
    subject: 'Order packed',
    heading: 'Your order has been packed!',
    body: 'is packed and ready to ship — we\'ll email you again once it\'s on its way.',
  },
  shipped: {
    subject: 'Order shipped',
    heading: 'Your order is on its way!',
    body: 'has shipped.',
  },
  delivered: {
    subject: 'Order delivered',
    heading: 'Your order has arrived!',
    body: 'has been marked delivered. We hope you love it — thanks for shopping with us.',
  },
  cancelled: {
    subject: 'Order cancelled',
    heading: 'Your order was cancelled',
    body: 'has been cancelled. If you were already charged, our team will process a refund where applicable.',
  },
};

async function sendOrderStatusEmail(order, status) {
  const copy = ORDER_STATUS_COPY[status];
  if (!copy) return { skipped: true }; // 'placed' (or anything unrecognized) — nothing to send
  const trackingHtml = order.tracking_url
    ? `<p>Track your package: <a href="${order.tracking_url}">${order.tracking_number || 'Track'}</a>${order.courier_name ? ` (${order.courier_name})` : ''}</p>`
    : order.tracking_number
    ? `<p>Tracking number: ${order.tracking_number}</p>`
    : '';
  const html = `
    <h2>${copy.heading}</h2>
    <p>Order <strong>${order.order_number}</strong> ${copy.body}</p>
    ${status === 'shipped' || status === 'delivered' ? trackingHtml : ''}
    <p>— Groove Organics</p>
  `;
  return sendEmail({ to: order.customer_email, subject: `${copy.subject} — ${order.order_number}`, html });
}

// Kept as a thin wrapper (rather than removed) in case anything besides
// backend/routes/orders.js ever calls it directly by name.
async function sendOrderShippedEmail(order) {
  return sendOrderStatusEmail(order, 'shipped');
}

async function sendWelcomeEmail(user) {
  const name = user.full_name || 'there';
  const html = `
    <h2>Welcome to Groove Organics, ${name}!</h2>
    <p>Your account is all set up. Every order you place earns Groove Points you can redeem for a
    discount on a future purchase — and if you've got friends who'd like our oils, your Refer &amp;
    Earn link (in your account dashboard) earns you both a bonus.</p>
    <p>— Groove Organics</p>
  `;
  return sendEmail({ to: user.email, subject: 'Welcome to Groove Organics', html });
}

// Fired for every POSITIVE loyalty_ledger entry (order_earned, referral_bonus,
// or a manual admin credit) — never for a redemption/debit. See
// backend/lib/dataStore.js's addLoyaltyEntry, the one place every ledger
// write in the app goes through.
const LOYALTY_REASON_COPY = {
  order_earned: 'for your recent order',
  referral_bonus: 'as a referral bonus for inviting a friend to Groove Organics',
};

async function sendPointsCreditedEmail({ toEmail, customerName, points, reason, note, newBalance }) {
  const reasonText = reason === 'manual_adjustment' && note
    ? note
    : (LOYALTY_REASON_COPY[reason] || 'to your Groove Organics account');
  const html = `
    <h2>You've earned ${points} Groove Points!</h2>
    <p>Hi ${customerName || 'there'}, ${points} Groove Points were just credited to your account ${reasonText}.</p>
    <p><strong>New balance: ${newBalance} points</strong></p>
    <p>Redeem them for a discount at checkout on your next order.</p>
    <p>— Groove Organics</p>
  `;
  return sendEmail({ to: toEmail, subject: `You earned ${points} Groove Points`, html });
}

// Fired once, right when a referred friend's account is created — tells the
// REFERRER their link actually worked. Distinct from sendPointsCreditedEmail
// (reason: 'referral_bonus'), which fires later, only once the friend pays
// for their first order — this one is the earlier "they joined!" moment.
// See backend/lib/dataStore.js's notifyReferralSignup.
async function sendReferralSignupEmail({ toEmail, referrerName, friendName }) {
  const html = `
    <h2>Your friend just joined Groove Organics!</h2>
    <p>Hi ${referrerName || 'there'}, ${friendName || 'someone you invited'} signed up using your referral link.</p>
    <p>Once they place their first order, you'll earn Groove Points as a referral bonus — we'll email you again then.</p>
    <p>— Groove Organics</p>
  `;
  return sendEmail({ to: toEmail, subject: 'Your friend joined Groove Organics', html });
}

// Fired for every NEGATIVE loyalty_ledger entry (order_redeemed, or a
// negative manual admin adjustment) — the debit counterpart to
// sendPointsCreditedEmail above. See backend/lib/dataStore.js's
// addLoyaltyEntry, the one place every ledger write in the app goes through.
const LOYALTY_DEBIT_REASON_COPY = {
  order_redeemed: 'redeemed at checkout for a discount on your order',
};

async function sendPointsDebitedEmail({ toEmail, customerName, points, reason, note, newBalance }) {
  const reasonText = reason === 'manual_adjustment' && note
    ? note
    : (LOYALTY_DEBIT_REASON_COPY[reason] || 'deducted from your Groove Organics account');
  const html = `
    <h2>${points} Groove Points used</h2>
    <p>Hi ${customerName || 'there'}, ${points} Groove Points were just ${reasonText}.</p>
    <p><strong>New balance: ${newBalance} points</strong></p>
    <p>— Groove Organics</p>
  `;
  return sendEmail({ to: toEmail, subject: `${points} Groove Points used`, html });
}

async function sendPasswordResetEmail(email, actionLink) {
  const html = `
    <h2>Reset your password</h2>
    <p>Someone (hopefully you) asked to reset the password on the Groove Organics account for ${email}.</p>
    <p><a href="${actionLink}" style="display:inline-block;background:#1b2416;color:#fbf6ec;padding:12px 22px;border-radius:6px;text-decoration:none;">Reset Password</a></p>
    <p>If the button doesn't work, copy and paste this link into your browser:<br />${actionLink}</p>
    <p>If you didn't ask for this, you can safely ignore this email — your password won't change.</p>
    <p>— Groove Organics</p>
  `;
  return sendEmail({ to: email, subject: 'Reset your Groove Organics password', html });
}

module.exports = {
  isConfigured,
  sendEmail,
  sendOrderConfirmedEmail,
  sendOrderShippedEmail,
  sendOrderStatusEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPointsCreditedEmail,
  sendPointsDebitedEmail,
  sendReferralSignupEmail,
};
