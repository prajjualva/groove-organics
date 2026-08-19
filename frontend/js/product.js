async function loadProduct() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  const wrap = document.getElementById('product-detail');
  if (!slug) {
    wrap.innerHTML = '<div class="empty-state">Product not specified.</div>';
    return;
  }
  try {
    const { product } = await api(`/api/products/${encodeURIComponent(slug)}`, { auth: false });
    document.title = `${product.name} — Groove Organics`;

    const priceHtml = product.compare_at_price_paise
      ? `<del>${formatRupees(product.compare_at_price_paise)}</del> ${formatRupees(product.price_paise)}`
      : formatRupees(product.price_paise);

    wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start;">
        <div class="product-card__image" style="aspect-ratio:1/1;">
          ${
            product.image_url
              ? `<img src="${product.image_url}" alt="${product.name}" style="width:100%;height:100%;object-fit:cover;" />`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="#FBF6EC" stroke-width="1" style="width:40%;"><path d="M12 2C8 6 5 9.5 5 14a7 7 0 0 0 14 0c0-4.5-3-8-7-12z"/></svg>`
          }
        </div>
        <div>
          <span class="breadcrumb"><a href="/shop">Shop</a> / ${product.category}</span>
          <h1>${product.name}</h1>
          ${product.rating ? `<div class="product-card__rating" style="margin-bottom:16px;">★ ${product.rating} (${product.review_count} reviews)</div>` : ''}
          <p style="font-size:1.1rem;color:var(--moss-700);">${product.description || product.short_description || ''}</p>
          <div class="mono" style="font-size:1.6rem;margin:20px 0;">${priceHtml}</div>
          ${
            product.is_coming_soon
              ? `<button class="btn btn--outline" id="notify-btn">Notify Me When Available</button>`
              : `
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                <label for="qty" style="font-weight:600;font-size:0.9rem;">Qty</label>
                <input id="qty" type="number" min="1" value="1" style="width:70px;padding:10px;border-radius:8px;border:1px solid var(--sand-300);" />
              </div>
              <button class="btn btn--primary" id="add-btn">Add to Cart</button>
              <a href="/cart" class="btn btn--outline" style="margin-left:10px;">View Cart</a>
              <button class="btn btn--outline" id="wishlist-btn" style="margin-left:10px;">♡ Save</button>
              `
          }
          <div class="banner-note" style="margin-top:32px;">
            ${product.stock > 0 ? `${product.stock} in stock.` : ''} Cold-pressed / wood-pressed (chekku method). GST calculated at checkout.
          </div>
        </div>
      </div>

      <div style="max-width:640px;margin-top:64px;">
        <h2>Reviews</h2>
        <div id="reviews-list"><p>Loading reviews…</p></div>
        <div class="card" style="margin-top:24px;">
          <h3 class="mt-0">Write a review</h3>
          <div id="review-form-wrap"></div>
        </div>
      </div>
    `;

    loadReviews(product);
    renderReviewForm(product);

    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const qty = Math.max(1, parseInt(document.getElementById('qty').value, 10) || 1);
        addToCart(product, qty);
        addBtn.textContent = 'Added to Cart ✓';
        setTimeout(() => (addBtn.textContent = 'Add to Cart'), 1400);
      });
    }
    const wishlistBtn = document.getElementById('wishlist-btn');
    if (wishlistBtn) {
      wishlistBtn.addEventListener('click', async () => {
        if (!getAuthToken()) {
          window.location.href = `/account?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }
        try {
          await api('/api/customer/wishlist', { method: 'POST', body: { product_id: product.id } });
          wishlistBtn.textContent = '♥ Saved';
        } catch (err) {
          alert(err.message);
        }
      });
    }
    const notifyBtn = document.getElementById('notify-btn');
    if (notifyBtn) {
      notifyBtn.addEventListener('click', async () => {
        const email = prompt('Enter your email and we’ll let you know when this launches:');
        if (!email) return;
        try {
          await api('/api/newsletter', { method: 'POST', body: { email }, auth: false });
          notifyBtn.textContent = 'Thanks — we’ll be in touch!';
        } catch (err) {
          alert(err.message);
        }
      });
    }
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Couldn't load this product: ${err.message}</div>`;
  }
}

async function loadReviews(product) {
  const wrap = document.getElementById('reviews-list');
  try {
    const { reviews } = await api(`/api/products/${encodeURIComponent(product.slug)}/reviews`, { auth: false });
    if (!reviews.length) {
      wrap.innerHTML = '<p style="color:var(--moss-700);">No reviews yet — be the first.</p>';
      return;
    }
    wrap.innerHTML = reviews
      .map(
        (r) => `
      <div class="card" style="margin-bottom:14px;">
        <div class="flex-between">
          <strong>${r.reviewer_name}</strong>
          <span class="mono" style="color:var(--gold-600);">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
        </div>
        ${r.title ? `<p style="font-weight:600;margin:8px 0 4px;">${r.title}</p>` : ''}
        ${r.body ? `<p style="margin:0;color:var(--moss-700);">${r.body}</p>` : ''}
        <p style="font-size:0.75rem;color:var(--moss-700);opacity:0.7;margin:8px 0 0;">${new Date(r.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
      </div>`
      )
      .join('');
  } catch (err) {
    wrap.innerHTML = `<p class="form-error">Couldn't load reviews: ${err.message}</p>`;
  }
}

function renderReviewForm(product) {
  const wrap = document.getElementById('review-form-wrap');
  if (!getAuthToken()) {
    wrap.innerHTML = `<p style="color:var(--moss-700);"><a href="/account?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}" style="text-decoration:underline;">Sign in</a> to write a review.</p>`;
    return;
  }
  wrap.innerHTML = `
    <div class="form-field">
      <label for="rev-rating">Rating</label>
      <select id="rev-rating">
        <option value="5">★★★★★ (5)</option>
        <option value="4">★★★★☆ (4)</option>
        <option value="3">★★★☆☆ (3)</option>
        <option value="2">★★☆☆☆ (2)</option>
        <option value="1">★☆☆☆☆ (1)</option>
      </select>
    </div>
    <div class="form-field"><label for="rev-title">Title (optional)</label><input id="rev-title" /></div>
    <div class="form-field"><label for="rev-body">Review</label><textarea id="rev-body" rows="3"></textarea></div>
    <button class="btn btn--primary" id="submit-review-btn">Submit Review</button>
    <p class="form-error" id="review-error" style="display:none;"></p>
  `;
  document.getElementById('submit-review-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('review-error');
    errorEl.style.display = 'none';
    try {
      await api(`/api/products/${encodeURIComponent(product.slug)}/reviews`, {
        method: 'POST',
        body: {
          rating: document.getElementById('rev-rating').value,
          title: document.getElementById('rev-title').value,
          body: document.getElementById('rev-body').value,
        },
      });
      wrap.innerHTML = '<p class="form-success">Thanks for your review!</p>';
      loadReviews(product);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav('shop');
  renderFooter();
  loadProduct();
});
