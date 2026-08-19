let ALL_PRODUCTS = [];
let ALL_CATEGORIES = [];
let ACTIVE_CATEGORY_ID = 'all';

// A subtree filter: selecting a parent category also matches its subcategories.
function categoryMatches(product, categoryId) {
  if (categoryId === 'all') return true;
  if (product.category_id === categoryId) return true;
  const productCat = ALL_CATEGORIES.find((c) => c.id === product.category_id);
  return Boolean(productCat && productCat.parent_id === categoryId);
}

function applySortAndFilter() {
  let list = ALL_PRODUCTS.filter((p) => categoryMatches(p, ACTIVE_CATEGORY_ID));

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
  const wrap = document.getElementById('category-filters');
  const parents = ALL_CATEGORIES.filter((c) => !c.parent_id);

  function buttonsHtml() {
    let html = `<button class="${ACTIVE_CATEGORY_ID === 'all' ? 'active' : ''}" data-filter="all">All</button>`;
    parents.forEach((parent) => {
      html += `<button class="${ACTIVE_CATEGORY_ID === parent.id ? 'active' : ''}" data-filter="${parent.id}">${parent.name}</button>`;
    });
    return html;
  }

  function subcategoryHtml() {
    const activeParent = parents.find((p) => p.id === ACTIVE_CATEGORY_ID);
    if (!activeParent) return '';
    const subs = ALL_CATEGORIES.filter((c) => c.parent_id === activeParent.id);
    if (!subs.length) return '';
    return `
      <div class="dashboard-nav" style="margin-top:10px;" id="subcategory-filters">
        <button class="active" data-subfilter="${activeParent.id}">All ${activeParent.name}</button>
        ${subs.map((s) => `<button data-subfilter="${s.id}">${s.name}</button>`).join('')}
      </div>`;
  }

  wrap.innerHTML = buttonsHtml() + subcategoryHtml();

  wrap.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ACTIVE_CATEGORY_ID = btn.getAttribute('data-filter');
      renderCategoryFilters();
      applySortAndFilter();
    });
  });
  wrap.querySelectorAll('[data-subfilter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('[data-subfilter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ACTIVE_CATEGORY_ID = btn.getAttribute('data-subfilter');
      applySortAndFilter();
    });
  });
}

async function loadShopProducts() {
  const grid = document.getElementById('shop-products');
  try {
    const [{ products }, { categories }] = await Promise.all([
      api('/api/products', { auth: false }),
      api('/api/categories', { auth: false }),
    ]);
    ALL_PRODUCTS = products;
    ALL_CATEGORIES = categories;

    const params = new URLSearchParams(window.location.search);
    const categorySlug = params.get('category');
    if (categorySlug) {
      const match = categories.find((c) => c.slug === categorySlug);
      if (match) ACTIVE_CATEGORY_ID = match.id;
    }

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
