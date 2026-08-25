const express = require('express');
const store = require('../lib/dataStore');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/products/:slug/reviews — public, approved reviews only
router.get('/products/:slug/reviews', async (req, res, next) => {
  try {
    const product = await store.getProductBySlug(req.params.slug);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ reviews: await store.listReviewsForProduct(product.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:slug/reviews — logged-in customers who have actually
// bought this product (a paid or delivered order containing it) only.
router.post('/products/:slug/reviews', requireAuth, async (req, res, next) => {
  try {
    const product = await store.getProductBySlug(req.params.slug);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const myOrders = await store.listOrdersForUser(req.user.userId);
    const hasPurchased = myOrders.some(
      (o) =>
        (o.payment_status === 'paid' || o.status === 'delivered') &&
        (o.order_items || []).some((item) => item.product_id === product.id)
    );
    if (!hasPurchased) {
      return res.status(403).json({ error: 'Only customers who have purchased this product can review it.' });
    }

    const { rating, title, body } = req.body || {};
    const numericRating = Number(rating);
    if (!numericRating || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: 'rating must be a number from 1 to 5.' });
    }
    const review = await store.createReview({
      product_id: product.id,
      user_id: req.user.userId,
      reviewer_name: req.user.full_name || req.user.email,
      rating: numericRating,
      title,
      body,
    });
    res.status(201).json({ review });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/reviews/:id — admin moderation
router.delete('/reviews/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ok = await store.deleteReview(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Review not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
