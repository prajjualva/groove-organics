// Shared product-card rendering, used by the homepage and the shop page.

function productImageSvg(product) {
  if (product.is_coming_soon) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#33422B" stroke-width="1"><path d="M12 2v20M2 12h20" stroke-dasharray="2 3"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="#FBF6EC" stroke-width="1"><path d="M12 2C8 6 5 9.5 5 14a7 7 0 0 0 14 0c0-4.5-3-8-7-12z"/></svg>`;
}

// Real photo if the admin uploaded one, otherwise the stylized placeholder icon.
function productImageInner(product) {
  if (product.image_url) {
    return `<img src="${product.image_url}" alt="${product.name}" style="width:100%;height:100%;object-fit:cover;" />`;
  }
  return productImageSvg(product);
}

function productCardHtml(product) {
  // Admin-set promo tags (multi-select, e.g. "Sale Live" + "Best Seller")
  // take priority over the legacy single is_bestseller/is_new flags — shown
  // as up to two small badges so a card never gets too cluttered.
  const tagBadges = (product.promo_tags || []).slice(0, 2).map((tag) => `<span class="product-card__badge">${tag}</span>`);
  const badgeInner = tagBadges.length
    ? tagBadges.join('')
    : product.is_bestseller
    ? '<span class="product-card__badge">Bestseller</span>'
    : product.is_new
    ? '<span class="product-card__badge product-card__badge--new">New</span>'
    : '';
  const badge = badgeInner ? `<div class="product-card__badges">${badgeInner}</div>` : '';

  if (product.is_coming_soon) {
    return `
      <div class="product-card">
        ${badge}
        <div class="product-card__image product-card__image--coming-soon">${productImageInner(product)}</div>
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
      <button class="product-card__wishlist" data-wishlist="${product.id}" aria-label="Save to wishlist" style="position:absolute;top:16px;right:16px;z-index:2;background:rgba(251,246,236,0.9);border:none;border-radius:999px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#33422B" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
      </button>
      <a href="/product?slug=${encodeURIComponent(product.slug)}" style="text-decoration:none;color:inherit;">
        <div class="product-card__image">${productImageInner(product)}</div>
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

// Subtle 3D tilt on hover, following the cursor — the .product-card
// element already has perspective/preserve-3d set up in CSS for this.
// Skipped for visitors who prefer reduced motion.
function wireProductCardTilt(container) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  container.querySelectorAll('.product-card').forEach((card) => {
    const maxTilt = 6; // degrees
    function onMove(e) {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `rotateY(${x * maxTilt * 2}deg) rotateX(${-y * maxTilt * 2}deg) translateY(-4px)`;
    }
    function onLeave() {
      card.style.transform = '';
    }
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
  });
}

function wireProductCardButtons(container, products) {
  wireProductCardTilt(container);
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
  container.querySelectorAll('[data-wishlist]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!getAuthToken()) {
        window.location.href = `/account?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      try {
        await api('/api/customer/wishlist', { method: 'POST', body: { product_id: btn.getAttribute('data-wishlist') } });
        btn.innerHTML = '♥';
        btn.style.color = '#B5551D';
      } catch (err) {
        alert(err.message);
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
