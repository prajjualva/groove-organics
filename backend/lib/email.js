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

async function sendOrderShippedEmail(order) {
  const trackingHtml = order.tracking_url
    ? `<p>Track your package: <a href="${order.tracking_url}">${order.tracking_number || 'Track'}</a>${order.courier_name ? ` (${order.courier_name})` : ''}</p>`
    : order.tracking_number
    ? `<p>Tracking number: ${order.tracking_number}</p>`
    : '';
  const html = `
    <h2>Your order is on its way!</h2>
    <p>Order <strong>${order.order_number}</strong> has shipped.</p>
    ${trackingHtml}
    <p>— Groove Organics</p>
  `;
  return sendEmail({ to: order.customer_email, subject: `Order shipped — ${order.order_number}`, html });
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

module.exports = { isConfigured, sendEmail, sendOrderConfirmedEmail, sendOrderShippedEmail, sendPasswordResetEmail };
