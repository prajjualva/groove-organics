const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const GST_RATE = Number(process.env.GST_RATE_PERCENT || 5);

// POST /api/orders — create an order from the cart (guest checkout allowed)
router.post('/', async (req, res, next) => {
  try {
    const { customer, items } = req.body || {};
    if (!customer?.name || !customer?.email || !customer?.address) {
      return res.status(400).json({ error: 'customer.name, customer.email and customer.address are required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required.' });
    }
    const order = await store.createOrder({ customer, items, gstRatePercent: GST_RATE, userId: req.user ? req.user.userId : null });
    res.status(201).json({ order });
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
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
