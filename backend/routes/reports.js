const express = require('express');
const store = require('../lib/dataStore');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/summary — admin/staff only. Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
// (both optional — omitting either leaves that side unbounded, matching the
// old "all time" Reports tab behavior). The one place date-ranged reporting
// is computed (see dataStore.js's getReportsSummary) — revenue/orders/AOV,
// orders by status, best sellers, coupon usage, low stock, new customers +
// top spenders, and referral signups/discount/points paid out, all in one
// response so the Reports tab doesn't need six separate round-trips.
router.get('/summary', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { from, to } = req.query || {};
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD.' });
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: 'to must be YYYY-MM-DD.' });
    const report = await store.getReportsSummary({ from: from || null, to: to || null });
    res.json({ report });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/audit-log — admin/staff only. Query: ?from=&to=&entityType=&actor=
// Exposes dataStore.js's listAuditLog (backed by the audit_log table) to the
// admin UI's Audit Log tab. Newest first, capped at 200 rows — this is a
// browse/spot-check view, not a full export.
router.get('/audit-log', requireRole('admin', 'staff'), async (req, res, next) => {
  try {
    const { from, to, entityType, actor } = req.query || {};
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD.' });
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: 'to must be YYYY-MM-DD.' });
    const entries = await store.listAuditLog({ from: from || null, to: to || null, entityType: entityType || null, actor: actor || null });
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
