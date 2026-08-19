const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/content — public. Returns { homepage_hero: {...}, homepage_story: {...}, ... }
router.get('/', async (req, res, next) => {
  try {
    res.json({ content: await store.listContent() });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/content/:key — admin only. Body is the full replacement value for that section.
router.patch('/:key', requireRole('admin'), async (req, res, next) => {
  try {
    const value = await store.setContent(req.params.key, req.body);
    res.json({ key: req.params.key, value });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
