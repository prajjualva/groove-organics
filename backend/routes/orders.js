const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');
const email = require('../lib/email');

const router = express.Router();

// Shared request validation for both order creation and the estimate
// preview below — pincode format/blocklist and COD availability are
// request-level checks, not pricing, so they live here rather than inside
// the pricing engine (dataStore.js's computeOrderPricing).
async function validateCheckoutRequest(customer, settings) {
  const paymentMethod = customer.paymentMethod === 'cod' ? 'cod' : 'online';
  if (paymentMethod === 'cod' && !settings.cod_enabled) {
    return 'Cash on Delivery is not available right now.';
  }
  if (customer.address?.pincode && !/^\d{6}$/.test(String(customer.address.pincode))) {
    return 'Pincode must be exactly 6 digits.';
  }
  const blocked = settings.blocked_pincodes || [];
  if (customer.address?.pincode && blocked.includes(String(customer.address.pincode))) {
    return 'Sorry, we do not currently deliver to this pincode.';
  }
  return null;
}

// POST /api/orders — create an order from the cart (guest checkout allowed).
// All pricing (subtotal, CGST/SGST/IGST, shipping, coupon, Groove Points,
// referral discount, total) is computed entirely server-side inside
// store.createOrder -> computeOrderPricing — nothing here re-derives or
// trusts any amount the client might have sent.
router.post('/', async (req, res, next) => {
  try {
    const { customer, items, couponCode, redeemPoints } = req.body || {};
    if (!customer?.name || !customer?.email || !customer?.address) {
      return res.status(400).json({ error: 'customer.name, customer.email and customer.address are required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required.' });
    }

    const settings = await store.getStoreSettings();
    const paymentMethod = customer.paymentMethod === 'cod' ? 'cod' : 'online';
    const validationError = await validateCheckoutRequest(customer, settings);
    if (validationError) return res.status(400).json({ error: validationError });

    const order = await store.createOrder({
      customer: { ...customer, paymentMethod },
      items,
      userId: req.user ? req.user.userId : null,
      couponCode: couponCode || null,
      // Redeeming Groove Points requires being logged in — a guest has no
      // balance to redeem against, so this is silently ignored for guests.
      redeemPoints: req.user ? Number(redeemPoints) || 0 : 0,
    });

    email.sendOrderConfirmedEmail(order).catch((err) => console.error('sendOrderConfirmedEmail failed:', err.message));

    // COD orders don't go through Razorpay at all — they're "placed" and
    // awaiting delivery-time payment, which staff mark separately.
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/estimate — public. The single server-side source of
// truth for what an order WOULD cost, without creating it. Cart/checkout
// pages call this instead of recomputing GST/shipping/coupon/points math
// themselves (see frontend/js/cart.js's cartEstimate) — it calls the exact
// same computeOrderPricing() function store.createOrder uses, so the
// number shown here always matches what placing the order actually
// charges. Body: { items, customer: { address, paymentMethod }, couponCode,
// redeemPoints }.
router.post('/estimate', async (req, res, next) => {
  try {
    const { items, customer, couponCode, redeemPoints } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({
        subtotalPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        gstPaise: 0,
        shippingPaise: 0,
        discountPaise: 0,
        couponDiscountPaise: 0,
        couponError: null,
        loyaltyDiscountPaise: 0,
        loyaltyPointsApplied: 0,
        referralDiscountPaise: 0,
        totalPaise: 0,
        isIntrastate: true,
      });
    }

    const pricing = await store.computeOrderPricing({
      items,
      shippingAddress: (customer && customer.address) || null,
      paymentMethod: customer && customer.paymentMethod === 'cod' ? 'cod' : 'online',
      userId: req.user ? req.user.userId : null,
      couponCode: couponCode || null,
      redeemPoints: req.user ? Number(redeemPoints) || 0 : 0,
    });

    res.json({
      subtotalPaise: pricing.subtotalPaise,
      cgstPaise: pricing.cgstPaise,
      sgstPaise: pricing.sgstPaise,
      igstPaise: pricing.igstPaise,
      gstPaise: pricing.gstPaise,
      shippingPaise: pricing.shippingPaise,
      discountPaise: pricing.discountPaise,
      couponDiscountPaise: pricing.couponDiscountPaise,
      couponCode: pricing.couponApplied ? pricing.couponApplied.code : null,
      couponError: pricing.couponError,
      loyaltyDiscountPaise: pricing.loyaltyDiscountPaise,
      loyaltyPointsApplied: pricing.loyaltyPointsApplied,
      referralDiscountPaise: pricing.referralDiscountPaise,
      totalPaise: pricing.totalPaise,
      isIntrastate: pricing.isIntrastate,
      sellerState: pricing.sellerState,
      customerState: pricing.customerState,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id/summary — public (order ids are unguessable), used by
// the order-confirmation page. Deliberately a small subset of fields — the
// full order (customer PII) stays behind requireRole('admin','staff') below.
// Includes line items + the subtotal/GST/shipping breakdown (not just the
// total) so the confirmation page can show a real itemized receipt inline,
// not just a status card — the PDF invoice remains the authoritative
// downloadable document, this is just a same-page summary of what was
// already recorded.
router.get('/:id/summary', async (req, res, next) => {
  try {
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const items = order.order_items || order.items || [];
    res.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        payment_gateway: order.payment_gateway,
        subtotal_paise: order.subtotal_paise,
        gst_paise: order.gst_paise,
        cgst_paise: order.cgst_paise || 0,
        sgst_paise: order.sgst_paise || 0,
        igst_paise: order.igst_paise || 0,
        tax_type: order.tax_type || null,
        discount_paise: order.discount_paise || 0,
        coupon_code: order.coupon_code || null,
        loyalty_discount_paise: order.loyalty_discount_paise || 0,
        referral_discount_paise: order.referral_discount_paise || 0,
        shipping_paise: order.shipping_paise,
        total_paise: order.total_paise,
        tracking_number: order.tracking_number || null,
        tracking_url: order.tracking_url || null,
        courier_name: order.courier_name || null,
        items: items.map((i) => ({
          product_name: i.product_name,
          variant_label: i.variant_label || null,
          quantity: i.quantity,
          unit_price_paise: i.unit_price_paise,
          line_total_paise: i.line_total_paise,
          hsn_code: i.hsn_code || null,
          gst_rate_percent: i.gst_rate_percent || 0,
          cgst_paise: i.cgst_paise || 0,
          sgst_paise: i.sgst_paise || 0,
          igst_paise: i.igst_paise || 0,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders — admin/staff only: full order list
router.get('/', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const orders = await store.listOrders();
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — admin/staff only
router.get('/:id', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:id/status — admin/staff only: Placed -> Packed -> Shipped -> Delivered
router.patch('/:id/status', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const allowed = ['placed', 'packed', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }
    const order = await store.updateOrderStatus(req.params.id, status, req.user.email || null);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (status === 'shipped') {
      email.sendOrderShippedEmail(order).catch((err) => console.error('sendOrderShippedEmail failed:', err.message));
    }
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/orders/:id/tracking — admin/staff only. Body: { trackingNumber, trackingUrl, courierName }
// Typically filled in at the same time an order is marked Shipped.
router.patch('/:id/tracking', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { trackingNumber, trackingUrl, courierName } = req.body || {};
    const order = await store.updateOrderTracking(req.params.id, { trackingNumber, trackingUrl, courierName }, req.user.email || null);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id/events — admin/staff only. The full timeline behind
// the Order Detail page — status changes, tracking added, payment marked
// paid, refund lifecycle — independent of the order's own current-state
// columns, so history survives even after a later change overwrites them.
router.get('/:id/events', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ events: await store.listOrderEvents(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id/refunds — admin/staff only.
router.get('/:id/refunds', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ refunds: await store.listOrderRefunds(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/refunds — admin/staff only. Body: { type, amountPaise,
// reason, note? }. Starts a refund/return/cancellation request as
// 'requested' — see PATCH .../refunds/:refundId to process or reject it.
// Never touches orders.total_paise — see the "never silently change a paid
// total" comment on requestOrderRefund in dataStore.js.
router.post('/:id/refunds', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { type, amountPaise, reason, note } = req.body || {};
    const refund = await store.requestOrderRefund({
      orderId: req.params.id,
      type,
      amountPaise,
      reason,
      note: note || null,
      requestedBy: req.user.email || null,
    });
    store.logAudit({
      actor: req.user.email,
      actorRole: req.user.role,
      action: 'order.refund_requested',
      entityType: 'order',
      entityId: req.params.id,
      summary: `Requested a ${refund.type} of ₹${(refund.amount_paise / 100).toFixed(2)} on order ${req.params.id} — ${reason}`,
    }).catch(() => {});
    res.status(201).json({ refund });
  } catch (err) {
    if (err && err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/orders/:id/refunds/:refundId — admin/staff only. Body:
// { status: 'processed' | 'rejected', note? }. Processing increments the
// order's refunded_amount_paise; rejecting just closes out the request.
router.patch('/:id/refunds/:refundId', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { status, note } = req.body || {};
    const refund = await store.updateOrderRefundStatus(req.params.refundId, {
      status,
      processedBy: req.user.email || null,
      note: note || null,
    });
    store.logAudit({
      actor: req.user.email,
      actorRole: req.user.role,
      action: status === 'processed' ? 'order.refund_processed' : 'order.refund_rejected',
      entityType: 'order',
      entityId: req.params.id,
      summary: `${status === 'processed' ? 'Processed' : 'Rejected'} a ₹${(refund.amount_paise / 100).toFixed(2)} refund on order ${req.params.id}`,
    }).catch(() => {});
    res.json({ refund });
  } catch (err) {
    if (err && err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/orders/:id/mark-cod-paid — admin/staff only: record that cash was
// collected on delivery for a COD order.
router.patch('/:id/mark-cod-paid', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const order = await store.markOrderPaid(req.params.id, {
      paymentGateway: 'cod',
      paymentOrderId: null,
      paymentId: `cod_${Date.now()}`,
    });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'order.mark_cod_paid', entityType: 'order', entityId: req.params.id, summary: `Marked COD order ${order.order_number || req.params.id} as paid` }).catch(() => {});
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
