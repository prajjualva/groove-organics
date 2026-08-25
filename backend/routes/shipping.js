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
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/shipping/estimate — public. Body: { totalGrams } -> { pricePaise }
// Used at checkout to show a live shipping estimate before the order is
// actually created (which recalculates this same way, server-side).
router.post('/estimate', async (req, res, next) => {
  try {
    const totalGrams = Number(req.body?.totalGrams) || 0;
    const pricePaise = await store.computeShippingForWeight(totalGrams);
    res.json({ pricePaise });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
