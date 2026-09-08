const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Homepage hero slider, festive-offer/promo cards, sitewide announcement
// strip — one flexible table (see db/schema.sql), managed from
// Admin -> Banners. Draft/Scheduled/Active/Expired status is computed on
// every read from is_active + scheduled_start/scheduled_end (see
// computeBannerStatus in dataStore.js) rather than stored, so there's no
// cron job that can silently stop running.

// GET /api/banners?placement=&status=&search=
// Public callers (the storefront) only ever see is_active+in-window
// ("Active") banners for a placement. Admin/staff additionally pass
// includeInactive so the Banners tab table can show every status, and may
// filter by status or search title/subtitle text.
router.get('/', async (req, res, next) => {
  try {
    const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'staff');
    const banners = await store.listBanners({
      includeInactive: !!isStaff,
      placement: req.query.placement || null,
      status: isStaff ? req.query.status || null : null,
      search: isStaff ? req.query.search || null : null,
    });
    res.json({ banners });
  } catch (err) {
    next(err);
  }
});

// POST /api/banners — admin only
router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    if (!req.body || !req.body.image_url) {
      return res.status(400).json({ error: 'An image is required.' });
    }
    const banner = await store.createBanner(req.body);
    res.status(201).json({ banner });
  } catch (err) {
    next(err);
  }
});

// POST /api/banners/reorder — admin only. { ids: [id, id, ...] } in the new
// display order (all from the same placement group in practice — the admin
// table only lets you drag within a placement's rows).
router.post('/reorder', requireRole('admin'), async (req, res, next) => {
  try {
    const ids = Array.isArray((req.body || {}).ids) ? req.body.ids : null;
    if (!ids || !ids.length) return res.status(400).json({ error: 'ids array is required.' });
    const banners = await store.reorderBanners(ids);
    res.json({ banners });
  } catch (err) {
    next(err);
  }
});

// POST /api/banners/bulk — admin only. { ids: [...], action: 'activate' | 'deactivate' | 'delete' }
// Backs the Banners tab's select-all + bulk-action bar.
router.post('/bulk', requireRole('admin'), async (req, res, next) => {
  try {
    const { ids, action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array is required.' });
    if (action === 'delete') {
      const count = await store.bulkDeleteBanners(ids);
      return res.json({ ok: true, count });
    }
    if (action === 'activate' || action === 'deactivate') {
      const banners = await store.bulkUpdateBanners(ids, { is_active: action === 'activate' });
      return res.json({ banners });
    }
    res.status(400).json({ error: "action must be 'activate', 'deactivate' or 'delete'." });
  } catch (err) {
    next(err);
  }
});

// POST /api/banners/:id/duplicate — admin only. Lands as a Draft at the end
// of the same placement's order so it never silently doubles up live.
router.post('/:id/duplicate', requireRole('admin'), async (req, res, next) => {
  try {
    const banner = await store.duplicateBanner(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found.' });
    res.status(201).json({ banner });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/banners/:id — admin only (edit form, or a quick toggle like
// is_active from the table)
router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const banner = await store.updateBanner(req.params.id, req.body);
    if (!banner) return res.status(404).json({ error: 'Banner not found.' });
    res.json({ banner });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/banners/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ok = await store.deleteBanner(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Banner not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
