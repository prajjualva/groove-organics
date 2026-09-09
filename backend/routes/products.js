const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/products — public catalog
router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.user && ['admin', 'staff'].includes(req.user.role);
    const products = await store.listProducts({ includeInactive });
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:slug — single product by slug
router.get('/:slug', async (req, res, next) => {
  try {
    const product = await store.getProductBySlug(req.params.slug);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    const variants = await store.listVariants(product.id);
    res.json({ product: { ...product, variants } });
  } catch (err) {
    next(err);
  }
});

// POST /api/products — admin only
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const product = await store.createProduct(req.body);
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'product.create', entityType: 'product', entityId: product.id, summary: `Created product "${product.name}"` }).catch(() => {});
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/products/:id — admin only. If the patch touches `stock`
// directly (the quick-edit field in Admin -> Products), the change is
// auto-logged to the stock_adjustments ledger as reason 'manual_edit' so
// every stock change is auditable no matter which UI path made it — see
// dataStore.js's recordStockAdjustment.
router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const patch = req.body || {};
    if (Object.prototype.hasOwnProperty.call(patch, 'stock')) {
      const before = await store.getProductById(req.params.id);
      if (!before) return res.status(404).json({ error: 'Product not found.' });
      const newStock = parseInt(patch.stock, 10) || 0;
      const delta = newStock - (Number(before.stock) || 0);
      const { stock, ...rest } = patch;
      let product = Object.keys(rest).length ? await store.updateProduct(req.params.id, rest) : before;
      if (delta !== 0) {
        await store.recordStockAdjustment({
          productId: req.params.id,
          delta,
          reason: 'manual_edit',
          adjustedBy: req.user.email || null,
        });
        product = await store.getProductById(req.params.id);
      }
      // Only audit-log here if non-stock fields were ALSO touched — a
      // stock-only edit is already fully covered by the stock_adjustments
      // entry just above, and double-logging it would just be noise.
      if (Object.keys(rest).length) {
        store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'product.update', entityType: 'product', entityId: req.params.id, summary: `Updated product "${product.name}"` }).catch(() => {});
      }
      return res.json({ product });
    }
    const product = await store.updateProduct(req.params.id, patch);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'product.update', entityType: 'product', entityId: req.params.id, summary: `Updated product "${product.name}"` }).catch(() => {});
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:id/stock-adjustments — admin only. Body: { delta,
// reason, note? }. The dedicated "Adjust stock" form in Admin -> Products'
// Inventory panel — records an intentional adjustment with a required
// reason, distinct from the auto-logged 'manual_edit' entries above.
router.post('/:id/stock-adjustments', requireRole('admin'), async (req, res, next) => {
  try {
    const { delta, reason, note } = req.body || {};
    const deltaNum = Number(delta);
    if (!Number.isFinite(deltaNum) || deltaNum === 0) return res.status(400).json({ error: 'delta must be a non-zero number.' });
    if (!reason) return res.status(400).json({ error: 'reason is required.' });
    const adjustment = await store.recordStockAdjustment({
      productId: req.params.id,
      delta: deltaNum,
      reason,
      note: note || null,
      adjustedBy: req.user.email || null,
    });
    const product = await store.getProductById(req.params.id);
    res.status(201).json({ adjustment, product });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id/stock-adjustments — admin/staff. Inventory history.
router.get('/:id/stock-adjustments', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ adjustments: await store.listStockAdjustments(req.params.id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const before = await store.getProductById(req.params.id).catch(() => null);
    const ok = await store.deleteProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Product not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'product.delete', entityType: 'product', entityId: req.params.id, summary: `Deleted product "${before ? before.name : req.params.id}"` }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
