const express = require('express');
const PDFDocument = require('pdfkit');
const store = require('../lib/dataStore');
const { buildInvoiceDoc } = require('../lib/invoice');

const router = express.Router();

// GET /api/orders/:id/invoice — streams a PDF invoice.
// Admin Phase 4: previously reachable by ANYONE who had the order-id URL, no
// auth check at all — flagged in the customer-website audit. Now: admin/staff
// can always fetch it; a guest order (no user_id — the confirmation page's
// own use case) stays reachable by unguessable id, same as before; but an
// order placed while logged in now requires being logged in as that same
// customer (or admin/staff) — a stranger with the URL for someone else's
// account order can no longer download their invoice.
//
// The actual PDF content lives in backend/lib/invoice.js's buildInvoiceDoc,
// shared with the order-confirmation email's attached copy — one place for
// the invoice's layout and numbers, so the two can never drift apart.
router.get('/:id/invoice', async (req, res, next) => {
  try {
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'staff');
    const isOwner = req.user && order.user_id && req.user.userId === order.user_id;
    if (order.user_id && !isStaff && !isOwner) {
      return res.status(403).json({ error: "Sign in as this order's customer to view this invoice." });
    }
    const settings = await store.getStoreSettings().catch(() => ({}));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${order.order_number}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);
    await buildInvoiceDoc(doc, order, settings, store);
    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
