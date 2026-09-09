const express = require('express');
const PDFDocument = require('pdfkit');
const store = require('../lib/dataStore');

const router = express.Router();

function formatRupees(paise) {
  return `Rs. ${(paise / 100).toFixed(2)}`;
}

// GET /api/orders/:id/invoice — streams a PDF invoice.
// Admin Phase 4: previously reachable by ANYONE who had the order-id URL, no
// auth check at all — flagged in the customer-website audit. Now: admin/staff
// can always fetch it; a guest order (no user_id — the confirmation page's
// own use case) stays reachable by unguessable id, same as before; but an
// order placed while logged in now requires being logged in as that same
// customer (or admin/staff) — a stranger with the URL for someone else's
// account order can no longer download their invoice.
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

    doc.fontSize(20).text(settings.business_legal_name || 'Groove Organics', { continued: false });
    doc.fontSize(10).fillColor('#556B2F').text('Goodness of Earth').fillColor('black');
    if (settings.gstin) doc.fontSize(9).fillColor('gray').text(`GSTIN: ${settings.gstin}`).fillColor('black');
    if (settings.business_address) doc.fontSize(9).fillColor('gray').text(settings.business_address).fillColor('black');
    doc.moveDown();
    doc.fontSize(14).text(`Invoice — ${order.order_number}`);
    doc.fontSize(10).text(`Date: ${new Date(order.created_at || Date.now()).toLocaleDateString('en-IN')}`);
    doc.fontSize(9).fillColor('gray').text('All prices below are inclusive of GST — GST is shown as a breakup, not an extra charge.').fillColor('black');
    if (order.tax_type && order.tax_type !== 'none') {
      const supplyNote =
        order.tax_type === 'intrastate'
          ? `Place of supply: ${order.customer_state || 'same state'} (intrastate — CGST + SGST)`
          : `Place of supply: ${order.customer_state || 'other state'} (interstate — IGST)${order.seller_state ? ` — seller state: ${order.seller_state}` : ''}`;
      doc.fontSize(9).fillColor('gray').text(supplyNote).fillColor('black');
    }
    doc.moveDown();

    doc.fontSize(11).text('Bill To:', { underline: true });
    doc.fontSize(10).text(order.customer_name);
    doc.text(order.customer_email);
    if (order.customer_phone) doc.text(order.customer_phone);
    const addr = order.shipping_address || {};
    const addrLine = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
    if (addrLine) doc.text(addrLine);
    doc.moveDown();

    doc.fontSize(11).text('Items:', { underline: true });
    doc.moveDown(0.5);
    const items = order.order_items || [];
    for (const item of items) {
      const name = item.variant_label ? `${item.product_name} (${item.variant_label})` : item.product_name;
      const product = item.product_id ? await store.getProductById(item.product_id).catch(() => null) : null;
      doc
        .fontSize(10)
        .text(`${name}  x${item.quantity}  —  ${formatRupees(item.unit_price_paise)} each (GST-incl.)  =  ${formatRupees(item.line_total_paise)}`);
      const hsnNote = (item.hsn_code || (product && product.hsn_code)) ? `HSN: ${item.hsn_code || product.hsn_code}` : '';
      let gstNote = '';
      if (item.gst_rate_percent) {
        if (item.cgst_paise || item.sgst_paise) {
          gstNote = `GST @ ${item.gst_rate_percent}% (incl.): CGST ${formatRupees(item.cgst_paise || 0)} + SGST ${formatRupees(item.sgst_paise || 0)}`;
        } else if (item.igst_paise) {
          gstNote = `GST @ ${item.gst_rate_percent}% (incl.): IGST ${formatRupees(item.igst_paise)}`;
        } else {
          gstNote = `GST @ ${item.gst_rate_percent}% (incl.): ${formatRupees(item.line_gst_paise || 0)}`;
        }
      }
      const shipNote = item.line_shipping_paise ? `Shipping: ${formatRupees(item.line_shipping_paise)}` : '';
      const noteLine = [hsnNote, gstNote, shipNote].filter(Boolean).join('   ');
      if (noteLine) {
        doc.fontSize(8).fillColor('gray').text(noteLine).fillColor('black');
      }
    }
    doc.moveDown();

    doc.fontSize(10).text(`Subtotal (before GST): ${formatRupees(order.subtotal_paise)}`);
    if (order.cgst_paise || order.sgst_paise) {
      doc.text(`CGST (included above): ${formatRupees(order.cgst_paise || 0)}`);
      doc.text(`SGST (included above): ${formatRupees(order.sgst_paise || 0)}`);
    } else if (order.igst_paise) {
      doc.text(`IGST (included above): ${formatRupees(order.igst_paise)}`);
    } else {
      doc.text(`GST (included above): ${formatRupees(order.gst_paise)}`);
    }
    doc.text(`Shipping: ${formatRupees(order.shipping_paise)}`);
    if (order.coupon_code || order.discount_paise) {
      const couponPart = order.coupon_code
        ? Math.max(0, (order.discount_paise || 0) - (order.loyalty_discount_paise || 0) - (order.referral_discount_paise || 0))
        : 0;
      if (couponPart) doc.text(`Coupon discount (${order.coupon_code}): -${formatRupees(couponPart)}`);
    }
    if (order.loyalty_discount_paise) doc.text(`Groove Points redeemed: -${formatRupees(order.loyalty_discount_paise)}`);
    if (order.referral_discount_paise) doc.text(`Referral discount: -${formatRupees(order.referral_discount_paise)}`);
    doc.fontSize(12).text(`Total: ${formatRupees(order.total_paise)}`, { underline: true });
    doc.moveDown();
    doc.fontSize(9).fillColor('gray').text(`Payment method: ${order.payment_gateway === 'cod' ? 'Cash on Delivery' : (order.payment_gateway || 'online')}`);
    doc.text(`Payment status: ${order.payment_status}`);
    doc.text(`Order status: ${order.status}`);
    if (order.tracking_number) {
      doc.text(`Tracking: ${order.tracking_number}${order.courier_name ? ` (${order.courier_name})` : ''}`);
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
