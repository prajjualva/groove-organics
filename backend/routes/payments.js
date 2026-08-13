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
// Configure this URL in the Razorpay dashboard once the site is deployed.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(200).json({ ok: true, note: 'Webhook secret not configured yet.' });

  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  if (signature !== expected) return res.status(400).json({ error: 'Invalid webhook signature.' });

  // Real handling (update order by payment_order_id) can be filled in once
  // this is wired to a live Razorpay account and real webhook events arrive.
  res.status(200).json({ ok: true });
});

module.exports = router;
