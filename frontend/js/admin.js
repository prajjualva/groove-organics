// Admin dashboard: products CRUD, order list + status updates, banner
// uploads, and a simple sales report. Everything here talks to /api/*
// with the admin's bearer token attached automatically by api.js.

let CURRENT_TAB = 'products';

// Must match backend/lib/mockStore.js's PROMO_TAG_OPTIONS — preset badges an
// admin can attach to a product (multiple at once), used for the product-card
// badge and to group products onto the /deals page.
const PROMO_TAG_OPTIONS = ['Sale Live', 'New Deal', 'Best Seller', 'Festive Offer', 'Limited Stock', 'Bundle Deal'];

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
  const [{ products }, { categories }, status] = await Promise.all([
    api('/api/products'),
    api('/api/categories', { auth: false }),
    api('/api/status', { auth: false }),
  ]);
  const defaultGstRatePercent = status.defaultGstRatePercent ?? 5;

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
        <div class="form-row">
          <div class="form-field">
            <label for="p-gst">GST rate % <span style="font-weight:400;color:var(--moss-700);">(leave blank to use the store default, ${defaultGstRatePercent}%)</span></label>
            <input id="p-gst" type="number" min="0" max="28" step="0.1" placeholder="${defaultGstRatePercent}" />
          </div>
          <div class="form-field">
            <label for="p-shipping">Extra shipping (₹ per unit) <span style="font-weight:400;color:var(--moss-700);">(0 = free shipping)</span></label>
            <input id="p-shipping" type="number" min="0" step="0.01" placeholder="0" />
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
      <p style="font-size:0.85rem;color:var(--moss-700);margin-top:0;">GST and shipping fields below: leave GST blank to use the store default (${defaultGstRatePercent}%); different products can carry different GST rates (e.g. 5% vs 12% vs 18%) since that's how it actually works under Indian GST law. Shipping is an extra charge added per unit of that product in the order — 0 means free shipping for it.</p>
      <table class="data-table">
        <thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Category</th><th>Stock</th><th>GST %</th><th>Ship ₹/unit</th><th>Active</th><th>Variants</th><th></th></tr></thead>
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
        <td><input type="number" min="0" max="28" step="0.1" value="${p.gst_rate_percent != null ? p.gst_rate_percent : ''}" placeholder="${defaultGstRatePercent}" data-gst="${p.id}" style="width:64px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
        <td><input type="number" min="0" step="0.01" value="${p.shipping_charge_paise ? (p.shipping_charge_paise / 100).toFixed(2) : ''}" placeholder="0" data-shipping="${p.id}" style="width:70px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
        <td><input type="checkbox" data-active="${p.id}" ${p.is_active ? 'checked' : ''} /></td>
        <td>
          <button class="btn btn--outline btn--sm" data-toggle-variants="${p.id}">Sizes / Colors</button>
          <button class="btn btn--outline btn--sm" data-toggle-more="${p.id}" style="margin-top:4px;">Sale, Shipping & Tags</button>
        </td>
        <td><button class="btn btn--outline btn--sm" data-delete="${p.id}">Delete</button></td>
      </tr>
      <tr class="variants-row" data-variants-for="${p.id}" style="display:none;">
        <td colspan="10"><div class="variants-panel" data-variants-panel="${p.id}"></div></td>
      </tr>
      <tr class="variants-row" data-more-for="${p.id}" style="display:none;">
        <td colspan="10"><div class="variants-panel" data-more-panel="${p.id}"></div></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-gst]').forEach((input) => {
    input.addEventListener('change', async () => {
      const raw = input.value.trim();
      await api(`/api/products/${input.getAttribute('data-gst')}`, {
        method: 'PATCH',
        body: { gst_rate_percent: raw === '' ? null : parseFloat(raw) },
      });
    });
  });
  tbody.querySelectorAll('[data-shipping]').forEach((input) => {
    input.addEventListener('change', async () => {
      const raw = input.value.trim();
      await api(`/api/products/${input.getAttribute('data-shipping')}`, {
        method: 'PATCH',
        body: { shipping_charge_paise: raw === '' ? 0 : Math.round(parseFloat(raw) * 100) },
      });
    });
  });

  tbody.querySelectorAll('[data-toggle-variants]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const productId = btn.getAttribute('data-toggle-variants');
      const row = tbody.querySelector(`[data-variants-for="${productId}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      if (isHidden) await renderVariantsPanel(productId);
    });
  });
  tbody.querySelectorAll('[data-toggle-more]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const productId = btn.getAttribute('data-toggle-more');
      const row = tbody.querySelector(`[data-more-for="${productId}"]`);
      const isHidden = row.style.display === 'none';
      row.style.display = isHidden ? '' : 'none';
      if (isHidden) renderMoreDetailsPanel(productId, products.find((p) => p.id === productId));
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
      const gstRaw = document.getElementById('p-gst').value.trim();
      const shippingRaw = document.getElementById('p-shipping').value.trim();
      await api('/api/products', {
        method: 'POST',
        body: {
          name: document.getElementById('p-name').value,
          slug: document.getElementById('p-slug').value,
          price_paise: Math.round(parseFloat(document.getElementById('p-price').value) * 100),
          category_id: categoryId,
          category,
          gst_rate_percent: gstRaw === '' ? null : parseFloat(gstRaw),
          shipping_charge_paise: shippingRaw === '' ? 0 : Math.round(parseFloat(shippingRaw) * 100),
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

// Sale price, weight/dimensions (for automatic weight-based shipping), HSN
// code and promo-tag badges — grouped together since they're all edited
// less often than price/stock/GST, opened from "Sale, Shipping & Tags".
function renderMoreDetailsPanel(productId, product) {
  const panel = document.querySelector(`[data-more-panel="${productId}"]`);
  const tags = product.promo_tags || [];
  panel.innerHTML = `
    <div class="form-row">
      <div class="form-field">
        <label>Sale price (₹) <span style="font-weight:400;color:var(--moss-700);">(shown struck-through against the regular price — leave blank for no sale)</span></label>
        <input type="number" min="0" step="0.01" data-more-compare value="${product.compare_at_price_paise ? (product.compare_at_price_paise / 100).toFixed(2) : ''}" />
      </div>
      <div class="form-field"><label>HSN code</label><input data-more-hsn value="${product.hsn_code || ''}" placeholder="e.g. 15131900" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Weight (grams)</label><input type="number" min="0" data-more-weight value="${product.weight_grams != null ? product.weight_grams : ''}" /></div>
      <div class="form-field"><label>Length (cm)</label><input type="number" min="0" step="0.1" data-more-length value="${product.length_cm != null ? product.length_cm : ''}" /></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Width (cm)</label><input type="number" min="0" step="0.1" data-more-width value="${product.width_cm != null ? product.width_cm : ''}" /></div>
      <div class="form-field"><label>Height (cm)</label><input type="number" min="0" step="0.1" data-more-height value="${product.height_cm != null ? product.height_cm : ''}" /></div>
    </div>
    <p style="font-size:0.8rem;color:var(--moss-700);">Weight and dimensions drive automatic shipping cost (Admin → Shipping Rates) — leave them blank if you're using the flat "Extra shipping" override in the table above instead.</p>
    <div class="form-field"><label>SEO title (optional, browser tab / search result title)</label><input data-more-seo-title value="${escapeAttr(product.seo_title)}" placeholder="${escapeAttr(product.name)} — Groove Organics" /></div>
    <div class="form-field"><label>SEO meta description (optional)</label><textarea data-more-seo-desc rows="2">${product.seo_meta_description || ''}</textarea></div>
    <div class="form-field">
      <label>Promo tags / badges (pick any that apply)</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${PROMO_TAG_OPTIONS.map(
          (tag) => `
          <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:0.85rem;">
            <input type="checkbox" data-more-tag value="${tag}" ${tags.includes(tag) ? 'checked' : ''} /> ${tag}
          </label>`
        ).join('')}
      </div>
      <p style="font-size:0.8rem;color:var(--moss-700);">Tagged products automatically appear on the <a href="/deals" target="_blank">/deals</a> page, grouped by tag.</p>
    </div>
    <button class="btn btn--primary btn--sm" data-save-more="${productId}">Save</button>
    <span class="form-error" data-more-saved style="display:none;color:var(--moss-700);">Saved.</span>
  `;
  panel.querySelector('[data-save-more]').addEventListener('click', async () => {
    const compareRaw = panel.querySelector('[data-more-compare]').value.trim();
    const weightRaw = panel.querySelector('[data-more-weight]').value.trim();
    const lengthRaw = panel.querySelector('[data-more-length]').value.trim();
    const widthRaw = panel.querySelector('[data-more-width]').value.trim();
    const heightRaw = panel.querySelector('[data-more-height]').value.trim();
    const selectedTags = Array.from(panel.querySelectorAll('[data-more-tag]:checked')).map((el) => el.value);
    await api(`/api/products/${productId}`, {
      method: 'PATCH',
      body: {
        compare_at_price_paise: compareRaw === '' ? null : Math.round(parseFloat(compareRaw) * 100),
        hsn_code: panel.querySelector('[data-more-hsn]').value.trim() || null,
        weight_grams: weightRaw === '' ? null : parseInt(weightRaw, 10),
        length_cm: lengthRaw === '' ? null : parseFloat(lengthRaw),
        width_cm: widthRaw === '' ? null : parseFloat(widthRaw),
        height_cm: heightRaw === '' ? null : parseFloat(heightRaw),
        promo_tags: selectedTags,
        seo_title: panel.querySelector('[data-more-seo-title]').value.trim() || null,
        seo_meta_description: panel.querySelector('[data-more-seo-desc]').value.trim() || null,
      },
    });
    const saved = panel.querySelector('[data-more-saved]');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
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

// Customer directory: every account (customer/staff/admin), with order
// count and paid-order spend joined in client-side from /api/orders — same
// pattern as the Reports tab's low-stock/best-seller widgets, rather than
// teaching the backend a new aggregate query for one admin screen.
async function renderCustomersTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading customers…</p>';
  const [{ customers }, { orders }, status] = await Promise.all([
    api('/api/customers'),
    api('/api/orders'),
    api('/api/status', { auth: false }),
  ]);

  const statsByEmail = {};
  orders.forEach((o) => {
    const key = (o.customer_email || '').toLowerCase();
    if (!key) return;
    if (!statsByEmail[key]) statsByEmail[key] = { count: 0, spendPaise: 0 };
    statsByEmail[key].count += 1;
    if (o.payment_status === 'paid') statsByEmail[key].spendPaise += o.total_paise;
  });

  const resetNote = status.supabaseConfigured
    ? "\"Send reset link\" emails the customer a real Supabase password-reset link via Resend."
    : "Demo mode: \"Send reset link\" mints a temporary local reset link (there's no real Supabase account yet) — check the server console if Resend isn't configured, the link is logged there instead of emailed.";

  wrap.innerHTML = `
    <p style="font-size:0.85rem;color:var(--moss-700);margin-top:0;">${resetNote} There's no way to view or set a customer's actual password here — or anywhere else — on purpose; this only ever sends them a link to set a new one themselves.</p>
    <div class="card" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Groove Points</th><th></th></tr></thead>
        <tbody>
          ${
            customers.length
              ? customers
                  .map((c) => {
                    const stats = statsByEmail[(c.email || '').toLowerCase()] || { count: 0, spendPaise: 0 };
                    return `
                    <tr data-customer-email="${c.email}">
                      <td>${c.full_name || '—'}</td>
                      <td>${c.email}</td>
                      <td><span class="status-pill status-${c.role === 'admin' ? 'delivered' : c.role === 'staff' ? 'shipped' : 'placed'}">${c.role}</span></td>
                      <td>${c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                      <td>${stats.count}</td>
                      <td class="mono">${formatRupees(stats.spendPaise)}</td>
                      <td class="mono" data-points-cell>${c.loyalty_points || 0}</td>
                      <td style="white-space:nowrap;display:flex;gap:6px;">
                        <button class="btn btn--outline btn--sm" data-send-reset="${c.email}">Send reset link</button>
                        <button class="btn btn--outline btn--sm" data-adjust-points="${c.id}">Adjust points</button>
                        ${c.role === 'customer' ? `<button class="btn btn--outline btn--sm" data-impersonate="${c.id}" data-impersonate-email="${c.email}">Log in as</button>` : ''}
                      </td>
                    </tr>`;
                  })
                  .join('')
              : '<tr><td colspan="8" style="color:var(--moss-700);">No customers yet.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-send-reset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.getAttribute('data-send-reset');
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Sending…';
      try {
        await api('/api/auth/forgot-password', { method: 'POST', auth: false, body: { email } });
        btn.textContent = 'Sent';
      } catch (err) {
        btn.textContent = originalLabel;
        btn.disabled = false;
        alert(err.message || 'Could not send the reset link.');
      }
    });
  });

  wrap.querySelectorAll('[data-adjust-points]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-adjust-points');
      const input = prompt('Points to add (use a negative number to deduct):', '0');
      if (input === null) return;
      const delta = Number(input);
      if (!delta) return alert('Enter a non-zero number.');
      btn.disabled = true;
      try {
        const { balance } = await api(`/api/customers/${id}/points/adjust`, { method: 'POST', body: { delta } });
        const cell = btn.closest('tr').querySelector('[data-points-cell]');
        if (cell) cell.textContent = balance;
      } catch (err) {
        alert(err.message || 'Could not adjust points.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  wrap.querySelectorAll('[data-impersonate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-impersonate');
      const email = btn.getAttribute('data-impersonate-email');
      if (!confirm(`Open the storefront signed in as ${email}? This opens in a new tab — your admin session here is unaffected.`)) return;
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Opening…';
      try {
        const result = await api(`/api/customers/${id}/impersonate`, { method: 'POST' });
        if (result.mode === 'supabase') {
          window.open(result.actionLink, '_blank');
        } else {
          window.open(`/impersonate-callback?mode=demo&token=${encodeURIComponent(result.token)}`, '_blank');
        }
      } catch (err) {
        alert(err.message || 'Could not sign in as this customer.');
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
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
        <thead><tr><th>Order #</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Tracking</th><th>Invoice</th></tr></thead>
        <tbody>
          ${orders
            .map(
              (o) => `
            <tr data-id="${o.id}">
              <td class="mono">${o.order_number}</td>
              <td>${o.customer_name}<br /><span style="font-size:0.78rem;opacity:0.6;">${o.customer_email}</span></td>
              <td class="mono">${formatRupees(o.total_paise)}${o.discount_paise ? `<br /><span style="font-size:0.75rem;color:var(--moss-700);">−${formatRupees(o.discount_paise)} (${o.coupon_code || 'coupon'})</span>` : ''}</td>
              <td>
                <span class="status-pill status-${o.payment_status === 'paid' ? 'delivered' : 'placed'}">${o.payment_status}</span>
                <div style="font-size:0.75rem;color:var(--moss-700);">${o.payment_gateway || '—'}</div>
                ${o.payment_gateway === 'cod' && o.payment_status !== 'paid' ? `<button class="btn btn--outline btn--sm" data-mark-cod-paid="${o.id}" style="margin-top:4px;">Mark COD Paid</button>` : ''}
              </td>
              <td>
                <select data-status="${o.id}">
                  ${['placed', 'packed', 'shipped', 'delivered', 'cancelled']
                    .map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`)
                    .join('')}
                </select>
              </td>
              <td>
                <input placeholder="Tracking number" data-tracking-number="${o.id}" value="${o.tracking_number || ''}" style="width:120px;padding:4px;border-radius:6px;border:1px solid var(--sand-300);font-size:0.78rem;margin-bottom:4px;" /><br />
                <input placeholder="Tracking URL" data-tracking-url="${o.id}" value="${o.tracking_url || ''}" style="width:120px;padding:4px;border-radius:6px;border:1px solid var(--sand-300);font-size:0.78rem;margin-bottom:4px;" /><br />
                <button class="btn btn--outline btn--sm" data-save-tracking="${o.id}">Save</button>
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
  wrap.querySelectorAll('[data-mark-cod-paid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Confirm cash was collected for this order?')) return;
      await api(`/api/orders/${btn.getAttribute('data-mark-cod-paid')}/mark-cod-paid`, { method: 'PATCH' });
      renderOrdersTab();
    });
  });
  wrap.querySelectorAll('[data-save-tracking]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-save-tracking');
      const trackingNumber = wrap.querySelector(`[data-tracking-number="${id}"]`).value.trim();
      const trackingUrl = wrap.querySelector(`[data-tracking-url="${id}"]`).value.trim();
      await api(`/api/orders/${id}/tracking`, { method: 'PATCH', body: { trackingNumber, trackingUrl } });
      btn.textContent = 'Saved';
      setTimeout(() => (btn.textContent = 'Save'), 1500);
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

// Sets background-position on the frontend (see home-content.js) — which
// part of the photo stays visible/centered when it's cropped to fill the
// frame (Fit: "Fill frame") or where it sits within any letterboxed space
// (Fit: "Show whole photo").
const BANNER_POSITION_OPTIONS = [
  { value: 'left top', label: 'Top left' },
  { value: 'center top', label: 'Top center' },
  { value: 'right top', label: 'Top right' },
  { value: 'left center', label: 'Middle left' },
  { value: 'center center', label: 'Center (default)' },
  { value: 'right center', label: 'Middle right' },
  { value: 'left bottom', label: 'Bottom left' },
  { value: 'center bottom', label: 'Bottom center' },
  { value: 'right bottom', label: 'Bottom right' },
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
      <div class="form-field"><label for="b-file">Image (Desktop)</label><input id="b-file" type="file" accept="image/*" /></div>
      <div class="form-field">
        <label for="b-file-mobile">Image (Mobile) — optional</label>
        <input id="b-file-mobile" type="file" accept="image/*" />
        <p style="font-size:0.8rem;color:var(--moss-700);margin:4px 0 0;">If left blank, the desktop image is used and cropped to fit — set this if the desktop photo has text or a subject that gets cut off on a phone screen.</p>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="b-position">Focus point</label>
          <select id="b-position">${BANNER_POSITION_OPTIONS.map((p) => `<option value="${p.value}">${p.label}</option>`).join('')}</select>
        </div>
        <div class="form-field">
          <label for="b-fit">Fit</label>
          <select id="b-fit">
            <option value="cover">Fill frame (crops edges)</option>
            <option value="contain">Show whole photo (may letterbox)</option>
          </select>
        </div>
      </div>
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
              <p style="font-size:0.78rem;color:var(--moss-700);margin:6px 0 2px;">
                Mobile image: ${b.image_url_mobile ? 'set' : 'not set (desktop image is cropped for phones)'}
              </p>
              <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                <input type="file" accept="image/*" data-mobile-image-input="${b.id}" style="flex:1;font-size:0.78rem;" />
                ${b.image_url_mobile ? `<button class="btn btn--outline btn--sm" data-clear-mobile-image="${b.id}">Clear</button>` : ''}
              </div>
              <div class="form-row" style="margin-bottom:0;">
                <div class="form-field" style="margin-bottom:8px;">
                  <label style="font-size:0.78rem;">Focus point</label>
                  <select data-banner-position="${b.id}" style="font-size:0.8rem;">
                    ${BANNER_POSITION_OPTIONS.map((p) => `<option value="${p.value}" ${(b.image_position || 'center center') === p.value ? 'selected' : ''}>${p.label}</option>`).join('')}
                  </select>
                </div>
                <div class="form-field" style="margin-bottom:8px;">
                  <label style="font-size:0.78rem;">Fit</label>
                  <select data-banner-fit="${b.id}" style="font-size:0.8rem;">
                    <option value="cover" ${(b.image_fit || 'cover') === 'cover' ? 'selected' : ''}>Fill frame</option>
                    <option value="contain" ${b.image_fit === 'contain' ? 'selected' : ''}>Show whole photo</option>
                  </select>
                </div>
              </div>
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
  byPlacement.querySelectorAll('[data-banner-position]').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api(`/api/banners/${select.getAttribute('data-banner-position')}`, {
          method: 'PATCH',
          body: { image_position: select.value },
        });
      } catch (err) {
        alert(err.message || 'Could not update the focus point.');
      }
    });
  });
  byPlacement.querySelectorAll('[data-banner-fit]').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api(`/api/banners/${select.getAttribute('data-banner-fit')}`, {
          method: 'PATCH',
          body: { image_fit: select.value },
        });
      } catch (err) {
        alert(err.message || 'Could not update the fit.');
      }
    });
  });

  // Set/replace just the mobile crop on an existing banner — picking a file
  // uploads immediately rather than needing a separate "Save" click, since
  // this is a single-purpose control.
  byPlacement.querySelectorAll('[data-mobile-image-input]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const image_url_mobile = await readFileAsDataUrl(file);
        await api(`/api/banners/${input.getAttribute('data-mobile-image-input')}`, {
          method: 'PATCH',
          body: { image_url_mobile },
        });
        renderBannersTab();
      } catch (err) {
        alert(err.message || 'Could not upload the mobile image.');
      }
    });
  });
  byPlacement.querySelectorAll('[data-clear-mobile-image]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/banners/${btn.getAttribute('data-clear-mobile-image')}`, {
        method: 'PATCH',
        body: { image_url_mobile: null },
      });
      renderBannersTab();
    });
  });

  document.getElementById('add-banner-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    // Guard against double-submission: this button used to have no
    // disabled/in-flight state at all, so clicking it more than once while
    // the (often multi-MB) image was still being read/uploaded — easy to
    // do, since nothing on screen changed until the request finished —
    // created one banner per click. Every other async button in this file
    // already disables itself first; this one just hadn't. Fixed 2026-09-08.
    if (btn.disabled) return;
    const errorEl = document.getElementById('add-banner-error');
    errorEl.style.display = 'none';
    const file = document.getElementById('b-file').files[0];
    const mobileFile = document.getElementById('b-file-mobile').files[0];
    if (!file) {
      errorEl.textContent = 'Choose a desktop image first.';
      errorEl.style.display = 'block';
      return;
    }
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Adding…';
    try {
      const image_url = await readFileAsDataUrl(file);
      const image_url_mobile = mobileFile ? await readFileAsDataUrl(mobileFile) : null;
      await api('/api/banners', {
        method: 'POST',
        body: {
          title: document.getElementById('b-title').value,
          subtitle: document.getElementById('b-subtitle').value,
          image_url,
          image_url_mobile,
          link_url: document.getElementById('b-link').value,
          placement: document.getElementById('b-placement').value,
          sort_order: parseInt(document.getElementById('b-sort').value, 10) || 1,
          image_position: document.getElementById('b-position').value,
          image_fit: document.getElementById('b-fit').value,
        },
      });
      renderBannersTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
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
  const [{ orders }, { products }, { coupons }, settings] = await Promise.all([
    api('/api/orders'),
    api('/api/products'),
    api('/api/coupons').catch(() => ({ coupons: [] })),
    api('/api/content', { auth: false }).then((r) => r.content.store_settings || {}),
  ]);

  const paidOrders = orders.filter((o) => o.payment_status === 'paid');
  const revenue = paidOrders.reduce((sum, o) => sum + o.total_paise, 0);
  const byStatus = {};
  orders.forEach((o) => (byStatus[o.status] = (byStatus[o.status] || 0) + 1));

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);
  const todayOrders = orders.filter((o) => (o.created_at || '').slice(0, 10) === todayStr);
  const todayPaid = todayOrders.filter((o) => o.payment_status === 'paid');
  const todaySales = todayPaid.reduce((sum, o) => sum + o.total_paise, 0);
  const monthRevenue = paidOrders.filter((o) => (o.created_at || '').slice(0, 7) === monthStr).reduce((sum, o) => sum + o.total_paise, 0);
  const pendingOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));

  const lowStockThreshold = settings.low_stock_threshold != null ? settings.low_stock_threshold : 10;
  const lowStock = products.filter((p) => !p.is_coming_soon && p.stock <= lowStockThreshold).sort((a, b) => a.stock - b.stock);

  const salesByProduct = {};
  paidOrders.forEach((o) => {
    (o.order_items || []).forEach((i) => {
      salesByProduct[i.product_name] = (salesByProduct[i.product_name] || 0) + i.quantity;
    });
  });
  const bestSellers = Object.entries(salesByProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">
      <div class="card"><div class="eyebrow">Today's Sales</div><h2 style="margin:0;" class="mono">${formatRupees(todaySales)}</h2></div>
      <div class="card"><div class="eyebrow">Today's Orders</div><h2 style="margin:0;">${todayOrders.length}</h2></div>
      <div class="card"><div class="eyebrow">Monthly Revenue</div><h2 style="margin:0;" class="mono">${formatRupees(monthRevenue)}</h2></div>
      <div class="card"><div class="eyebrow">Pending Orders</div><h2 style="margin:0;">${pendingOrders.length}</h2></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <div class="card">
        <h3 class="mt-0">Low stock (≤ ${lowStockThreshold})</h3>
        ${lowStock.length ? lowStock.map((p) => `<div class="flex-between"><span>${p.name}</span><span class="mono">${p.stock}</span></div>`).join('') : '<p style="color:var(--moss-700);">Nothing low on stock.</p>'}
      </div>
      <div class="card">
        <h3 class="mt-0">Best sellers (by units, paid orders)</h3>
        ${bestSellers.length ? bestSellers.map(([name, qty]) => `<div class="flex-between"><span>${name}</span><span class="mono">${qty}</span></div>`).join('') : '<p style="color:var(--moss-700);">No paid orders yet.</p>'}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card">
        <h3 class="mt-0">Orders by status</h3>
        ${Object.entries(byStatus)
          .map(([status, count]) => `<div class="flex-between"><span class="status-pill status-${status}">${status}</span><span class="mono">${count}</span></div>`)
          .join('') || '<p>No orders yet.</p>'}
      </div>
      <div class="card">
        <h3 class="mt-0">Coupon usage</h3>
        ${
          coupons.length
            ? coupons
                .map((c) => `<div class="flex-between"><span class="mono">${c.code}</span><span>${c.times_used}${c.usage_limit ? ` / ${c.usage_limit}` : ''} used</span></div>`)
                .join('')
            : '<p style="color:var(--moss-700);">No coupons yet — add one from Admin → Coupons.</p>'
        }
      </div>
    </div>
  `;
}

const LEGAL_PAGE_TABS = [
  { key: 'page_terms', label: 'Terms & Conditions' },
  { key: 'page_privacy', label: 'Privacy Policy' },
  { key: 'page_refund_policy', label: 'Refund & Return Policy' },
  { key: 'page_shipping_policy', label: 'Shipping Policy' },
];

async function renderLegalTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading legal pages…</p>';
  const { content } = await api('/api/content', { auth: false });

  wrap.innerHTML = LEGAL_PAGE_TABS.map((page) => {
    const value = content[page.key] || { title: page.label, body: '' };
    return `
      <div class="card" style="margin-bottom:20px;">
        <h3 class="mt-0">${page.label}</h3>
        <div class="form-field"><label>Page title</label><input class="lp-title" data-key="${page.key}" value="${escapeAttr(value.title)}" /></div>
        <div class="form-field"><label>Body</label><textarea class="lp-body" data-key="${page.key}" rows="8">${value.body || ''}</textarea></div>
        <button class="btn btn--primary btn--sm" data-lp-save="${page.key}">Save</button>
        <span class="form-error" data-lp-saved="${page.key}" style="display:none;color:var(--moss-700);">Saved.</span>
      </div>`;
  }).join('');

  wrap.querySelectorAll('[data-lp-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-lp-save');
      const title = wrap.querySelector(`.lp-title[data-key="${key}"]`).value;
      const body = wrap.querySelector(`.lp-body[data-key="${key}"]`).value;
      await api(`/api/content/${key}`, { method: 'PATCH', body: { title, body } });
      const saved = wrap.querySelector(`[data-lp-saved="${key}"]`);
      saved.style.display = 'inline';
      setTimeout(() => (saved.style.display = 'none'), 2000);
    });
  });
}

async function renderStoreSettingsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading settings…</p>';
  const { content } = await api('/api/content', { auth: false });
  const s = content.store_settings || {};

  wrap.innerHTML = `
    <div class="card">
      <h3 class="mt-0">Business details</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">Used on invoices and the contact page. No API keys or secrets go here — those stay in backend/.env.</p>
      <div class="form-row">
        <div class="form-field"><label>Legal business name</label><input id="ss-legal-name" value="${escapeAttr(s.business_legal_name)}" /></div>
        <div class="form-field"><label>GSTIN</label><input id="ss-gstin" value="${escapeAttr(s.gstin)}" /></div>
      </div>
      <div class="form-field"><label>Business address</label><textarea id="ss-address" rows="2">${escapeAttr(s.business_address)}</textarea></div>
      <div class="form-row">
        <div class="form-field"><label>Support email</label><input id="ss-support-email" value="${escapeAttr(s.support_email)}" /></div>
        <div class="form-field"><label>Support phone</label><input id="ss-support-phone" value="${escapeAttr(s.support_phone)}" /></div>
      </div>
    </div>
    <div class="card">
      <h3 class="mt-0">Checkout & shipping</h3>
      <div class="form-row">
        <div class="form-field"><label><input type="checkbox" id="ss-cod-enabled" ${s.cod_enabled ? 'checked' : ''} /> Cash on Delivery (COD) enabled</label></div>
        <div class="form-field"><label>COD extra charge (₹)</label><input id="ss-cod-charge" type="number" min="0" step="0.01" value="${s.cod_extra_charge_paise ? (s.cod_extra_charge_paise / 100).toFixed(2) : '0'}" /></div>
      </div>
      <div class="form-field"><label>Free shipping threshold (₹) <span style="font-weight:400;color:var(--moss-700);">(0 disables free shipping)</span></label><input id="ss-free-shipping" type="number" min="0" step="1" value="${s.free_shipping_threshold_paise ? (s.free_shipping_threshold_paise / 100).toFixed(0) : '0'}" /></div>
      <div class="form-field"><label>Blocked pincodes (comma-separated, optional)</label><input id="ss-blocked-pincodes" value="${(s.blocked_pincodes || []).join(', ')}" /></div>
      <div class="form-field"><label>Low-stock alert threshold (units)</label><input id="ss-low-stock" type="number" min="0" value="${s.low_stock_threshold != null ? s.low_stock_threshold : 10}" /></div>
    </div>
    <div class="card">
      <h3 class="mt-0">Groove Points loyalty</h3>
      <div class="form-field"><label><input type="checkbox" id="ss-loyalty-enabled" ${s.loyalty_points_enabled ? 'checked' : ''} /> Enabled</label></div>
      <div class="form-row">
        <div class="form-field"><label>₹ spent per point earned</label><input id="ss-loyalty-earn" type="number" min="1" value="${s.loyalty_earn_rate_paise_per_point ? (s.loyalty_earn_rate_paise_per_point / 100).toFixed(0) : '100'}" /></div>
        <div class="form-field"><label>₹ value per point redeemed</label><input id="ss-loyalty-redeem" type="number" min="0.01" step="0.01" value="${s.loyalty_redeem_value_paise_per_point ? (s.loyalty_redeem_value_paise_per_point / 100).toFixed(2) : '1'}" /></div>
      </div>
      <div class="form-field"><label>Max % of an order points can cover</label><input id="ss-loyalty-cap" type="number" min="0" max="100" value="${s.loyalty_redeem_cap_percent != null ? s.loyalty_redeem_cap_percent : 50}" /></div>
    </div>
    <div class="card">
      <h3 class="mt-0">Refer a friend</h3>
      <p style="font-size:0.85rem;color:var(--moss-700);">Every customer gets a share link from their account (Refer & Earn tab). When someone signs up through it: the referrer earns Groove Points on every order their friend places, and the new customer gets a discount automatically on their own first order — no coupon code needed either way.</p>
      <div class="form-field"><label><input type="checkbox" id="ss-referral-enabled" ${s.referral_program_enabled ? 'checked' : ''} /> Enabled</label></div>
      <div class="form-row">
        <div class="form-field"><label>Groove Points per order (to the referrer)</label><input id="ss-referral-points" type="number" min="0" value="${s.referral_points_per_order != null ? s.referral_points_per_order : 100}" /></div>
        <div class="form-field"><label>Discount % on the friend's first order</label><input id="ss-referral-discount" type="number" min="0" max="100" value="${s.referral_discount_percent != null ? s.referral_discount_percent : 10}" /></div>
      </div>
    </div>
    <button class="btn btn--primary" id="ss-save">Save Settings</button>
    <span class="form-error" id="ss-saved" style="display:none;color:var(--moss-700);">Saved.</span>
  `;

  document.getElementById('ss-save').addEventListener('click', async () => {
    const blocked = document
      .getElementById('ss-blocked-pincodes')
      .value.split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    await api('/api/content/store_settings', {
      method: 'PATCH',
      body: {
        business_legal_name: document.getElementById('ss-legal-name').value,
        gstin: document.getElementById('ss-gstin').value,
        business_address: document.getElementById('ss-address').value,
        support_email: document.getElementById('ss-support-email').value,
        support_phone: document.getElementById('ss-support-phone').value,
        charge_gst: true,
        cod_enabled: document.getElementById('ss-cod-enabled').checked,
        cod_extra_charge_paise: Math.round((parseFloat(document.getElementById('ss-cod-charge').value) || 0) * 100),
        free_shipping_threshold_paise: Math.round((parseFloat(document.getElementById('ss-free-shipping').value) || 0) * 100),
        blocked_pincodes: blocked,
        low_stock_threshold: parseInt(document.getElementById('ss-low-stock').value, 10) || 0,
        loyalty_points_enabled: document.getElementById('ss-loyalty-enabled').checked,
        loyalty_earn_rate_paise_per_point: Math.round((parseFloat(document.getElementById('ss-loyalty-earn').value) || 100) * 100),
        loyalty_redeem_value_paise_per_point: Math.round((parseFloat(document.getElementById('ss-loyalty-redeem').value) || 1) * 100),
        loyalty_redeem_cap_percent: parseInt(document.getElementById('ss-loyalty-cap').value, 10) || 0,
        referral_program_enabled: document.getElementById('ss-referral-enabled').checked,
        referral_points_per_order: parseInt(document.getElementById('ss-referral-points').value, 10) || 0,
        referral_discount_percent: parseInt(document.getElementById('ss-referral-discount').value, 10) || 0,
      },
    });
    const saved = document.getElementById('ss-saved');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
  });
}

async function renderCouponsTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading coupons…</p>';
  const { coupons } = await api('/api/coupons');

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <h3 class="mt-0">Add a coupon</h3>
      <div class="form-row">
        <div class="form-field"><label>Code</label><input id="cp-code" placeholder="e.g. GROOVE20" /></div>
        <div class="form-field">
          <label>Type</label>
          <select id="cp-type"><option value="percent">Percent off</option><option value="flat">Flat amount off</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Value <span style="font-weight:400;color:var(--moss-700);">(percent, or ₹ for flat)</span></label><input id="cp-value" type="number" min="0" step="0.01" /></div>
        <div class="form-field"><label>Max discount (₹, optional — percent only)</label><input id="cp-max" type="number" min="0" step="0.01" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Minimum order (₹, optional)</label><input id="cp-min" type="number" min="0" step="0.01" /></div>
        <div class="form-field"><label>Usage limit (optional)</label><input id="cp-limit" type="number" min="1" /></div>
      </div>
      <button class="btn btn--primary" id="cp-add">Add Coupon</button>
      <p class="form-error" id="cp-error" style="display:none;"></p>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Active</th><th></th></tr></thead>
        <tbody>
          ${coupons
            .map(
              (c) => `
            <tr data-id="${c.id}">
              <td class="mono">${c.code}</td>
              <td>${c.discount_type === 'percent' ? `${c.discount_value}%${c.max_discount_paise ? ` (max ${formatRupees(c.max_discount_paise)})` : ''}` : formatRupees(c.discount_value)}</td>
              <td class="mono">${c.min_order_paise ? formatRupees(c.min_order_paise) : '—'}</td>
              <td class="mono">${c.times_used}${c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
              <td><input type="checkbox" data-cp-active="${c.id}" ${c.is_active ? 'checked' : ''} /></td>
              <td><button class="btn btn--outline btn--sm" data-cp-delete="${c.id}">Delete</button></td>
            </tr>`
            )
            .join('') || '<tr><td colspan="6" style="color:var(--moss-700);">No coupons yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('cp-add').addEventListener('click', async () => {
    const errorEl = document.getElementById('cp-error');
    errorEl.style.display = 'none';
    const code = document.getElementById('cp-code').value.trim();
    const value = parseFloat(document.getElementById('cp-value').value);
    if (!code || !value) {
      errorEl.textContent = 'Code and value are required.';
      errorEl.style.display = 'block';
      return;
    }
    const type = document.getElementById('cp-type').value;
    const maxRaw = document.getElementById('cp-max').value.trim();
    const minRaw = document.getElementById('cp-min').value.trim();
    const limitRaw = document.getElementById('cp-limit').value.trim();
    try {
      await api('/api/coupons', {
        method: 'POST',
        body: {
          code,
          discount_type: type,
          discount_value: type === 'flat' ? Math.round(value * 100) : value,
          max_discount_paise: maxRaw ? Math.round(parseFloat(maxRaw) * 100) : null,
          min_order_paise: minRaw ? Math.round(parseFloat(minRaw) * 100) : 0,
          usage_limit: limitRaw ? parseInt(limitRaw, 10) : null,
          is_active: true,
        },
      });
      renderCouponsTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
  wrap.querySelectorAll('[data-cp-active]').forEach((input) => {
    input.addEventListener('change', async () => {
      await api(`/api/coupons/${input.getAttribute('data-cp-active')}`, { method: 'PATCH', body: { is_active: input.checked } });
    });
  });
  wrap.querySelectorAll('[data-cp-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this coupon?')) return;
      await api(`/api/coupons/${btn.getAttribute('data-cp-delete')}`, { method: 'DELETE' });
      renderCouponsTab();
    });
  });
}

async function renderShippingRatesTab() {
  const wrap = document.getElementById('tab-content');
  wrap.innerHTML = '<p>Loading shipping rates…</p>';
  const { slabs } = await api('/api/shipping/rate-slabs', { auth: false });

  wrap.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <p style="font-size:0.85rem;color:var(--moss-700);">
        Rows are matched in ascending order by chargeable weight — the first row whose "up to" weight is not exceeded (or the row left blank = "anything heavier") sets the shipping price.
        Chargeable weight is the greater of a product's actual weight and its volumetric weight (L × W × H ÷ 5000), pooled across every item in the order that doesn't have its own flat shipping override.
      </p>
      <table class="data-table">
        <thead><tr><th>Up to weight (grams, blank = catch-all)</th><th>Price (₹)</th><th></th></tr></thead>
        <tbody>
          ${slabs
            .map(
              (s) => `
            <tr data-id="${s.id}">
              <td><input type="number" min="0" data-slab-weight="${s.id}" value="${s.max_weight_grams != null ? s.max_weight_grams : ''}" placeholder="catch-all" style="width:120px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
              <td><input type="number" min="0" step="0.01" data-slab-price="${s.id}" value="${(s.price_paise / 100).toFixed(2)}" style="width:100px;padding:6px;border-radius:6px;border:1px solid var(--sand-300);" /></td>
              <td><button class="btn btn--outline btn--sm" data-slab-save="${s.id}">Save</button> <button class="btn btn--outline btn--sm" data-slab-delete="${s.id}">Delete</button></td>
            </tr>`
            )
            .join('') || '<tr><td colspan="3" style="color:var(--moss-700);">No rate slabs yet — add one below.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h3 class="mt-0">Add a rate</h3>
      <div class="form-row">
        <div class="form-field"><label>Up to weight (grams, leave blank for catch-all)</label><input id="sl-weight" type="number" min="0" /></div>
        <div class="form-field"><label>Price (₹)</label><input id="sl-price" type="number" min="0" step="0.01" /></div>
      </div>
      <button class="btn btn--primary" id="sl-add">Add Rate</button>
      <p class="form-error" id="sl-error" style="display:none;"></p>
    </div>
  `;

  wrap.querySelectorAll('[data-slab-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-slab-save');
      const weightRaw = wrap.querySelector(`[data-slab-weight="${id}"]`).value.trim();
      const priceRaw = wrap.querySelector(`[data-slab-price="${id}"]`).value.trim();
      await api(`/api/shipping/rate-slabs/${id}`, {
        method: 'PATCH',
        body: { max_weight_grams: weightRaw === '' ? null : parseInt(weightRaw, 10), price_paise: Math.round((parseFloat(priceRaw) || 0) * 100) },
      });
      btn.textContent = 'Saved';
      setTimeout(() => (btn.textContent = 'Save'), 1500);
    });
  });
  wrap.querySelectorAll('[data-slab-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this rate?')) return;
      await api(`/api/shipping/rate-slabs/${btn.getAttribute('data-slab-delete')}`, { method: 'DELETE' });
      renderShippingRatesTab();
    });
  });
  document.getElementById('sl-add').addEventListener('click', async () => {
    const errorEl = document.getElementById('sl-error');
    errorEl.style.display = 'none';
    const weightRaw = document.getElementById('sl-weight').value.trim();
    const priceRaw = document.getElementById('sl-price').value.trim();
    if (!priceRaw) {
      errorEl.textContent = 'Price is required.';
      errorEl.style.display = 'block';
      return;
    }
    await api('/api/shipping/rate-slabs', {
      method: 'POST',
      body: { max_weight_grams: weightRaw === '' ? null : parseInt(weightRaw, 10), price_paise: Math.round(parseFloat(priceRaw) * 100) },
    });
    renderShippingRatesTab();
  });
}

const TAB_RENDERERS = {
  products: renderProductsTab,
  categories: renderCategoriesTab,
  orders: renderOrdersTab,
  customers: renderCustomersTab,
  banners: renderBannersTab,
  content: renderContentTab,
  legal: renderLegalTab,
  coupons: renderCouponsTab,
  shipping: renderShippingRatesTab,
  settings: renderStoreSettingsTab,
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
