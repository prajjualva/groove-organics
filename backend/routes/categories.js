const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories — public, full tree (parents + subcategories)
router.get('/', async (req, res, next) => {
  try {
    res.json({ categories: await store.listCategories() });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories — admin only. { name, slug, parent_id? }
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, slug, parent_id } = req.body || {};
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required.' });
    const category = await store.createCategory({ name, slug, parent_id: parent_id || null });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/categories/:id — admin only
router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const category = await store.updateCategory(req.params.id, req.body);
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    res.json({ category });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ok = await store.deleteCategory(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Category not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
