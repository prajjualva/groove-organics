const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories — public tree (parents + subcategories), active-only
// for anyone who isn't admin/staff — a deactivated category (Admin Phase 5)
// shouldn't appear in the storefront's own nav/filter list, but the admin
// Categories tab still needs to see it to be able to re-activate it.
router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.user && ['admin', 'staff'].includes(req.user.role);
    res.json({ categories: await store.listCategories({ includeInactive }) });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories — admin only. { name, slug, parent_id? }
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, slug, parent_id } = req.body || {};
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required.' });
    // The schema defaults sort_order to 0 for every row, which would leave
    // every never-explicitly-reordered category tied at 0 — appending new
    // ones after the current max within their own sibling group (same
    // parent_id) instead means a freshly created category always lands at
    // the end of its list, matching where it visually shows up.
    const existing = await store.listCategories({ includeInactive: true });
    const maxOrder = existing.reduce(
      (max, c) => ((c.parent_id || null) === (parent_id || null) ? Math.max(max, c.sort_order || 0) : max),
      0
    );
    const category = await store.createCategory({ name, slug, parent_id: parent_id || null, sort_order: maxOrder + 1 });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'category.create', entityType: 'category', entityId: category.id, summary: `Created category "${category.name}"` }).catch(() => {});
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
    // The ↑/↓ reorder buttons PATCH just { sort_order } on every affected
    // sibling for every click — logging each of those would flood the audit
    // log with reorder noise, so only log when something ELSE was touched.
    const touchedFields = Object.keys(req.body || {});
    if (touchedFields.some((f) => f !== 'sort_order')) {
      store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'category.update', entityType: 'category', entityId: req.params.id, summary: `Updated category "${category.name}"` }).catch(() => {});
    }
    res.json({ category });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await store.listCategories({ includeInactive: true });
    const before = existing.find((c) => c.id === req.params.id);
    const ok = await store.deleteCategory(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Category not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'category.delete', entityType: 'category', entityId: req.params.id, summary: `Deleted category "${before ? before.name : req.params.id}"` }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
