// Product Detail Page — rebuilt per the Phase 1b customer-website audit to
// cover the full spec: gallery, Buy Now, key benefits, ingredients/product
// info, shipping info, FAQ, related products — moved out of ad-hoc inline
// JS-string styling into real CSS classes (see the "Phase 1b" block in
// style.css). Every content section (benefits/ingredients/shipping
// note/FAQ/gallery) only renders when the admin has actually filled it in —
// nothing here is invented; an unfilled section is simply omitted rather
// than backfilled with placeholder marketing copy.

let PDP_STORE_SETTINGS = null;

async function loadStoreSettingsOnce() {
  if (PDP_STORE_SETTINGS) return PDP_STORE_SETTINGS;
  try {
    const { content } = await api('/api/content', { auth: false });
    PDP_STORE_SETTINGS = content.store_settings || {};
  } catch {
    PDP_STORE_SETTINGS = {};
  }
  return PDP_STORE_SETTINGS;
}

function galleryImages(product) {
  const extra = Array.isArray(product.gallery_images) ? product.gallery_images : [];
  return [product.image_url, ...extra].filter(Boolean);
}

async function loadProduct() {
  const slug = new URLSearchParams(window.location.search).get('slug');
  const wrap = document.getElementById('product-detail');
  if (!slug) {
    wrap.innerHTML = '<div class="empty-state">Product not specified.</div>';
    return;
  }
  try {
    const [{ product }, settings] = await Promise.all([
      api(`/api/products/${encodeURIComponent(slug)}`, { auth: false }),
      loadStoreSettingsOnce(),
    ]);
    document.title = product.seo_title || `${product.name} — Groove Organics`;
    const metaDesc = product.seo_meta_description || product.short_description;
    if (metaDesc) {
      let metaTag = document.querySelector('meta[name="description"]');
      if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute('name', 'description');
        document.head.appendChild(metaTag);
      }
      metaTag.setAttribute('content', metaDesc);
    }

    const priceHtml = product.compare_at_price_paise
      ? `<del>${formatRupees(product.compare_at_price_paise)}</del> ${formatRupees(product.price_paise)}`
      : formatRupees(product.price_paise);

    const variants = product.variants || [];
    const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))];
    const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
    const hasVariants = variants.length > 0;
    const images = galleryImages(product);

    const galleryHtml = images.length
      ? `
        <div class="pdp-gallery">
          <div class="pdp-gallery__main" id="pdp-gallery-main">
            <img src="${images[0]}" alt="${product.name}" id="pdp-gallery-main-img" />
          </div>
          ${
            images.length > 1
              ? `<div class="pdp-gallery__thumbs" id="pdp-gallery-thumbs">
                  ${images.map((src, i) => `<button type="button" class="pdp-gallery__thumb${i === 0 ? ' active' : ''}" data-gallery-idx="${i}"><img src="${src}" alt="" /></button>`).join('')}
                </div>`
              : ''
          }
        </div>`
      : `<div class="product-card__image" style="aspect-ratio:1/1;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#FBF6EC" stroke-width="1" style="width:40%;"><path d="M12 2C8 6 5 9.5 5 14a7 7 0 0 0 14 0c0-4.5-3-8-7-12z"/></svg>
        </div>`;

    const benefitsHtml = (product.key_benefits || []).length
      ? `<div class="pdp-section">
          <h2>Why you'll love it</h2>
          <ul class="pdp-benefits">${product.key_benefits.map((b) => `<li>${b}</li>`).join('')}</ul>
        </div>`
      : '';

    const ingredientsHtml = product.ingredients_info
      ? `<div class="pdp-section"><h2>Ingredients</h2><p>${product.ingredients_info}</p></div>`
      : '';

    const freeShipThreshold = settings.free_shipping_threshold_paise;
    const shippingFacts = [
      'Shipping is calculated at checkout based on weight and your delivery pincode.',
      freeShipThreshold ? `Free shipping on orders over ${formatRupees(freeShipThreshold)}.` : '',
      product.shipping_info || '',
    ].filter(Boolean);
    const shippingHtml = `
      <div class="pdp-section">
        <h2>Shipping &amp; Delivery</h2>
        <div class="pdp-shipinfo">
          ${shippingFacts.map((f) => `<div class="pdp-shipinfo__row"><span>📦</span><span>${f}</span></div>`).join('')}
        </div>
      </div>`;

    const faqEntries = product.faq && product.faq.length ? product.faq : null;
    const faqHtml = faqEntries
      ? `<div class="pdp-section">
          <h2>Questions about this product</h2>
          <div class="pdp-faq">
            ${faqEntries
              .map(
                (f) => `<details class="pdp-faq__item"><summary class="pdp-faq__q">${f.question}</summary><div class="pdp-faq__a">${f.answer}</div></details>`
              )
              .join('')}
          </div>
        </div>`
      : '';

    wrap.innerHTML = `
      <div class="split-grid split-grid--pdp">
        ${galleryHtml}
        <div>
          <span class="breadcrumb"><a href="/shop">Shop</a> / ${product.category}</span>
          <h1>${product.name}</h1>
          ${product.rating ? `<div class="product-card__rating" style="margin-bottom:16px;">★ ${product.rating} (${product.review_count} reviews)</div>` : ''}
          <p style="font-size:1.1rem;color:var(--moss-700);">${product.description || product.short_description || ''}</p>
          <div class="mono" style="font-size:1.6rem;margin:20px 0;" id="variant-price">${priceHtml}</div>
          ${
            product.is_coming_soon
              ? `<button class="btn btn--outline" id="notify-btn">Notify Me When Available</button>`
              : `
              ${
                hasVariants
                  ? `
                  <div id="variant-selectors" style="margin-bottom:20px;">
                    ${
                      sizes.length
                        ? `<div class="form-field"><label>Size</label>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                          ${sizes.map((s, i) => `<button type="button" class="btn btn--outline btn--sm variant-pill" data-size="${s}" data-selected="${i === 0}">${s}</button>`).join('')}
                        </div></div>`
                        : ''
                    }
                    ${
                      colors.length
                        ? `<div class="form-field"><label>Color</label>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                          ${colors.map((c, i) => `<button type="button" class="btn btn--outline btn--sm variant-pill" data-color="${c}" data-selected="${i === 0}">${c}</button>`).join('')}
                        </div></div>`
                        : ''
                    }
                    <p class="form-error" id="variant-error" style="display:none;">That combination isn't available.</p>
                  </div>`
                  : ''
              }
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                <label for="qty" style="font-weight:600;font-size:0.9rem;">Qty</label>
                <input id="qty" type="number" min="1" value="1" style="width:70px;min-height:44px;padding:10px;border-radius:8px;border:1px solid var(--sand-300);" />
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:10px;">
                <button class="btn btn--primary" id="add-btn">Add to Cart</button>
                <button class="btn btn--outline" id="buy-now-btn">Buy Now</button>
                <button class="btn btn--outline" id="wishlist-btn">♡ Save</button>
              </div>
              `
          }
          <div class="banner-note" style="margin-top:32px;" id="stock-note">
            ${product.stock > 0 ? `${product.stock} in stock.` : ''} Cold-pressed / wood-pressed (chekku method). GST calculated at checkout.
          </div>
        </div>
      </div>

      ${benefitsHtml}
      ${ingredientsHtml}
      ${shippingHtml}
      ${faqHtml}

      <div class="pdp-section">
        <h2>Reviews</h2>
        <div id="reviews-list"><p>Loading reviews…</p></div>
        <div class="card" style="margin-top:24px;max-width:640px;">
          <h3 class="mt-0">Write a review</h3>
          <div id="review-form-wrap"></div>
        </div>
      </div>

      <div class="pdp-related" id="pdp-related"></div>
    `;

    loadReviews(product);
    renderReviewForm(product);
    loadRelatedProducts(product);
    wireGallery(images);

    // Resolves the currently-selected size/color pills to a matching variant
    // row (or null if that combination doesn't exist / isn't stocked).
    function getSelectedVariant() {
      if (!hasVariants) return null;
      const selectedSize = sizes.length ? document.querySelector('[data-size][data-selected="true"]')?.getAttribute('data-size') : null;
      const selectedColor = colors.length ? document.querySelector('[data-color][data-selected="true"]')?.getAttribute('data-color') : null;
      return (
        variants.find((v) => (sizes.length ? v.size === selectedSize : true) && (colors.length ? v.color === selectedColor : true)) || null
      );
    }

    function variantLabel(v) {
      return [v.size, v.color].filter(Boolean).join(' / ');
    }

    function currentDisplayPricePaise() {
      const variant = getSelectedVariant();
      return variant ? variant.price_paise : product.price_paise;
    }

    function refreshVariantUI() {
      const priceEl = document.getElementById('variant-price');
      const stockNote = document.getElementById('stock-note');
      const errorEl = document.getElementById('variant-error');
      const addBtn = document.getElementById('add-btn');
      const buyBtn = document.getElementById('buy-now-btn');
      const variant = getSelectedVariant();

      if (hasVariants) {
        if (!variant) {
          if (errorEl) errorEl.style.display = 'block';
          if (addBtn) addBtn.disabled = true;
          if (buyBtn) buyBtn.disabled = true;
        } else {
          if (errorEl) errorEl.style.display = 'none';
          if (priceEl) priceEl.textContent = formatRupees(variant.price_paise);
          if (stockNote) {
            stockNote.innerHTML = `${variant.stock > 0 ? `${variant.stock} in stock.` : '<strong>Out of stock.</strong>'} Cold-pressed / wood-pressed (chekku method). GST calculated at checkout.`;
          }
          if (addBtn) addBtn.disabled = variant.stock <= 0;
          if (buyBtn) buyBtn.disabled = variant.stock <= 0;
        }
      }
      updateStickyCta();
    }

    document.querySelectorAll('.variant-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const isSize = pill.hasAttribute('data-size');
        document
          .querySelectorAll(isSize ? '[data-size]' : '[data-color]')
          .forEach((p) => p.setAttribute('data-selected', 'false'));
        pill.setAttribute('data-selected', 'true');
        refreshVariantUI();
      });
    });
    refreshVariantUI();

    function doAddToCart() {
      const qty = Math.max(1, parseInt(document.getElementById('qty').value, 10) || 1);
      const variant = getSelectedVariant();
      if (hasVariants && !variant) return false;
      addToCart(product, qty, variant ? { id: variant.id, label: variantLabel(variant), price_paise: variant.price_paise } : null);
      return true;
    }

    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (!doAddToCart()) return;
        addBtn.textContent = 'Added to Cart ✓';
        setTimeout(() => (addBtn.textContent = 'Add to Cart'), 1400);
      });
    }
    const buyNowBtn = document.getElementById('buy-now-btn');
    if (buyNowBtn) {
      buyNowBtn.addEventListener('click', () => {
        if (!doAddToCart()) return;
        window.location.href = '/checkout';
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

    // ---- Sticky mobile CTA bar (mirrors Add to Cart, price stays live) ----
    function updateStickyCta() {
      const bar = document.getElementById('pdp-sticky-cta');
      if (!bar || product.is_coming_soon) return;
      const priceEl = bar.querySelector('.sticky-cta__price');
      if (priceEl) priceEl.textContent = formatRupees(currentDisplayPricePaise());
    }
    if (!product.is_coming_soon) {
      const bar = document.createElement('div');
      bar.className = 'sticky-cta';
      bar.id = 'pdp-sticky-cta';
      bar.innerHTML = `
        <span class="sticky-cta__price">${formatRupees(currentDisplayPricePaise())}</span>
        <button class="btn btn--primary" id="sticky-add-btn" type="button">Add to Cart</button>
      `;
      document.body.appendChild(bar);
      document.body.classList.add('has-sticky-cta');
      bar.querySelector('#sticky-add-btn').addEventListener('click', () => {
        if (!doAddToCart()) return;
        const btn = bar.querySelector('#sticky-add-btn');
        btn.textContent = 'Added ✓';
        setTimeout(() => (btn.textContent = 'Add to Cart'), 1400);
      });
    }
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Couldn't load this product: ${err.message}</div>`;
  }
}

function wireGallery(images) {
  if (images.length < 2) {
    wireLightbox(images);
    return;
  }
  const mainImg = document.getElementById('pdp-gallery-main-img');
  document.querySelectorAll('.pdp-gallery__thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.getAttribute('data-gallery-idx'), 10);
      mainImg.src = images[idx];
      document.querySelectorAll('.pdp-gallery__thumb').forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
  wireLightbox(images);
}

function wireLightbox(images) {
  const mainImg = document.getElementById('pdp-gallery-main-img');
  if (!mainImg || !images.length) return;
  mainImg.addEventListener('click', () => {
    const box = document.createElement('div');
    box.className = 'pdp-lightbox';
    box.innerHTML = `<button type="button" class="pdp-lightbox__close" aria-label="Close">×</button><img src="${mainImg.src}" alt="" />`;
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.classList.contains('pdp-lightbox__close')) box.remove();
    });
    document.body.appendChild(box);
  });
}

// Related products: same category (or its parent), excluding this product,
// pulled from the same public /api/products list the Shop page already
// uses — no new backend endpoint needed, no invented "you might also like"
// content, just a real category match capped at 4 items.
async function loadRelatedProducts(product) {
  const wrap = document.getElementById('pdp-related');
  if (!wrap) return;
  try {
    const { products } = await api('/api/products', { auth: false });
    const related = products
      .filter((p) => p.id !== product.id && !p.is_coming_soon && p.category_id === product.category_id)
      .slice(0, 4);
    if (!related.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `<h2>You may also like</h2><div class="products-grid">${related.map(productCardHtml).join('')}</div>`;
    wireProductCardButtons(wrap, related);
  } catch {
    wrap.innerHTML = '';
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
      <div class="card" style="margin-bottom:14px;max-width:640px;">
        <div class="flex-between">
          <strong>${r.reviewer_name}</strong>
          <span class="mono" style="color:var(--gold-700);">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
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
  renderSiteChrome('shop');
  loadProduct();
});
