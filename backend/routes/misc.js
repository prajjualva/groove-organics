const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/newsletter — homepage signup, "10% off your first order"
router.post('/newsletter', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required.' });
    await store.addNewsletterSubscriber(email);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/contact — contact page form
router.post('/contact', async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !message) return res.status(400).json({ error: 'name, email and message are required.' });
    await store.addContactMessage({ name, email, subject, message });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/banners?placement=homepage_hero — public: active banners, optionally filtered by placement
router.get('/banners', async (req, res, next) => {
  try {
    const includeInactive = req.user && req.user.role === 'admin';
    const banners = await store.listBanners({ includeInactive, placement: req.query.placement || null });
    res.json({ banners });
  } catch (err) {
    next(err);
  }
});

// POST /api/banners — admin only
router.post('/banners', requireRole('admin'), async (req, res, next) => {
  try {
    const banner = await store.createBanner(req.body);
    res.status(201).json({ banner });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/banners/:id — admin only (e.g. toggling is_active, changing sort_order)
router.patch('/banners/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const banner = await store.updateBanner(req.params.id, req.body);
    if (!banner) return res.status(404).json({ error: 'Banner not found.' });
    res.json({ banner });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/banners/:id — admin only
router.delete('/banners/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ok = await store.deleteBanner(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Banner not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
