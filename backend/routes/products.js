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
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/products/:id — admin only
router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const product = await store.updateProduct(req.params.id, req.body);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ok = await store.deleteProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Product not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
