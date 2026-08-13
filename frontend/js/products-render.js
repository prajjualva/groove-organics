// Shared product-card rendering, used by the homepage and the shop page.

function productImageSvg(product) {
  if (product.is_coming_soon) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#33422B" stroke-width="1"><path d="M12 2v20M2 12h20" stroke-dasharray="2 3"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="#FBF6EC" stroke-width="1"><path d="M12 2C8 6 5 9.5 5 14a7 7 0 0 0 14 0c0-4.5-3-8-7-12z"/></svg>`;
}

function productCardHtml(product) {
  const badge = product.is_bestseller
    ? '<span class="product-card__badge">Bestseller</span>'
    : product.is_new
    ? '<span class="product-card__badge product-card__badge--new">New</span>'
    : '';

  if (product.is_coming_soon) {
    return `
      <div class="product-card">
        ${badge}
        <div class="product-card__image product-card__image--coming-soon">${productImageSvg(product)}</div>
        <h3>${product.name}</h3>
        <p class="product-card__desc">${product.short_description || ''}</p>
        <div class="product-card__footer">
          <span class="mono" style="font-size:0.85rem;color:var(--moss-700);">Notify me</span>
          <button class="btn btn--outline btn--sm" data-notify="${product.slug}">Notify Me</button>
        </div>
      </div>`;
  }

  const priceHtml = product.compare_at_price_paise
    ? `<del>${formatRupees(product.compare_at_price_paise)}</del>${formatRupees(product.price_paise)}`
    : formatRupees(product.price_paise);

  return `
    <div class="product-card">
      ${badge}
      <a href="/product?slug=${encodeURIComponent(product.slug)}" style="text-decoration:none;color:inherit;">
        <div class="product-card__image">${productImageSvg(product)}</div>
        <h3>${product.name}</h3>
        <p class="product-card__desc">${product.short_description || ''}</p>
        ${product.rating ? `<div class="product-card__rating">★ ${product.rating} (${product.review_count} reviews)</div>` : ''}
      </a>
      <div class="product-card__footer">
        <span class="product-card__price mono">${priceHtml}</span>
        <button class="btn btn--primary btn--sm" data-add-to-cart="${product.id}">Add</button>
      </div>
    </div>`;
}

function wireProductCardButtons(container, products) {
  container.querySelectorAll('[data-add-to-cart]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const product = products.find((p) => p.id === btn.getAttribute('data-add-to-cart'));
      if (product) {
        addToCart(product, 1);
        btn.textContent = 'Added ✓';
        setTimeout(() => (btn.textContent = 'Add'), 1200);
      }
    });
  });
  container.querySelectorAll('[data-notify]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = prompt('Enter your email and we’ll let you know when this launches:');
      if (!email) return;
      try {
        await api('/api/newsletter', { method: 'POST', body: { email }, auth: false });
        btn.textContent = 'Thanks!';
      } catch (err) {
        alert(err.message);
      }
    });
  });
}
