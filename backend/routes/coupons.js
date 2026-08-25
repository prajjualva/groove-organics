const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/coupons/validate — public. Body: { code, goodsPaise }
// goodsPaise should be the GST-inclusive product total the cart is showing
// (subtotal + gst, before shipping/discount) — validated server-side so a
// shopper can't hand-craft a discount amount from devtools.
router.post('/validate', async (req, res, next) => {
  try {
    const { code, goodsPaise } = req.body || {};
    if (!code) return res.status(400).json({ valid: false, reason: 'Enter a coupon code.' });
    const result = await store.validateCoupon(code, Number(goodsPaise) || 0);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/coupons — admin only
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    res.json({ coupons: await store.listCoupons() });
  } catch (err) {
    next(err);
  }
});

// POST /api/coupons — admin only
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const body = { ...req.body, code: String(req.body.code || '').toUpperCase().trim() };
    if (!body.code) return res.status(400).json({ error: 'A coupon code is required.' });
    const coupon = await store.createCoupon(body);
    res.status(201).json({ coupon });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/coupons/:id — admin only
router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const coupon = await store.updateCoupon(req.params.id, req.body);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found.' });
    res.json({ coupon });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/coupons/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ok = await store.deleteCoupon(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Coupon not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
