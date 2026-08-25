const express = require('express');
const PDFDocument = require('pdfkit');
const store = require('../lib/dataStore');

const router = express.Router();

function formatRupees(paise) {
  return `Rs. ${(paise / 100).toFixed(2)}`;
}

// GET /api/orders/:id/invoice — streams a PDF invoice.
// Note: reachable with just the order id (no login) so the confirmation page
// can link straight to it. Order ids are unguessable UUIDs/mock ids, but this
// is worth revisiting (e.g. add an email-match check) before going live.
router.get('/:id/invoice', async (req, res, next) => {
  try {
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
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
      const hsnNote = product && product.hsn_code ? `HSN: ${product.hsn_code}` : '';
      const gstNote = item.gst_rate_percent ? `GST @ ${item.gst_rate_percent}% (incl.): ${formatRupees(item.line_gst_paise || 0)}` : '';
      const shipNote = item.line_shipping_paise ? `Shipping: ${formatRupees(item.line_shipping_paise)}` : '';
      const noteLine = [hsnNote, gstNote, shipNote].filter(Boolean).join('   ');
      if (noteLine) {
        doc.fontSize(8).fillColor('gray').text(noteLine).fillColor('black');
      }
    }
    doc.moveDown();

    doc.fontSize(10).text(`Subtotal (before GST): ${formatRupees(order.subtotal_paise)}`);
    doc.text(`GST (included above): ${formatRupees(order.gst_paise)}`);
    doc.text(`Shipping: ${formatRupees(order.shipping_paise)}`);
    if (order.discount_paise) doc.text(`Coupon discount${order.coupon_code ? ` (${order.coupon_code})` : ''}: -${formatRupees(order.discount_paise)}`);
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
