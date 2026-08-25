// /deals — every product carrying at least one admin-set promo tag,
// sectioned by tag (a product with multiple tags appears in every matching
// section — see PROMO_TAG_OPTIONS in backend/lib/mockStore.js).

async function renderDealsPage() {
  const wrap = document.getElementById('deals-content');
  const { products } = await api('/api/products', { auth: false });

  const tagged = products.filter((p) => (p.promo_tags || []).length > 0);
  if (!tagged.length) {
    wrap.innerHTML = '<div class="empty-state">No deals live right now — check back soon, or browse the <a href="/shop" style="text-decoration:underline;">full shop</a>.</div>';
    return;
  }

  // Preserve a stable, sensible tag order rather than whatever order tags
  // happen to appear in across products.
  const TAG_ORDER = ['Sale Live', 'Festive Offer', 'New Deal', 'Bundle Deal', 'Best Seller', 'Limited Stock'];
  const tagsPresent = new Set();
  tagged.forEach((p) => (p.promo_tags || []).forEach((t) => tagsPresent.add(t)));
  const orderedTags = [...TAG_ORDER.filter((t) => tagsPresent.has(t)), ...[...tagsPresent].filter((t) => !TAG_ORDER.includes(t))];

  wrap.innerHTML = orderedTags
    .map(
      (tag) => `
      <div style="margin-bottom:48px;">
        <h2 style="margin-bottom:20px;">${tag}</h2>
        <div class="products-grid" data-tag-grid="${tag}"></div>
      </div>`
    )
    .join('');

  orderedTags.forEach((tag) => {
    const grid = wrap.querySelector(`[data-tag-grid="${tag}"]`);
    const inTag = tagged.filter((p) => (p.promo_tags || []).includes(tag));
    grid.innerHTML = inTag.map(productCardHtml).join('');
    wireProductCardButtons(grid, inTag);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav('');
  renderFooter();
  renderDealsPage();
});
