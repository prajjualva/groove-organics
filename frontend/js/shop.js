let ALL_PRODUCTS = [];
let ACTIVE_CATEGORY = 'all';

function applySortAndFilter() {
  let list = [...ALL_PRODUCTS];
  if (ACTIVE_CATEGORY !== 'all') list = list.filter((p) => p.category === ACTIVE_CATEGORY);

  const sort = document.getElementById('sort-select').value;
  if (sort === 'price-asc') list.sort((a, b) => a.price_paise - b.price_paise);
  else if (sort === 'price-desc') list.sort((a, b) => b.price_paise - a.price_paise);
  else if (sort === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const grid = document.getElementById('shop-products');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">No products in this category yet.</div>';
    return;
  }
  grid.innerHTML = list.map(productCardHtml).join('');
  wireProductCardButtons(grid, list);
}

function renderCategoryFilters() {
  const categories = Array.from(new Set(ALL_PRODUCTS.map((p) => p.category)));
  const wrap = document.getElementById('category-filters');
  wrap.innerHTML =
    `<button class="active" data-filter="all">All</button>` +
    categories
      .map((c) => `<button data-filter="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</button>`)
      .join('');
  wrap.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ACTIVE_CATEGORY = btn.getAttribute('data-filter');
      applySortAndFilter();
    });
  });
}

async function loadShopProducts() {
  const grid = document.getElementById('shop-products');
  try {
    const { products } = await api('/api/products', { auth: false });
    ALL_PRODUCTS = products;
    renderCategoryFilters();
    applySortAndFilter();
  } catch (err) {
    grid.innerHTML = `<p class="form-error">Couldn't load products: ${err.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav('shop');
  renderFooter();
  loadShopProducts();
  document.getElementById('sort-select').addEventListener('change', applySortAndFilter);
});
