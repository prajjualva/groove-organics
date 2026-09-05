const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/customers — admin/staff only. Every account (customers, plus
// staff/admin so their role shows too), for the admin "Customers" tab.
// Order counts/spend aren't included — the admin UI already loads
// /api/orders for the Reports tab and matches on email itself.
router.get('/', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    res.json({ customers: await store.listCustomers() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
