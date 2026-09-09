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

// POST /api/products/:productId/variants — admin only. { size?, color?, price_paise, stock, sku?, barcode?, image_url? }
router.post('/products/:productId/variants', requireRole('admin'), async (req, res, next) => {
  try {
    const { size, color, price_paise, stock, sku, barcode, image_url } = req.body || {};
    if (!size && !color) return res.status(400).json({ error: 'A variant needs at least a size or a color.' });
    if (!price_paise) return res.status(400).json({ error: 'price_paise is required.' });
    const variant = await store.createVariant(req.params.productId, {
      size: size || null,
      color: color || null,
      price_paise,
      stock: stock || 0,
      sku: sku || null,
      barcode: barcode || null,
      image_url: image_url || null,
    });
    const variantLabel = [size, color].filter(Boolean).join(' / ') || variant.id;
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'variant.create', entityType: 'variant', entityId: variant.id, summary: `Added variant "${variantLabel}"` }).catch(() => {});
    res.status(201).json({ variant });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/variants/:id — admin only. Same auto-audit-on-stock-change
// behavior as PATCH /api/products/:id — see backend/routes/products.js.
router.patch('/variants/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const patch = req.body || {};
    if (Object.prototype.hasOwnProperty.call(patch, 'stock')) {
      const before = await store.getVariantById(req.params.id);
      if (!before) return res.status(404).json({ error: 'Variant not found.' });
      const newStock = parseInt(patch.stock, 10) || 0;
      const delta = newStock - (Number(before.stock) || 0);
      const { stock, ...rest } = patch;
      let variant = Object.keys(rest).length ? await store.updateVariant(req.params.id, rest) : before;
      const variantLabel = [before.size, before.color].filter(Boolean).join(' / ') || req.params.id;
      if (delta !== 0) {
        await store.recordStockAdjustment({
          productId: before.product_id,
          variantId: req.params.id,
          variantLabel,
          delta,
          reason: 'manual_edit',
          adjustedBy: req.user.email || null,
        });
        variant = await store.getVariantById(req.params.id);
      }
      // Stock-only edits are already covered by the stock_adjustments entry
      // above — only audit-log here if other fields were ALSO touched.
      if (Object.keys(rest).length) {
        store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'variant.update', entityType: 'variant', entityId: req.params.id, summary: `Updated variant "${variantLabel}"` }).catch(() => {});
      }
      return res.json({ variant });
    }
    const before = await store.getVariantById(req.params.id);
    const variant = await store.updateVariant(req.params.id, patch);
    if (!variant) return res.status(404).json({ error: 'Variant not found.' });
    const variantLabel = before ? [before.size, before.color].filter(Boolean).join(' / ') || req.params.id : req.params.id;
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'variant.update', entityType: 'variant', entityId: req.params.id, summary: `Updated variant "${variantLabel}"` }).catch(() => {});
    res.json({ variant });
  } catch (err) {
    next(err);
  }
});

// POST /api/variants/:id/stock-adjustments — admin only. Body: { delta, reason, note? }.
router.post('/variants/:id/stock-adjustments', requireRole('admin'), async (req, res, next) => {
  try {
    const variant = await store.getVariantById(req.params.id);
    if (!variant) return res.status(404).json({ error: 'Variant not found.' });
    const { delta, reason, note } = req.body || {};
    const deltaNum = Number(delta);
    if (!Number.isFinite(deltaNum) || deltaNum === 0) return res.status(400).json({ error: 'delta must be a non-zero number.' });
    if (!reason) return res.status(400).json({ error: 'reason is required.' });
    const adjustment = await store.recordStockAdjustment({
      productId: variant.product_id,
      variantId: req.params.id,
      variantLabel: [variant.size, variant.color].filter(Boolean).join(' / ') || null,
      delta: deltaNum,
      reason,
      note: note || null,
      adjustedBy: req.user.email || null,
    });
    res.status(201).json({ adjustment, variant: await store.getVariantById(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/variants/:id/stock-adjustments — admin/staff. Inventory history
// for one variant (filtered client-side from the product's full history,
// since the ledger is keyed by product_id + variant_id).
router.get('/variants/:id/stock-adjustments', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const variant = await store.getVariantById(req.params.id);
    if (!variant) return res.status(404).json({ error: 'Variant not found.' });
    const all = await store.listStockAdjustments(variant.product_id, { limit: 300 });
    res.json({ adjustments: all.filter((a) => a.variant_id === req.params.id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/variants/:id — admin only
router.delete('/variants/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const before = await store.getVariantById(req.params.id).catch(() => null);
    const ok = await store.deleteVariant(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Variant not found.' });
    const variantLabel = before ? [before.size, before.color].filter(Boolean).join(' / ') || req.params.id : req.params.id;
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'variant.delete', entityType: 'variant', entityId: req.params.id, summary: `Deleted variant "${variantLabel}"` }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
