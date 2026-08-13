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
          <svg viewBox="0 0 24 24" fill="none" stroke="#FBF6EC" stroke-width="1" style="width:40%;"><path d="M12 2C8 6 5 9.5 5 14a7 7 0 0 0 14 0c0-4.5-3-8-7-12z"/></svg>
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
              `
          }
          <div class="banner-note" style="margin-top:32px;">
            ${product.stock > 0 ? `${product.stock} in stock.` : ''} Cold-pressed / wood-pressed (chekku method). GST calculated at checkout.
          </div>
        </div>
      </div>
    `;

    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const qty = Math.max(1, parseInt(document.getElementById('qty').value, 10) || 1);
        addToCart(product, qty);
        addBtn.textContent = 'Added to Cart ✓';
        setTimeout(() => (addBtn.textContent = 'Add to Cart'), 1400);
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

document.addEventListener('DOMContentLoaded', () => {
  renderNav('shop');
  renderFooter();
  loadProduct();
});
