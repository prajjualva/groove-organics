const express = require('express');
const store = require('../lib/dataStore');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All routes here require a logged-in user (any role — admin/staff can also
// have their own addresses/orders/wishlist if they shop as customers too).
router.use(requireAuth);

// --- Addresses ---
router.get('/addresses', async (req, res, next) => {
  try {
    res.json({ addresses: await store.listAddresses(req.user.userId) });
  } catch (err) {
    next(err);
  }
});

router.post('/addresses', async (req, res, next) => {
  try {
    const address = await store.createAddress(req.user.userId, req.body);
    res.status(201).json({ address });
  } catch (err) {
    next(err);
  }
});

router.patch('/addresses/:id', async (req, res, next) => {
  try {
    const address = await store.updateAddress(req.user.userId, req.params.id, req.body);
    if (!address) return res.status(404).json({ error: 'Address not found.' });
    res.json({ address });
  } catch (err) {
    next(err);
  }
});

router.delete('/addresses/:id', async (req, res, next) => {
  try {
    const ok = await store.deleteAddress(req.user.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Address not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Order history (own orders only) ---
router.get('/orders', async (req, res, next) => {
  try {
    res.json({ orders: await store.listOrdersForUser(req.user.userId) });
  } catch (err) {
    next(err);
  }
});

// --- Wishlist ---
router.get('/wishlist', async (req, res, next) => {
  try {
    res.json({ wishlist: await store.listWishlist(req.user.userId) });
  } catch (err) {
    next(err);
  }
});

router.post('/wishlist', async (req, res, next) => {
  try {
    const { product_id } = req.body || {};
    if (!product_id) return res.status(400).json({ error: 'product_id is required.' });
    await store.addWishlistItem(req.user.userId, product_id);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/wishlist/:productId', async (req, res, next) => {
  try {
    await store.removeWishlistItem(req.user.userId, req.params.productId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Refer a friend ---
// GET /api/customer/referral — this customer's own share code/link + how
// many people they've referred and how many Groove Points that's earned
// them. Generates a code on first request for any account that predates
// this feature (see dataStore.getOrCreateReferralCode).
router.get('/referral', async (req, res, next) => {
  try {
    const { code, referredCount, pointsFromReferrals, referrals } = await store.getReferralStats(req.user.userId);
    const origin = process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get('host')}`;
    res.json({
      code,
      link: `${origin}/account?ref=${encodeURIComponent(code)}`,
      referredCount,
      pointsFromReferrals,
      // Per-friend breakdown — name/email, when they joined, how many
      // orders they've placed/paid, what they've spent, and how many
      // Groove Points that specific friend has earned this customer.
      referrals,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
