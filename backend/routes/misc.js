const express = require('express');
const store = require('../lib/dataStore');

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

// Banner endpoints (GET/POST/PATCH/DELETE /api/banners...) moved to
// routes/banners.js — that grew into a real feature (scheduling, reorder,
// duplicate, bulk actions) and no longer fit under "misc".

module.exports = router;
