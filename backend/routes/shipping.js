const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/shipping/rate-slabs — public (checkout needs these to show an
// estimate; the actual authoritative number is always recalculated
// server-side when the order is created, never trusted from the client).
router.get('/rate-slabs', async (req, res, next) => {
  try {
    res.json({ slabs: await store.listShippingRateSlabs() });
  } catch (err) {
    next(err);
  }
});

// POST /api/shipping/rate-slabs — admin only
router.post('/rate-slabs', requireRole('admin'), async (req, res, next) => {
  try {
    const slab = await store.createShippingRateSlab(req.body);
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'shipping_rate_slab.create', entityType: 'shipping_rate_slab', entityId: slab.id, summary: `Created shipping rate${slab.zone_name ? ` "${slab.zone_name}"` : ''}` }).catch(() => {});
    res.status(201).json({ slab });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/shipping/rate-slabs/:id — admin only
router.patch('/rate-slabs/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const slab = await store.updateShippingRateSlab(req.params.id, req.body);
    if (!slab) return res.status(404).json({ error: 'Rate slab not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'shipping_rate_slab.update', entityType: 'shipping_rate_slab', entityId: req.params.id, summary: `Updated shipping rate${slab.zone_name ? ` "${slab.zone_name}"` : ''}` }).catch(() => {});
    res.json({ slab });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shipping/rate-slabs/:id — admin only
router.delete('/rate-slabs/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ok = await store.deleteShippingRateSlab(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Rate slab not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'shipping_rate_slab.delete', entityType: 'shipping_rate_slab', entityId: req.params.id, summary: 'Deleted a shipping rate' }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/shipping/classes — public (product pages/checkout don't need
// this, but the admin product editor's dropdown reads it unauthenticated
// the same way it reads /api/categories).
router.get('/classes', async (req, res, next) => {
  try {
    res.json({ shippingClasses: await store.listShippingClasses() });
  } catch (err) {
    next(err);
  }
});

// POST /api/shipping/classes — admin only. Body: { name, flat_rate_paise?, is_active? }
router.post('/classes', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, flat_rate_paise, is_active } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required.' });
    const shippingClass = await store.createShippingClass({
      name: name.trim(),
      flat_rate_paise: flat_rate_paise === '' || flat_rate_paise == null ? null : Number(flat_rate_paise),
      is_active: is_active !== false,
    });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'shipping_class.create', entityType: 'shipping_class', entityId: shippingClass.id, summary: `Created shipping class "${shippingClass.name}"` }).catch(() => {});
    res.status(201).json({ shippingClass });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/shipping/classes/:id — admin only
router.patch('/classes/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const shippingClass = await store.updateShippingClass(req.params.id, req.body);
    if (!shippingClass) return res.status(404).json({ error: 'Shipping class not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'shipping_class.update', entityType: 'shipping_class', entityId: req.params.id, summary: `Updated shipping class "${shippingClass.name}"` }).catch(() => {});
    res.json({ shippingClass });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shipping/classes/:id — admin only
router.delete('/classes/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await store.listShippingClasses();
    const before = existing.find((c) => c.id === req.params.id);
    const ok = await store.deleteShippingClass(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Shipping class not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'shipping_class.delete', entityType: 'shipping_class', entityId: req.params.id, summary: `Deleted shipping class "${before ? before.name : req.params.id}"` }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/shipping/estimate — public. Body: { totalGrams, orderValuePaise,
// state, pincode } -> { pricePaise }. state/pincode/orderValuePaise are
// optional — pass what's known so far to get a zone-aware quote; without
// them this still works as a plain weight-only lookup. Used for a
// shipping-only estimate outside the full order-pricing preview (see
// POST /api/orders/estimate, which covers this plus GST/coupon/points too).
router.post('/estimate', async (req, res, next) => {
  try {
    const { totalGrams, orderValuePaise, state, pincode } = req.body || {};
    const pricePaise = await store.computeShipping({
      totalGrams: Number(totalGrams) || 0,
      orderValuePaise: Number(orderValuePaise) || 0,
      state: state || '',
      pincode: pincode || '',
    });
    res.json({ pricePaise });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
