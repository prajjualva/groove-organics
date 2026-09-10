const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/media — admin/staff only. The whole library, newest first — used
// by the Media Library tab and by any other admin panel that wants to let
// an admin pick an existing upload instead of choosing a new file.
router.get('/', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ media: await store.listMedia() });
  } catch (err) {
    next(err);
  }
});

// POST /api/media — admin/staff. Body: { filename, dataUrl, altText? }.
// dataUrl is a full "data:<mime>;base64,..." string, same shape the admin
// UI's readFileAsDataUrl() already produces for every other image upload in
// this app (products/categories/banners) — no new upload mechanism.
router.post('/', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { filename, dataUrl, altText } = req.body || {};
    const item = await store.uploadMedia({
      filename,
      dataUrl,
      altText: typeof altText === 'string' ? altText.trim().slice(0, 300) || null : null,
      uploadedBy: req.user.email,
    });
    store
      .logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'media.upload', entityType: 'media', entityId: item.id, summary: `Uploaded "${item.filename}" to the Media Library` })
      .catch(() => {});
    res.status(201).json({ item });
  } catch (err) {
    if (err.message && /file|filename/i.test(err.message)) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// PATCH /api/media/:id — admin/staff. Body: { altText }.
router.patch('/:id', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { altText } = req.body || {};
    const item = await store.updateMediaAltText(req.params.id, typeof altText === 'string' ? altText.trim().slice(0, 300) || null : null);
    if (!item) return res.status(404).json({ error: 'File not found.' });
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/media/:id — admin/staff. Deletes the Storage object (live
// mode) and its library row. Does NOT check whether the file is still
// referenced anywhere (a product image, a page body, a homepage banner) —
// same as every other delete in this app (e.g. deleting a category some
// products still reference) — deleting the library entry never breaks an
// existing use, since those all keep their own copy of the URL string.
router.delete('/:id', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const ok = await store.deleteMedia(req.params.id);
    if (!ok) return res.status(404).json({ error: 'File not found.' });
    store.logAudit({ actor: req.user.email, actorRole: req.user.role, action: 'media.delete', entityType: 'media', entityId: req.params.id, summary: 'Deleted a file from the Media Library' }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
