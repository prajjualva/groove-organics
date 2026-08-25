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

module.exports = router;
