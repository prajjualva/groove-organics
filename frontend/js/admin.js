// Admin dashboard: products CRUD, order list + status updates, banner
// uploads, and a simple sales report. Everything here talks to /api/*
// with the admin's bearer token attached automatically by api.js.

let CURRENT_TAB = 'products';

function requireAdminOrRedirect() {
  const user = getAuthUser();
  if (!user || !getAuthToken()) {
    window.location.href = '/admin';
    return null;
  }
  return user;
}

// Renders <option> tags for a category <select>, indenting subcategories
// under their parent so the hierarchy reads clearly in a flat dropdown.
function categoryOptionsHtml(categories, selectedId) {
  const parents = categories.filter((c) => !c.parent_id);
  return parents
    .map((parent) => {
      const children = categories.filter((c) => c.parent_id === parent.id);
      const parentOption = `<option value="${parent.id}" ${parent.id === selectedId ? 'selected' : ''}>${parent.name}</option>`;
      const childOptions = children
        .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>&nbsp;&nbsp;— ${c.name}</option>`)
        .join('');
      return parentOption + childOptions;
    })
    .join('');
}

function categoryLabel(categories, categoryId) {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return '—';
  if (!cat.parent_id) return cat.name;
  const parent = categories.find((c) => c.id === cat.parent_id);
  return parent ? `${parent.name} / ${cat.name}` : cat.name;
}

// Reads a <input type="file"> as a base64 data URL — good enough for demo
// mode; once Supabase is connected this is the natural place to swap in a
// real Storage upload (same call site, different implementation).
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderProductsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading products…</p>';
  const [{ products }, { categories }] = await Promise.all([api('/api/products'), api('/api/categories', { auth: false })]);

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add a product</h3>
      <form id="add-product-form">
        <div class="form-row">
          <div class="form-field"><label for="p-name">Name</label><input id="p-name" required /></div>
          <div class="form-field"><label for="p-slug">URL slug</label><input id="p-slug" placeholder="e.g. sesame-oil" required /></div>
        </div>
        <div class="form-row">
          <div class="form-field"><label for="p-price">Price (₹)</label><input id="p-price" type="number" min="0" step="0.01" required /></div>
          <div class="form-field">
            <label for="p-category">Category</label>
            <select id="p-category" required>${categoryOptionsHtml(categories, null)}</select>
          </div>
        </div>
        <div class="form-field"><label for="p-short">Short description</label><input id="p-short" /></div>
        <div class="form-field"><label for="p-desc">Full description</label><textarea id="p-desc" rows="3"></textarea></div>
        <div class="form-field"><label for="p-image">Product image</label><input id="p-image" type="file" accept="image/*" /></div>
        <button class="btn btn--primary" type="submit">Add Product</button>
        <p class="form-error" id="add-product-error" style="display:none;"></p>
      </form>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Category</th><th>Stock</th><th>Active</th><th>Variants</th><th></th></tr></thead>
        <tbody id="products-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = products
    .map(
      (p) => `
      <tr data-id="${p.id}">
        <td>
          <div style="width:48px;height:48px;border-radius:8px;overflow:hidden;background:var(--sand-200);display:flex;align-items:center;justify-content:center;">
            ${p.image_url ? `<img src="${p.image_url}" alt="" style="width:100%;height:100%;object-fit:cover;" />` : '<span style="font-size:0.65rem;color:var(--moss-700);">No image</span>'}
          </div>
          <input type="file" accept="image/*" data-image="${p.id}" style="margin-top:6px;font-size:0.7rem;width:110px;" />
        </td>
        <td>${p.name}</td>
        <td class="mono">${formatRupees(p.price_paise)}</td>
        <td>
          <select data-category="${p.id}">${categoryOptionsHtml(categories, p.category_id)}</select>
        </td>
        <td><input type="number" min="0" value="${p.stock}" data-stock="${p.id}" style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
        <td><input type="checkbox" data-active="${p.id}" ${p.is_active ? 'checked' : ''} /></td>
        <td><button class="btn btn--outline btn--sm" data-toggle-variants="${p.id}">Sizes / Colors</button></td>
        <td><button class="btn btn--outline btn--sm" data-delete="${p.id}">Delete</button></td>
      </tr>
      <tr class="variants-row" data-variants-for="${p.id}" style="display:none;">
        <td colspan="8"><div class="variants-panel" data-variants-panel="${p.id}"></div></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-toggle-variants]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const productId = btn.getAttribute('data-toggle-variants');
      const row = tbody.querySelector(`[data-variants-for="${productId}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      if (isHidden) await renderVariantsPanel(productId);
    });
  });

  tbody.querySelectorAll('[data-stock]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/products/${input.getAttribute('data-stock')}`, {
        method: 'PATCH',
        body: { stock: parseInt(input.value, 10) || 0 },
      });
    });
  });
  tbody.querySelectorAll('[data-active]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/products/${input.getAttribute('data-active')}`, {
        method: 'PATCH',
        body: { is_active: input.checked },
      });
    });
  });
  tbody.querySelectorAll('[data-category]').forEach((select) => {
    select.addEventListener('change', async () => {
      await api(`/api/products/${select.getAttribute('data-category')}`, {
        method: 'PATCH',
        body: { category_id: select.value },
      });
    });
  });
  tbody.querySelectorAll('[data-image]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const image_url = await readFileAsDataUrl(file);
      await api(`/api/products/${input.getAttribute('data-image')}`, { method: 'PATCH', body: { image_url } });
      renderProductsTab();
    });
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this product?')) return;
      await api(`/api/products/${btn.getAttribute('data-delete')}`, { method: 'DELETE' });
      renderProductsTab();
    });
  });

  document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('add-product-error');
    errorEl.style.display = 'none';
    try {
      const imageFile = document.getElementById('p-image').files[0];
      const image_url = imageFile ? await readFileAsDataUrl(imageFile) : null;
      const categoryId = document.getElementById('p-category').value;
      const category = categoryLabel(categories, categoryId).split(' / ')[0].toLowerCase();
      await api('/api/products', {
        method: 'POST',
        body: {
          name: document.getElementById('p-name').value,
          slug: document.getElementById('p-slug').value,
          price_paise: Math.round(parseFloat(document.getElementById('p-price').value) * 100),
          category_id: categoryId,
          category,
          short_description: document.getElementById('p-short').value,
          description: document.getElementById('p-desc').value,
          image_url,
        },
      });
      renderProductsTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// Inline size/color variant editor for a single product, opened from the
// Products table's "Sizes / Colors" button. A product with no rows here
// is just sold as-is using its own price_paise/stock (simple case stays
// simple) — variants are only needed once a product comes in more than
// one size and/or color.
async function renderVariantsPanel(productId) {
  const panel = document.querySelector(`[data-variants-panel="${productId}"]`);
  panel.innerHTML = '<p>Loading variants…</p>';
  const { variants } = await api(`/api/products/${productId}/variants`, { auth: false });

  panel.innerHTML = `
    <table class="data-table" style="margin-bottom:16px;">
      <thead><tr><th>Size</th><th>Color</th><th>Price (₹)</th><th>Stock</th><th>SKU</th><th></th></tr></thead>
      <tbody>
        ${
          variants.length
            ? variants
                .map(
                  (v) => `
              <tr data-variant-id="${v.id}">
                <td>${v.size || '—'}</td>
                <td>${v.color || '—'}</td>
                <td class="mono">${formatRupees(v.price_paise)}</td>
                <td><input type="number" min="0" value="${v.stock}" data-variant-stock="${v.id}" style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
                <td class="mono">${v.sku || '—'}</td>
                <td><button class="btn btn--outline btn--sm" data-delete-variant="${v.id}">Delete</button></td>
              </tr>`
                )
                .join('')
            : '<tr><td colspan="6" style="color:var(--moss-700);">No variants yet — this product sells as a single item.</td></tr>'
        }
      </tbody>
    </table>
    <div class="form-row">
      <div class="form-field"><label>Size (optional)</label><input data-new-variant-size placeholder="e.g. 500ml" /></div>
      <div class="form-field"><label>Color (optional)</label><input data-new-variant-color placeholder="e.g. Green" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Price (₹)</label><input type="number" min="0" step="0.01" data-new-variant-price /></div>
      <div class="form-field"><label>Stock</label><input type="number" min="0" data-new-variant-stock value="0" /></div>
    </div>
    <div class="form-field"><label>SKU (optional)</label><input data-new-variant-sku /></div>
    <button class="btn btn--primary btn--sm" data-add-variant="${productId}">Add Variant</button>
    <p class="form-error" data-variant-error style="display:none;"></p>
  `;

  panel.querySelectorAll('[data-variant-stock]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/variants/${input.getAttribute('data-variant-stock')}`, {
        method: 'PATCH',
        body: { stock: parseInt(input.value, 10) || 0 },
      });
    });
  });
  panel.querySelectorAll('[data-delete-variant]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this variant?')) return;
      await api(`/api/variants/${btn.getAttribute('data-delete-variant')}`, { method: 'DELETE' });
      renderVariantsPanel(productId);
    });
  });
  panel.querySelector('[data-add-variant]').addEventListener('click', async () => {
    const errorEl = panel.querySelector('[data-variant-error]');
    errorEl.style.display = 'none';
    const size = panel.querySelector('[data-new-variant-size]').value.trim();
    const color = panel.querySelector('[data-new-variant-color]').value.trim();
    const priceRupees = panel.querySelector('[data-new-variant-price]').value;
    const stock = panel.querySelector('[data-new-variant-stock]').value;
    const sku = panel.querySelector('[data-new-variant-sku]').value.trim();
    if (!size && !color) {
      errorEl.textContent = 'Enter a size or a color (or both).';
      errorEl.style.display = 'block';
      return;
    }
    if (!priceRupees) {
      errorEl.textContent = 'Price is required.';
      errorEl.style.display = 'block';
      return;
    }
    try {
      await api(`/api/products/${productId}/variants`, {
        method: 'POST',
        body: {
          size: size || null,
          color: color || null,
          price_paise: Math.round(parseFloat(priceRupees) * 100),
          stock: parseInt(stock, 10) || 0,
          sku: sku || null,
        },
      });
      renderVariantsPanel(productId);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

async function renderCategoriesTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading categories…</p>';
  const { categories } = await api('/api/categories', { auth: false });

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add a category or subcategory</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">Leave "Parent" as "None" to create a top-level category (e.g. "Spices"). Pick a parent to create a subcategory under it (e.g. "Turmeric" under "Spices").</p>
      <div class="form-row">
        <div class="form-field"><label for="c-name">Name</label><input id="c-name" placeholder="e.g. Turmeric" required /></div>
        <div class="form-field"><label for="c-slug">URL slug</label><input id="c-slug" placeholder="e.g. turmeric" required /></div>
      </div>
      <div class="form-field">
        <label for="c-parent">Parent category</label>
        <select id="c-parent">
          <option value="">None (top-level category)</option>
          ${categories.filter((c) => !c.parent_id).map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn--primary" id="add-category-btn">Add Category</button>
      <p class="form-error" id="add-category-error" style="display:none;"></p>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Category</th><th>Slug</th><th></th></tr></thead>
        <tbody id="categories-tbody"></tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('categories-tbody');
  const parents = categories.filter((c) => !c.parent_id);
  const rows = [];
  parents.forEach((parent) => {
    rows.push({ ...parent, displayName: parent.name });
    categories
      .filter((c) => c.parent_id === parent.id)
      .forEach((child) => rows.push({ ...child, displayName: `— ${child.name}` }));
  });
  tbody.innerHTML = rows
    .map((c) => `<tr><td>${c.displayName}</td><td class="mono">${c.slug}</td><td><button class="btn btn--outline btn--sm" data-delete-category="${c.id}">Delete</button></td></tr>`)
    .join('');

  tbody.querySelectorAll('[data-delete-category]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this category? Products in it will keep their old category tag but lose the link.')) return;
      await api(`/api/categories/${btn.getAttribute('data-delete-category')}`, { method: 'DELETE' });
      renderCategoriesTab();
    });
  });

  document.getElementById('add-category-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('add-category-error');
    errorEl.style.display = 'none';
    try {
      await api('/api/categories', {
        method: 'POST',
        body: {
          name: document.getElementById('c-name').value,
          slug: document.getElementById('c-slug').value,
          parent_id: document.getElementById('c-parent').value || null,
        },
      });
      renderCategoriesTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

async function renderOrdersTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading orders…</p>';
  const { orders } = await api('/api/orders');

  if (!orders.length) {
    wrap.innerHTML = '<div class="empty-state">No orders yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Invoice</th></tr></thead>
        <tbody>
          ${orders
            .map(
              (o) => `
            <tr data-id="${o.id}">
              <td class="mono">${o.order_number}</td>
              <td>${o.customer_name}<br /><span style="font-size:0.78rem;opacity:0.6;">${o.customer_email}</span></td>
              <td class="mono">${formatRupees(o.total_paise)}</td>
              <td><span class="status-pill status-${o.payment_status === 'paid' ? 'delivered' : 'placed'}">${o.payment_status}</span></td>
              <td>
                <select data-status="${o.id}">
                  ${['placed', 'packed', 'shipped', 'delivered', 'cancelled']
                    .map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`)
                    .join('')}
                </select>
              </td>
              <td><a href="/api/orders/${o.id}/invoice" target="_blank" rel="noopener">PDF</a></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-status]').forEach((select) => {
    select.addEventListener('change', async () => {
      await api(`/api/orders/${select.getAttribute('data-status')}/status`, {
        method: 'PATCH',
        body: { status: select.value },
      });
    });
  });
}

// Placements the storefront currently knows how to display. The database
// column is plain text (not an enum) so this list can grow later without a
// migration — just add an <option> here and teach the frontend to read it.
const BANNER_PLACEMENTS = [
  { value: 'homepage_hero', label: 'Homepage Hero (top rotating slider)' },
  { value: 'homepage_promo', label: 'Homepage Promo / Festive Offer Card' },
  { value: 'sitewide_announcement', label: 'Sitewide Announcement Strip' },
];

function placementLabel(value) {
  const found = BANNER_PLACEMENTS.find((p) => p.value === value);
  return found ? found.label : value;
}

async function renderBannersTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading banners…</p>';
  const { banners } = await api('/api/banners');

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add a banner</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">
        Use this for the homepage hero slider, festive-offer / promo cards, seasonal sale posters — anything image + link. Pick where it should appear below.
        Images are stored as-is for now (demo mode); once Supabase Storage is connected, uploads move there automatically.
      </p>
      <div class="form-row">
        <div class="form-field">
          <label for="b-placement">Where should this appear?</label>
          <select id="b-placement">${BANNER_PLACEMENTS.map((p) => `<option value="${p.value}">${p.label}</option>`).join('')}</select>
        </div>
        <div class="form-field"><label for="b-sort">Order (lower shows first)</label><input id="b-sort" type="number" min="0" value="1" /></div>
      </div>
      <div class="form-field"><label for="b-title">Title</label><input id="b-title" placeholder="e.g. Diwali Sale" /></div>
      <div class="form-field"><label for="b-subtitle">Subtitle / offer text (optional)</label><input id="b-subtitle" placeholder="e.g. 20% off, this week only" /></div>
      <div class="form-field"><label for="b-file">Image</label><input id="b-file" type="file" accept="image/*" /></div>
      <div class="form-field"><label for="b-link">Link (optional)</label><input id="b-link" placeholder="/shop" /></div>
      <button class="btn btn--primary" id="add-banner-btn">Add Banner</button>
      <p class="form-error" id="add-banner-error" style="display:none;"></p>
    </div>
    <div id="banners-by-placement"></div>
  `;

  const byPlacement = document.getElementById('banners-by-placement');
  if (!banners.length) {
    byPlacement.innerHTML = '<div class="empty-state">No banners yet.</div>';
  } else {
    const groups = {};
    banners.forEach((b) => {
      const key = b.placement || 'homepage_hero';
      (groups[key] = groups[key] || []).push(b);
    });
    byPlacement.innerHTML = Object.entries(groups)
      .map(
        ([placement, items]) => `
        <h4 style="margin:24px 0 10px;">${placementLabel(placement)}</h4>
        <div class="products-grid">
          ${items
            .map(
              (b) => `
            <div class="card" data-banner="${b.id}">
              <img src="${b.image_url}" alt="${b.title || ''}" style="width:100%;border-radius:8px;margin-bottom:8px;aspect-ratio:16/9;object-fit:cover;" />
              <strong>${b.title || 'Untitled'}</strong>
              ${b.subtitle ? `<p style="font-size:0.85rem;color:var(--moss-700);margin:4px 0;">${b.subtitle}</p>` : ''}
              <div class="flex-between" style="margin-top:8px;">
                <label style="font-size:0.8rem;display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" data-banner-active="${b.id}" ${b.is_active ? 'checked' : ''} /> Active
                </label>
                <button class="btn btn--outline btn--sm" data-delete-banner="${b.id}">Delete</button>
              </div>
            </div>`
            )
            .join('')}
        </div>`
      )
      .join('');
  }

  byPlacement.querySelectorAll('[data-delete-banner]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this banner?')) return;
      await api(`/api/banners/${btn.getAttribute('data-delete-banner')}`, { method: 'DELETE' });
      renderBannersTab();
    });
  });
  byPlacement.querySelectorAll('[data-banner-active]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/banners/${input.getAttribute('data-banner-active')}`, {
        method: 'PATCH',
        body: { is_active: input.checked },
      });
    });
  });

  document.getElementById('add-banner-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('add-banner-error');
    errorEl.style.display = 'none';
    const fileInput = document.getElementById('b-file');
    const file = fileInput.files[0];
    if (!file) {
      errorEl.textContent = 'Choose an image first.';
      errorEl.style.display = 'block';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api('/api/banners', {
          method: 'POST',
          body: {
            title: document.getElementById('b-title').value,
            subtitle: document.getElementById('b-subtitle').value,
            image_url: reader.result,
            link_url: document.getElementById('b-link').value,
            placement: document.getElementById('b-placement').value,
            sort_order: parseInt(document.getElementById('b-sort').value, 10) || 1,
          },
        });
        renderBannersTab();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  });
}

// Homepage copy editor — lets a non-technical admin change every word on
// the homepage (hero text, story, feature strip, process steps) without
// touching code. Backed by /api/content (site_content table / mock map).
async function renderContentTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading homepage content…</p>';
  const { content } = await api('/api/content');
  const hero = content.homepage_hero || {};
  const story = content.homepage_story || {};
  const featureStrip = content.homepage_feature_strip || { items: [] };
  const process = content.homepage_process || { steps: [] };

  wrap.innerHTML = `
    <p style="font-size:0.85rem;color:var(--moss-700);margin-bottom:20px;">
      Everything here shows up on the homepage exactly as typed. Save each section separately.
    </p>

    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Hero (top of homepage)</h3>
      <div class="form-field"><label for="ct-hero-tagline">Small tagline above the headline</label><input id="ct-hero-tagline" value="${escapeAttr(hero.tagline)}" /></div>
      <div class="form-row">
        <div class="form-field"><label for="ct-hero-h1">Headline — line 1</label><input id="ct-hero-h1" value="${escapeAttr(hero.headline_line1)}" /></div>
        <div class="form-field"><label for="ct-hero-h2">Headline — line 2</label><input id="ct-hero-h2" value="${escapeAttr(hero.headline_line2)}" /></div>
      </div>
      <div class="form-field"><label for="ct-hero-body">Paragraph</label><textarea id="ct-hero-body" rows="2">${escapeAttr(hero.body)}</textarea></div>
      <div class="form-row">
        <div class="form-field"><label for="ct-hero-cta1-label">Primary button text</label><input id="ct-hero-cta1-label" value="${escapeAttr(hero.cta_primary_label)}" /></div>
        <div class="form-field"><label for="ct-hero-cta1-href">Primary button link</label><input id="ct-hero-cta1-href" value="${escapeAttr(hero.cta_primary_href)}" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label for="ct-hero-cta2-label">Secondary button text</label><input id="ct-hero-cta2-label" value="${escapeAttr(hero.cta_secondary_label)}" /></div>
        <div class="form-field"><label for="ct-hero-cta2-href">Secondary button link</label><input id="ct-hero-cta2-href" value="${escapeAttr(hero.cta_secondary_href)}" /></div>
      </div>
      <button class="btn btn--primary" id="ct-save-hero">Save Hero</button>
      <p class="form-error" id="ct-hero-error" style="display:none;"></p>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Feature strip (4 icons under the hero)</h3>
      <div id="ct-feature-items">
        ${(featureStrip.items || []).map((item, i) => `
          <div class="form-row" style="margin-bottom:8px;">
            <div class="form-field"><label>Title ${i + 1}</label><input class="ct-feature-title" value="${escapeAttr(item.title)}" /></div>
            <div class="form-field"><label>Text ${i + 1}</label><input class="ct-feature-body" value="${escapeAttr(item.body)}" /></div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn--primary" id="ct-save-features">Save Feature Strip</button>
      <p class="form-error" id="ct-features-error" style="display:none;"></p>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Our Story section</h3>
      <div class="form-field"><label for="ct-story-eyebrow">Small label above the title</label><input id="ct-story-eyebrow" value="${escapeAttr(story.eyebrow)}" /></div>
      <div class="form-row">
        <div class="form-field"><label for="ct-story-t1">Title — line 1</label><input id="ct-story-t1" value="${escapeAttr(story.title_line1)}" /></div>
        <div class="form-field"><label for="ct-story-t2">Title — line 2</label><input id="ct-story-t2" value="${escapeAttr(story.title_line2)}" /></div>
      </div>
      <div class="form-field"><label for="ct-story-body">Paragraph</label><textarea id="ct-story-body" rows="3">${escapeAttr(story.body)}</textarea></div>
      <p style="font-size:0.8rem;color:var(--moss-700);">Milestones (year + text) — edit inline:</p>
      <div id="ct-story-milestones">
        ${(story.milestones || []).map((m, i) => `
          <div class="form-row" style="margin-bottom:8px;">
            <div class="form-field"><label>Year ${i + 1}</label><input class="ct-milestone-year" value="${escapeAttr(m.year)}" style="max-width:100px;" /></div>
            <div class="form-field"><label>Text ${i + 1}</label><input class="ct-milestone-text" value="${escapeAttr(m.text)}" /></div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn--primary" id="ct-save-story">Save Story</button>
      <p class="form-error" id="ct-story-error" style="display:none;"></p>
    </div>

    <div class="card">
      <h3 class="mt-0">Process section (From Farm to Bottle)</h3>
      <div class="form-field"><label for="ct-process-eyebrow">Small label</label><input id="ct-process-eyebrow" value="${escapeAttr(process.eyebrow)}" /></div>
      <div class="form-field"><label for="ct-process-title">Title</label><input id="ct-process-title" value="${escapeAttr(process.title)}" /></div>
      <div id="ct-process-steps">
        ${(process.steps || []).map((s, i) => `
          <div class="form-row" style="margin-bottom:8px;">
            <div class="form-field"><label>Step ${i + 1} title</label><input class="ct-step-title" value="${escapeAttr(s.title)}" /></div>
            <div class="form-field"><label>Step ${i + 1} text</label><input class="ct-step-body" value="${escapeAttr(s.body)}" /></div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn--primary" id="ct-save-process">Save Process</button>
      <p class="form-error" id="ct-process-error" style="display:none;"></p>
    </div>
  `;

  async function save(key, value, errorElId, btnId) {
    const errorEl = document.getElementById(errorElId);
    errorEl.style.display = 'none';
    const btn = document.getElementById(btnId);
    const originalLabel = btn.textContent;
    try {
      await api(`/api/content/${key}`, { method: 'PATCH', body: value });
      btn.textContent = 'Saved ✓';
      setTimeout(() => (btn.textContent = originalLabel), 1500);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  }

  document.getElementById('ct-save-hero').addEventListener('click', () =>
    save(
      'homepage_hero',
      {
        tagline: document.getElementById('ct-hero-tagline').value,
        headline_line1: document.getElementById('ct-hero-h1').value,
        headline_line2: document.getElementById('ct-hero-h2').value,
        body: document.getElementById('ct-hero-body').value,
        cta_primary_label: document.getElementById('ct-hero-cta1-label').value,
        cta_primary_href: document.getElementById('ct-hero-cta1-href').value,
        cta_secondary_label: document.getElementById('ct-hero-cta2-label').value,
        cta_secondary_href: document.getElementById('ct-hero-cta2-href').value,
      },
      'ct-hero-error',
      'ct-save-hero'
    )
  );

  document.getElementById('ct-save-features').addEventListener('click', () => {
    const titles = Array.from(document.querySelectorAll('.ct-feature-title')).map((el) => el.value);
    const bodies = Array.from(document.querySelectorAll('.ct-feature-body')).map((el) => el.value);
    save('homepage_feature_strip', { items: titles.map((title, i) => ({ title, body: bodies[i] })) }, 'ct-features-error', 'ct-save-features');
  });

  document.getElementById('ct-save-story').addEventListener('click', () => {
    const years = Array.from(document.querySelectorAll('.ct-milestone-year')).map((el) => el.value);
    const texts = Array.from(document.querySelectorAll('.ct-milestone-text')).map((el) => el.value);
    save(
      'homepage_story',
      {
        eyebrow: document.getElementById('ct-story-eyebrow').value,
        title_line1: document.getElementById('ct-story-t1').value,
        title_line2: document.getElementById('ct-story-t2').value,
        body: document.getElementById('ct-story-body').value,
        milestones: years.map((year, i) => ({ year, text: texts[i] })),
      },
      'ct-story-error',
      'ct-save-story'
    );
  });

  document.getElementById('ct-save-process').addEventListener('click', () => {
    const titles = Array.from(document.querySelectorAll('.ct-step-title')).map((el) => el.value);
    const bodies = Array.from(document.querySelectorAll('.ct-step-body')).map((el) => el.value);
    save(
      'homepage_process',
      {
        eyebrow: document.getElementById('ct-process-eyebrow').value,
        title: document.getElementById('ct-process-title').value,
        steps: titles.map((title, i) => ({ title, body: bodies[i] })),
      },
      'ct-process-error',
      'ct-save-process'
    );
  });
}

function escapeAttr(str) {
  return String(str == null ? '' : str).replace(/"/g, '&quot;');
}

async function renderReportsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading report…</p>';
  const { orders } = await api('/api/orders');

  const paidOrders = orders.filter((o) => o.payment_status === 'paid');
  const revenue = paidOrders.reduce((sum, o) => sum + o.total_paise, 0);
  const byStatus = {};
  orders.forEach((o) => (byStatus[o.status] = (byStatus[o.status] || 0) + 1));

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:24px;">
      <div class="card"><div class="eyebrow">Total Orders</div><h2 style="margin:0;">${orders.length}</h2></div>
      <div class="card"><div class="eyebrow">Paid Orders</div><h2 style="margin:0;">${paidOrders.length}</h2></div>
      <div class="card"><div class="eyebrow">Revenue (Paid)</div><h2 style="margin:0;" class="mono">${formatRupees(revenue)}</h2></div>
    </div>
    <div class="card">
      <h3 class="mt-0">Orders by status</h3>
      ${Object.entries(byStatus)
        .map(([status, count]) => `<div class="flex-between"><span class="status-pill status-${status}">${status}</span><span class="mono">${count}</span></div>`)
        .join('') || '<p>No orders yet.</p>'}
    </div>
  `;
}

const TAB_RENDERERS = {
  products: renderProductsTab,
  categories: renderCategoriesTab,
  orders: renderOrdersTab,
  banners: renderBannersTab,
  content: renderContentTab,
  reports: renderReportsTab,
};

async function loadModeNote() {
  const status = await api('/api/status', { auth: false });
  const note = document.getElementById('mode-note');
  if (status.mode === 'demo-data') {
    note.style.display = 'block';
    note.textContent = 'Running on in-memory demo data — nothing here persists across a server restart yet. Connect Supabase (see backend/.env) to make this permanent.';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAdminOrRedirect();
  if (!user) return;
  document.getElementById('admin-whoami').textContent = `${user.email || ''} (${user.role || 'admin'})`;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    clearAuthSession();
    window.location.href = '/admin';
  });

  document.querySelectorAll('.dashboard-nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dashboard-nav button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      CURRENT_TAB = btn.getAttribute('data-tab');
      TAB_RENDERERS[CURRENT_TAB]();
    });
  });

  loadModeNote();
  renderProductsTab();
});
