const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/products/:productId/variants — public
router.get('/products/:productId/variants', async (req, res, next) => {
  try {
    res.json({ variants: await store.listVariants(req.params.productId) });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:productId/variants — admin only. { size?, color?, price_paise, stock, sku?, image_url? }
router.post('/products/:productId/variants', requireRole('admin'), async (req, res, next) => {
  try {
    const { size, color, price_paise, stock, sku, image_url } = req.body || {};
    if (!size && !color) return res.status(400).json({ error: 'A variant needs at least a size or a color.' });
    if (!price_paise) return res.status(400).json({ error: 'price_paise is required.' });
    const variant = await store.createVariant(req.params.productId, {
      size: size || null,
      color: color || null,
      price_paise,
      stock: stock || 0,
      sku: sku || null,
      image_url: image_url || null,
    });
    res.status(201).json({ variant });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/variants/:id — admin only
router.patch('/variants/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const variant = await store.updateVariant(req.params.id, req.body);
    if (!variant) return res.status(404).json({ error: 'Variant not found.' });
    res.json({ variant });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/variants/:id — admin only
router.delete('/variants/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ok = await store.deleteVariant(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Variant not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
