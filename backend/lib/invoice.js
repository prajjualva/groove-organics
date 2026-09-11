// Shared invoice-PDF builder, used by two callers that need the exact same
// invoice content:
//   1. GET /api/orders/:id/invoice (backend/routes/invoice.js) — streams
//      straight to the HTTP response as the customer/admin views/downloads it.
//   2. The order-confirmation email (backend/lib/email.js via
//      backend/routes/orders.js) — needs the whole PDF in memory first, to
//      attach it to the email.
// buildInvoiceDoc does the actual drawing onto a caller-supplied PDFDocument
// (caller owns .pipe()/.end()); generateInvoiceBuffer wraps that for the
// in-memory case. Keeping one function for the content means the emailed
// invoice can never drift out of sync with the one a customer can view/
// download on the site.
const PDFDocument = require('pdfkit');

function formatRupees(paise) {
  return `Rs. ${(paise / 100).toFixed(2)}`;
}

async function buildInvoiceDoc(doc, order, settings, store) {
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
}

// Renders the same invoice into an in-memory Buffer rather than streaming to
// an HTTP response — for attaching it to an email. store is passed in
// (rather than required here) to dodge a require cycle: dataStore.js already
// requires email.js, so email.js/invoice.js must never require dataStore.js
// themselves — see backend/routes/orders.js, the one caller that has both
// `store` and the freshly-created `order` on hand already.
async function generateInvoiceBuffer(order, settings, store) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    buildInvoiceDoc(doc, order, settings, store)
      .then(() => doc.end())
      .catch(reject);
  });
}

module.exports = { formatRupees, buildInvoiceDoc, generateInvoiceBuffer };
