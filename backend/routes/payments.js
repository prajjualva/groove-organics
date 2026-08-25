const express = require('express');
const crypto = require('crypto');
const store = require('../lib/dataStore');
const razorpay = require('../lib/razorpay');

const router = express.Router();

// POST /api/payments/create-order  { orderId } -> Razorpay order (or demo stand-in)
// Called after /api/orders creates our internal order record, right before checkout.
router.post('/create-order', async (req, res, next) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required.' });
    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (!razorpay.isConfigured) {
      // Demo mode: no real gateway wired up yet. Return a fake payment order
      // so the checkout UI can be built and tested end-to-end today.
      return res.json({
        mode: 'demo',
        keyId: null,
        razorpayOrderId: `demo_order_${order.id}`,
        amountPaise: order.total_paise,
        currency: 'INR',
        note: 'Razorpay is not configured yet — add RAZORPAY_KEY_ID/KEY_SECRET to backend/.env to accept real payments.',
      });
    }

    const rpOrder = await razorpay.client.orders.create({
      amount: order.total_paise,
      currency: 'INR',
      receipt: order.order_number,
    });
    // Save the gateway's order id against ours right away — if the browser
    // closes right after a successful payment (before /confirm fires), the
    // webhook below can still find and pay this order using this id.
    await store.attachPaymentOrderId(order.id, rpOrder.id);
    res.json({
      mode: 'live',
      keyId: razorpay.keyId,
      razorpayOrderId: rpOrder.id,
      amountPaise: rpOrder.amount,
      currency: rpOrder.currency,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/confirm — verify signature (live) or auto-confirm (demo)
router.post('/confirm', async (req, res, next) => {
  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required.' });

    if (!razorpay.isConfigured) {
      const order = await store.markOrderPaid(orderId, {
        paymentGateway: 'demo',
        paymentOrderId: razorpay_order_id || `demo_order_${orderId}`,
        paymentId: `demo_payment_${Date.now()}`,
      });
      if (!order) return res.status(404).json({ error: 'Order not found.' });
      return res.json({ order, mode: 'demo' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature verification failed.' });
    }

    const order = await store.markOrderPaid(orderId, {
      paymentGateway: 'razorpay',
      paymentOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order, mode: 'live' });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/webhook — Razorpay server-to-server payment status updates.
// This is the fix for the "browser closes right after payment succeeds"
// gap: /api/payments/confirm relies on the customer's browser calling us
// back, which can fail to happen even though Razorpay charged them
// successfully. This webhook is Razorpay telling us directly, independent
// of the browser, so the order still gets marked paid.
// Configure this URL (https://yourdomain.com/api/payments/webhook) and a
// webhook secret in the Razorpay dashboard once the site is deployed, and
// set RAZORPAY_WEBHOOK_SECRET in backend/.env to the same value.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(200).json({ ok: true, note: 'Webhook secret not configured yet.' });

  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  if (signature !== expected) return res.status(400).json({ error: 'Invalid webhook signature.' });

  try {
    const event = JSON.parse(req.body.toString('utf8'));
    const payment = event?.payload?.payment?.entity;
    if (
      payment &&
      (event.event === 'payment.captured' || event.event === 'order.paid') &&
      payment.order_id
    ) {
      const order = await store.getOrderByPaymentOrderId(payment.order_id);
      if (order && order.payment_status !== 'paid') {
        await store.markOrderPaid(order.id, {
          paymentGateway: 'razorpay',
          paymentOrderId: payment.order_id,
          paymentId: payment.id,
        });
      }
    }
  } catch (err) {
    console.error('Razorpay webhook processing error:', err);
    // Still acknowledge with 200 so Razorpay doesn't hammer retries for a
    // parsing bug on our end — the payment itself already succeeded.
  }

  res.status(200).json({ ok: true });
});

module.exports = router;
