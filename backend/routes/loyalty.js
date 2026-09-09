const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/loyalty/balance — the logged-in customer's own Groove Points balance + history
router.get('/balance', requireRole('customer', 'admin', 'staff'), async (req, res, next) => {
  try {
    const [balance, ledger] = await Promise.all([
      store.getLoyaltyBalance(req.user.userId),
      store.listLoyaltyLedger(req.user.userId),
    ]);
    res.json({ balance, ledger });
  } catch (err) {
    next(err);
  }
});

// POST /api/loyalty/preview  { points, goodsPaise } -> { points, discountPaise }
// Mirrors the exact server-side math createOrder uses (previewLoyaltyRedemption,
// called from createOrder with the same capBasisPaise = goods value after any
// coupon discount), so the live preview shown before checkout always matches
// what the order will actually apply — no separate client-side formula to
// drift out of sync.
router.post('/preview', requireRole('customer', 'admin', 'staff'), async (req, res, next) => {
  try {
    const points = parseInt((req.body || {}).points, 10) || 0;
    const goodsPaise = Number((req.body || {}).goodsPaise) || 0;
    const result = await store.previewLoyaltyRedemption(req.user.userId, points, goodsPaise);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
