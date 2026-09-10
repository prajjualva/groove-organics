const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/pages — public sees published only; admin/staff sees drafts too
// (used by the admin Pages tab's list).
router.get('/', async (req, res, next) => {
  try {
    const includeUnpublished = req.user && ['admin', 'staff'].includes(req.user.role);
    res.json({ pages: await store.listPages({ includeUnpublished }) });
  } catch (err) {
    next(err);
  }
});

// GET /api/pages/:slug — public, published-only unless admin/staff. Backs
// the generic /p/:slug page renderer (frontend/page.html + page.js).
router.get('/:slug', async (req, res, next) => {
  try {
    const includeUnpublished = req.user && ['admin', 'staff'].includes(req.user.role);
    const page = await store.getPageBySlug(req.params.slug, { includeUnpublished });
    if (!page) return res.status(404).json({ error: 'Page not found.' });
    res.json({ page });
  } catch (err) {
    next(err);
  }
});

// POST /api/pages — admin/staff. Body: { slug, title, body, status?, seoTitle?, seoMetaDescription? }
router.post('/', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { slug, title, body, status, seoTitle, seoMetaDescription } = req.body || {};
    const page = await store.createPage({ slug, title, body, status: status === 'published' ? 'published' : 'draft', seoTitle, seoMetaDescription });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'page.create', entityType: 'page', entityId: page.id, summary: `Created page "${page.title}" (/p/${page.slug}, ${page.status})` }).catch(() => {});
    res.status(201).json({ page });
  } catch (err) {
    if (err.message && /slug|title|already exists/i.test(err.message)) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/pages/:id — admin/staff. Partial update — same shape as create.
router.patch('/:id', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const page = await store.updatePage(req.params.id, req.body || {});
    if (!page) return res.status(404).json({ error: 'Page not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'page.update', entityType: 'page', entityId: page.id, summary: `Updated page "${page.title}" (/p/${page.slug}, ${page.status})` }).catch(() => {});
    res.json({ page });
  } catch (err) {
    if (err.message && /slug|already exists/i.test(err.message)) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/pages/:id — admin/staff.
router.delete('/:id', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const ok = await store.deletePage(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Page not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'page.delete', entityType: 'page', entityId: req.params.id, summary: 'Deleted a page' }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
