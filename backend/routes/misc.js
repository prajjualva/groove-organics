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

// GET /api/banners — public: active homepage banners
router.get('/banners', async (req, res, next) => {
  try {
    const includeInactive = req.user && req.user.role === 'admin';
    const banners = await store.listBanners({ includeInactive });
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

module.exports = router;
