const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');
const email = require('../lib/email');

const router = express.Router();
const GST_RATE = Number(process.env.GST_RATE_PERCENT || 5);

// Chargeable weight for one line = max(actual weight, volumetric weight),
// volumetric = L x W x H (cm) / 5000, giving grams. Falls back to 0 (ships
// free) if a product has no weight/dimensions set at all.
function chargeableWeightGrams(product, variant) {
  const weight = (variant && variant.weight_grams != null ? variant.weight_grams : null) ?? product.weight_grams ?? 0;
  const l = product.length_cm || 0;
  const w = product.width_cm || 0;
  const h = product.height_cm || 0;
  const volumetric = (l * w * h) / 5000;
  return Math.max(Number(weight) || 0, volumetric);
}

// POST /api/orders — create an order from the cart (guest checkout allowed)
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
    if (paymentMethod === 'cod' && !settings.cod_enabled) {
      return res.status(400).json({ error: 'Cash on Delivery is not available right now.' });
    }
    if (customer.address?.pincode && !/^\d{6}$/.test(String(customer.address.pincode))) {
      return res.status(400).json({ error: 'Pincode must be exactly 6 digits.' });
    }
    const blocked = settings.blocked_pincodes || [];
    if (customer.address?.pincode && blocked.includes(String(customer.address.pincode))) {
      return res.status(400).json({ error: 'Sorry, we do not currently deliver to this pincode.' });
    }

    // Pool the chargeable weight of every line item that does NOT have a manual
    // per-product shipping override (those are priced individually inside
    // createOrder/priceOrderItems instead) and look up one shipping cost for
    // the whole pooled shipment against the rate-slab table.
    let pooledGrams = 0;
    for (const item of items) {
      if (!item.product_id) continue;
      const product = await store.getProductById(item.product_id).catch(() => null);
      if (!product || product.shipping_charge_paise) continue; // manual override — handled per-unit elsewhere
      let variant = null;
      if (item.variant_id) {
        const variants = await store.listVariants(item.product_id).catch(() => []);
        variant = variants.find((v) => v.id === item.variant_id) || null;
      }
      pooledGrams += chargeableWeightGrams(product, variant) * (Number(item.quantity) || 1);
    }
    let shippingPaise = pooledGrams > 0 ? await store.computeShippingForWeight(pooledGrams) : 0;
    if (paymentMethod === 'cod') shippingPaise += Number(settings.cod_extra_charge_paise) || 0;

    const order = await store.createOrder({
      customer: { ...customer, paymentMethod },
      items,
      gstRatePercent: GST_RATE,
      shippingPaise,
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

// GET /api/orders/:id/summary — public (order ids are unguessable), used by
// the order-confirmation page. Deliberately a small subset of fields — the
// full order (customer PII) stays behind requireRole('admin','staff') below.
router.get('/:id/summary', async (req, res, next) => {
  try {
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        payment_gateway: order.payment_gateway,
        total_paise: order.total_paise,
        tracking_number: order.tracking_number || null,
        tracking_url: order.tracking_url || null,
        courier_name: order.courier_name || null,
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
    const order = await store.updateOrderStatus(req.params.id, status);
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
    const order = await store.updateOrderTracking(req.params.id, { trackingNumber, trackingUrl, courierName });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order });
  } catch (err) {
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
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
